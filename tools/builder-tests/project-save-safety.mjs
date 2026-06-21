// Project save-safety regression test.
//
// Pupil report: "the save of new projects does not appear to be reliable at
// present, sometimes losing the old one."  Drives the REAL storage.js headless
// and proves a new project can never drop an existing one, across the two
// failure modes that actually lose data:
//
//   1) Cross-tab clobber.  Two editor tabs share one localStorage.  Tab B
//      creates a project; tab A then autosaves (which calls touchProject ->
//      saveCatalog).  A stale in-memory catalog in tab A must NOT overwrite the
//      shared catalog and erase tab B's new project.
//   2) Quota / partial write.  createProject must be atomic: if the slot write
//      fails (localStorage full), it must not half-register a project nor lose
//      the previously-active one, and must report the failure.
//
// Plus the happy-path single-tab New flow, as a plain regression guard.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/home/duguid/projects/nesgame/attempt1';
const WEB  = path.join(ROOT, 'tools', 'tile_editor_web');

let failed = false;
const ok  = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };

// Shared localStorage shim with an optional quota trip so we can simulate a
// full store on the next write.
function makeLocalStorage() {
  const m = new Map();
  let failNextSet = 0;          // >0 => the next N setItem calls throw
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => {
      if (failNextSet > 0) { failNextSet--; const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
      m.set(k, String(v));
    },
    removeItem: (k) => { m.delete(k); },
    clear: () => m.clear(),
    key: (i) => Array.from(m.keys())[i] ?? null,
    get length() { return m.size; },
    __failNextSets: (n) => { failNextSet = n; },
    __dump: () => new Map(m),
  };
}

const src = fs.readFileSync(path.join(WEB, 'storage.js'), 'utf8');
// Each "tab" is its own createTileEditorStorage() instance (own in-memory
// `cached` catalog) but SHARES one localStorage, exactly like two browser tabs.
function newTab(ls) {
  const win = {};
  new Function('window', 'localStorage', src)(win, ls);
  if (typeof win.createTileEditorStorage !== 'function') throw new Error('storage.js did not expose createTileEditorStorage');
  return win.createTileEditorStorage({});
}

// ---- 1) Happy path: single-tab New keeps the old project -----------------
(function happyPath() {
  const ls = makeLocalStorage();
  const S = newTab(ls);
  // The bootstrap project ("My First Project", id 'default').
  S.saveCurrent({ name: 'First', marker: 'one' });
  const firstId = S.getActiveProjectId();

  // New project, index.html-style: save current, then createProject.
  S.saveCurrent({ name: 'First', marker: 'one' });
  S.createProject('Second', { name: 'Second', marker: 'two' });

  const ids = S.listProjects().map(p => p.id);
  if (ids.includes(firstId) && ids.length === 2) ok('single-tab New keeps both projects (' + ids.length + ')');
  else bad('single-tab New lost a project; ids=' + JSON.stringify(ids));

  // The old slot still holds the old content.
  S.setActiveProjectId(firstId);
  const old = S.loadCurrent();
  if (old && old.marker === 'one') ok('old project content intact after New');
  else bad('old project content lost after New: ' + JSON.stringify(old));
})();

// ---- 2) Cross-tab clobber -------------------------------------------------
(function crossTab() {
  const ls = makeLocalStorage();
  const tabA = newTab(ls);
  // Tab A boots and caches the catalog (one project).
  tabA.saveCurrent({ name: 'First', marker: 'one' });
  const firstId = tabA.getActiveProjectId();
  if (tabA.listProjects().length !== 1) { bad('precondition: expected 1 project in tab A'); return; }

  // Tab B opens later (fresh instance, same store) and creates a project.
  const tabB = newTab(ls);
  tabB.createProject('Second', { name: 'Second', marker: 'two' });
  const secondId = tabB.getActiveProjectId();
  if (secondId === firstId) { bad('tab B createProject did not allocate a new id'); return; }

  // Tab A, unaware of tab B's project, autosaves -> touchProject -> saveCatalog.
  // A stale catalog here would erase 'Second' from the shared store.
  tabA.saveCurrent({ name: 'First', marker: 'one-edited' });

  // Re-read the shared catalog from a brand-new instance (what the next page
  // load / reload sees).
  const fresh = newTab(ls);
  const ids = fresh.listProjects().map(p => p.id);
  if (ids.includes(firstId) && ids.includes(secondId))
    ok('cross-tab: tab A autosave preserves the project tab B created');
  else bad('cross-tab CLOBBER: a tab autosave erased another tab\'s project; ids=' + JSON.stringify(ids));
})();

