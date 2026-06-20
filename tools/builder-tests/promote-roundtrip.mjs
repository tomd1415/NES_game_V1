#!/usr/bin/env node
// Arc E §1 (E1-1) — editor "Promote to metatiles" is non-destructive at the ROM
// level.  A palette-uniform 8×8 background, promoted via the real MetatileLib
// (what the Backgrounds-page button calls), must build to the SAME ROM through
// /play as the original 8×8 — i.e. promote → server-expand round-trips the
// rendered output.  This exercises the whole editor→server metatile path that
// the canvas UI drives, without needing the canvas.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import * as H from './lib/render-harness.mjs';

const PORT = 18839;
let failed = false;
const ok  = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };

// MetatileLib (the editor module) + the assembler, loaded headlessly.  We pass
// a customMainC so /play uses the TEMPDIR build path (not the in-place STEP_DIR
// path), which keeps the shared Step_Playground tree — and the golden test —
// pristine.  scene.inc/level.nam are still generated from the (expanded) state,
// so the metatile expansion under test is still exercised.
globalThis.window = globalThis;
for (const f of ['metatiles.js', 'sprite-render.js', 'builder-assembler.js', 'builder-modules.js']) {
  new Function(fs.readFileSync(path.join(H.WEB, f), 'utf8'))();
}
const MetatileLib = globalThis.MetatileLib;
const tpl = H.readTemplate();

const cell = (t, p) => ({ tile: t, palette: p });
// A 2×1 background with PALETTE-UNIFORM 2×2 blocks (so promote, which takes each
// block's top-left palette, is loss-free).  Checkerboard of two block kinds.
function uniform8x8Bg() {
  const cols = 64, rows = 30;
  const nt = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      const blk = ((r >> 1) + (c >> 1)) & 1;          // which 2×2 block kind
      const pal = blk ? 2 : 0;
      const tile = 1 + (r & 1) * 2 + (c & 1);          // 1..4 within the block
      row.push(cell(tile, pal));
    }
    nt.push(row);
  }
  const beh = Array.from({ length: rows }, () => Array(cols).fill(0));
  // Floor across the WHOLE bottom 2×2 block (rows 28+29) so behaviour is
  // block-uniform — promote bundles one behaviour per 16×16 block (D4), so a
  // loss-free round-trip needs the input uniform per block (palette + behaviour).
  for (let c = 0; c < cols; c++) { beh[28][c] = 1; beh[29][c] = 1; }
  return { name: 'bg', dimensions: { screens_x: 2, screens_y: 1 }, nametable: nt, behaviour: beh };
}

function baseState(bg) {
  return {
    name: 'promote-rt', version: 1, universal_bg: 0x0F,
    sprites: [{ role: 'player', name: 'hero', width: 2, height: 2, cells: H.mkCells(2, 2) }],
    sprite_tiles: H.blankPool(),
    bg_tiles: Array.from({ length: 256 }, (_, i) => ({
      // give tiles 1..4 distinct art so palette/tile differences would show
      pixels: Array.from({ length: 8 }, () => Array(8).fill(i % 4)), name: '' })),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: [{ slots: [0x21, 0x10, 0x30] }, { slots: [0x01, 0x11, 0x31] },
                  { slots: [0x02, 0x12, 0x32] }, { slots: [0x03, 0x13, 0x33] }],
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    backgrounds: [bg], selectedBgIdx: 0,
    behaviour_types: H.BEHAVIOUR_TYPES,
  };
}

const { srv } = await H.startServer(PORT);
try {
  const build = async (state) => {
    const r = await H.buildRom(PORT, {
      state, playerSpriteIdx: 0, playerStart: { x: 60, y: 120 }, mode: 'browser',
      customMainC: window.BuilderAssembler.assemble(state, tpl) });
    if (!r.ok) throw new Error('build failed at ' + r.stage + ': ' + String(r.log || '').slice(-600));
    return createHash('sha1').update(r.romBytes).digest('hex');
  };

  const bg8 = uniform8x8Bg();
  const sha8 = await build(baseState(bg8));
  ok('8×8 background builds (' + sha8.slice(0, 12) + '…)');

  // Promote a fresh copy via the real editor MetatileLib, then build.
  const bgMeta = uniform8x8Bg();
  MetatileLib.promote(bgMeta);
  if (bgMeta.tileMode !== '16x16') bad('promote did not set tileMode 16×16');
  const shaMeta = await build(baseState(bgMeta));
  ok('promoted (16×16) background builds (' + shaMeta.slice(0, 12) + '…)');

  if (sha8 === shaMeta) ok('promote is ROM-non-destructive (8×8 ≡ promoted, byte-identical)');
  else bad('promote changed the ROM: 8×8=' + sha8.slice(0, 12) + ' promoted=' + shaMeta.slice(0, 12));
} catch (e) {
  bad('threw: ' + (e && e.stack || e));
} finally {
  await H.stopServer(srv);
}

if (failed) process.exit(1);
console.log('\nPromote round-trip (E1-1) test complete.');
