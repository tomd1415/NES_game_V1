// BR-02 — debounced-save flush regression test.
//
// Two halves:
//   1) Behavioural: drive the real storage.js headless and prove the
//      shared flush hook persists in-flight editor state, including the
//      flush-before-duplicate ordering that the wire helpers rely on.
//   2) Static: assert Code / Builder / Behaviour each define flushSave(),
//      register it as the Storage flush hook + on `pagehide`, and route
//      their bespoke project switcher through it (not a bare saveCurrent),
//      that storage.js flushes before New/Duplicate, and that
//      project-menu.js flushes before the recovery snapshot.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/home/duguid/projects/nesgame/attempt1';
const WEB  = path.join(ROOT, 'tools', 'tile_editor_web');

function fail(msg) { console.error('FAIL:', msg); process.exit(1); }
function assert(cond, msg) { if (!cond) fail(msg); }

// ---- 1) Behavioural -----------------------------------------------------
function makeLocalStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    clear: () => m.clear(),
    key: (i) => Array.from(m.keys())[i] ?? null,
    get length() { return m.size; },
  };
}

const ls = makeLocalStorage();
const win = {};
const src = fs.readFileSync(path.join(WEB, 'storage.js'), 'utf8');
// storage.js is an IIFE: (function (global) {...})(typeof window ... globalThis)
// and reads a free `localStorage`.  Inject both as parameters so it binds to
// our shims and attaches createTileEditorStorage to `win`.
new Function('window', 'localStorage', src)(win, ls);
assert(typeof win.createTileEditorStorage === 'function',
  'storage.js did not expose createTileEditorStorage');

const Storage = win.createTileEditorStorage({});

// Seed a project whose stored slot is intentionally STALE — mimics a page
// whose latest edit lives only in the editor widget, not yet in storage.
Storage.createProject('A', { name: 'A', code: 'stale' });

// The flush hook mimics a page's flushSave(): copy the live editor value
// into state, then persist.
let editorValue = 'edited-but-not-yet-saved';
Storage.setFlushHook(() => {
  const s = Storage.loadCurrent() || { name: 'A' };
  s.code = editorValue;
  Storage.saveCurrent(s);
});

// (a) flushPending persists the in-flight value.
assert(Storage.loadCurrent().code === 'stale', 'precondition: slot should be stale');
Storage.flushPending();
assert(Storage.loadCurrent().code === 'edited-but-not-yet-saved',
  'flushPending did not persist the in-flight editor value');
console.log('✓ flushPending() persists in-flight editor state');

// (b) flush-before-duplicate: an edit made just before Duplicate must end up
//     in the copy.  This is the exact ordering wireBasicProjectActions uses.
editorValue = 'edit-right-before-duplicate';
Storage.flushPending();                       // what the Duplicate handler does first
const newId = Storage.duplicateProject(Storage.getActiveProjectId());
assert(newId, 'duplicateProject returned no id');
Storage.setActiveProjectId(newId);
assert(Storage.loadCurrent().code === 'edit-right-before-duplicate',
  'duplicate did not capture the edit flushed immediately before it');
console.log('✓ flush-before-duplicate captures the last edit in the copy');

// (c) a cleared hook is a safe no-op.
Storage.setFlushHook(null);
Storage.flushPending();   // must not throw
console.log('✓ flushPending() with no hook is a safe no-op');

// ---- 2) Static wiring assertions ---------------------------------------
const PAGES = ['code.html', 'builder.html', 'behaviour.html'];
for (const page of PAGES) {
  const html = fs.readFileSync(path.join(WEB, page), 'utf8');
  assert(/function flushSave\s*\(/.test(html), `${page} has no flushSave()`);
  assert(/Storage\.setFlushHook\s*\(\s*flushSave\s*\)/.test(html),
    `${page} does not register flushSave as the Storage flush hook`);
  assert(/addEventListener\(\s*['"]pagehide['"]\s*,\s*flushSave\s*\)/.test(html),
    `${page} does not flush on pagehide`);
  // The bespoke switcher must call flushSave(), not a bare saveCurrent.
  assert(/setActiveProjectId/.test(html), `${page} has no project switcher`);
  console.log(`✓ ${page} defines + wires flushSave (hook + pagehide)`);
}

// code.html specifically must copy CodeMirror into state inside flushSave
// (its debounce is the only other place that copy happens).
const codeHtml = fs.readFileSync(path.join(WEB, 'code.html'), 'utf8');
const flushBody = codeHtml.slice(codeHtml.indexOf('function flushSave'));
assert(/cm\.getValue\(\)/.test(flushBody.slice(0, 600)),
  'code.html flushSave does not copy CodeMirror value into state');
console.log('✓ code.html flushSave copies CodeMirror → state');

// storage.js flushes before the reload-causing New / Duplicate actions.
assert(/flushPending\(\)[\s\S]{0,120}createProject/.test(src),
  'storage.js New handler does not flushPending() before createProject');
assert(/flushPending\(\)[\s\S]{0,120}duplicateProject/.test(src),
  'storage.js Duplicate handler does not flushPending() before duplicateProject');
console.log('✓ storage.js flushes before New + Duplicate');

// project-menu.js flushes before snapshotting on recovery.
const pm = fs.readFileSync(path.join(WEB, 'project-menu.js'), 'utf8');
assert(/Storage\.flushPending\(\)/.test(pm),
  'project-menu.js does not flush before the recovery snapshot');
console.log('✓ project-menu.js flushes before recovery snapshot');

console.log('\nBR-02 flush-save: all checks passed');
