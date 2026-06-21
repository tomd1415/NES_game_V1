#!/usr/bin/env node
// Arc E §3 (E3-3) — top-down racer auto-rotated car art.
//
// The server bakes 8 rotated copies of the player's car into spare sprite-CHR
// slots; the engine draws the frame for the current heading (16 headings → 8
// frames, heading>>1).  This proves the WIRING headlessly — the drawn player
// tile index changes with heading, and adjacent headings reuse a frame.  (How
// the rotated art *looks* is the visual pass; jsnes can't judge that.)
//   1. a racer build emits BW_RACER_ROT + car_rot_tiles.
//   2. the player's drawn tile differs between frames (heading 0 vs 2 vs 8).
//   3. adjacent headings (0 and 1) share a frame — "8 dirs across 16 headings".
import * as H from './lib/render-harness.mjs';

const PORT = 18842;
let failed = false;
const ok  = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };

const win = H.loadBuilderModules();
const tpl = H.readTemplate();

function makeState() {
  const cols = 64, rows = 60;
  const nt = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ tile: 1, palette: 0 })));
  const beh = Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0));
  const s = {
    name: 'racer-rot', version: 1, universal_bg: 0x0F,
    sprites: [{ role: 'player', name: 'car', width: 2, height: 2, cells: H.mkCells(2, 2) }],
    sprite_tiles: H.blankPool(), bg_tiles: H.blankPool(),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x21, 0x10, 0x30] })),
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    backgrounds: [{ name: 'bg', dimensions: { screens_x: 2, screens_y: 2 }, nametable: nt, behaviour: beh }],
    behaviour_types: [...H.BEHAVIOUR_TYPES],
    selectedBgIdx: 0, builder: win.BuilderDefaults(),
  };
  s.builder.modules.game.config = { type: 'racer', racerTopSpeed: 3 };
  return s;
}

const { srv } = await H.startServer(PORT);
try {
  const s = makeState();
  const asm = win.BuilderAssembler.assemble(s, tpl);
  // The engine references car_rot_tiles only behind BW_RACER_ROT (template guard);
  // the server emits the #define + array into scene.inc, not the template, so we
  // can only assert the template carries the guarded use here.
  if (/car_rot_tiles/.test(asm)) ok('engine references car_rot_tiles (rotation draw path present)');
  else bad('template missing car_rot_tiles reference');

  let c = asm.replace('while (oam_idx < 256) {',
    '(*(unsigned char*)0x0704)=racer_heading;(*(unsigned char*)0x0708)=anim_tiles[anim_base];' +
    'while (oam_idx < 256) {');
  const r = await H.buildRom(PORT, {
    state: s, playerSpriteIdx: 0, playerStart: { x: 200, y: 200 }, mode: 'browser', customMainC: c });
  if (!r.ok) { bad('racer-rotation ROM did not compile at stage ' + r.stage + ':\n' + String(r.log || '').slice(-1800)); }
  else {
    // The built scene.inc must have turned the feature on + emitted the table.
    // (We can't see scene.inc here, but the ROM compiling with the 0x0708 mirror
    // referencing car_rot_tiles via anim_tiles proves it linked.)
    const h = H.openRom(r.romBytes);
    const mem = h.nes.cpu.mem;
    const head = () => mem[0x704];
    const tile = () => mem[0x708];
    const steerTo = (target) => {
      for (let g = 0; g < 80 && head() !== target; g++) {
        const dir = ((target - head() + 16) % 16) <= 8 ? H.BTN.RIGHT : H.BTN.LEFT;
        h.hold(dir); h.frames(1); h.release(dir); h.frames(1);
      }
      h.frames(2);
    };

    h.frames(200);
    steerTo(0);  const t0 = tile();
    steerTo(1);  const t1 = tile();
    steerTo(2);  const t2 = tile();
    steerTo(8);  const t8 = tile();

    if (t0 !== 0 || t2 !== 0) ok('player draws from the baked rotation frames (tile indices non-zero)');
    else bad('player tile stayed 0 — rotation frames not used (t0=' + t0 + ', t2=' + t2 + ')');

    if (t1 === t0) ok('adjacent headings share a frame (heading 0 & 1 → same tile ' + t0 + ')');
    else bad('headings 0 and 1 used different frames (t0=' + t0 + ', t1=' + t1 + ')');

    if (t2 !== t0) ok('a 2-step heading change rotates the car (frame 0 tile ' + t0 + ' → frame 1 tile ' + t2 + ')');
    else bad('heading 2 did not change the drawn frame (still ' + t0 + ')');

    if (t8 !== t0 && t8 !== t2) ok('heading 8 (opposite) is a distinct frame (tile ' + t8 + ')');
    else bad('heading 8 was not a distinct frame (t0=' + t0 + ', t2=' + t2 + ', t8=' + t8 + ')');
  }
} catch (e) {
  bad('threw: ' + (e && e.stack || e));
} finally {
  await H.stopServer(srv);
}

if (failed) process.exit(1);
console.log('\nRacer rotation (E3-3) test complete.');
