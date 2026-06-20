#!/usr/bin/env node
// Arc E §1 (E1-0) — 16x16 metatiles, server-side-expansion spike.
//
// A metatile = 2x2 tiles + ONE palette + ONE behaviour id.  A background can be
// authored as a grid of metatile ids (mtmap) over a per-bg library (metatiles);
// the server expands it into the ordinary 8x8 nametable/behaviour grids the rest
// of the pipeline already consumes — no engine/scroll/baseline change.
//
// Two assertions:
//   A. Palette-correct BY CONSTRUCTION — every 16x16 attribute quadrant is
//      single-palette (the desync §1.2 kills: per-8x8-cell palette that the old
//      emitter silently downsampled).  Checked against the REAL server
//      `_expand_metatiles` + `_world_nametable` via a Python sub-check.
//   B. A hand-authored metatile project compiles to a real NES ROM via /play.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import * as H from './lib/render-harness.mjs';

const PORT = 18836;
let failed = false;
const ok  = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };

// A per-bg metatile library: two blocks with DIFFERENT palettes, so a
// checkerboard maximally stresses attribute-quadrant uniformity.
const metatiles = [
  { tiles: [1, 2, 3, 4], palette: 0, behaviour: 1 },   // "ground" block, pal 0
  { tiles: [5, 6, 7, 8], palette: 2, behaviour: 0 },   // "sky" block,    pal 2
];
// 15 rows x 16 cols of metatiles = exactly one 32x30 screen, checkerboard.
const mtmap = Array.from({ length: 15 }, (_, r) =>
  Array.from({ length: 16 }, (_, c) => (r + c) % 2));

function makeState() {
  return {
    name: 'metatiles', version: 1, universal_bg: 0x0F,
    sprites: [{ role: 'player', name: 'hero', width: 2, height: 2, cells: H.mkCells(2, 2) }],
    sprite_tiles: H.blankPool(), bg_tiles: H.blankPool(),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x21, 0x10, 0x30] })),
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    backgrounds: [{
      name: 'mt-bg',
      tileMode: '16x16',
      metatiles,
      mtmap,
    }],
    behaviour_types: H.BEHAVIOUR_TYPES, selectedBgIdx: 0,
  };
}

const state = makeState();

// --- A. Palette-uniformity, exercised against the real server expansion -----
const tmp = path.join(os.tmpdir(), 'metatile_state_' + PORT + '.json');
fs.writeFileSync(tmp, JSON.stringify(state));
const py = [
  'import json, sys',
  'sys.path.insert(0, ' + JSON.stringify(path.join(H.ROOT, 'tools')) + ')',
  'import playground_server as P',
  'st = json.load(open(' + JSON.stringify(tmp) + '))',
  'P._expand_metatiles(st)',
  'bg = st["backgrounds"][st.get("selectedBgIdx", 0)]',
  'nt = bg["nametable"]; beh = bg["behaviour"]',
  // every 2x2 tile group (= one 16x16 attribute quadrant) must be one palette
  'nonuniform = 0',
  'for r in range(0, len(nt), 2):',
  '    for c in range(0, len(nt[r]), 2):',
  '        pals = {nt[r+dr][c+dc].get("palette", 0) for dr in (0,1) for dc in (0,1)',
  '                if r+dr < len(nt) and c+dc < len(nt[r+dr])}',
  '        if len(pals) > 1: nonuniform += 1',
  // expansion sanity: 15x16 metatiles -> 30x32 tiles, 1 screen
  'dims = bg["dimensions"]',
  'assert len(nt) == 30 and len(nt[0]) == 32, f"expanded size {len(nt)}x{len(nt[0])}"',
  'assert dims["screens_x"] == 1 and dims["screens_y"] == 1, dims',
  // a checkerboard metatile (id 1, pal 2, behaviour 0) and (id 0, pal 0, beh 1)
  // -> top-left metatile is id (0+0)%2=0 -> palette 0, behaviour 1 across its 2x2
  'assert nt[0][0]["palette"] == 0 and nt[0][1]["palette"] == 0, "TL quad palette"',
  'assert beh[0][0] == 1 and beh[1][1] == 1, "TL behaviour block"',
  'assert nt[0][2]["palette"] == 2, "next metatile palette"',
  'print("NONUNIFORM", nonuniform)',
  'sys.exit(1 if nonuniform else 0)',
].join('\n');
const res = spawnSync('python3', ['-c', py], { encoding: 'utf8' });
try { fs.unlinkSync(tmp); } catch {}
if (res.status === 0) {
  ok('every 16x16 attribute quadrant is single-palette (correct by construction)');
} else {
  bad('palette-uniformity check failed:\n' + (res.stdout || '') + (res.stderr || ''));
}

// --- B. End-to-end: a metatile project builds a real ROM through /play ------
const { srv } = await H.startServer(PORT);
try {
  const r = await H.buildRom(PORT, {
    state,
    playerSpriteIdx: 0,
    playerStart: { x: 60, y: 120 },
    mode: 'browser',
    // No customMainC — the server assembles scene.inc/nam from the (expanded)
    // background, which is the whole point of the spike.
  });
  if (!r.ok) {
    bad('metatile /play build rejected at stage ' + r.stage + ':\n' + String(r.log || '').slice(-1800));
  } else if (!r.romBytes || r.romBytes.subarray(0, 4).toString('latin1') !== 'NES\x1a') {
    bad('metatile build did not return a valid iNES ROM');
  } else {
    ok('hand-authored metatile project compiles to a real NES ROM (' + r.size + ' bytes)');
  }
} catch (e) {
  bad('threw: ' + (e && e.stack || e));
} finally {
  await H.stopServer(srv);
}

if (failed) process.exit(1);
console.log('\nMetatiles (E1-0) spike test complete.');