// ---- 3) Quota / atomic createProject -------------------------------------
(function quota() {
  const ls = makeLocalStorage();
  const S = newTab(ls);
  S.saveCurrent({ name: 'First', marker: 'one' });
  const firstId = S.getActiveProjectId();

  // Trip the store so the new project's slot write fails.
  ls.__failNextSets(1);
  let threw = false, result = null;
  try { result = S.createProject('Second', { name: 'Second', marker: 'two' }); }
  catch (e) { threw = true; }

  // Whatever the signalling style, the OLD project must still be loadable and
  // the catalog must not contain a phantom project whose slot never wrote.
  const fresh = newTab(ls);
  const ids = fresh.listProjects().map(p => p.id);
  const phantomRegistered = ids.length > 1;

  if (!phantomRegistered) ok('quota: failed createProject did not half-register a phantom project');
  else bad('quota: createProject registered a project whose slot never wrote; ids=' + JSON.stringify(ids));

  fresh.setActiveProjectId(firstId);
  const old = fresh.loadCurrent();
  if (old && old.marker === 'one') ok('quota: the previously-active project is intact after a failed New');
  else bad('quota: the old project was lost by a failed New: ' + JSON.stringify(old));

  // The active project must remain a real, loadable one (not a dangling id).
  const active = fresh.getActiveProjectId();
  const activeLoads = !!fresh.loadCurrent();
  if (ids.includes(active) && activeLoads) ok('quota: active project remains valid + loadable after a failed New');
  else bad('quota: active id dangles after a failed New (active=' + active + ', loads=' + activeLoads + ')');

  // And it should signal failure rather than silently pretending success.
  const signalled = threw || (result && result.ok === false) || result == null;
  if (signalled) ok('quota: createProject signals failure (throws / ok:false / null)');
  else bad('quota: createProject silently returned success on a failed write: ' + JSON.stringify(result));
})();

// ---- 4) bootstrapCurrent inherits the starter project's name -------------
(function bootstrapName() {
  const ls = makeLocalStorage();
  const S = newTab(ls);
  // No slot yet, but the catalog seeds "My First Project".  A fresh state
  // factory that returns name:'untitled' must end up named "My First Project"
  // so the rename field, list and label agree (was a confusing mismatch).
  const got = S.bootstrapCurrent(() => ({ name: 'untitled', marker: 'seed' }));
  if (got && got.name === 'My First Project') ok('bootstrapCurrent seeds the starter with the catalog name');
  else bad('bootstrapCurrent did not inherit the catalog name: ' + JSON.stringify(got && got.name));

  // And it persisted, so a reload sees the same name.
  const fresh = newTab(ls);
  const reloaded = fresh.loadCurrent();
  if (reloaded && reloaded.name === 'My First Project') ok('bootstrapCurrent persists the inherited name');
  else bad('bootstrapCurrent did not persist: ' + JSON.stringify(reloaded && reloaded.name));

  // Second call returns the stored slot untouched (idempotent).
  const again = fresh.bootstrapCurrent(() => ({ name: 'SHOULD-NOT-APPEAR' }));
  if (again && again.marker === 'seed') ok('bootstrapCurrent is idempotent (returns the stored project)');
  else bad('bootstrapCurrent re-seeded over an existing project: ' + JSON.stringify(again));
})();

if (failed) { console.error('\nproject-save-safety: FAILURES above'); process.exit(1); }
console.log('\nproject-save-safety: all checks passed');
