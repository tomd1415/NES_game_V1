#!/usr/bin/env node
// Arc E §2 (E2-1) — auto-runner Builder validators.
//   * runner needs a world ≥ 2 screens wide (it scrolls) — blocking error.
//   * runner with no spike tile painted (behaviour slot 7) — warning.
// Drives the real builder-validators.js headless.
import fs from 'node:fs';
import path from 'node:path';

const WEB = new URL('../../tools/tile_editor_web', import.meta.url).pathname;
function fail(m) { console.error('FAIL:', m); process.exit(1); }
function assert(c, m) { if (!c) fail(m); }

globalThis.window = globalThis;
new Function(fs.readFileSync(path.join(WEB, 'builder-validators.js'), 'utf8'))();
const V = window.BuilderValidators;

// A background `screensX` wide; `spike` paints one slot-7 cell when true.
function mkState({ type = 'runner', screensX = 4, spike = false, dialogue = false } = {}) {
  const cols = 32 * screensX, rows = 30;
  const beh = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let c = 0; c < cols; c++) beh[28][c] = 1;   // floor
  if (spike) { beh[27][40] = 7; }                  // a spike tile (slot 7)
  return {
    sprites: [{ role: 'player' }],
    selectedBgIdx: 0,
    backgrounds: [{ name: 'bg', dimensions: { screens_x: screensX, screens_y: 1 }, behaviour: beh }],
    behaviour_types: [{ id: 7, name: 'spike' }],
    builder: { version: 1, modules: {
      game: { enabled: true, config: { type, autoscrollSpeed: 2 } },
      dialogue: { enabled: dialogue, config: { text: 'HELLO', proximity: 2 } },
    } },
  };
}
const has = (ps, id) => ps.some(p => p.id === id);
const sev = (ps, id) => (ps.find(p => p.id === id) || {}).severity;

// 1. runner on a 1-screen world → blocking error.
let p = V.validate(mkState({ screensX: 1, spike: true }));
assert(has(p, 'runner-needs-scrolling-world') && sev(p, 'runner-needs-scrolling-world') === 'error',
  '1-screen runner world not blocked');
console.log('✓ runner on a 1-screen world → blocking error');

// 2. runner on a 4-screen world → no scrolling-world error.
p = V.validate(mkState({ screensX: 4, spike: true }));
assert(!has(p, 'runner-needs-scrolling-world'), 'wide runner world wrongly flagged');
console.log('✓ runner on a ≥2-screen world → no scrolling-world error');

// 3. runner with no spike painted → warning.
p = V.validate(mkState({ screensX: 4, spike: false }));
assert(has(p, 'runner-no-spike') && sev(p, 'runner-no-spike') === 'warn',
  'runner with no spike did not warn');
console.log('✓ runner with no spike tile → warning');

// 4. runner with a spike painted → no warning.
p = V.validate(mkState({ screensX: 4, spike: true }));
assert(!has(p, 'runner-no-spike'), 'runner with a spike wrongly warned');
console.log('✓ runner with a spike tile → no warning');

// 5. a platformer (not runner) is unaffected by both runner validators.
p = V.validate(mkState({ type: 'platformer', screensX: 1, spike: false }));
assert(!has(p, 'runner-needs-scrolling-world') && !has(p, 'runner-no-spike'),
  'runner validators wrongly fired for a platformer');
console.log('✓ platformer (not runner) → neither runner validator fires');

// 6. runner + dialogue enabled → warn it's unsupported (dialogue is auto-off).
p = V.validate(mkState({ screensX: 4, spike: true, dialogue: true }));
assert(has(p, 'runner-dialogue-unsupported') && sev(p, 'runner-dialogue-unsupported') === 'warn',
  'runner + dialogue did not warn');
console.log('✓ runner + dialogue enabled → warning (dialogue off in auto-runner)');

// 7. platformer + dialogue → no runner-dialogue warning.
p = V.validate(mkState({ type: 'platformer', screensX: 2, dialogue: true }));
assert(!has(p, 'runner-dialogue-unsupported'), 'platformer + dialogue wrongly warned');
console.log('✓ platformer + dialogue → no runner-dialogue warning');

console.log('\nE2-1 runner-validators: all checks passed');
