#!/usr/bin/env node
// Arc E §3 (E3-5) — 2-player top-down racer (shared screen, camera follows P1).
//
// A second car driven by controller 2 with the same angle-based physics.  The
// camera follows P1 (chosen model), so P2 can scroll off-screen.  Asserts the
// two cars are driven INDEPENDENTLY: controller 2 moves P2 (not P1), and
// controller 1 moves P1 (not P2).
import * as H from './lib/render-harness.mjs';

const PORT = 18845;
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
    name: 'racer-2p', version: 1, universal_bg: 0x0F,
    sprites: [
      { role: 'player', name: 'car1', width: 2, height: 2, cells: H.mkCells(2, 2) },
      { role: 'player', name: 'car2', width: 2, height: 2, cells: H.mkCells(2, 2) },
    ],
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

const { srv } = await H.startServer(PORT);
try {
  const s = makeState();
  const asm = win.BuilderAssembler.assemble(s, tpl);

  let c = asm.replace('while (oam_idx < 256) {',
    '(*(unsigned char*)0x0700)=(unsigned char)(px&0xFF);(*(unsigned char*)0x0701)=(unsigned char)(px>>8);' +
    '(*(unsigned char*)0x070A)=(unsigned char)(px2&0xFF);(*(unsigned char*)0x070B)=(unsigned char)(px2>>8);' +
    'while (oam_idx < 256) {');
  const r = await H.buildRom(PORT, {
    state: s, playerSpriteIdx: 0, playerStart: { x: 100, y: 100 },
    playerSpriteIdx2: 1, playerStart2: { x: 150, y: 150 },
    mode: 'browser', customMainC: c });
  if (!r.ok) { bad('2-player racer ROM did not compile at stage ' + r.stage + ':\n' + String(r.log || '').slice(-2000)); }
  else {
    const h = H.openRom(r.romBytes);
    const mem = h.nes.cpu.mem;
    const pxv  = () => mem[0x700] + 256 * mem[0x701];
    const px2v = () => mem[0x70A] + 256 * mem[0x70B];
    const driveP1 = (n) => { h.nes.buttonDown(1, H.BTN.A); for (let i=0;i<n;i++) h.frames(1); h.nes.buttonUp(1, H.BTN.A); };
    const driveP2 = (n) => { h.nes.buttonDown(2, H.BTN.A); for (let i=0;i<n;i++) h.frames(1); h.nes.buttonUp(2, H.BTN.A); };
    const coast = (n) => { for (let i=0;i<n;i++) h.frames(1); };

    h.frames(200);
    ok('2-player racer ROM built and runs (P2 racer blocks compiled)');

    // Controller 2 should move P2 (heading 0 → +x); P1 had no input from rest, so
    // it must not move at all.  (Movement is modest because two cars' fixed-point
    // velocity math runs the loop ~2× over the NTSC frame budget — a known perf
    // item; the point here is INDEPENDENT control, not speed.)
    let p1 = pxv(), p2 = px2v();
    driveP2(100);
    const dP2 = px2v() - p2, dP1 = pxv() - p1;
    if (dP2 > 12 && dP1 === 0)
      ok('controller 2 drives P2, not P1 (Δpx2=' + dP2 + ', Δpx1=' + dP1 + ')');
    else bad('P2 control wrong (Δpx2=' + dP2 + ', Δpx1=' + dP1 + ')');

    // Let P2 coast to a stop (friction; holding DOWN would reverse it now), then
    // drive P1 — P1 moves, the stopped P2 stays put.
    coast(260);
    p1 = pxv(); p2 = px2v();
    driveP1(100);
    const eP1 = pxv() - p1, eP2 = px2v() - p2;
    if (eP1 > 12 && Math.abs(eP2) < 6)
      ok('controller 1 drives P1, not P2 (Δpx1=' + eP1 + ', Δpx2=' + eP2 + ')');
    else bad('P1 control wrong (Δpx1=' + eP1 + ', Δpx2=' + eP2 + ')');
  }
} catch (e) {
  bad('threw: ' + (e && e.stack || e));
} finally {
  await H.stopServer(srv);
}

if (failed) process.exit(1);
console.log('\n2-player racer (E3-5) test complete.');
