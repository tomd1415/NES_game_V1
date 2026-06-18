#!/usr/bin/env node
// Render regression — the win/death screen tint stays watchable, it does NOT
// flood/grey-out the screen.
//
// Backfills B-4 ("green screen"): the win and death tints used to set the PPU
// greyscale bit alongside colour-emphasis (PPU_MASK = 0x1F | emphasis), which
// in jsnes (and on hardware) collapses every colour onto the grey ramp — the
// screen washes out. The engine now uses 0x1E | emphasis (greyscale bit
// cleared), so the tint stays colourful.
//
// This is the render-level companion to the source guard in run-all.mjs
// ("tint engine-owned (0x1E)"). It drives a real win and checks the rendered
// frame: the tint must actually FIRE (the screen changes) yet KEEP its colour
// (the greyscale collapse would crash the saturated-pixel fraction — measured
// 0.66 with the fix vs 0.22 with the 0x1F bug).
//
// See docs/plans/current/2026-06-18-arc-a-render-test-harness.md.

import * as H from './lib/render-harness.mjs';

const PORT = 18821;
let failed = false;
const ok  = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };

// A colourful 4-quadrant background tile (palette indices 0/1/2/3) tiled across
// the screen, so a greyscale collapse is visible as lost saturation.
const QUAD = Array.from({ length: 8 }, (_, r) =>
  Array.from({ length: 8 }, (_, c) => (r < 4 ? 0 : 2) + (c < 4 ? 0 : 1)));

function winBackground() {
  const cols = 32, rows = 30;
  const beh = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let c = 0; c < cols; c++) beh[28][c] = 1;     // SOLID_GROUND floor
  beh[27][8] = 5;                                     // TRIGGER under player centre
  const nt = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ tile: 1, palette: 0 })));
  return { name: 'bg', dimensions: { screens_x: 1, screens_y: 1 }, nametable: nt, behaviour: beh };
}

const win = H.loadBuilderModules();
const tpl = H.readTemplate();
const { srv } = await H.startServer(PORT);
try {
  const bg = H.blankPool();
  bg[1] = { pixels: QUAD, name: 'quad' };
  const s = {
    name: 'wintint', version: 1, universal_bg: 0x0F,
    sprites: [{ role: 'player', name: 'hero', width: 2, height: 2, cells: H.mkCells(2, 2) }],
    sprite_tiles: H.blankPool(), bg_tiles: bg,
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x2A, 0x12] })), // red/green/blue
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    backgrounds: [winBackground()],
    behaviour_types: H.BEHAVIOUR_TYPES, selectedBgIdx: 0,
    builder: win.BuilderDefaults(),
  };
  s.builder.modules.win_condition.enabled = true;     // reach-a-trigger-tile win

  const r = await H.buildRom(PORT, {
    state: s, playerSpriteIdx: 0, playerStart: { x: 60, y: 120}, sceneSprites: [],
    mode: 'browser', customMainC: win.BuilderAssembler.assemble(s, tpl),
  });
  if (!r.ok) {
    bad('win project did not compile at stage ' + r.stage + ':\n' + String(r.log || '').slice(-1500));
  } else {
    const h = H.openRom(r.romBytes);
    h.frames(8);
    const pre = Float64Array.from(h.lastFrame());        // player still falling, not won
    const satPre = H.saturatedFraction(h.lastFrame());
    h.frames(150);                                        // player lands on the trigger → win
    const post = h.lastFrame();

    // 1. The tint must actually fire — a colour-emphasis change repaints most
    //    of the screen (the player moving alone is < 1% of pixels).
    const changed = H.frameDiffFraction(pre, post);
    if (changed > 0.3) ok('win tint fires — ' + (changed * 100).toFixed(0) + '% of the screen changes');
    else bad('win tint never applied (only ' + (changed * 100).toFixed(1) + '% of pixels changed)');

    // 2. The screen stays colourful — NOT the greyscale wash-out of B-4.
    const satPost = H.saturatedFraction(post);
    if (satPost >= 0.45) ok('tinted screen keeps its colour (saturated fraction ' + satPost.toFixed(2) + ')');
    else bad('tinted screen lost colour — greyscale flood regression (saturated fraction ' +
             satPost.toFixed(2) + ', baseline ' + satPre.toFixed(2) + ')');

    // 3. The screen is not blank (rendering still on under the tint).
    const lit = H.countNonBg(post, 0, 0, 256, 240, 0x000000);
    if (lit > 1000) ok('screen still renders under the tint (' + lit + ' lit pixels)');
    else bad('screen went (near-)blank under the tint (' + lit + ' lit pixels)');
  }
} catch (e) {
  bad('threw: ' + (e && e.stack || e));
} finally {
  await H.stopServer(srv);
}

if (failed) process.exit(1);
console.log('\nWin/death tint-not-flood render smoke-test complete.');
