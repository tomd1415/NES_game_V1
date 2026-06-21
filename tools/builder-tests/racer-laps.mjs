#!/usr/bin/env node
// Arc E §3 (E3-4) — top-down racer laps + race goal.
//
// A lap = cross the finish line (behaviour id 7), pass a checkpoint (id 5), then
// cross the finish again — the checkpoint stops a pupil farming laps on the line
// and needs no ordering.  Reaching RACER_LAPS_TO_WIN ends the race (win tint +
// frozen car).  Drives a real ROM round a simple horizontal track and asserts:
//   1. a full finish→checkpoint→finish lap increments the counter;
//   2. crossing the finish again WITHOUT a fresh checkpoint does NOT count;
//   3. completing the last lap sets the finished flag and freezes the car.
import * as H from './lib/render-harness.mjs';

const PORT = 18841;
let failed = false;
const ok  = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };

const FIN_C = 20, CHK_C = 40;        // finish + checkpoint columns (2 cols each)
const LAPS_TO_WIN = 2;

const win = H.loadBuilderModules();
const tpl = H.readTemplate();

// 2×2 open world; full-height finish (id 7) + checkpoint (id 5) strips.
function makeState() {
  const cols = 64, rows = 60;
  const nt = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ tile: 1, palette: 0 })));
  const beh = Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0));
  for (let r = 0; r < rows; r++) {
    beh[r][FIN_C] = 7; beh[r][FIN_C + 1] = 7;   // finish line
    beh[r][CHK_C] = 5; beh[r][CHK_C + 1] = 5;   // checkpoint
  }
  const s = {
    name: 'racer-laps', version: 1, universal_bg: 0x0F,
    sprites: [{ role: 'player', name: 'car', width: 2, height: 2, cells: H.mkCells(2, 2) }],
    sprite_tiles: H.blankPool(), bg_tiles: H.blankPool(),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x21, 0x10, 0x30] })),
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    backgrounds: [{ name: 'bg', dimensions: { screens_x: 2, screens_y: 2 }, nametable: nt, behaviour: beh }],
    behaviour_types: [...H.BEHAVIOUR_TYPES],
    selectedBgIdx: 0, builder: win.BuilderDefaults(),
  };
  s.builder.modules.game.config = { type: 'racer', racerTopSpeed: 4, racerLaps: LAPS_TO_WIN };
  return s;
}

const { srv } = await H.startServer(PORT);
try {
  const s = makeState();
  const asm = win.BuilderAssembler.assemble(s, tpl);
  if (/^#define RACER_LAPS_TO_WIN 2$/m.test(asm)) ok('racer emits RACER_LAPS_TO_WIN tunable');
  else bad('racer did not emit RACER_LAPS_TO_WIN 2');

  let c = asm.replace('while (oam_idx < 256) {',
    '(*(unsigned char*)0x0700)=(unsigned char)(px&0xFF);(*(unsigned char*)0x0701)=(unsigned char)(px>>8);' +
    '(*(unsigned char*)0x0702)=(unsigned char)(py&0xFF);(*(unsigned char*)0x0703)=(unsigned char)(py>>8);' +
    '(*(unsigned char*)0x0704)=racer_heading;' +
    '(*(unsigned char*)0x0705)=racer_laps;(*(unsigned char*)0x0706)=racer_cp_stage;(*(unsigned char*)0x0707)=racer_finished;' +
    'while (oam_idx < 256) {');
  const r = await H.buildRom(PORT, {
    state: s, playerSpriteIdx: 0, playerStart: { x: 144, y: 200 }, mode: 'browser', customMainC: c });
  if (!r.ok) { bad('racer-laps ROM did not compile at stage ' + r.stage + ':\n' + String(r.log || '').slice(-1800)); }
  else {
    const h = H.openRom(r.romBytes);
    const mem = h.nes.cpu.mem;
    const pxv = () => mem[0x700] + 256 * mem[0x701];
    const head = () => mem[0x704];
    const laps = () => mem[0x705];
    const armed = () => mem[0x706];
    const finished = () => mem[0x707];

    const steerTo = (target) => {
      for (let g = 0; g < 80 && head() !== target; g++) {
        const dir = ((target - head() + 16) % 16) <= 8 ? H.BTN.RIGHT : H.BTN.LEFT;
        h.hold(dir); h.frames(1); h.release(dir); h.frames(1);
      }
    };
    // Face `heading`, hold accelerate, drive until `pred` (or timeout), release.
    const leg = (heading, pred, max = 450) => {
      h.release(H.BTN.A); steerTo(heading); h.hold(H.BTN.A);
      let g = 0; while (!pred() && g < max) { h.frames(1); g++; }
      h.release(H.BTN.A); return pred();
    };

    h.frames(200);
    if (laps() === 0 && finished() === 0 && armed() === 0) ok('race starts at 0 laps, not armed, not finished');
    else bad('unexpected start state: laps=' + laps() + ' armed=' + armed() + ' finished=' + finished());

    // Lap 1 outbound: drive right past the checkpoint (crossing the finish on the
    // way must NOT count — not armed yet).
    leg(0, () => pxv() > (CHK_C + 2) * 8);
    if (laps() === 0 && armed() === 1) ok('crossing finish unarmed does not count; checkpoint arms the lap');
    else bad('after outbound: laps=' + laps() + ' armed=' + armed() + ' (expected 0 / 1)');

    // Lap 1 return: drive left past the finish → lap 1 counts.
    leg(8, () => pxv() < (FIN_C - 2) * 8);
    if (laps() === 1 && finished() === 0) ok('finish→checkpoint→finish counts one lap');
    else bad('after return: laps=' + laps() + ' finished=' + finished() + ' (expected 1 / 0)');

    // Anti-farm: drive right back over the finish but stop BEFORE the checkpoint.
    leg(0, () => pxv() > (FIN_C + 6) * 8);
    if (laps() === 1) ok('re-crossing the finish without a new checkpoint does NOT count (anti-farm)');
    else bad('anti-farm failed: laps jumped to ' + laps());

    // Finish lap 2: on to the checkpoint, then back over the finish → win.
    leg(0, () => pxv() > (CHK_C + 2) * 8);
    leg(8, () => pxv() < (FIN_C - 2) * 8 || finished() === 1);
    if (laps() >= LAPS_TO_WIN && finished() === 1) ok('completing the last lap wins the race (finished flag set)');
    else bad('race not won: laps=' + laps() + ' finished=' + finished());

    // Frozen after the win: accelerating does nothing.
    steerTo(0);
    const fx = pxv(); h.hold(H.BTN.A); h.frames(20); h.release(H.BTN.A);
    if (pxv() === fx) ok('car is frozen after the race is won (px unchanged)');
    else bad('car still moved after winning (px ' + fx + ' → ' + pxv() + ')');
  }
} catch (e) {
  bad('threw: ' + (e && e.stack || e));
} finally {
  await H.stopServer(srv);
}

if (failed) process.exit(1);
console.log('\nRacer laps (E3-4) test complete.');
