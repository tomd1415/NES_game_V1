// Optional-accounts editor UI (account-menu.js) — headless smoke test.
//
// Drives the real account-menu.js against a small DOM shim + mocked fetch +
// mocked Storage.  Asserts the behaviours the teacher's requirements hinge on:
//   * if /auth/me is unreachable, the whole Account section hides (accounts are
//     OPTIONAL and must never block the editor),
//   * signed-out shows "Sign in / Create account"; signed-in shows Save / Load
//     / Sign out,
//   * "Save to my account" PUTs when a cloud project of the same name exists,
//     POSTs otherwise,
//   * "Open from my account" creates a NEW local project from the blob and
//     reloads (never clobbers current work).
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/home/duguid/projects/nesgame/attempt1';
const WEB  = path.join(ROOT, 'tools', 'tile_editor_web');
const SRC  = fs.readFileSync(path.join(WEB, 'account-menu.js'), 'utf8');

let failed = false;
const ok  = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };
const tick = () => new Promise(r => setTimeout(r, 0));

// ---- minimal DOM shim ---------------------------------------------------
function parseStyle(str, obj) { (str || '').split(';').forEach(p => { const [k, v] = p.split(':'); if (k && v) obj[k.trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v.trim(); }); }
function makeEl(tag) {
  const el = {
    tagName: (tag || 'div').toUpperCase(), children: [], parent: null,
    listeners: {}, _open: false, value: '', textContent: '', innerHTML: '',
    attrs: {}, _style: {},
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
      contains(c) { return this._s.has(c); },
      toggle(c, on) { if (on === undefined) on = !this._s.has(c); on ? this._s.add(c) : this._s.delete(c); },
    },
    appendChild(c) { c.parent = el; el.children.push(c); return c; },
    insertBefore(node, ref) { node.parent = el; const i = ref ? el.children.indexOf(ref) : -1; if (i < 0) el.children.push(node); else el.children.splice(i, 0, node); return node; },
    replaceChildren(...k) { el.children.length = 0; k.forEach(x => el.appendChild(x)); },
    remove() { if (el.parent) { const i = el.parent.children.indexOf(el); if (i >= 0) el.parent.children.splice(i, 1); } },
    setAttribute(k, v) { el.attrs[k] = String(v); if (k === 'id') el.id = String(v); },
    getAttribute(k) { return el.attrs[k] ?? null; },
    addEventListener(t, fn) { (el.listeners[t] ||= []).push(fn); },
    dispatchEvent(t, e) { (el.listeners[t] || []).forEach(fn => fn(e || {})); },
    showModal() { el._open = true; }, close() { el._open = false; el.dispatchEvent('close'); },
    focus() {}, click() { if (typeof el.onclick === 'function') el.onclick({}); else el.dispatchEvent('click'); },
    querySelector(sel) { return findIn(el, sel); },
    querySelectorAll(sel) { const out = []; collect(el, sel, out); return out; },
    closest(sel) { let n = el; while (n) { if (matches(n, sel)) return n; n = n.parent; } return null; },
  };
  Object.defineProperty(el, 'className', { get() { return [...el.classList._s].join(' '); }, set(v) { el.classList._s = new Set(String(v).split(/\s+/).filter(Boolean)); } });
  Object.defineProperty(el, 'style', { get() { return el._style; }, set(v) { if (typeof v === 'string') { el._style = {}; parseStyle(v, el._style); } else el._style = v || {}; } });
  Object.defineProperty(el, 'parentNode', { get() { return el.parent || null; } });
  Object.defineProperty(el, 'nextSibling', { get() { const p = el.parent; if (!p) return null; const i = p.children.indexOf(el); return p.children[i + 1] || null; } });
  return el;
}
function matches(el, sel) {
  if (!el || !el.tagName) return false;
  if (sel[0] === '.') return el.classList.contains(sel.slice(1));
  if (sel[0] === '#') return el.id === sel.slice(1);
  return el.tagName === sel.toUpperCase();
}
function findIn(root, sel) { for (const c of root.children) { if (matches(c, sel)) return c; const r = findIn(c, sel); if (r) return r; } return null; }
function collect(root, sel, out) { for (const c of root.children) { if (matches(c, sel)) out.push(c); collect(c, sel, out); } }

