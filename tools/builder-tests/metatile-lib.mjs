#!/usr/bin/env node
// Arc E §1 (E1-1 headless half) — the shared metatile library (metatiles.js):
// migrate, promote (8x8 -> 16x16), expand (16x16 -> 8x8).
//
// Asserts:
//   1. migrate is additive — 8x8 bgs untouched, 16x16 bgs get library/map arrays.
//   2. promote dedups 2x2 blocks into a library + id map (TL palette/behaviour).
//   3. promote -> expand round-trips a palette-uniform background exactly.
//   4. the JS `expand` matches the SERVER's _expand_metatile_bg byte-for-byte
//      (so the Backgrounds preview will match the built ROM).
//   5. a non-uniform block promotes to its TL palette (render-equivalent: the
//      server's attribute emitter already discarded the other 3 cells).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = '/home/duguid/projects/nesgame/attempt1';
const WEB  = path.join(ROOT, 'tools', 'tile_editor_web');

function fail(msg) { console.error('FAIL:', msg); process.exit(1); }
function assert(cond, msg) { if (!cond) fail(msg); }

globalThis.window = globalThis;
new Function(fs.readFileSync(path.join(WEB, 'metatiles.js'), 'utf8'))();
const M = globalThis.MetatileLib;
assert(M && M.migrate && M.promote && M.expand, 'metatiles.js did not expose MetatileLib');

// ---- 1. migrate is additive --------------------------------------------
{
  const eightBg = { name: 'a', nametable: [[{ tile: 0, palette: 0 }]] };  // no tileMode
  const s = { backgrounds: [eightBg, { name: 'b', tileMode: '16x16' }, { name: 'c', tileMode: 'weird' }] };
  M.migrate(s);
  assert(!('tileMode' in eightBg), 'migrate must not add tileMode to an 8x8 bg (keeps saves stable)');
  assert(Array.isArray(s.backgrounds[1].metatiles) && Array.isArray(s.backgrounds[1].mtmap),
    'migrate must ensure metatiles/mtmap arrays on a 16x16 bg');
  assert(s.backgrounds[2].tileMode === '8x8', 'migrate must normalise an unknown tileMode to 8x8');
  console.log('✓ migrate: additive (8x8 untouched, 16x16 arrays ensured, unknown -> 8x8)');
}

// ---- build a 4x4-tile (2x2-metatile) palette-uniform fixture -----------
// Two distinct blocks in a checkerboard -> library of 2, mtmap [[0,1],[1,0]].
function cell(t, p) { return { tile: t, palette: p }; }
function uniformBg() {
  const nametable = [
    [cell(1, 0), cell(2, 0), cell(5, 2), cell(6, 2)],
    [cell(3, 0), cell(4, 0), cell(7, 2), cell(8, 2)],
    [cell(5, 2), cell(6, 2), cell(1, 0), cell(2, 0)],
    [cell(7, 2), cell(8, 2), cell(3, 0), cell(4, 0)],
  ];
  const behaviour = [
    [1, 1, 0, 0],
    [1, 1, 0, 0],
    [0, 0, 1, 1],
    [0, 0, 1, 1],
  ];
  return { name: 'mt', nametable, behaviour };
}

