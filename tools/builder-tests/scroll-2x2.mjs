// 2x2 / vertical-scroll RENDER regression (feedback #9 / #29). four-screen.mjs
// only checks the iNES 4-screen header bit; this checks that a 2x2 world
// actually *scrolls seamlessly* across all four nametables — the recurring
// pupil bug (ghost rows, garbage at seams, jitter, drift into garbage).
//
// Method: build a 2x2 top-down grid whose two screen seams (world col 32 and
// row 30) are painted a unique colour, then drive the camera in an emulator
// and assert the seams render as one clean full-height column + full-width row
// and move the right way as the world scrolls. Runs headless in jsnes (which
// handles ordinary scrolling; only the mid-frame sprite-0 split defeats it).
import fs from 'node:fs';
import path from 'node:path';
import * as H from './lib/render-harness.mjs';

const WEB = H.WEB;
function fail(m) { console.error('FAIL:', m); process.exit(1); }
function assert(c, m) { if (!c) fail(m); }

globalThis.window = globalThis;
new Function(fs.readFileSync(path.join(WEB, 'engine-version.js'), 'utf8'))();
globalThis.NES_TARGET_ENGINE = globalThis.NES_ENGINE_VERSION;
for (const f of ['sprite-render.js', 'builder-assembler.js', 'builder-modules.js',
    'builder-validators.js', 'default-state.js', 'studio-starter.js']) {
  new Function(fs.readFileSync(path.join(WEB, f), 'utf8'))();
}
const tpl = fs.readFileSync(path.join(WEB, 'builder-templates', 'platformer.c'), 'utf8');

// --- A 2x2 top-down grid world with unique-colour seam stripes -------------
function solid(v) { return Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => v)); }
function makeState() {
  const s = window.StudioStarter.createTopdown();
  // Three distinct, solid colours: two for the checker, one only for the seams.
  s.bg_palettes[0].slots = [0x11, 0x1A, 0x16];   // blue, green, red(=seam)
  s.bg_tiles[1] = { name: 'a', pixels: solid(1) };
  s.bg_tiles[2] = { name: 'b', pixels: solid(2) };
  s.bg_tiles[3] = { name: 'seam', pixels: solid(3) };
  const bg = s.backgrounds[0];
  bg.dimensions = { screens_x: 2, screens_y: 2 };   // 64x60 tiles, four nametables
  bg.nametable = []; bg.behaviour = [];
  for (let r = 0; r < 60; r++) {
    const nt = [], bh = [];
    for (let c = 0; c < 64; c++) {
      // Screen seams: the vertical NT0/NT1 boundary (col 32-33) and the
      // horizontal NT0/NT2 boundary (row 30-31), painted the unique seam colour.
      const onSeam = (c === 32 || c === 33 || r === 30 || r === 31);
      const tile = onSeam ? 3 : (((Math.floor(c / 4) + Math.floor(r / 4)) % 2) ? 2 : 1);
      nt.push({ tile, palette: 0 }); bh.push(0);   // no walls — the player roams freely
    }
    bg.nametable.push(nt); bg.behaviour.push(bh);
  }
  const p1 = s.builder.modules.players.submodules.player1.config;
  p1.startX = 288; p1.startY = 272;   // interior, near centre, offset off the seam cross
  return s;
}

// The seam colour is the one that fills a whole screen column / row; the 32px
// checker never runs more than 32px of one colour along an axis, so an
// ≥85%-of-axis run uniquely identifies the seam (and proves it rendered).
// Scan the interior only (jsnes renders the leftmost 8px + edges solid black,
// which would otherwise read as a full-height/width "seam"), and ignore pure
// black, so the run detected is the painted seam colour.
const X0 = 8, X1 = 248, Y0 = 8, Y1 = 232;   // interior [X0,X1) x [Y0,Y1)
function vSeam(fb) {           // → {x,color} of the cleanest full-height column
  let best = null;
  for (let x = X0; x < X1; x++) {
    const cnt = new Map(); let dom = 0, dc = 0;
    for (let y = Y0; y < Y1; y++) { const c = fb[y * 256 + x]; const n = (cnt.get(c) || 0) + 1; cnt.set(c, n); if (n > dom) { dom = n; dc = c; } }
    if (dc !== 0 && dom >= 0.85 * (Y1 - Y0) && (!best || dom > best.dom)) best = { x, color: dc, dom };
  }
  return best;
}
function hSeam(fb) {           // → {y,color} of the cleanest full-width row
  let best = null;
  for (let y = Y0; y < Y1; y++) {
    const cnt = new Map(); let dom = 0, dc = 0;
    for (let x = X0; x < X1; x++) { const c = fb[y * 256 + x]; const n = (cnt.get(c) || 0) + 1; cnt.set(c, n); if (n > dom) { dom = n; dc = c; } }
    if (dc !== 0 && dom >= 0.85 * (X1 - X0) && (!best || dom > best.dom)) best = { y, color: dc, dom };
  }
  return best;
}
function distinctColours(fb) { return new Set(fb).size; }

