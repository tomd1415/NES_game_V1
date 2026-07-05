#!/usr/bin/env node
// SMB flagpole validators (engine v8):
//   * flagpole on but Win condition off → the flag's #if BW_WIN_ENABLED code
//     never runs, so crossing it does nothing (error).
//   * flagpole column past the end of the level → unreachable (warn).
// Drives the real builder-validators.js headless.
import fs from 'node:fs';
import path from 'node:path';

const WEB = new URL('../../tools/tile_editor_web', import.meta.url).pathname;
function fail(m) { console.error('FAIL:', m); process.exit(1); }
function assert(c, m) { if (!c) fail(m); }

globalThis.window = globalThis;
new Function(fs.readFileSync(path.join(WEB, 'builder-validators.js'), 'utf8'))();
const V = window.BuilderValidators;

// type: game style; flagOn/winOn: module toggles; flagX: flagpole column;
// screensX: level width in screens (× 32 tiles).
function mkState({ type = 'smb', flagOn = true, winOn = true, flagX = 60, screensX = 2 } = {}) {
  // Paint one trigger tile so the (unrelated) reach-tile Win-condition
  // validator is satisfied and we isolate the flagpole checks.
  const beh = [[5]];
  return {
    sprites: [{ role: 'player' }],
    selectedBgIdx: 0,
    backgrounds: [{ name: 'bg', dimensions: { screens_x: screensX, screens_y: 1 }, behaviour: beh }],
    behaviour_types: [{ id: 5, name: 'trigger' }],
    builder: { version: 1, modules: {
      game: { enabled: true, config: { type } },
      flagpole: { enabled: flagOn, config: { x: flagX } },
      win_condition: { enabled: winOn, config: { type: 'reach_tile', behaviourType: 'trigger' } },
    } },
  };
}
const has = (ps, id) => ps.some(p => p.id === id);
const sev = (ps, id) => (ps.find(p => p.id === id) || {}).severity;

// --- flagpole needs win condition ---
let p = V.validate(mkState({ winOn: false }));
assert(has(p, 'flagpole-needs-win') && sev(p, 'flagpole-needs-win') === 'error',
  'flagpole without win condition did not error');
console.log('✓ flagpole on, Win condition off → blocking error');

p = V.validate(mkState({ winOn: true }));
assert(!has(p, 'flagpole-needs-win'), 'flagpole + win condition wrongly flagged');
console.log('✓ flagpole on, Win condition on → no error');

p = V.validate(mkState({ type: 'platformer', winOn: false }));
assert(!has(p, 'flagpole-needs-win'), 'non-SMB flagpole wrongly flagged');
console.log('✓ non-SMB game type → flagpole validators stay silent');

// --- flagpole beyond the level width (keep win on to isolate the bounds warn) ---
p = V.validate(mkState({ flagX: 60, screensX: 1 }));   // width 32, x 60 → unreachable
assert(has(p, 'flagpole-beyond-level') && sev(p, 'flagpole-beyond-level') === 'warn',
  'flag past the level width did not warn');
console.log('✓ flag column past the level end → warning');

p = V.validate(mkState({ flagX: 60, screensX: 2 }));   // width 64, x 60 → fine
assert(!has(p, 'flagpole-beyond-level'), 'in-bounds flag wrongly warned');
console.log('✓ flag column inside a 2-screen level → no warning');

p = V.validate(mkState({ flagX: 10, screensX: 1 }));   // width 32, x 10 → fine
assert(!has(p, 'flagpole-beyond-level'), 'early flag column wrongly warned');
console.log('✓ flag column well inside the level → no warning');

// bounds problem is a warning only — Play stays enabled.
p = V.validate(mkState({ flagX: 60, screensX: 1 }));
assert(!V.hasErrors(p), 'the flag-position warning wrongly blocks Play');
console.log('✓ flag-position issue is a warning — Play stays enabled');

console.log('\nSMB flagpole validators: all checks passed');
