#!/usr/bin/env node
// Arc E §3 (E3-1) — top-down racer Builder validators.
//   * racer needs a track bigger than one screen (it follows the car with the
//     scrolling camera) — blocking error.  Either axis ≥ 2 screens satisfies it
//     because the racer is top-down (unlike the runner, which is x-only).
// Drives the real builder-validators.js headless.
import fs from 'node:fs';
import path from 'node:path';

const WEB = '/home/duguid/projects/nesgame/attempt1/tools/tile_editor_web';
function fail(m) { console.error('FAIL:', m); process.exit(1); }
function assert(c, m) { if (!c) fail(m); }

globalThis.window = globalThis;
new Function(fs.readFileSync(path.join(WEB, 'builder-validators.js'), 'utf8'))();
const V = window.BuilderValidators;

function mkState({ type = 'racer', screensX = 2, screensY = 2 } = {}) {
  const cols = 32 * screensX, rows = 30 * screensY;
  const beh = Array.from({ length: rows }, () => Array(cols).fill(0));
  return {
    sprites: [{ role: 'player' }],
    selectedBgIdx: 0,
    backgrounds: [{ name: 'bg', dimensions: { screens_x: screensX, screens_y: screensY }, behaviour: beh }],
    behaviour_types: [],
    builder: { version: 1, modules: {
      game: { enabled: true, config: { type, racerTopSpeed: 3 } },
    } },
  };
}
const has = (ps, id) => ps.some(p => p.id === id);
const sev = (ps, id) => (ps.find(p => p.id === id) || {}).severity;

// 1. racer on a 1×1 world → blocking error.
let p = V.validate(mkState({ screensX: 1, screensY: 1 }));
assert(has(p, 'racer-needs-scrolling-world') && sev(p, 'racer-needs-scrolling-world') === 'error',
  '1×1 racer world not blocked');
console.log('✓ racer on a 1×1 world → blocking error');

// 2. racer wide enough on X only → no error (top-down: either axis counts).
p = V.validate(mkState({ screensX: 2, screensY: 1 }));
assert(!has(p, 'racer-needs-scrolling-world'), 'racer wide on X wrongly flagged');
console.log('✓ racer ≥2 screens wide (X) → no scrolling-world error');

// 3. racer tall enough on Y only → no error.
p = V.validate(mkState({ screensX: 1, screensY: 2 }));
assert(!has(p, 'racer-needs-scrolling-world'), 'racer tall on Y wrongly flagged');
console.log('✓ racer ≥2 screens tall (Y) → no scrolling-world error');

// 4. racer on a full 2×2 world → no error.
p = V.validate(mkState({ screensX: 2, screensY: 2 }));
assert(!has(p, 'racer-needs-scrolling-world'), '2×2 racer world wrongly flagged');
console.log('✓ racer on a 2×2 world → no scrolling-world error');

// 5. a platformer (not racer) is unaffected by the racer validator.
p = V.validate(mkState({ type: 'platformer', screensX: 1, screensY: 1 }));
assert(!has(p, 'racer-needs-scrolling-world'), 'racer validator wrongly fired for a platformer');
console.log('✓ platformer (not racer) → racer validator does not fire');

console.log('\nE3-1 racer-validators: all checks passed');
