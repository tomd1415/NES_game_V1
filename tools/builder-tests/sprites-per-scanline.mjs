#!/usr/bin/env node
// 8-sprites-per-scanline validator: the NES shows at most 8 hardware sprites
// (8px cells) on any scanline; more flicker/vanish. The validator estimates
// this from Scene instances' initial placements, counting only cells that can
// share a 256px screen window (so a scrolling level's spread-out enemies —
// never on screen together — don't false-positive). Warn only.
import fs from 'node:fs';
import path from 'node:path';

const WEB = new URL('../../tools/tile_editor_web', import.meta.url).pathname;
function fail(m) { console.error('FAIL:', m); process.exit(1); }
function assert(c, m) { if (!c) fail(m); }

globalThis.window = globalThis;
new Function(fs.readFileSync(path.join(WEB, 'builder-validators.js'), 'utf8'))();
const V = window.BuilderValidators;

// sprites: index 0 = 1×1 cell, index 1 = 2×2 cells. `insts` = [{spriteIdx,x,y}].
function mkState(insts, { sceneOn = true } = {}) {
  return {
    sprites: [
      { role: 'enemy', width: 1, height: 1, cells: [[{}]] },
      { role: 'enemy', width: 2, height: 2, cells: [[{}, {}], [{}, {}]] },
    ],
    selectedBgIdx: 0,
    backgrounds: [{ name: 'bg', dimensions: { screens_x: 4, screens_y: 1 }, behaviour: [] }],
    behaviour_types: [],
    builder: { version: 1, modules: {
      game: { enabled: true, config: { type: 'platformer' } },
      scene: { enabled: sceneOn, config: { instances: insts } },
    } },
  };
}
const row = (spriteIdx, y, xs) => xs.map(x => ({ spriteIdx, x, y }));
const has = (ps, id) => ps.some(p => p.id === id);
const sev = (ps, id) => (ps.find(p => p.id === id) || {}).severity;
const ID = 'too-many-sprites-per-scanline';

// 1. Nine 1-cell sprites bunched on one row (within 256px) → warn.
let xs = [0, 10, 20, 30, 40, 50, 60, 70, 80];
let p = V.validate(mkState(row(0, 100, xs)));
assert(has(p, ID) && sev(p, ID) === 'warn', 'nine bunched sprites did not warn');
console.log('✓ 9 sprites bunched on one row → warning');

// 2. Eight on one row (the hardware max) → no warn.
p = V.validate(mkState(row(0, 100, xs.slice(0, 8))));
assert(!has(p, ID), '8 sprites (the limit) wrongly warned');
console.log('✓ exactly 8 on a row → no warning');

// 3. Nine on the same row but spread >256px apart → no warn (culling).
p = V.validate(mkState(row(0, 100, [0, 300, 600, 900, 1200, 1500, 1800, 2100, 2400])));
assert(!has(p, ID), 'spread-out sprites wrongly warned (should be culled)');
console.log('✓ 9 sprites spread across the level (never co-visible) → no warning');

// 4. Sprites split across two vertical bands, ≤8 per band → no warn
//    (10 total, but at most 5 share any one row).
const five = [0, 10, 20, 30, 40];
p = V.validate(mkState([...row(0, 40, five), ...row(0, 160, five)]));
assert(!has(p, ID), 'sprites split safely across two rows wrongly warned');
console.log('✓ 10 sprites split 5+5 across two rows → no warning');

// 5. Wide (2-cell) sprites: five of them on a row = 10 cells → warn.
p = V.validate(mkState(row(1, 100, [0, 10, 20, 30, 40])));
assert(has(p, ID), 'five 2-wide sprites (10 cells) did not warn');
console.log('✓ five 16px-wide sprites on a row (10 cells) → warning');

// 6. Scene module off → silent.
p = V.validate(mkState(row(0, 100, xs), { sceneOn: false }));
assert(!has(p, ID), 'fired with the Scene module off');
console.log('✓ Scene module off → no warning');

// 7. Warning only — never blocks Play.
p = V.validate(mkState(row(0, 100, xs)));
assert(!V.hasErrors(p), 'the per-scanline warning wrongly blocks Play');
console.log('✓ warning only — Play stays enabled');

console.log('\n8-sprites-per-scanline validator: all checks passed');
