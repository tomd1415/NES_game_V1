// Phase 4.1 — accessibility smoke-test.  Loads a11y.js into a tiny
// DOM shim, drives it through scale + theme changes, and verifies the
// pref round-trip + applied CSS state.  jsdom isn't installed in this
// project so we mock just what a11y.js touches: documentElement.style
// + dataset, body.style.fontSize, head.appendChild, and the storage
// hooks.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/home/duguid/projects/nesgame/attempt1';
const WEB  = path.join(ROOT, 'tools', 'tile_editor_web');

/* ---------- minimal DOM shim ------------------------------------ */
function makeStyleShim() {
  const props = {};
  return {
    setProperty(k, v) { props[k] = String(v); },
    getPropertyValue(k) { return props[k] || ''; },
    get fontSize() { return props['font-size'] || ''; },
    set fontSize(v) { props['font-size'] = String(v); },
    _all: props,
  };
}
function makeElement(tag) {
  const el = {
    tagName: (tag || 'div').toUpperCase(),
    children: [], style: makeStyleShim(), attrs: {}, listeners: {},
    classList: { _set: new Set(), add(c) { this._set.add(c); }, remove(c) { this._set.delete(c); }, contains(c) { return this._set.has(c); } },
    appendChild(child) { this.children.push(child); child.parent = this; return child; },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
    addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); },
    dispatchEvent(t, e) { (this.listeners[t] || []).forEach(fn => fn(e)); },
    querySelector(sel) { return findIn(this, sel); },
    querySelectorAll(sel) { const out = []; collectIn(this, sel, out); return out; },
  };
  Object.defineProperty(el, 'className', {
    get() { return Array.from(el.classList._set).join(' '); },
    set(v) {
      el.classList._set.clear();
      String(v).split(/\s+/).filter(Boolean).forEach(c => el.classList._set.add(c));
    },
    configurable: true,
  });
  Object.defineProperty(el, 'innerHTML', {
    get() { return ''; },
    set(_v) { /* ignored — a11y.js builds the DOM via createElement instead */ },
    configurable: true,
  });
  return el;
}
function matches(el, sel) {
  if (!el || !el.tagName) return false;  // skip text nodes
  if (sel.startsWith('.'))  return el.classList && el.classList.contains(sel.slice(1));
  if (sel.startsWith('#'))  return el.id === sel.slice(1) || (el.attrs && el.attrs.id === sel.slice(1));
  return el.tagName === sel.toUpperCase();
}
function findIn(root, sel) {
  if (!root || !Array.isArray(root.children)) return null;
  for (const c of root.children) {
    if (matches(c, sel)) return c;
    const inner = findIn(c, sel);
    if (inner) return inner;
  }
  return null;
}
function collectIn(root, sel, out) {
  if (!root || !Array.isArray(root.children)) return;
  for (const c of root.children) {
    if (matches(c, sel)) out.push(c);
    collectIn(c, sel, out);
  }
}

const documentElement = makeElement('html');
const head = makeElement('head'); documentElement.appendChild(head);
const body = makeElement('body'); documentElement.appendChild(body);
const headerEl = makeElement('header'); headerEl.classList.add('app-header');
body.appendChild(headerEl);

const document = {
  documentElement, head, body,
  readyState: 'complete',
  createTextNode(text) {
    return { nodeType: 3, data: String(text), parent: null };
  },
  createElement(tag) {
    const el = makeElement(tag);
    if (tag === 'select') {
      el.value = '';
      const opts = [];
      Object.defineProperty(el, 'value', {
        get() { return el._value; },
        set(v) { el._value = String(v); },
        configurable: true,
      });
      el.appendChild = function(opt) {
        opts.push(opt); el.children.push(opt);
        if (opt.selected) el._value = opt.value;
        else if (el._value === undefined) el._value = opt.value;
        return opt;
      };
    }
    return el;
  },
  getElementById(id) {
    function walk(el) {
      if (el.attrs && el.attrs.id === id) return el;
      if (el.id === id) return el;
      for (const c of (el.children || [])) {
        const r = walk(c); if (r) return r;
      }
      return null;
    }
    return walk(documentElement);
  },
  querySelector(sel) { return findIn(documentElement, sel); },
  querySelectorAll(sel) { const out = []; collectIn(documentElement, sel, out); return out; },
  addEventListener() {},
};

/* ---------- mocked Storage API ---------------------------------- */
let prefStore = {};
const Storage = {
  readPrefs() { return JSON.parse(JSON.stringify(prefStore)); },
  writePrefs(p) { prefStore = JSON.parse(JSON.stringify(p)); },
};

/* ---------- load a11y.js into the shim -------------------------- */
const win = {};
win.document = document;
win.Storage = Storage;
win.window = win;
const a11ySrc = fs.readFileSync(path.join(WEB, 'a11y.js'), 'utf8');
new Function('document', 'Storage', 'window', a11ySrc)(document, Storage, win);

/* ---------- assertions ------------------------------------------ */
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exit(1); }
  console.log('✓', msg);
}

// init() runs synchronously since readyState is 'complete'.
assert(typeof win.A11y === 'object', 'A11y debug surface exposed on window');
assert(typeof win.A11y.apply === 'function', 'A11y.apply is callable');
assert(typeof win.A11y.current === 'function', 'A11y.current is callable');

// Default state: scale 1, theme default.
let cur = win.A11y.current();
assert(cur.uiScale === '1', 'default scale is 1 (got "' + cur.uiScale + '")');
assert(cur.uiTheme === 'default', 'default theme is "default" (got "' + cur.uiTheme + '")');
assert(body.style.fontSize === '13px', 'body font-size = 13px at default scale');

// Apply 150% scale via the public API.
win.A11y.apply({ uiScale: '1.5' });
cur = win.A11y.current();
assert(cur.uiScale === '1.5', 'scale applied (got "' + cur.uiScale + '")');
assert(body.style.fontSize === '19.5px', 'body font-size = 19.5px at 150% (got "' + body.style.fontSize + '")');

// Apply high-contrast theme.
win.A11y.apply({ uiTheme: 'high-contrast' });
cur = win.A11y.current();
assert(cur.uiTheme === 'high-contrast', 'theme applied (got "' + cur.uiTheme + '")');
assert(documentElement.getAttribute('data-ui-theme') === 'high-contrast',
  'data-ui-theme attribute set to high-contrast');

// Style block injected.
const injected = head.children.find(c => c.attrs && c.attrs.id === 'a11y-injected-css')
              || head.children.find(c => c.id === 'a11y-injected-css');
assert(injected, 'high-contrast <style> block injected');

// Controls injected into the header.
const controls = headerEl.querySelector('.a11y-controls');
assert(controls, '.a11y-controls injected into .app-header');
const scaleSel = headerEl.querySelector('select');
assert(scaleSel, 'scale <select> exists in controls');

// Prefs round-trip — simulate the scale dropdown firing 'change'.
scaleSel.value = '1.25';
scaleSel.dispatchEvent('change', { target: { value: '1.25' } });
cur = win.A11y.current();
assert(cur.uiScale === '1.25', 'change event applies scale');
assert(prefStore.uiScale === '1.25', 'change event persists to prefs (got ' + JSON.stringify(prefStore) + ')');

console.log('\nAccessibility smoke-test complete.');