function allText(el) { let t = el.textContent || ''; for (const c of el.children) t += ' ' + allText(c); return t; }

function makeEnv() {
  const documentElement = makeEl('html');
  const head = makeEl('head'); documentElement.appendChild(head);
  const body = makeEl('body'); documentElement.appendChild(body);
  // The shared menu the account section attaches to.
  const menu = makeEl('details'); menu.id = 'projects-menu';
  const menuBody = makeEl('div'); menuBody.className = 'menu-body';
  menu.appendChild(menuBody); body.appendChild(menu);

  const document_ = {
    documentElement, head, body, readyState: 'complete',
    createElement: (t) => makeEl(t),
    createTextNode: (t) => ({ nodeType: 3, textContent: String(t), children: [] }),
    getElementById(id) { let r = null; (function w(e) { if (e.id === id) r = e; for (const c of e.children) if (!r) w(c); })(documentElement); return r; },
    querySelector(sel) { return findIn(documentElement, sel); },
    addEventListener() {},
  };
  return { document_, body, menu, menuBody };
}

function load(env, fetchImpl, Storage) {
  const win = { document: env.document_, fetch: fetchImpl, Storage,
    location: { reload() { win._reloaded = true; } }, addEventListener() {} };
  win.window = win;
  const alertFn = (m) => { win._alert = m; };
  win.alert = alertFn;
  // account-menu.js IIFE param is `global`; it reads document/fetch/Storage/
  // window/alert as free globals — inject them all.
  new Function('global', 'document', 'fetch', 'Storage', 'window', 'alert', SRC)(
    win, env.document_, fetchImpl, Storage, win, alertFn);
  return win;
}

function jsonResp(ok, obj, status) { return Promise.resolve({ ok, status: status || (ok ? 200 : 400), json: () => Promise.resolve(obj) }); }

// Find a <button> by visible text within a root element.
const btn = (root, re) => root && root.querySelectorAll('button').find(b => re.test(b.textContent));
const control = (env) => env.document_.getElementById('account-control');

// ---- 1) graceful hide when /auth/me is unreachable ----------------------
{
  const env = makeEnv();
  const fetchImpl = () => Promise.reject(new Error('network down'));
  load(env, fetchImpl, { loadCurrent: () => ({ name: 'x' }), flushPending() {} });
  await tick(); await tick();
  if (!control(env)) ok('account control hidden/removed when /auth/me is unreachable (accounts stay optional)');
  else bad('account control was left in the DOM despite /auth/me failing');
}

// ---- 2) signed-out rendering -------------------------------------------
{
  const env = makeEnv();
  const fetchImpl = (p) => p === '/auth/me' ? jsonResp(true, { ok: true, username: null, signupsOpen: true }) : jsonResp(false, {});
  load(env, fetchImpl, { loadCurrent: () => ({ name: 'x' }), flushPending() {} });
  await tick(); await tick();
  const ctrl = control(env);
  const signin = env.document_.getElementById('account-signin');
  if (ctrl && ctrl.style.display !== 'none' && signin && /Sign in/.test(signin.textContent))
    ok('signed-out shows a top-bar "👤 Sign in" button');
  else bad('signed-out did not render the top-bar Sign in button: ' + JSON.stringify(ctrl && allText(ctrl)));
}

// ---- 3) signed-in rendering --------------------------------------------
{
  const env = makeEnv();
  const fetchImpl = (p) => p === '/auth/me' ? jsonResp(true, { ok: true, username: 'pixel_kid', signupsOpen: true }) : jsonResp(false, {});
  load(env, fetchImpl, { loadCurrent: () => ({ name: 'x' }), flushPending() {} });
  await tick(); await tick();
  const txt = allText(control(env));
  if (/pixel_kid/.test(txt) && /Save to my account/.test(txt) && /Open from my account/.test(txt) && /Sign out/.test(txt))
    ok('signed-in shows the username + Save / Open / Sign out');
  else bad('signed-in control missing expected items: ' + JSON.stringify(txt));
}

