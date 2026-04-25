/* Phase 1.3 / 4.x — shared project-menu helpers.
 *
 * The Backgrounds page has the most complete project menu (New /
 * Duplicate / Delete / Migration backup / Save all / Open saved /
 * Recover from snapshot).  Sprites mirrors it.  Behaviour, Builder
 * and Code historically shipped a thinner subset.  This module fills
 * the gap by lazily wiring **Recover from snapshot** and **Migration
 * backup** buttons on any page that includes the matching elements,
 * without disturbing pages that already roll their own handlers.
 *
 * Save-all / Open-saved are NOT handled here because every page
 * already wires them locally with page-specific state-replacement
 * logic; copying that here would clash with the existing handlers.
 *
 * Usage (call once after Storage has loaded the project state):
 *
 *   ProjectMenu.wire({
 *     onAfterRecover: (loaded) => { ... }   // optional; defaults
 *     // to window.location.reload() which works on every page
 *     // because they all read state from Storage on init.
 *   });
 *
 * The recovery dialog is injected lazily so pages that already ship
 * one (Backgrounds) don't end up with two — the function checks for
 * an existing `#recovery-dialog` first and reuses it.  Keeps the
 * dialog markup out of every page's HTML and lets the shared module
 * be enabled with one script tag.
 */
(function (global) {
  'use strict';

  function injectStyles() {
    if (document.getElementById('project-menu-injected-css')) return;
    const css = [
      'dialog#recovery-dialog {',
      '  background: var(--bg, #14121f); color: var(--fg, #f4f4f4);',
      '  border: 1px solid var(--border, #3a3352); border-radius: 6px;',
      '  padding: 18px 20px; width: min(520px, 94vw);',
      '}',
      'dialog#recovery-dialog::backdrop { background: rgba(0,0,0,0.7); }',
      'dialog#recovery-dialog h2 { margin: 0 0 8px; color: var(--accent, #ffd866); }',
      'dialog#recovery-dialog .snapshot-list {',
      '  list-style: none; padding: 0; margin: 8px 0 12px;',
      '  max-height: 50vh; overflow: auto;',
      '}',
      'dialog#recovery-dialog .snapshot-list li {',
      '  display: flex; gap: 12px; align-items: center;',
      '  padding: 8px; border-bottom: 1px solid var(--border, #3a3352);',
      '}',
      'dialog#recovery-dialog .snapshot-list li:last-child { border-bottom: 0; }',
      'dialog#recovery-dialog .snapshot-list span:first-child { flex: 1; }',
      'dialog#recovery-dialog .snapshot-meta {',
      '  display: block; font-size: 0.85em; color: var(--muted, #9a97ad);',
      '}',
      'dialog#recovery-dialog .dialog-actions {',
      '  display: flex; justify-content: flex-end; gap: 8px;',
      '}',
    ].join('\n');
    const style = document.createElement('style');
    style.id = 'project-menu-injected-css';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function ensureRecoveryDialog() {
    let dlg = document.getElementById('recovery-dialog');
    if (dlg) return dlg;
    dlg = document.createElement('dialog');
    dlg.id = 'recovery-dialog';

    const h = document.createElement('h2');
    h.textContent = 'Recover from a snapshot';
    dlg.appendChild(h);

    const p = document.createElement('p');
    p.style.color = 'var(--muted)';
    p.style.fontSize = '0.9em';
    p.textContent = 'Pick any snapshot below and click Restore. Your current ' +
      'project is first saved to its own snapshot slot so nothing is lost.';
    dlg.appendChild(p);

    const ul = document.createElement('ul');
    ul.className = 'snapshot-list';
    ul.id = 'snapshot-list';
    dlg.appendChild(ul);

    const actions = document.createElement('div');
    actions.className = 'dialog-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.id = 'btn-recovery-cancel';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => dlg.close());
    actions.appendChild(cancel);
    dlg.appendChild(actions);

    document.body.appendChild(dlg);
    return dlg;
  }

  function openRecoveryDialog(opts) {
    opts = opts || {};
    const dlg = ensureRecoveryDialog();
    const ul = dlg.querySelector('#snapshot-list');
    ul.replaceChildren();

    const all = []
      .concat(Storage.listSnapshots().map(s => ({ ...s, kind: 'snapshot' })))
      .concat(Storage.listBackups().map(s => ({ ...s, kind: 'backup' })));
    all.sort((a, b) => b.ts - a.ts);

    if (!all.length) {
      const li = document.createElement('li');
      li.textContent = 'No snapshots or backups yet. Make a change and wait 30s.';
      ul.appendChild(li);
    } else {
      for (const s of all) {
        const li = document.createElement('li');
        const desc = document.createElement('span');
        const b = document.createElement('b');
        b.textContent = s.name || 'untitled';
        const meta = document.createElement('span');
        meta.className = 'snapshot-meta';
        const when = new Date(s.ts).toLocaleString();
        const tag = s.kind === 'backup' ? '🛟 backup' : '📸 snapshot';
        meta.textContent = when + ' · ' + tag + (s.reason ? ' · ' + s.reason : '');
        desc.appendChild(b);
        desc.appendChild(document.createElement('br'));
        desc.appendChild(meta);
        li.appendChild(desc);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'primary';
        btn.textContent = 'Restore';
        btn.addEventListener('click', () => {
          // Best-effort: save the current state as a "before_recovery"
          // snapshot.  Falls back gracefully if no current state exists.
          try {
            const cur = Storage.loadCurrent();
            if (cur) Storage.saveSnapshot(cur, 'before_recovery');
          } catch (_) {}
          const loaded = Storage.loadSnapshot(s.key);
          if (!loaded) {
            alert('That save could not be loaded — the data may be damaged.');
            return;
          }
          Storage.saveCurrent(loaded);
          dlg.close();
          if (typeof opts.onAfterRecover === 'function') {
            try { opts.onAfterRecover(loaded); return; } catch (_) {}
          }
          // Default: reload so the page picks up the restored state
          // through the same path it uses on first load.  Works on
          // every editor page because they all read from
          // Storage.loadCurrent() during init.
          window.location.reload();
        });
        li.appendChild(btn);
        ul.appendChild(li);
      }
    }
    dlg.showModal();
  }

  function wireRecoverButton(opts) {
    const btn = document.getElementById('btn-recover');
    if (!btn) return;
    // Avoid double-wiring on pages that already attached their own
    // handler (Backgrounds, Sprites).  Mark the button so we know.
    if (btn.dataset.projectMenuWired === '1') return;
    if (btn.onclick !== null && btn.onclick !== undefined) return;
    btn.dataset.projectMenuWired = '1';
    btn.addEventListener('click', () => openRecoveryDialog(opts));
  }

  function wireMigrationButton() {
    const btn = document.getElementById('btn-migration-download');
    if (!btn) return;
    if (btn.dataset.projectMenuWired === '1') return;
    btn.dataset.projectMenuWired = '1';
    if (typeof Storage.hasPreMigrationBackup === 'function') {
      btn.hidden = !Storage.hasPreMigrationBackup();
    }
    btn.addEventListener('click', () => {
      const b = Storage.getPreMigrationBackup();
      if (!b) { btn.hidden = true; return; }
      const json = JSON.stringify({ ts: b.ts, keys: b.keys }, null, 2);
      const stamp = new Date(b.ts).toISOString().slice(0, 19).replace(/[:T]/g, '-');
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'tile_editor_pre_upgrade_' + stamp + '.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      Storage.clearPreMigrationBackup();
      btn.hidden = true;
    });
  }

  function wire(opts) {
    injectStyles();
    wireRecoverButton(opts || {});
    wireMigrationButton();
  }

  global.ProjectMenu = { wire, openRecoveryDialog };
})(typeof window !== 'undefined' ? window : globalThis);
