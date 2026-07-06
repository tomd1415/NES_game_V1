// Regression: loading a game/tutorial must NOT break when localStorage is full.
// Before the fix, createProject/saveCurrent did a raw setItem that threw
// QuotaExceededError mid-load, leaving the editor half-updated (hence the
// "clear storage + force reload" the user hit). Now writes free the oldest
// snapshots/backups and retry, so a Save/Load never hard-fails on quota.
import fs from 'node:fs';
import path from 'node:path';

const WEB = new URL('../../tools/tile_editor_web', import.meta.url).pathname;
let failed = false;
const ok = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };

// A localStorage with a hard byte budget that throws QuotaExceededError, like
// a real browser once ~5 MB is used.
class MockLS {
  constructor(budget) { this.map = new Map(); this.budget = budget; }
  get length() { return this.map.size; }
  key(i) { return Array.from(this.map.keys())[i] ?? null; }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  removeItem(k) { this.map.delete(k); }
  _total(exceptKey) { let n = 0; for (const [k, v] of this.map) { if (k === exceptKey) continue; n += k.length + v.length; } return n; }
  setItem(k, v) {
    v = String(v);
    if (this._total(k) + k.length + v.length > this.budget) { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; }
    this.map.set(k, v);
  }
}

globalThis.window = globalThis;
globalThis.localStorage = new MockLS(220 * 1024);   // ~220 KB (small, to force pressure)
new Function(fs.readFileSync(path.join(WEB, 'storage.js'), 'utf8'))();
const Storage = window.createTileEditorStorage({ migrateState: (s) => s, validateState: () => null });

// A "biggish" project state (~28 KB) — like a real one with tile pools.
function bigState(name) { return { name: name, version: 1, blob: 'x'.repeat(28 * 1024) }; }

try {
  // 1. Create a project and pile on snapshots + backups until storage is full.
  Storage.createProject('Project A', bigState('Project A'));
  let snaps = 0;
  for (let i = 0; i < 40; i++) { const r = Storage.saveSnapshot(bigState('A snap ' + i), 'auto'); if (r.ok) snaps++; }
  ok('filled storage with ' + snaps + ' snapshots (quota pressure reached)');
  if (localStorage._total() < 150 * 1024) bad('storage did not actually fill up — test is not exercising quota');

  // 2. Loading a NEW game/tutorial must succeed (createProject must not throw,
  //    and the new project must actually be stored + loadable).
  let created = null, threw = false;
  try { created = Storage.createProject('Tutorial B', bigState('Tutorial B')); }
  catch (e) { threw = true; bad('createProject threw under quota: ' + (e && e.name)); }
  if (!threw) {
    if (created && created.id) ok('createProject succeeded under quota (freed space, no throw)');
    else bad('createProject did not return an id');
    const loaded = Storage.loadCurrent();
    if (loaded && loaded.name === 'Tutorial B') ok('the newly loaded game is stored + loadable (no force-reload needed)');
    else bad('loadCurrent did not return the new project: ' + JSON.stringify(loaded && loaded.name));
  }

  // 3. saveCurrent on the active project keeps working (frees space, returns ok).
  const sc = Storage.saveCurrent(bigState('Tutorial B edited'));
  if (sc.ok) ok('saveCurrent still succeeds after freeing space'); else bad('saveCurrent failed: ' + sc.error);

  // 4. The Time Machine never lists a snapshot whose blob was dropped.
  const listed = Storage.listSnapshots();
  const dangling = listed.filter((x) => localStorage.getItem(x.key) == null);
  if (dangling.length === 0) ok('listSnapshots() hides dropped (dangling) snapshots'); else bad(dangling.length + ' dangling snapshots listed');
} catch (e) {
  bad('threw: ' + (e && e.stack || e));
}

if (failed) process.exit(1);
console.log('\nStorage quota-resilience test complete.');
