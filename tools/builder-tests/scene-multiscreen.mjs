#!/usr/bin/env node
// Multi-screen scene sprites — sprites can be placed anywhere in a scrolling
// level, not just the first screen (pupil-reported Builder limitation).
//
// ss_x/ss_y are 16-bit world pixels when a sprite sits past screen 1, and the
// engine hides an off-screen sprite (the world_to_screen hide-fix).  Drives a
// real ROM and asserts:
//   * a sprite at world x=400 (screen 2) is HIDDEN while the camera is on screen 1
//     (this also proves 16-bit storage: an 8-bit x would wrap 400→144 and show it
//     on screen 1),
//   * a sprite at world x=100 (screen 1) is visible from the start,
//   * scrolling right brings the screen-2 sprite into view.
import * as H from './lib/render-harness.mjs';

const PORT = 18847;
let failed = false;
const ok  = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };

const A_TILE = 20, B_TILE = 21;   // distinct tiles for the two scene sprites

const win = H.loadBuilderModules();
const tpl = H.readTemplate();

function cell(t) { return { tile: t, palette: 0, empty: false }; }
function makeState() {
  const cols = 64, rows = 30;     // 2 screens wide
  const nt = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ tile: 1, palette: 0 })));
  const beh = Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0));
  const s = {
    name: 'scene-ms', version: 1, universal_bg: 0x0F,
    sprites: [
      { role: 'player', name: 'hero',   width: 2, height: 2, cells: H.mkCells(2, 2) },
      { role: 'enemy',  name: 'far',    width: 1, height: 1, cells: [[cell(A_TILE)]] },
      { role: 'enemy',  name: 'near',   width: 1, height: 1, cells: [[cell(B_TILE)]] },
    ],
    sprite_tiles: H.blankPool(), bg_tiles: H.blankPool(),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x21, 0x10, 0x30] })),
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    backgrounds: [{ name: 'bg', dimensions: { screens_x: 2, screens_y: 1 }, nametable: nt, behaviour: beh }],
    behaviour_types: [...H.BEHAVIOUR_TYPES],
    selectedBgIdx: 0, builder: win.BuilderDefaults(),
  };
  s.builder.modules.game.config = { type: 'topdown' };
  return s;
}

const { srv } = await H.startServer(PORT);
try {
  const s = makeState();
  const asm = win.BuilderAssembler.assemble(s, tpl);
  let c = asm.replace('while (oam_idx < 256) {',
    '(*(unsigned char*)0x0700)=(unsigned char)(cam_x&0xFF);(*(unsigned char*)0x0701)=(unsigned char)(cam_x>>8);' +
    'while (oam_idx < 256) {');
  const r = await H.buildRom(PORT, {
    state: s, playerSpriteIdx: 0, playerStart: { x: 24, y: 120 }, mode: 'browser', customMainC: c,
    sceneSprites: [
      { spriteIdx: 1, x: 400, y: 120 },   // far: screen 2
      { spriteIdx: 2, x: 100, y: 120 },   // near: screen 1
    ],
  });
  if (!r.ok) { bad('scene-multiscreen ROM did not compile at stage ' + r.stage + ':\n' + String(r.log || '').slice(-1800)); }
  else {
    const h = H.openRom(r.romBytes);
    const camX = () => h.nes.cpu.mem[0x700] + 256 * h.nes.cpu.mem[0x701];
    const find = (tile) => H.findSpriteByTile(h.nes, tile, tile);

    let guard = 0; while (camX() > 5000 && guard < 240) { h.frames(1); guard++; }
    h.frames(60);

    // The screen-1 sprite (world x=100) sits at its real position on screen.
    const b0 = find(B_TILE);
    if (b0 && b0.x >= 90 && b0.x <= 112) ok('a screen-1 scene sprite (x=100) renders at its position (x=' + (b0 && b0.x) + ')');
    else bad('screen-1 scene sprite missing/misplaced: ' + JSON.stringify(b0));

    // The screen-2 sprite (world x=400) is off the right edge while on screen 1.
    // Crucially x clamps to ~255 — an 8-bit wrap of 400 would be 144 (mid-screen),
    // so this proves the 16-bit world position survived.
    const a0 = find(A_TILE);
    if (a0 && a0.x >= 250)
      ok('a screen-2 scene sprite (x=400) is off the right edge, not wrapped to mid-screen (16-bit x)');
    else bad('screen-2 sprite wrongly placed (8-bit wrap?) : ' + JSON.stringify(a0));

    // Scroll right; the screen-2 sprite slides to its true on-screen position.
    h.hold(H.BTN.RIGHT);
    let g = 0; while (camX() < 200 && g < 600) { h.frames(1); g++; }
    h.release(H.BTN.RIGHT);
    h.frames(8);
    if (camX() >= 200) ok('driving right scrolls the camera toward screen 2 (cam_x=' + camX() + ')');
    else bad('camera did not scroll enough (cam_x=' + camX() + ')');
    const a1 = find(A_TILE);
    if (a1 && a1.x < 240)
      ok('the screen-2 sprite scrolls into view at its true position (x=' + a1.x + ' ≈ 400-' + camX() + ')');
    else bad('screen-2 sprite did not scroll into view (cam_x=' + camX() + ', ' + JSON.stringify(a1) + ')');
  }
} catch (e) {
  bad('threw: ' + (e && e.stack || e));
} finally {
  await H.stopServer(srv);
}

if (failed) process.exit(1);
console.log('\nMulti-screen scene sprites test complete.');
