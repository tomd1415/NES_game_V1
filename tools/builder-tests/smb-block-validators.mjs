#!/usr/bin/env node
// SMB blocks validator (engine v6): a ? block set to dispense a power-up
// while the Power-ups module is off silently falls back to a coin in the
// engine, so we WARN the pupil that intent and result disagree.
// Drives the real builder-validators.js headless.
import fs from 'node:fs';
import path from 'node:path';

const WEB = new URL('../../tools/tile_editor_web', import.meta.url).pathname;
function fail(m) { console.error('FAIL:', m); process.exit(1); }
function assert(c, m) { if (!c) fail(m); }

globalThis.window = globalThis;
new Function(fs.readFileSync(path.join(WEB, 'builder-validators.js'), 'utf8'))();
const V = window.BuilderValidators;

// Minimal SMB-ish state: a platformer with the blocks module on and one
// ? block whose `contents` and the powerups toggle we vary.
function mkState({ blocksOn = true, powerupsOn = false, contents = 'mushroom', kind = 'question' } = {}) {
  return {
    sprites: [{ role: 'player' }],
    selectedBgIdx: 0,
    backgrounds: [{ name: 'bg', dimensions: { screens_x: 2, screens_y: 1 }, behaviour: [] }],
    behaviour_types: [],
    builder: { version: 1, modules: {
      game: { enabled: true, config: { type: 'platformer', smbSpeed: 3 } },
      blocks: { enabled: blocksOn, config: { blockList: [
        { x: 8, y: 18, kind, usedTile: 5, contents },
      ] } },
      powerups: { enabled: powerupsOn, config: {} },
    } },
  };
}
const has = (ps, id) => ps.some(p => p.id === id);
const sev = (ps, id) => (ps.find(p => p.id === id) || {}).severity;
const ID = 'question-block-powerup-no-module';

// 1. ? block → mushroom, power-ups OFF → warn.
let p = V.validate(mkState({ powerupsOn: false, contents: 'mushroom' }));
assert(has(p, ID) && sev(p, ID) === 'warn', 'power-up ? block without module did not warn');
console.log('✓ ? block gives a mushroom, Power-ups off → warning');

// 2. Same, but power-ups ON → no warning (it works as intended).
p = V.validate(mkState({ powerupsOn: true, contents: 'mushroom' }));
assert(!has(p, ID), 'warned even though Power-ups module is on');
console.log('✓ ? block gives a mushroom, Power-ups on → no warning');

// 3. ? block → coin, power-ups off → no warning (coin needs no module).
p = V.validate(mkState({ powerupsOn: false, contents: 'coin' }));
assert(!has(p, ID), 'coin ? block wrongly warned');
console.log('✓ ? block gives a coin → no warning (no module needed)');

// 4. Every power-up content flavour trips it (fire flower / star / 1-Up).
for (const c of ['fireflower', 'star', 'oneup']) {
  p = V.validate(mkState({ powerupsOn: false, contents: c }));
  assert(has(p, ID), `content "${c}" did not warn without the module`);
}
console.log('✓ fire flower / star / 1-Up all warn without the module');

// 5. blocks module OFF → validator is silent regardless.
p = V.validate(mkState({ blocksOn: false, powerupsOn: false, contents: 'star' }));
assert(!has(p, ID), 'fired even though the Blocks module is off');
console.log('✓ Blocks module off → no warning');

// 6. It is a warning, not an error — Play stays enabled.
p = V.validate(mkState({ powerupsOn: false, contents: 'mushroom' }));
assert(!V.hasErrors(p), 'the power-up-content mismatch wrongly blocks Play');
console.log('✓ warning only — Play stays enabled');

console.log('\nSMB block-content validator: all checks passed');