// Drive: settle centred, scroll right, then scroll down. Returns snapshots.
function drive(romBytes) {
  const emu = H.openRom(romBytes);
  emu.frames(45);
  const C = emu.frame().slice();
  emu.hold(H.BTN.RIGHT); emu.frames(50); emu.release(H.BTN.RIGHT);
  const R = emu.frame().slice();
  emu.hold(H.BTN.DOWN); emu.frames(50); emu.release(H.BTN.DOWN);
  const D = emu.frame().slice();
  return { C, R, D };
}

const PORT = 18869;
const srv = await H.startServer(PORT, {});
try {
  const s = makeState();
  const r = await H.buildRom(PORT, {
    state: s, playerSpriteIdx: 0, playerStart: { x: 288, y: 272 }, sceneSprites: [],
    mode: 'browser', customMainC: window.BuilderAssembler.assemble(s, tpl),
    targetEngine: globalThis.NES_TARGET_ENGINE,
  });
  if (!r.ok) fail('2x2 grid did not build (stage ' + r.stage + '): ' + String(r.log || '').slice(-400));
  assert(r.romBytes[6] & 0x08, '2x2 world should set the iNES four-screen bit (byte6=0x' + r.romBytes[6].toString(16) + ')');
  console.log('✓ built a 2x2 world (four-screen bit set)');

  const a = drive(r.romBytes);

  // 1) Centred view: BOTH seams render — proves all four nametables show at
  //    once with no ghost/garbage.
  assert(distinctColours(a.C) > 3, 'centred 2x2 frame is near-blank (' + distinctColours(a.C) + ' colours) — nothing streamed');
  const vC = vSeam(a.C), hC = hSeam(a.C);
  assert(vC, 'vertical NT0/NT1 seam did not render as a clean full-height column at the centre');
  assert(hC, 'horizontal NT0/NT2 seam did not render as a clean full-width row at the centre');
  assert(vC.color === hC.color, 'the two seams are different colours — a seam is showing wrong nametable content');
  console.log('✓ centred 2x2 view shows both nametable seams cleanly (V@x=' + vC.x + ', H@y=' + hC.y + ')');

  // 2) Horizontal scroll streams correctly: the vertical seam moves LEFT.
  const vR = vSeam(a.R);
  assert(vR, 'vertical seam vanished after scrolling right — horizontal streaming dropped a column');
  assert(vR.x < vC.x, 'vertical seam did not move left when scrolling right (was x=' + vC.x + ', now x=' + vR.x + ')');
  console.log('✓ horizontal scroll streams cleanly (vertical seam x=' + vC.x + ' → ' + vR.x + ')');

  // 3) Vertical scroll streams correctly: the horizontal seam moves UP.
  const hR = hSeam(a.R), hD = hSeam(a.D);
  assert(hR && hD, 'horizontal seam vanished during vertical scroll — vertical streaming dropped a row');
  assert(hD.y < hR.y, 'horizontal seam did not move up when scrolling down (was y=' + hR.y + ', now y=' + hD.y + ')');
  console.log('✓ vertical scroll streams cleanly (horizontal seam y=' + hR.y + ' → ' + hD.y + ')');

  // 4) Determinism: same inputs → identical final frame (no scroll-boundary jitter).
  const b = drive(r.romBytes);
  let diff = 0; for (let i = 0; i < a.D.length; i++) if (a.D[i] !== b.D[i]) diff++;
  assert(diff === 0, 'scroll is non-deterministic across runs (' + diff + ' pixels differ) — boundary jitter');
  console.log('✓ scroll is deterministic across runs (no boundary jitter)');
} finally {
  await H.stopServer(srv.srv);
}
console.log('\n2x2 / vertical-scroll render regression complete.');
