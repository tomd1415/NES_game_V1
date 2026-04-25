// Phase 1.3 — project-menu parity smoke-test.  Asserts that every
// editor page exposes the universal project-lifecycle buttons, and
// that the new shared `project-menu.js` module loads + wires the
// recovery + migration handlers without clashing with existing
// inline wiring on Backgrounds / Sprites.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/home/duguid/projects/nesgame/attempt1';
const WEB  = path.join(ROOT, 'tools', 'tile_editor_web');

function fail(msg) { console.error('FAIL:', msg); process.exit(1); }

// -- 1) Every page declares the universal lifecycle buttons -----
//
// Builder + Code intentionally omit `btn-project-new` because they
// hint pupils to create projects on the Sprites page (see the
// `<p class="menu-hint">` in those files).  Every other button is
// expected on every page now.
const PAGES = ['index.html', 'sprites.html', 'behaviour.html', 'builder.html', 'code.html'];
const UNIVERSAL = [
  'btn-project-duplicate',
  'btn-project-delete',
  'btn-migration-download',
  'btn-save-all',
  'btn-load-all',
  'btn-recover',
];
const NEW_PROJECT_PAGES = new Set(['index.html', 'sprites.html', 'behaviour.html']);

for (const page of PAGES) {
  const html = fs.readFileSync(path.join(WEB, page), 'utf8');
  for (const id of UNIVERSAL) {
    if (!html.includes(`id="${id}"`)) fail(`${page} missing #${id}`);
  }
  if (NEW_PROJECT_PAGES.has(page) && !html.includes('id="btn-project-new"')) {
    fail(`${page} missing #btn-project-new`);
  }
  console.log(`✓ ${page} carries the universal project-menu buttons`);
}

// -- 2) Pages with thin menus include project-menu.js -----------
//
// Backgrounds + Sprites stay on their inline handlers.  The rest
// rely on the shared module to wire btn-recover / btn-migration.
for (const page of ['behaviour.html', 'builder.html', 'code.html']) {
  const html = fs.readFileSync(path.join(WEB, page), 'utf8');
  if (!html.includes('src="project-menu.js"')) fail(`${page} does not include project-menu.js`);
  if (!/ProjectMenu\.wire\s*\(/.test(html))    fail(`${page} does not call ProjectMenu.wire()`);
  console.log(`✓ ${page} loads + invokes project-menu.js`);
}

// -- 3) project-menu.js loads in headless mode + wires correctly --
//
// Drive the module through a minimal DOM shim mirroring the a11y.mjs
// approach, then trigger the recover button and assert the dialog
// gets injected and populated from the (mocked) Storage API.
function makeStyleShim() {
  const props = {};
  return {
    setProperty(k, v) { props[k] = String(v); },
    getPropertyValue(k) { return props[k] || ''; },
    get fontSize() { return props['font-size'] || ''; },
    set fontSize(v) { props['font-size'] = String(v); },
  };
}
function makeElement(tag) {
  const el = {
    tagName: (tag || 'div').toUpperCase(),
    children: [], style: makeStyleShim(), attrs: {}, listeners: {}, dataset: {},
    classList: { _set: new Set(), add(c) { this._set.add(c); }, contains(c) { return this._set.has(c); } },
    hidden: false, onclick: undefined,
    appendChild(child) { this.children.push(child); child.parent = this; return child; },
    replaceChildren(...kids) { this.children.length = 0; for (const k of kids) this.appendChild(k); },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
    addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); },
    dispatchEvent(t, e) { (this.listeners[t] || []).forEach(fn => fn(e)); },
    showModal() { this._open = true; },
    close() { this._open = false; },
    querySelector(sel) { return findIn(this, sel); },
  };
  Object.defineProperty(el, 'className', {
    get() { return Array.from(el.classList._set).join(' '); },
    set(v) { el.classList._set.clear(); String(v).split(/\s+/).filter(Boolean).forEach(c => el.classList._set.add(c)); },
  });
  return el;
}
function matches(el, sel) {
  if (!el || !el.tagName) return false;
  if (sel.startsWith('.')) return el.classList && el.classList.contains(sel.slice(1));
  if (sel.startsWith('#')) return (el.attrs && el.attrs.id === sel.slice(1)) || el.id === sel.slice(1);
  return el.tagName === sel.toUpperCase();
}
function findIn(root, sel) {
  if (!root || !Array.isArray(root.children)) return null;
  for (const c of root.children) {
    if (matches(c, sel)) return c;
    const inner = findIn(c, sel); if (inner) return inner;
  }
  return null;
}

