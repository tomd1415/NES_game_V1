// BR-07 — renaming a project must update BOTH the in-memory state and the v2
// catalog, so the project list / duplicate / delete don't keep the old name.
// Drives the real storage.js renameCurrent headless, plus static assertions
// that Builder + Code use it.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = new URL('../..', import.meta.url).pathname;
const WEB  = path.join(ROOT, 'tools', 'tile_editor_web');

function fail(msg) { console.error('FAIL:', msg); process.exit(1); }
function assert(cond, msg) { if (!cond) fail(msg); }

function makeLocalStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    key: (i) => Array.from(m.keys())[i] ?? null,
    get length() { return m.size; },
  };
}

const ls = makeLocalStorage();
const win = {};
new Function('window', 'localStorage',
  fs.readFileSync(path.join(WEB, 'storage.js'), 'utf8'))(win, ls);
const Storage = win.createTileEditorStorage({});

const state = { name: 'Old Name', data: 1 };
Storage.createProject('Old Name', state);

const ret = Storage.renameCurrent(state, 'Brand New Name');
assert(ret === 'Brand New Name', 'renameCurrent did not return the normalised name');
assert(state.name === 'Brand New Name', 'renameCurrent did not update state.name');
const active = Storage.getActiveProject();
assert(active && active.name === 'Brand New Name',
  'renameCurrent did not update the catalog (list still shows "' +
  (active && active.name) + '")');
console.log('✓ renameCurrent updates state.name AND the catalog atomically');

// Empty / null name falls back to "untitled".
Storage.renameCurrent(state, '');
assert(state.name === 'untitled' && Storage.getActiveProject().name === 'untitled',
  'empty rename did not fall back to "untitled" in both places');
console.log('✓ empty rename falls back to "untitled" everywhere');

// Static: Builder + Code wire the input through renameCurrent (not a bare
// state.name assignment that skips the catalog).
for (const page of ['builder.html', 'code.html']) {
  const html = fs.readFileSync(path.join(WEB, page), 'utf8');
  assert(/Storage\.renameCurrent\s*\(/.test(html),
    `${page} does not call Storage.renameCurrent in its name handler`);
  console.log(`✓ ${page} renames via Storage.renameCurrent`);
}

console.log('\nBR-07 rename-project: all checks passed');
