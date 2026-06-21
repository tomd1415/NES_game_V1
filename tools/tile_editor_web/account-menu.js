/* Optional pupil accounts — editor UI (T4.2 P3).
 *
 * Adds a discoverable account control to the top toolbar (next to the 📁
 * project menu) on every editor page — "👤 Sign in" when signed out, a
 * "👤 username ▾" dropdown (Save / Open / Sign out) when signed in — plus the
 * sign-in / create-account and open-from-account dialogs.  Talks to the
 * playground server's /auth/* and /me/projects endpoints (same origin, session
 * cookie).
 *
 * DESIGN RULES (per teacher requirements):
 *   * Accounts are OPTIONAL.  Pupils use the editor fully without one.  If the
 *     server or /auth/me is unreachable (static-only host, server down), the
 *     whole section silently hides — it must never block the editor.
 *   * The account stores ONLY a username (no real names — [A-Za-z0-9_-]{3,20})
 *     and a hashed password.  No email, no analytics.  The UI collects nothing
 *     else.
 *   * Save/Load to account is additive: loading a cloud project creates a NEW
 *     local project, never overwriting the work currently on screen.
 *
 * Auto-mounts on DOMContentLoaded; safe to load on every page (no-op if there
 * is no project menu or no Storage).
 */
(function (global) {
  'use strict';

  var me = null;            // { username|null, signupsOpen } once /auth/me succeeds
  var mounted = false;

  function injectStyles() {
    if (document.getElementById('account-menu-css')) return;
    var css = [
      // Top-bar control (sits next to the 📁 project menu on every page).
      '#account-control { display: inline-flex; align-items: center; }',
      '.account-signin {',
      '  background: var(--panel2, #2a2440); color: var(--fg, #f4f4f4);',
      '  border: 1px solid var(--border, #3a3352); border-radius: 4px;',
      '  padding: 5px 10px; cursor: pointer; font: inherit; white-space: nowrap;',
      '}',
      '.account-signin:hover { background: #3a3560; }',
      '.account-menu { position: relative; }',
      '.account-menu > summary {',
      '  list-style: none; cursor: pointer; padding: 5px 10px;',
      '  background: var(--panel2, #2a2440); border: 1px solid var(--border, #3a3352);',
      '  border-radius: 4px; max-width: 180px; overflow: hidden;',
      '  text-overflow: ellipsis; white-space: nowrap;',
      '}',
      '.account-menu[open] > summary { background: #3a3560; }',
      '.account-menu .acct-user { color: var(--accent, #ffd866); font-weight: 600; }',
      '.account-menu > .menu-body {',
      '  position: absolute; right: 0; top: calc(100% + 4px);',
      '  background: var(--panel, #1f1b30); border: 1px solid var(--border, #3a3352);',
      '  border-radius: 4px; padding: 6px; display: flex; flex-direction: column; gap: 4px;',
      '  min-width: 220px; box-shadow: 0 6px 18px rgba(0,0,0,0.5); z-index: 30;',
      '}',
      '.account-menu > .menu-body button { text-align: left; }',
      '.acct-line { font-size: 0.9em; color: var(--muted, #9a97ad); margin: 2px 0; }',
      'dialog.acct-dialog {',
      '  background: var(--bg, #14121f); color: var(--fg, #f4f4f4);',
      '  border: 1px solid var(--border, #3a3352); border-radius: 6px;',
      '  padding: 18px 20px; width: min(420px, 94vw);',
      '}',
      'dialog.acct-dialog::backdrop { background: rgba(0,0,0,0.7); }',
      'dialog.acct-dialog h2 { margin: 0 0 10px; color: var(--accent, #ffd866); }',
      'dialog.acct-dialog label { display:block; margin: 0 0 10px; font-size: 0.92em; }',
      'dialog.acct-dialog input { width:100%; padding:6px 8px; margin-top:4px; box-sizing:border-box;',
      '  background: var(--panel2, #2a2440); color: var(--fg, #f4f4f4); border:1px solid var(--border,#3a3352); border-radius:4px; }',
      'dialog.acct-dialog .acct-tabs { display:flex; gap:6px; margin-bottom:12px; }',
      'dialog.acct-dialog .acct-tabs button { flex:1; }',
      'dialog.acct-dialog .acct-tabs button.active { background: var(--accent,#ffd866); color:#000; font-weight:600; }',
      'dialog.acct-dialog .dialog-actions { display:flex; justify-content:flex-end; gap:8px; margin-top:6px; }',
      'dialog.acct-dialog .acct-msg { min-height: 1.2em; font-size:0.88em; margin: 4px 0 8px; }',
      'dialog.acct-dialog .acct-msg.err { color: var(--warn, #ff6188); }',
      'dialog.acct-dialog .acct-msg.ok  { color: var(--good, #a9dc76); }',
      'dialog.acct-dialog .acct-recovery { background: var(--panel2,#2a2440); border:1px dashed var(--accent,#ffd866);',
      '  border-radius:4px; padding:10px; margin:8px 0; font-size:0.9em; }',
      'dialog.acct-dialog .acct-recovery code { font-size:1.15em; color: var(--accent,#ffd866); letter-spacing:0.05em; }',
      'dialog.acct-dialog .acct-project-list { list-style:none; padding:0; margin:6px 0 12px; max-height:50vh; overflow:auto; }',
      'dialog.acct-dialog .acct-project-list li { display:flex; gap:10px; align-items:center; padding:7px 4px; border-bottom:1px solid var(--border,#3a3352); }',
      'dialog.acct-dialog .acct-project-list li:last-child { border-bottom:0; }',
      'dialog.acct-dialog .acct-project-list .meta { flex:1; }',
      'dialog.acct-dialog .acct-project-list .meta small { display:block; color:var(--muted,#9a97ad); font-size:0.82em; }',
    ].join('\n');
    var style = document.createElement('style');
    style.id = 'account-menu-css';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // --- tiny DOM helper -------------------------------------------------
  function el(tag, props, kids) {
    var n = document.createElement(tag);
    if (props) for (var k in props) {
      if (k === 'class') n.className = props[k];
      else if (k === 'text') n.textContent = props[k];
      else if (k === 'html') n.innerHTML = props[k];
      else n[k] = props[k];
    }
    (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }

  // --- server calls ----------------------------------------------------
  function api(method, path, body) {
    var opts = { method: method, credentials: 'same-origin', headers: {} };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    return fetch(path, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok || j.ok === false) {
          var e = new Error(j.error || ('HTTP ' + r.status));
          e.code = j.code; e.status = r.status;
          throw e;
        }
        return j;
      });
    });
  }

  // --- top-bar control (next to the 📁 project menu) ------------------
  // A discoverable entry that sits in the toolbar rather than hidden inside the
  // project dropdown.  Signed-out: a plain "👤 Sign in" button.  Signed-in: a
  // little "👤 username ▾" dropdown with Save / Open / Sign out.
  function placeControl() {
    var anchor = document.getElementById('projects-menu');
    if (!anchor || !anchor.parentNode) return null;
    var ctrl = document.getElementById('account-control');
    if (!ctrl) {
      ctrl = el('span', { id: 'account-control' });
      anchor.parentNode.insertBefore(ctrl, anchor.nextSibling);
    }
    return ctrl;
  }

  function renderControl() {
    var ctrl = document.getElementById('account-control');
    if (!ctrl) return;
    ctrl.replaceChildren();
    if (me && me.username) {
      var summary = el('summary', { title: 'Your account' }, [
        document.createTextNode('👤 '),
        el('span', { class: 'acct-user', text: me.username }),
        document.createTextNode(' ▾'),
      ]);
      var body = el('div', { class: 'menu-body' }, [
        el('button', { type: 'button', text: '☁ Save to my account', onclick: saveToAccount }),
        el('button', { type: 'button', text: '☁ Open from my account…', onclick: openLoadDialog }),
        el('hr', { class: 'tb-inline-divider' }),
        el('button', { type: 'button', text: '🚪 Sign out', onclick: signOut }),
      ]);
      ctrl.appendChild(el('details', { class: 'account-menu', id: 'account-menu' }, [summary, body]));
    } else {
      ctrl.appendChild(el('button', {
        type: 'button', class: 'account-signin', id: 'account-signin',
        title: 'Sign in or create an account to save your work to the class server (optional)',
        text: '👤 Sign in', onclick: openAuthDialog,
      }));
    }
  }

  function setStatus(node, msg, kind) {
    if (!node) return;
    node.textContent = msg || '';
    node.className = 'acct-msg' + (kind ? ' ' + kind : '');
  }

  // --- sign in / create account dialog --------------------------------
  function openAuthDialog() {
    var menu = document.getElementById('projects-menu');
    if (menu) menu.open = false;
    var mode = 'login';   // 'login' | 'signup'

    var dlg = el('dialog', { class: 'acct-dialog' });
    var title = el('h2', { text: 'Sign in' });
    // Self-signup is gated on a class join code; when the server has none
    // configured (signupsOpen=false) there's no point offering "Create account".
    var canSignup = !(me && me.signupsOpen === false);
    var tabLogin = el('button', { type: 'button', class: 'active', text: 'Sign in' });
    var tabSignup = el('button', { type: 'button', text: 'Create account' });
    var tabs = el('div', { class: 'acct-tabs' }, canSignup ? [tabLogin, tabSignup] : [tabLogin]);
    var closedNote = canSignup ? null : el('div', { class: 'acct-line',
      text: 'New accounts are closed right now — ask your teacher for the class join code.' });

    var userIn = el('input', { type: 'text', autocomplete: 'username', placeholder: '3–20 letters/numbers' });
    var passIn = el('input', { type: 'password', autocomplete: 'current-password', placeholder: 'at least 6 characters' });
    var userLab = el('label', { text: 'Username' }, [userIn]);
    var passLab = el('label', { text: 'Password' }, [passIn]);
    var codeIn = el('input', { type: 'text', placeholder: 'ask your teacher for the class code' });
    var codeLab = el('label', { text: 'Class code', style: 'display:none' }, [codeIn]);
    var msg = el('div', { class: 'acct-msg' });
    var recovery = el('div', { class: 'acct-recovery', style: 'display:none' });

    var cancel = el('button', { type: 'button', text: 'Cancel', onclick: function () { dlg.close(); } });
    var submit = el('button', { type: 'button', class: 'primary', text: 'Sign in' });
    var actions = el('div', { class: 'dialog-actions' }, [cancel, submit]);

    function applyMode() {
      var login = mode === 'login';
      title.textContent = login ? 'Sign in' : 'Create an account';
      tabLogin.classList.toggle('active', login);
      tabSignup.classList.toggle('active', !login);
      codeLab.style.display = login ? 'none' : 'block';
      passIn.autocomplete = login ? 'current-password' : 'new-password';
      submit.textContent = login ? 'Sign in' : 'Create account';
      setStatus(msg, '');
      recovery.style.display = 'none';
    }
    tabLogin.addEventListener('click', function () { mode = 'login'; applyMode(); });
    if (canSignup) tabSignup.addEventListener('click', function () { mode = 'signup'; applyMode(); });

    // Enter in any field submits — pupils expect it and there's no <form>.
    [userIn, passIn, codeIn].forEach(function (inp) {
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { if (e.preventDefault) e.preventDefault(); submit.click(); }
      });
    });

    submit.addEventListener('click', function () {
      var username = (userIn.value || '').trim();
      var password = passIn.value || '';
      if (!username || !password) { setStatus(msg, 'Enter a username and password.', 'err'); return; }
      submit.disabled = true;
      setStatus(msg, mode === 'login' ? 'Signing in…' : 'Creating your account…');
      var p = mode === 'login'
        ? api('POST', '/auth/login', { username: username, password: password })
        : api('POST', '/auth/signup', { username: username, password: password, joinCode: (codeIn.value || '').trim() });
      p.then(function (j) {
        if (mode === 'signup' && j.recoveryCode) {
          // Show the one-time recovery code; keep the dialog open so the pupil
          // can write it down before continuing.
          recovery.replaceChildren();
          recovery.appendChild(el('div', { html: '<b>Save your recovery code!</b> It is the only way to reset a forgotten password (no email is stored).' }));
          recovery.appendChild(el('div', { style: 'margin-top:6px' }, [el('code', { text: j.recoveryCode })]));
          var done = el('button', { type: 'button', class: 'primary', text: 'I\'ve saved it — continue', style: 'margin-top:8px',
            onclick: function () { dlg.close(); afterAuth(); } });
          recovery.appendChild(done);
          recovery.style.display = 'block';
          setStatus(msg, 'Account created.', 'ok');
          tabs.style.display = 'none'; userLab.style.display = 'none'; passLab.style.display = 'none';
          codeLab.style.display = 'none'; actions.style.display = 'none';
        } else {
          dlg.close(); afterAuth();
        }
      }).catch(function (e) {
        setStatus(msg, e.message || 'That did not work — check your details.', 'err');
      }).finally(function () { submit.disabled = false; });
    });

    function afterAuth() {
      refreshMe().then(renderControl);
    }

    dlg.appendChild(title);
    dlg.appendChild(tabs);
    if (closedNote) dlg.appendChild(closedNote);
    dlg.appendChild(userLab);
    dlg.appendChild(passLab);
    dlg.appendChild(codeLab);
    dlg.appendChild(msg);
    dlg.appendChild(recovery);
    dlg.appendChild(actions);
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('close', function () { dlg.remove(); });
    document.body.appendChild(dlg);
    applyMode();
    dlg.showModal();
    userIn.focus();
  }

  function signOut() {
    api('POST', '/auth/logout').catch(function () {}).then(function () {
      me = { username: null, signupsOpen: me ? me.signupsOpen : true };
      renderControl();
    });
  }

  // --- save current project to the account ----------------------------
  function currentProject() {
    if (!global.Storage) return null;
    try { global.Storage.flushPending(); } catch (_) {}
    var s = global.Storage.loadCurrent();
    if (!s) return null;
    return { name: s.name || 'untitled', blob: JSON.stringify(s) };
  }

  function saveToAccount() {
    var proj = currentProject();
    if (!proj) { alert('There is no project open to save yet.'); return; }
    // Overwrite the cloud copy of the same name if it exists, else create one.
    api('GET', '/me/projects').then(function (j) {
      var existing = (j.projects || []).find(function (p) { return p.name === proj.name; });
      var call = existing
        ? api('PUT', '/me/projects/' + existing.id, { name: proj.name, blob: proj.blob })
        : api('POST', '/me/projects', { name: proj.name, blob: proj.blob });
      return call;
    }).then(function () {
      alert('Saved “' + proj.name + '” to your account.');
    }).catch(function (e) {
      if (e.status === 401) { me = { username: null, signupsOpen: true }; renderControl(); }
      alert('Could not save to your account: ' + (e.message || e));
    });
  }

  // --- load a project from the account --------------------------------
  function openLoadDialog() {
    var menu = document.getElementById('projects-menu');
    if (menu) menu.open = false;
    var dlg = el('dialog', { class: 'acct-dialog' });
    dlg.appendChild(el('h2', { text: 'Open from my account' }));
    dlg.appendChild(el('div', { class: 'acct-line',
      text: 'Opening a project copies it into this browser as a new project — your current work is left untouched.' }));
    var msg = el('div', { class: 'acct-msg' });
    var list = el('ul', { class: 'acct-project-list' });
    var cancel = el('button', { type: 'button', text: 'Close', onclick: function () { dlg.close(); } });
    dlg.appendChild(msg);
    dlg.appendChild(list);
    dlg.appendChild(el('div', { class: 'dialog-actions' }, [cancel]));
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('close', function () { dlg.remove(); });
    document.body.appendChild(dlg);
    dlg.showModal();

    setStatus(msg, 'Loading your projects…');
    api('GET', '/me/projects').then(function (j) {
      setStatus(msg, '');
      var projects = j.projects || [];
      if (!projects.length) { setStatus(msg, 'You have not saved any projects to your account yet.'); return; }
      projects.forEach(function (p) {
        var when = p.updated_at ? new Date(p.updated_at * 1000).toLocaleString() : '';
        var meta = el('div', { class: 'meta' }, [
          el('b', { text: p.name }),
          el('small', { text: when + (p.size ? ' · ' + Math.round(p.size / 1024) + ' KB' : '') }),
        ]);
        var open = el('button', { type: 'button', class: 'primary', text: 'Open',
          onclick: function () { loadProject(p, dlg, msg); } });
        list.appendChild(el('li', null, [meta, open]));
      });
    }).catch(function (e) {
      if (e.status === 401) { dlg.close(); me = { username: null, signupsOpen: true }; renderControl(); }
      else setStatus(msg, 'Could not load your projects: ' + (e.message || e), 'err');
    });
  }

  function loadProject(p, dlg, msg) {
    setStatus(msg, 'Opening “' + p.name + '”…');
    api('GET', '/me/projects/' + p.id).then(function (j) {
      var parsed;
      try { parsed = JSON.parse(j.blob); }
      catch (_) { throw new Error('That saved project is damaged.'); }
      if (!global.Storage) throw new Error('Storage unavailable.');
      global.Storage.flushPending();
      global.Storage.createProject(p.name, parsed);   // new local project, switches active
      window.location.reload();
    }).catch(function (e) {
      setStatus(msg, 'Could not open it: ' + (e.message || e), 'err');
    });
  }

  // --- bootstrap -------------------------------------------------------
  function refreshMe() {
    return api('GET', '/auth/me').then(function (j) {
      me = { username: j.username || null, signupsOpen: !!j.signupsOpen };
      return me;
    }).catch(function () { me = null; return null; });
  }

  function mount() {
    if (mounted) return;
    if (!global.Storage) return;            // no storage layer → nothing to do
    var ctrl = placeControl();
    if (!ctrl) return;                      // no project menu to anchor to
    mounted = true;
    injectStyles();
    ctrl.style.display = 'none';
    // Only reveal the control once we know the server is reachable; on any
    // failure it stays hidden so accounts are truly optional.
    refreshMe().then(function (m) {
      if (m === null) { ctrl.remove(); mounted = false; return; }
      ctrl.style.display = '';
      renderControl();
    });
  }

  function init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mount);
    } else {
      mount();
    }
  }

  global.AccountMenu = { mount: mount, _refreshMe: refreshMe, _api: api };
  init();
})(typeof window !== 'undefined' ? window : globalThis);