const documentElement = makeElement('html');
const head = makeElement('head'); documentElement.appendChild(head);
const body = makeElement('body'); documentElement.appendChild(body);

// Pre-populate the Recover + Migration buttons that a real Behaviour
// page would carry.
const btnRecover = makeElement('button'); btnRecover.attrs.id = 'btn-recover'; btnRecover.id = 'btn-recover';
const btnMig     = makeElement('button'); btnMig.attrs.id     = 'btn-migration-download'; btnMig.id = 'btn-migration-download'; btnMig.hidden = true;
body.appendChild(btnRecover);
body.appendChild(btnMig);

const document_ = {
  documentElement, head, body,
  readyState: 'complete',
  createElement(tag) { return makeElement(tag); },
  createTextNode(t) { return { nodeType: 3, data: String(t) }; },
  getElementById(id) {
    function walk(el) {
      if (el.attrs && el.attrs.id === id) return el;
      if (el.id === id) return el;
      for (const c of (el.children || [])) { const r = walk(c); if (r) return r; }
      return null;
    }
    return walk(documentElement);
  },
  querySelector(sel) { return findIn(documentElement, sel); },
};

// Mocked Storage with a known snapshot list.
const Storage = {
  listSnapshots() { return [{ key: 'snap-1', ts: 1700000000000, name: 'demo', reason: 'manual' }]; },
  listBackups() { return []; },
  loadCurrent() { return { name: 'current' }; },
  saveCurrent(s) { Storage._lastSaved = s; },
  saveSnapshot() {},
  loadSnapshot(_key) { return { name: 'restored', from: 'snap-1' }; },
  hasPreMigrationBackup() { return false; },
  getPreMigrationBackup() { return null; },
  clearPreMigrationBackup() {},
};

const win = { document: document_, Storage, addEventListener() {}, location: { reload() { win._reloaded = true; } } };
win.window = win;
const src = fs.readFileSync(path.join(WEB, 'project-menu.js'), 'utf8');
new Function('document', 'Storage', 'window', src)(document_, Storage, win);

if (typeof win.ProjectMenu !== 'object') fail('ProjectMenu not exposed');
if (typeof win.ProjectMenu.wire !== 'function') fail('ProjectMenu.wire missing');

win.ProjectMenu.wire();
if (btnRecover.dataset.projectMenuWired !== '1') fail('Recover button not marked as wired');
if (btnMig.dataset.projectMenuWired !== '1')     fail('Migration button not marked as wired');
console.log('✓ ProjectMenu.wire flags both buttons as wired');

// Trigger the recover click → dialog should be created + opened,
// snapshot list should contain the mocked entry.
btnRecover.dispatchEvent('click', {});
const dlg = document_.getElementById('recovery-dialog');
if (!dlg) fail('recovery-dialog not injected after click');
if (!dlg._open) fail('recovery-dialog not opened');
const list = dlg.querySelector('#snapshot-list');
if (!list) fail('snapshot-list missing');
if (list.children.length !== 1) fail('expected 1 snapshot rendered, got ' + list.children.length);
console.log('✓ recovery dialog injects and renders the (mocked) snapshot list');

// Click the Restore button on the snapshot row — should saveCurrent +
// reload via the mocked window.location.
const li = list.children[0];
const restoreBtn = li.children.find(c => c.tagName === 'BUTTON');
if (!restoreBtn) fail('restore button missing on snapshot row');
restoreBtn.dispatchEvent('click', {});
if (!win._reloaded) fail('expected window.location.reload after restore');
if (!Storage._lastSaved || Storage._lastSaved.from !== 'snap-1') fail('restore did not call saveCurrent with the loaded snapshot');
console.log('✓ Restore click calls saveCurrent + reloads');

// Re-wiring is idempotent: calling wire again must not double-attach.
const beforeListeners = btnRecover.listeners.click ? btnRecover.listeners.click.length : 0;
win.ProjectMenu.wire();
const afterListeners = btnRecover.listeners.click ? btnRecover.listeners.click.length : 0;
if (afterListeners !== beforeListeners) fail('second wire() attached an extra listener');
console.log('✓ ProjectMenu.wire is idempotent');

console.log('\nProject-menu parity smoke-test complete.');
