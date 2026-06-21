#!/usr/bin/env node
// Arc E §3 (E3-5) — top-down racer lap HUD.
//
// The current lap number is drawn as a single digit sprite at the top-left
// (sprites don't scroll, so it stays put).  Drives a real ROM round one lap and
// asserts the HUD digit sprite's tile index changes when the lap advances — i.e.
// the on-screen lap number tracks the race.  (How the glyph LOOKS is the visual
// pass.)
import * as H from './lib/render-harness.mjs';

const PORT = 18844;
let failed = false;
const ok  = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };

const FIN_C = 20, CHK_C = 40;

const win = H.loadBuilderModules();
const tpl = H.readTemplate();

function makeState() {
  const cols = 64, rows = 60;
  const nt = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ tile: 1, palette: 0 })));
  const beh = Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0));
  for (let r = 0; r < rows; r++) {
    beh[r][FIN_C] = 7; beh[r][FIN_C + 1] = 7;   // finish
    beh[r][CHK_C] = 5; beh[r][CHK_C + 1] = 5;   // checkpoint
  }
  const s = {
    name: 'racer-hud', version: 1, universal_bg: 0x0F,
    sprites: [{ role: 'player', name: 'car', width: 2, height: 2, cells: H.mkCells(2, 2) }],
    sprite_tiles: H.blankPool(), bg_tiles: H.blankPool(),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x21, 0x10, 0x30] })),
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    backgrounds: [{ name: 'bg', dimensions: { screens_x: 2, screens_y: 2 }, nametable: nt, behaviour: beh }],
    behaviour_types: [...H.BEHAVIOUR_TYPES],
    selectedBgIdx: 0, builder: win.BuilderDefaults(),
  };
  s.builder.modules.game.config = { type: 'racer', racerTopSpeed: 4, racerLaps: 3 };
  return s;
}

// Top-left HUD sprite (the lap digit) — on-screen, near the corner.
function hudTile(h) {
  for (let i = 0; i < 64; i++) {
    const s = H.oamSprite(h.nes, i);
    if (s.y >= 1 && s.y <= 16 && s.x >= 1 && s.x <= 16) return s.tile;
  }
  return -1;
}

const { srv } = await H.startServer(PORT);
try {
  const s = makeState();
  const asm = win.BuilderAssembler.assemble(s, tpl);
  if (/racer_digit_tiles/.test(asm)) ok('engine references racer_digit_tiles (lap-HUD draw path present)');
  else bad('template missing racer_digit_tiles reference');

  let c = asm.replace('while (oam_idx < 256) {',
    '(*(unsigned char*)0x0700)=(unsigned char)(px&0xFF);(*(unsigned char*)0x0701)=(unsigned char)(px>>8);' +
    '(*(unsigned char*)0x0704)=racer_heading;(*(unsigned char*)0x0705)=racer_laps;' +
    'while (oam_idx < 256) {');
  const r = await H.buildRom(PORT, {
    state: s, playerSpriteIdx: 0, playerStart: { x: 144, y: 200 }, mode: 'browser', customMainC: c });
  if (!r.ok) { bad('racer-hud ROM did not compile at stage ' + r.stage + ':\n' + String(r.log || '').slice(-1800)); }
  else {
    const h = H.openRom(r.romBytes);
    const mem = h.nes.cpu.mem;
    const pxv = () => mem[0x700] + 256 * mem[0x701];
    const head = () => mem[0x704];
    const laps = () => mem[0x705];
    const steerTo = (target) => {
      for (let g = 0; g < 80 && head() !== target; g++) {
        const dir = ((target - head() + 16) % 16) <= 8 ? H.BTN.RIGHT : H.BTN.LEFT;
        h.hold(dir); h.frames(1); h.release(dir); h.frames(1);
      }
    };
    const leg = (heading, pred, max = 450) => {
      h.release(H.BTN.A); steerTo(heading); h.hold(H.BTN.A);
      let g = 0; while (!pred() && g < max) { h.frames(1); g++; }
      h.release(H.BTN.A); return pred();
    };

    h.frames(200);
    const t0 = hudTile(h);
    if (t0 > 0 && laps() === 0) ok('lap HUD shows a digit at the start (tile ' + t0 + ', lap 1)');
    else bad('no HUD digit at start (tile=' + t0 + ', laps=' + laps() + ')');

    // Drive one full lap: finish → checkpoint → finish.
    leg(0, () => pxv() > (CHK_C + 2) * 8);
    leg(8, () => pxv() < (FIN_C - 2) * 8);
    if (laps() === 1) ok('completed one lap (laps=1)');
    else bad('did not complete a lap (laps=' + laps() + ')');

    h.frames(3);
    const t1 = hudTile(h);
    if (t1 > 0 && t1 !== t0) ok('lap HUD digit updates when the lap advances (tile ' + t0 + ' → ' + t1 + ')');
    else bad('lap HUD did not update (tile ' + t0 + ' → ' + t1 + ')');
  }
} catch (e) {
  bad('threw: ' + (e && e.stack || e));
} finally {
  await H.stopServer(srv);
}

if (failed) process.exit(1);
console.log('\nRacer lap HUD (E3-5) test complete.');