// ---- 4) Save to account: PUT when the name already exists --------------
{
  const env = makeEnv();
  const calls = [];
  const fetchImpl = (p, opts) => {
    calls.push({ p, m: (opts && opts.method) || 'GET' });
    if (p === '/auth/me') return jsonResp(true, { ok: true, username: 'u', signupsOpen: true });
    if (p === '/me/projects' && (!opts || opts.method === 'GET')) return jsonResp(true, { ok: true, projects: [{ id: 7, name: 'Castle' }] });
    if (p === '/me/projects/7' && opts.method === 'PUT') return jsonResp(true, { ok: true, id: 7 });
    if (p === '/me/projects' && opts.method === 'POST') return jsonResp(true, { ok: true, id: 9 });
    return jsonResp(false, {});
  };
  load(env, fetchImpl, { loadCurrent: () => ({ name: 'Castle', data: 1 }), flushPending() {} });
  await tick(); await tick();
  btn(control(env), /Save to my account/).click();
  await tick(); await tick(); await tick();
  const put = calls.find(c => c.p === '/me/projects/7' && c.m === 'PUT');
  const post = calls.find(c => c.p === '/me/projects' && c.m === 'POST');
  if (put && !post) ok('Save to account PUTs the existing cloud project of the same name');
  else bad('Save-to-account did not PUT the matching project: ' + JSON.stringify(calls));
}

// ---- 5) Save to account: POST when no same-name project ----------------
{
  const env = makeEnv();
  const calls = [];
  const fetchImpl = (p, opts) => {
    calls.push({ p, m: (opts && opts.method) || 'GET', body: opts && opts.body });
    if (p === '/auth/me') return jsonResp(true, { ok: true, username: 'u', signupsOpen: true });
    if (p === '/me/projects' && (!opts || opts.method === 'GET')) return jsonResp(true, { ok: true, projects: [] });
    if (p === '/me/projects' && opts.method === 'POST') return jsonResp(true, { ok: true, id: 9 });
    return jsonResp(false, {});
  };
  load(env, fetchImpl, { loadCurrent: () => ({ name: 'Brand New', data: 2 }), flushPending() {} });
  await tick(); await tick();
  btn(control(env), /Save to my account/).click();
  await tick(); await tick(); await tick();
  const post = calls.find(c => c.p === '/me/projects' && c.m === 'POST');
  if (post && /Brand New/.test(post.body)) ok('Save to account POSTs a new cloud project when none matches the name');
  else bad('Save-to-account did not POST a new project: ' + JSON.stringify(calls));
}

// ---- 6) Open from account creates a NEW local project + reloads --------
{
  const env = makeEnv();
  let created = null;
  const blob = JSON.stringify({ name: 'Cloud Game', tiles: [] });
  const fetchImpl = (p, opts) => {
    if (p === '/auth/me') return jsonResp(true, { ok: true, username: 'u', signupsOpen: true });
    if (p === '/me/projects' && (!opts || opts.method === 'GET')) return jsonResp(true, { ok: true, projects: [{ id: 3, name: 'Cloud Game', updated_at: 1700000000, size: 1234 }] });
    if (p === '/me/projects/3') return jsonResp(true, { ok: true, id: 3, name: 'Cloud Game', blob });
    return jsonResp(false, {});
  };
  const win = load(env, fetchImpl, {
    loadCurrent: () => ({ name: 'local' }), flushPending() {},
    createProject: (name, st) => { created = { name, st }; return { id: 'L1' }; },
  });
  await tick(); await tick();
  btn(control(env), /Open from my account/).click();
  await tick(); await tick();
  // The load dialog is appended to body; find its Open button and click it.
  const openBtn = env.body.querySelectorAll('button').find(b => b.textContent === 'Open');
  if (!openBtn) { bad('load dialog did not render an Open button'); }
  else {
    openBtn.click();
    await tick(); await tick(); await tick();
    if (created && created.name === 'Cloud Game' && created.st && created.st.name === 'Cloud Game' && win._reloaded)
      ok('Open-from-account creates a new local project from the blob and reloads');
    else bad('Open-from-account did not create the local project / reload: ' + JSON.stringify({ created: !!created, reloaded: win._reloaded }));
  }
}

if (failed) { console.error('\naccount-ui: FAILURES above'); process.exit(1); }
console.log('\naccount-ui: all checks passed');
