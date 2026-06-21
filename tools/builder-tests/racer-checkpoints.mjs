#!/usr/bin/env node
// Arc E §3 (E3-5) — racer ordered checkpoints (2 per lap).
//
// With "checkpoints per lap" = 2, a lap requires passing checkpoint 1 (trigger,
// id 5) THEN checkpoint 2 (ladder, id 6) IN ORDER before re-crossing the finish.
// Drives a real ROM round a horizontal track and asserts:
//   1. finish → CP1 → CP2 → finish counts a lap;
//   2. finish → CP1 → finish (skipping CP2) does NOT count (order enforced).
import * as H from './lib/render-harness.mjs';

const PORT = 18846;
let failed = false;
const ok  = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };

const FIN_C = 15, CP1_C = 30, CP2_C = 45;   // finish, checkpoint 1, checkpoint 2

const win = H.loadBuilderModules();
const tpl = H.readTemplate();

function makeState() {
  const cols = 64, rows = 60;
  const nt = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ tile: 1, palette: 0 })));
  const beh = Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0));
  for (let r = 0; r < rows; r++) {
    beh[r][FIN_C] = 7; beh[r][FIN_C + 1] = 7;   // finish
    beh[r][CP1_C] = 5; beh[r][CP1_C + 1] = 5;   // checkpoint 1 (trigger)
    beh[r][CP2_C] = 6; beh[r][CP2_C + 1] = 6;   // checkpoint 2 (ladder)
  }
  const s = {
    name: 'racer-cp', version: 1, universal_bg: 0x0F,
    sprites: [{ role: 'player', name: 'car', width: 2, height: 2, cells: H.mkCells(2, 2) }],
    sprite_tiles: H.blankPool(), bg_tiles: H.blankPool(),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x21, 0x10, 0x30] })),
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    backgrounds: [{ name: 'bg', dimensions: { screens_x: 2, screens_y: 2 }, nametable: nt, behaviour: beh }],
    behaviour_types: [...H.BEHAVIOUR_TYPES],
    selectedBgIdx: 0, builder: win.BuilderDefaults(),
  };
  s.builder.modules.game.config = { type: 'racer', racerTopSpeed: 4, racerLaps: 3, racerCheckpoints: 2 };
  return s;
}

const { srv } = await H.startServer(PORT);
try {
  const s = makeState();
  const asm = win.BuilderAssembler.assemble(s, tpl);
  if (/^#define RACER_CP_COUNT 2$/m.test(asm)) ok('racer emits RACER_CP_COUNT 2');
  else bad('racer did not emit RACER_CP_COUNT 2');

  let c = asm.replace('while (oam_idx < 256) {',
    '(*(unsigned char*)0x0700)=(unsigned char)(px&0xFF);(*(unsigned char*)0x0701)=(unsigned char)(px>>8);' +
    '(*(unsigned char*)0x0704)=racer_heading;(*(unsigned char*)0x0705)=racer_laps;(*(unsigned char*)0x0706)=racer_cp_stage;' +
    'while (oam_idx < 256) {');
  const r = await H.buildRom(PORT, {
    state: s, playerSpriteIdx: 0, playerStart: { x: 104, y: 200 }, mode: 'browser', customMainC: c });
  if (!r.ok) { bad('racer-cp ROM did not compile at stage ' + r.stage + ':\n' + String(r.log || '').slice(-1800)); }
  else {
    const h = H.openRom(r.romBytes);
    const mem = h.nes.cpu.mem;
    const pxv = () => mem[0x700] + 256 * mem[0x701];
    const head = () => mem[0x704];
    const laps = () => mem[0x705];
    const stage = () => mem[0x706];
    const steerTo = (t) => {
      for (let g = 0; g < 80 && head() !== t; g++) {
        const dir = ((t - head() + 16) % 16) <= 8 ? H.BTN.RIGHT : H.BTN.LEFT;
        h.hold(dir); h.frames(1); h.release(dir); h.frames(1);
      }
    };
    const leg = (heading, pred, max = 500) => {
      h.release(H.BTN.A); steerTo(heading); h.hold(H.BTN.A);
      let g = 0; while (!pred() && g < max) { h.frames(1); g++; }
      h.release(H.BTN.A); return pred();
    };

    h.frames(200);
    if (laps() === 0 && stage() === 0) ok('starts at 0 laps, checkpoint stage 0');
    else bad('bad start: laps=' + laps() + ' stage=' + stage());

    // Ordered lap: out past CP1 then CP2 (stage 1 → 2), back over finish → lap 1.
    leg(0, () => pxv() > (CP2_C + 2) * 8);
    if (stage() === 2 && laps() === 0) ok('passing CP1 then CP2 advances to stage 2 (no lap yet)');
    else bad('after CP1+CP2: stage=' + stage() + ' laps=' + laps() + ' (expected 2 / 0)');
    leg(8, () => pxv() < (FIN_C - 1) * 8);
    if (laps() === 1) ok('finish after both checkpoints counts a lap');
    else bad('ordered lap did not count (laps=' + laps() + ')');

    // Order enforced: out past CP1 only (stage 1), turn back over finish — must
    // NOT count (CP2 skipped).
    leg(0, () => pxv() > (CP1_C + 2) * 8 && pxv() < (CP2_C - 2) * 8);
    if (stage() === 1) ok('passing only CP1 leaves stage at 1');
    else bad('after CP1 only: stage=' + stage() + ' (expected 1)');
    leg(8, () => pxv() < (FIN_C - 1) * 8);
    if (laps() === 1) ok('finish after skipping CP2 does NOT count (order enforced)');
    else bad('order not enforced — lap counted without CP2 (laps=' + laps() + ')');
  }
} catch (e) {
  bad('threw: ' + (e && e.stack || e));
} finally {
  await H.stopServer(srv);
}

if (failed) process.exit(1);
console.log('\nRacer ordered checkpoints (E3-5) test complete.');
