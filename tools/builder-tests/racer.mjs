#!/usr/bin/env node
// Arc E §3 (E3-1) — top-down racer movement spike.
//
// BW_GAME_STYLE == 3: angle-based velocity.  Steer (Left/Right) rotates a
// 16-direction heading; A/Up accelerates along it (8.8 fixed-point speed);
// friction bleeds the speed off when coasting; vx/vy come from the COS16 table.
// No collision, laps, or rotated art yet (E3-2..E3-4).  Drives a real ROM and
// asserts the physics:
//   0. the game module emits BW_GAME_STYLE 3 + the RACER_MAX_SPEED tunable.
//   1. accelerating from rest at heading 0 drives the car +x (and not +y).
//   2. releasing accelerate makes the car coast to a full stop (friction).
//   3. steering changes the heading.
//   4. after steering, the velocity follows the new heading via the cos table
//      (the car moves in the steered direction — the heart of the spike).
import * as H from './lib/render-harness.mjs';

const PORT = 18863;
let failed = false;
const ok  = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };

// Must match the engine table in platformer.c.
const COS16 = [127, 117, 90, 49, 0, -49, -90, -117, -127, -117, -90, -49, 0, 49, 90, 117];
const sinOf = (h) => COS16[(h + 12) & 15];

const win = H.loadBuilderModules();
const tpl = H.readTemplate();

// 2×2 world (open track, behaviour 0 everywhere) so SCROLL_BUILD is on and the
// car has room to drive in every direction from a central start.
function makeState() {
  const cols = 64, rows = 60;
  const nt = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ tile: 1, palette: 0 })));
  const beh = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => 0));
  const s = {
    name: 'racer', version: 1, universal_bg: 0x0F,
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
  // 0. Emit guards: the game module must select the racer style + tunable.
  const asm = win.BuilderAssembler.assemble(s, tpl);
  if (!/^#define BW_GAME_STYLE 3$/m.test(asm)) bad('game module did not emit BW_GAME_STYLE 3');
  else ok('racer game type emits #define BW_GAME_STYLE 3');
  if (!/^#define RACER_MAX_SPEED 640$/m.test(asm)) bad('racer did not emit RACER_MAX_SPEED (tier 3 → 640)');
  else ok('racer emits RACER_MAX_SPEED tunable (640)');

  // Mirror px (u16), py (u16), heading (u8), speed (u16) into scratch RAM.
  let c = asm.replace('while (oam_idx < 256) {',
    '(*(unsigned char*)0x0700)=(unsigned char)(px&0xFF);(*(unsigned char*)0x0701)=(unsigned char)(px>>8);' +
    '(*(unsigned char*)0x0702)=(unsigned char)(py&0xFF);(*(unsigned char*)0x0703)=(unsigned char)(py>>8);' +
    '(*(unsigned char*)0x0704)=racer_heading;' +
    '(*(unsigned char*)0x0705)=(unsigned char)(racer_speed&0xFF);(*(unsigned char*)0x0706)=(unsigned char)(racer_speed>>8);' +
    'while (oam_idx < 256) {');
  const r = await H.buildRom(PORT, {
    state: s, playerSpriteIdx: 0, playerStart: { x: 160, y: 120 }, mode: 'browser', customMainC: c });
  if (!r.ok) { bad('racer ROM did not compile at stage ' + r.stage + ':\n' + String(r.log || '').slice(-1800)); }
  else {
    const h = H.openRom(r.romBytes);
    const mem = h.nes.cpu.mem;
    const pxv  = () => mem[0x700] + 256 * mem[0x701];
    const pyv  = () => mem[0x702] + 256 * mem[0x703];
    const head = () => mem[0x704];
    const spd  = () => mem[0x705] + 256 * mem[0x706];

    // Settle: the 2×2 world streams over many vblanks before the main loop
    // ticks; with no input the car (speed 0) stays put, so run a generous
    // fixed warm-up, then take the baseline.
    h.frames(200);
    const baseHead = head();
    if (baseHead === 0) ok('car starts at heading 0 (facing +x)');
    else bad('car did not start at heading 0 (got ' + baseHead + ')');

    // 1. Accelerate straight: hold A at heading 0 → px climbs, py barely moves.
    //    Measured over a generous window so it's robust to startup/streaming
    //    timing (jsnes is deterministic, but the exact frame the main loop takes
    //    over shifts as the ROM changes).
    const ax = pxv(), ay = pyv();
    h.hold(H.BTN.A); h.frames(45); h.release(H.BTN.A);
    const dx1 = pxv() - ax, dy1 = pyv() - ay;
    if (dx1 > 8 && Math.abs(dy1) <= 3)
      ok('accelerate at heading 0 drives +x (Δpx=' + dx1 + ', Δpy=' + dy1 + ')');
    else bad('accelerate at heading 0 did not drive cleanly +x (Δpx=' + dx1 + ', Δpy=' + dy1 + ')');
    if (spd() > 0) ok('accelerating builds speed (speed=' + spd() + ' 8.8)');
    else bad('accelerating did not build speed');

    // 2. Coast to stop: release accelerate → friction bleeds speed to 0 and the
    //    car stops moving.  Sample px over the final frames to confirm it halts.
    let guard = 0;
    while (spd() > 0 && guard < 240) { h.frames(1); guard++; }
    const sx = pxv(); h.frames(10); const ex = pxv();
    if (spd() === 0 && ex === sx) ok('car coasts to a full stop (friction; stopped after ' + guard + ' frames)');
    else bad('car did not coast to a stop (speed=' + spd() + ', Δpx after stop=' + (ex - sx) + ')');

    // 3. Steer: hold Right a few frames → heading changes from 0.
    h.hold(H.BTN.RIGHT); h.frames(6); h.release(H.BTN.RIGHT);
    const h1 = head();
    if (h1 !== baseHead) ok('steering Right changes the heading (0 → ' + h1 + ')');
    else bad('steering did not change the heading (still ' + baseHead + ')');

    // 4. Velocity follows the steered heading: accelerate and confirm Δpx/Δpy
    //    track the sign of COS16[h]/sin(h) — i.e. the car drives where it points.
    const cx = COS16[h1], cy = sinOf(h1);
    const bx = pxv(), by = pyv();
    h.hold(H.BTN.A); h.frames(16); h.release(H.BTN.A);
    const dx2 = pxv() - bx, dy2 = pyv() - by;
    const dirOK = (comp, delta) =>
      comp > 20 ? delta > 1 : comp < -20 ? delta < -1 : Math.abs(delta) <= 3;
    if (dirOK(cx, dx2) && dirOK(cy, dy2))
      ok('velocity follows heading ' + h1 + ' via the cos table ' +
         '(cos=' + cx + '→Δpx=' + dx2 + ', sin=' + cy + '→Δpy=' + dy2 + ')');
    else bad('velocity did not follow heading ' + h1 +
         ' (cos=' + cx + ' Δpx=' + dx2 + ', sin=' + cy + ' Δpy=' + dy2 + ')');
  }
} catch (e) {
  bad('threw: ' + (e && e.stack || e));
} finally {
  await H.stopServer(srv);
}

if (failed) process.exit(1);
console.log('\nRacer (E3-1) movement-spike test complete.');
