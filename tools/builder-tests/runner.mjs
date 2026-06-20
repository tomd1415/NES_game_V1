#!/usr/bin/env node
// Arc E §2 (E2-0) — infinite-runner / Geometry-Dash game style spike.
//
// BW_GAME_STYLE == 2: the camera auto-scrolls, the player rides it at a fixed
// screen X (no manual left/right), taps A to jump (reusing the shared platformer
// gravity/jump), and snaps back to the start of the track on touching a spike
// tile (behaviour slot 7) or reaching the end.  Drives a real ROM and asserts:
//   1. cam_x auto-advances every frame.
//   2. the player is locked to cam_x + RUNNER_SCREEN_X (rides the camera).
//   3. tapping A makes the player jump (py rises then returns).
//   4. touching a spike tile resets the run (cam_x snaps back near 0).
import * as H from './lib/render-harness.mjs';

const PORT = 18837;
let failed = false;
const ok  = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };

const RUNNER_SCREEN_X = 64;     // must match the engine default
const SPIKE_COL = 90;           // world column painted as spike (behaviour 7)

const win = H.loadBuilderModules();
const tpl = H.readTemplate();

// 4x1 world (128 cols) so SCROLL_BUILD is on and there's room to run.  Floor on
// row 28 everywhere; a spike (behaviour id 7) at the player's centre row in one
// far column.
function makeState() {
  const cols = 128, rows = 30;
  const nt = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ tile: 1, palette: 0 })));
  const beh = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, () => (r === 28 ? 1 : 0)));
  beh[26][SPIKE_COL] = 7; beh[27][SPIKE_COL] = 7;   // deadly spike column
  const s = {
    name: 'runner', version: 1, universal_bg: 0x0F,
    sprites: [{ role: 'player', name: 'hero', width: 2, height: 2, cells: H.mkCells(2, 2) }],
    sprite_tiles: H.blankPool(), bg_tiles: H.blankPool(),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x21, 0x10, 0x30] })),
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    backgrounds: [{ name: 'bg', dimensions: { screens_x: 4, screens_y: 1 }, nametable: nt, behaviour: beh }],
    behaviour_types: [...H.BEHAVIOUR_TYPES, { id: 7, name: 'spike' }],
    selectedBgIdx: 0, builder: win.BuilderDefaults(),
  };
  s.builder.modules.game.config = { type: 'runner', autoscrollSpeed: 2 };
  return s;
}

const { srv } = await H.startServer(PORT);
try {
  const s = makeState();
  // Emit guard: the game module must select the runner style.
  const asm = win.BuilderAssembler.assemble(s, tpl);
  if (!/^#define BW_GAME_STYLE 2$/m.test(asm)) bad('game module did not emit BW_GAME_STYLE 2');
  else ok('runner game type emits #define BW_GAME_STYLE 2');
  if (!/^#define AUTOSCROLL_SPEED 2$/m.test(asm)) bad('runner did not emit AUTOSCROLL_SPEED');
  else ok('runner emits AUTOSCROLL_SPEED tunable');

  // Dialogue is disabled in runner builds (its in-vblank writes fight the
  // auto-scroll — pupil-reported).  Even with the dialogue module ON, a runner
  // build must emit NO dialogue.
  {
    const sd = makeState();
    sd.builder.modules.dialogue = { enabled: true, config: { text: 'HELLO', proximity: 2 } };
    const dasm = win.BuilderAssembler.assemble(sd, tpl);
    // The template carries `#if BW_DIALOGUE_ENABLED` guards always; what the
    // dialogue MODULE emits (and the runner must skip) is the `#define`.
    if (/^#define BW_DIALOGUE_ENABLED 1$/m.test(dasm)) bad('runner build still enabled dialogue (#define emitted)');
    else ok('dialogue is disabled in runner builds (no #define BW_DIALOGUE_ENABLED)');
  }

  // Mirror cam_x (u16), px (u16), py (u8) into scratch RAM each frame.
  let c = asm.replace('while (oam_idx < 256) {',
    '(*(unsigned char*)0x0700)=(unsigned char)(cam_x&0xFF);(*(unsigned char*)0x0701)=(unsigned char)(cam_x>>8);' +
    '(*(unsigned char*)0x0702)=(unsigned char)(px&0xFF);(*(unsigned char*)0x0703)=(unsigned char)(px>>8);' +
    '(*(unsigned char*)0x0704)=(unsigned char)(py&0xFF);while (oam_idx < 256) {');
  const r = await H.buildRom(PORT, {
    state: s, playerSpriteIdx: 0, playerStart: { x: 64, y: 120 }, mode: 'browser', customMainC: c });
  if (!r.ok) { bad('runner ROM did not compile at stage ' + r.stage + ':\n' + String(r.log || '').slice(-1800)); }
  else {
    const h = H.openRom(r.romBytes);
    const camX = () => h.nes.cpu.mem[0x700] + 256 * h.nes.cpu.mem[0x701];
    const pxv  = () => h.nes.cpu.mem[0x702] + 256 * h.nes.cpu.mem[0x703];
    const pyv  = () => h.nes.cpu.mem[0x704];

    // Run until the world has loaded + the main loop is ticking.  The scratch
    // mirror reads 0xFFFF (uninitialised RAM) until the first main-loop frame
    // writes it, so wait out the garbage rather than testing for 0.
    let guard = 0; while (camX() > 5000 && guard < 240) { h.frames(1); guard++; }

    // 1. Auto-scroll: cam_x advances over time (sampled before the spike).
    const camA = camX(); h.frames(40); const camB = camX();
    if (camB > camA) ok('camera auto-scrolls (cam_x ' + camA + ' → ' + camB + ')');
    else bad('camera did not auto-scroll (cam_x stuck at ' + camA + ')');

    // 2. Player rides the camera at the fixed screen X.
    if (pxv() === camX() + RUNNER_SCREEN_X)
      ok('player locked to cam_x + ' + RUNNER_SCREEN_X + ' (px=' + pxv() + ', cam_x=' + camX() + ')');
    else bad('player not camera-locked: px=' + pxv() + ', cam_x=' + camX());

    // 3. Jump: settle on the floor, then tap A — py must rise then come back.
    //    The runner accepts A (Geometry-Dash "tap to jump") as well as the
    //    shared UP; we test A here since it's the runner's intuitive control.
    let py0 = pyv(); guard = 0;
    while (guard < 80) { h.frames(1); if (pyv() === py0) break; py0 = pyv(); guard++; }
    const rest = pyv();
    h.tap(H.BTN.A);
    let minPy = rest; for (let i = 0; i < 12; i++) { h.frames(1); if (pyv() < minPy) minPy = pyv(); }
    if (minPy < rest - 4) ok('tap A jumps (py rose ' + rest + ' → ' + minPy + ')');
    else bad('tap A did not jump (rest ' + rest + ', min ' + minPy + ')');

    // 4. Spike → respawn: run on until the player reaches the spike column; the
    //    run must snap back (cam_x drops sharply toward 0).
    let reset = false, prev = camX();
    for (let i = 0; i < 400 && !reset; i++) {
      h.frames(1);
      const cx = camX();
      if (cx + 80 < prev) reset = true;   // a big backward jump = respawn
      prev = cx;
    }
    if (reset) ok('touching a spike snaps the run back to the start (cam_x reset)');
    else bad('spike did not reset the run (cam_x never snapped back)');
  }
} catch (e) {
  bad('threw: ' + (e && e.stack || e));
} finally {
  await H.stopServer(srv);
}

if (failed) process.exit(1);
console.log('\nRunner (E2-0) spike test complete.');