// ---- 2. promote dedup + map -------------------------------------------
{
  const bg = uniformBg();
  // deep copies of the originals for later comparison
  const origNt = JSON.parse(JSON.stringify(bg.nametable));
  const origBeh = JSON.parse(JSON.stringify(bg.behaviour));
  M.promote(bg);
  assert(bg.tileMode === '16x16', 'promote must set tileMode 16x16');
  assert(bg.metatiles.length === 2, 'promote should dedup to 2 metatiles, got ' + bg.metatiles.length);
  assert(JSON.stringify(bg.mtmap) === JSON.stringify([[0, 1], [1, 0]]),
    'promote mtmap wrong: ' + JSON.stringify(bg.mtmap));
  assert(JSON.stringify(bg.metatiles[0]) === JSON.stringify({ tiles: [1, 2, 3, 4], palette: 0, behaviour: 1 }),
    'metatile 0 wrong: ' + JSON.stringify(bg.metatiles[0]));
  assert(JSON.stringify(bg.metatiles[1]) === JSON.stringify({ tiles: [5, 6, 7, 8], palette: 2, behaviour: 0 }),
    'metatile 1 wrong: ' + JSON.stringify(bg.metatiles[1]));
  console.log('✓ promote: dedups 2x2 blocks into a 2-entry library + correct id map');

  // ---- 3. round-trip: expand(promote(bg)) === original (uniform blocks) --
  const ex = M.expand(bg);
  assert(JSON.stringify(ex.nametable) === JSON.stringify(origNt),
    'round-trip nametable mismatch');
  assert(JSON.stringify(ex.behaviour) === JSON.stringify(origBeh),
    'round-trip behaviour mismatch');
  console.log('✓ promote -> expand round-trips a palette-uniform background exactly');

  // ---- 4. JS expand == server _expand_metatile_bg -----------------------
  const tmp = path.join(os.tmpdir(), 'mt_lib_bg.json');
  fs.writeFileSync(tmp, JSON.stringify({ tileMode: '16x16', metatiles: bg.metatiles, mtmap: bg.mtmap }));
  const py = [
    'import json, sys',
    'sys.path.insert(0, ' + JSON.stringify(path.join(ROOT, 'tools')) + ')',
    'import playground_server as P',
    'bg = json.load(open(' + JSON.stringify(tmp) + '))',
    'nt, beh = P._expand_metatile_bg(bg)',
    'print(json.dumps({"nt": nt, "beh": beh}))',
  ].join('\n');
  const res = spawnSync('python3', ['-c', py], { encoding: 'utf8' });
  try { fs.unlinkSync(tmp); } catch {}
  if (res.status !== 0) fail('python expand failed: ' + (res.stderr || res.stdout));
  const pyOut = JSON.parse(res.stdout.trim());
  assert(JSON.stringify(pyOut.nt) === JSON.stringify(ex.nametable),
    'JS expand nametable != server _expand_metatile_bg');
  assert(JSON.stringify(pyOut.beh) === JSON.stringify(ex.behaviour),
    'JS expand behaviour != server _expand_metatile_bg');
  console.log('✓ JS expand matches server _expand_metatile_bg byte-for-byte');
}

// ---- 5. non-uniform block -> TL palette (render-equivalent) ------------
{
  const bg = {
    name: 'nu',
    // one block whose 4 cells have DIFFERENT palettes (the §1.2 desync source)
    nametable: [
      [cell(9, 1), cell(9, 2)],
      [cell(9, 3), cell(9, 0)],
    ],
    behaviour: [[2, 2], [2, 2]],
  };
  M.promote(bg);
  assert(bg.metatiles.length === 1, 'non-uniform block should still be one metatile');
  assert(bg.metatiles[0].palette === 1,
    'promote must take the TOP-LEFT palette (1), got ' + bg.metatiles[0].palette);
  const ex = M.expand(bg);
  const pals = [ex.nametable[0][0], ex.nametable[0][1], ex.nametable[1][0], ex.nametable[1][1]]
    .map(c => c.palette);
  assert(pals.every(p => p === 1), 'expanded block must be uniformly palette 1, got ' + pals);
  console.log('✓ non-uniform block promotes to its TL palette (correct by construction)');
}

// ---- 6. deleteBlock remaps the map (fallback to 0; shift higher ids) -----
{
  const bg = {
    tileMode: '16x16',
    metatiles: [
      { tiles: [0, 0, 0, 0], palette: 0, behaviour: 0 },   // 0
      { tiles: [1, 1, 1, 1], palette: 1, behaviour: 0 },   // 1 (to delete)
      { tiles: [2, 2, 2, 2], palette: 2, behaviour: 0 },   // 2
    ],
    mtmap: [[0, 1, 2], [2, 1, 0]],
  };
  const okDel = M.deleteBlock(bg, 1);
  assert(okDel === true, 'deleteBlock should return true');
  assert(bg.metatiles.length === 2, 'deleteBlock should remove one block');
  // old 2 → 1; old 1 → 0 (fallback); old 0 → 0
  assert(JSON.stringify(bg.mtmap) === JSON.stringify([[0, 0, 1], [1, 0, 0]]),
    'deleteBlock remap wrong: ' + JSON.stringify(bg.mtmap));
  assert(bg.metatiles[1].palette === 2, 'surviving block 2 should now be id 1');
  console.log('✓ deleteBlock: removes the block, falls usages back to 0, shifts higher ids');

  // refuses to delete the last block
  const one = { tileMode: '16x16', metatiles: [{ tiles: [0, 0, 0, 0], palette: 0, behaviour: 0 }], mtmap: [[0]] };
  assert(M.deleteBlock(one, 0) === false && one.metatiles.length === 1,
    'deleteBlock must refuse to delete the last block');
  console.log('✓ deleteBlock: refuses to delete the last remaining block');
}

console.log('\nmetatile-lib (E1-1 headless half): all checks passed');
