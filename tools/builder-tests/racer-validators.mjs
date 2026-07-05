#!/usr/bin/env node
// Arc E §3 (E3-1) — top-down racer Builder validators.
//   * racer needs a track bigger than one screen (it follows the car with the
//     scrolling camera) — blocking error.  Either axis ≥ 2 screens satisfies it
//     because the racer is top-down (unlike the runner, which is x-only).
// Drives the real builder-validators.js headless.
import fs from 'node:fs';
import path from 'node:path';

const WEB = new URL('../../tools/tile_editor_web', import.meta.url).pathname;
function fail(m) { console.error('FAIL:', m); process.exit(1); }
function assert(c, m) { if (!c) fail(m); }

globalThis.window = globalThis;
new Function(fs.readFileSync(path.join(WEB, 'builder-validators.js'), 'utf8'))();
const V = window.BuilderValidators;

function mkState({ type = 'racer', screensX = 2, screensY = 2, finish = false,
                  checkpoint = false, checkpoint2 = false, racerCheckpoints = 1 } = {}) {
  const cols = 32 * screensX, rows = 30 * screensY;
  const beh = Array.from({ length: rows }, () => Array(cols).fill(0));
  if (finish) beh[2][2] = 7;        // a finish-line tile (slot 7)
  if (checkpoint) beh[2][5] = 5;    // checkpoint 1 (trigger slot, id 5)
  if (checkpoint2) beh[2][8] = 6;   // checkpoint 2 (ladder slot, id 6)
  return {
    sprites: [{ role: 'player' }],
    selectedBgIdx: 0,
    backgrounds: [{ name: 'bg', dimensions: { screens_x: screensX, screens_y: screensY }, behaviour: beh }],
    behaviour_types: [],
    builder: { version: 1, modules: {
      game: { enabled: true, config: { type, racerTopSpeed: 3, racerCheckpoints } },
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

// 6. (E3-4) racer with neither finish nor checkpoint → warn (laps can't work).
p = V.validate(mkState({ finish: false, checkpoint: false }));
assert(has(p, 'racer-laps-need-markers') && sev(p, 'racer-laps-need-markers') === 'warn',
  'racer with no lap markers did not warn');
console.log('✓ racer with no finish/checkpoint → warning (free-drive only)');

// 7. racer with only a finish (no checkpoint) → still warns.
p = V.validate(mkState({ finish: true, checkpoint: false }));
assert(has(p, 'racer-laps-need-markers'), 'racer with finish but no checkpoint did not warn');
console.log('✓ racer with a finish but no checkpoint → warning');

// 8. racer with both finish + checkpoint → no markers warning.
p = V.validate(mkState({ finish: true, checkpoint: true }));
assert(!has(p, 'racer-laps-need-markers'), 'racer with both markers wrongly warned');
console.log('✓ racer with finish + checkpoint → no markers warning');

// 9. a platformer with no markers → no racer-laps warning.
p = V.validate(mkState({ type: 'platformer', finish: false, checkpoint: false }));
assert(!has(p, 'racer-laps-need-markers'), 'racer-laps validator wrongly fired for a platformer');
console.log('✓ platformer (not racer) → racer-laps validator does not fire');

// 10. (E3-5) 2-checkpoint racer with finish + CP1 but no CP2 → warns.
p = V.validate(mkState({ finish: true, checkpoint: true, checkpoint2: false, racerCheckpoints: 2 }));
assert(has(p, 'racer-laps-need-markers'), '2-checkpoint racer without CP2 did not warn');
console.log('✓ 2-checkpoint racer missing checkpoint 2 → warning');

// 11. 2-checkpoint racer with finish + CP1 + CP2 → no warning.
p = V.validate(mkState({ finish: true, checkpoint: true, checkpoint2: true, racerCheckpoints: 2 }));
assert(!has(p, 'racer-laps-need-markers'), '2-checkpoint racer with both CPs wrongly warned');
console.log('✓ 2-checkpoint racer with both checkpoints → no warning');

console.log('\nE3-1/E3-4 racer-validators: all checks passed');
