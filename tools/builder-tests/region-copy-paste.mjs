#!/usr/bin/env node
// R-9 — background region copy/paste (editor-only, index.html).
//
// The select/copy/paste logic is pure given a `state` (the nametable), so we
// extract the R-9 block straight out of index.html's inline script, run it
// under tiny stubs, and check copy + paste (incl. the attribute-block snap)
// against a synthetic nametable.  This also proves the block parses.
//
// See docs/plans/current/2026-06-18-arc-c-tier2-backlog.md (R-9).

import { readFileSync } from 'node:fs';

let failed = false;
const ok  = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };

const html = readFileSync(new URL('../tile_editor_web/index.html', import.meta.url), 'utf8');

// Pull the contiguous R-9 helper block (normalisedTileRect … pasteNtRegionAtHover).
const start = html.indexOf('// --- R-9: background region copy/paste');
const end = html.indexOf('function applyNtTool(');
if (start < 0 || end < 0 || end <= start) {
  bad('could not locate the R-9 block in index.html (markers moved?)');
  process.exit(1);
}
const block = html.slice(start, end);
if (!/function copyNtRegion\(/.test(block) || !/function pasteNtRegion\(/.test(block)) {
  bad('R-9 block did not contain the expected functions');
  process.exit(1);
}
ok('R-9 region block found + extracted from index.html');

// --- Sandbox: minimal stubs for the free names the block references ---
let undoCount = 0, dirtyCount = 0, renderCount = 0;
const COLS = 8, ROWS = 8;
const makeNt = () => Array.from({ length: ROWS }, (_, y) =>
  Array.from({ length: COLS }, (_, x) => ({ tile: y * 10 + x, palette: (x + y) & 3 })));
let nametable = makeNt();
const activeBg = () => ({ nametable, dimensions: { screens_x: 1, screens_y: 1 } });
const docStub = { getElementById: () => ({ textContent: '', value: 'select', getContext: () => ({}) }) };

let factory;
try {
  factory = new Function('activeBg', 'document', 'hooks', `
    let ntSelection = null, ntRegionClipboard = null, ntHoverCell = null;
    const ntZoom = () => 1;
    const pushUndo = () => hooks.undo();
    const markDirty = () => hooks.dirty();
    const renderNametable = () => hooks.render();
    ${block}
    return {
      copyNtRegion, pasteNtRegion, pasteNtRegionAtHover, normalisedTileRect,
      setSel: (s) => { ntSelection = s; },
      setHover: (h) => { ntHoverCell = h; },
      getClip: () => ntRegionClipboard,
    };
  `);
} catch (e) {
  bad('R-9 block did not parse: ' + (e && e.message));
  process.exit(1);
}
ok('R-9 block parses as valid JS (new Function)');

const api = factory(activeBg, docStub, {
  undo: () => undoCount++, dirty: () => dirtyCount++, render: () => renderCount++,
});

// --- Copy a 2×2 region (1,1)-(2,2) ---
api.setSel({ x0: 1, y0: 1, x1: 2, y1: 2 });
api.copyNtRegion();
const clip = api.getClip();
if (clip && clip.w === 2 && clip.h === 2) ok('copy captures the selection size (2×2)');
else bad('copy produced the wrong size: ' + JSON.stringify(clip && { w: clip.w, h: clip.h }));
if (clip && clip.cells[0][0].tile === 11 && clip.cells[0][1].tile === 12
        && clip.cells[1][0].tile === 21 && clip.cells[1][1].tile === 22)
  ok('copy deep-clones the right {tile} cells');
else bad('copied cells are wrong: ' + JSON.stringify(clip && clip.cells));

// Mutating the source must NOT change the clipboard (deep clone).
nametable[1][1].tile = 999;
if (clip.cells[0][0].tile === 11) ok('clipboard is a deep clone (source edit does not leak in)');
else bad('clipboard aliased the source (tile became ' + clip.cells[0][0].tile + ')');
nametable = makeNt();   // reset

// --- Paste at an ODD anchor (5,5): must snap to the 2×2 block (4,4) ---
api.pasteNtRegion(5, 5);
const at = (y, x) => nametable[y][x].tile;
if (at(4, 4) === 11 && at(4, 5) === 12 && at(5, 4) === 21 && at(5, 5) === 22)
  ok('paste lands the region, snapped to the attribute block (odd 5,5 → 4,4)');
else bad('paste landed wrong: [' + [at(4,4), at(4,5), at(5,4), at(5,5)].join(',') + '] (want 11,12,21,22)');
if (undoCount === 1) ok('paste pushes exactly one undo step');
else bad('paste pushed ' + undoCount + ' undo steps (want 1)');
if (dirtyCount >= 1 && renderCount >= 1) ok('paste marks dirty + re-renders');
else bad('paste did not markDirty/renderNametable');

// --- Paste-at-hover uses the last hovered cell ---
nametable = makeNt();
api.setHover({ x: 0, y: 0 });
api.pasteNtRegionAtHover();
if (at(0, 0) === 11 && at(1, 1) === 22) ok('paste-at-hover anchors on the hovered cell (0,0)');
else bad('paste-at-hover wrong: [' + [at(0,0), at(1,1)].join(',') + ']');

// --- Out-of-bounds paste is clamped, not a crash ---
nametable = makeNt();
let threw = false;
try { api.pasteNtRegion(7, 7); } catch (e) { threw = true; }   // 7→6, region runs to col 7 (in), row 7 (in)
if (!threw) ok('paste near the edge is guarded (no crash on ragged/edge rows)');
else bad('paste near the edge threw');

if (failed) process.exit(1);
console.log('\nRegion copy/paste (R-9) smoke-test complete.');
