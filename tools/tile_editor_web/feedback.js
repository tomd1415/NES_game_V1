/* Pupil feedback form — shared across the four editor pages.
 *
 * Usage from page script (once, at end of init):
 *
 *   Feedback.mountInto(
 *     document.querySelector('.feedback-form-host'),
 *     { page: 'sprites', getProjectName: () => state.currentProjectName }
 *   );
 *
 * The form is built once per host and is idempotent on repeat calls.
 * Styles are injected into <head> on first use so the four HTML files
 * don't need to carry duplicate CSS.
 */
(function () {
  'use strict';

  const CATEGORIES = [
    { id: 'feature', emoji: '✨', label: 'Add a feature' },
    { id: 'broken',  emoji: '🐛', label: 'Something is broken' },
    { id: 'general', emoji: '💭', label: 'General comment' },
  ];
  const MSG_MAX = 500;
  const NAME_MAX = 80;

  const STYLE = `
    .fb-form { display: flex; flex-direction: column; gap: 10px;
      font-size: 0.95em; color: var(--fg, #eee); }
    .fb-form h3 { margin: 0 0 2px; color: var(--accent, #ffd166);
      font-size: 1em; }
    .fb-form p.fb-hint { margin: 0; color: var(--muted, #aaa);
      line-height: 1.45; }
    .fb-cat-row { display: flex; flex-wrap: wrap; gap: 8px; }
    .fb-cat { display: inline-flex; align-items: center; gap: 6px;
      padding: 6px 10px; border: 1px solid var(--border, #444);
      border-radius: 6px; background: var(--panel2, #2a2a2a);
      cursor: pointer; user-select: none; }
    .fb-cat input { margin: 0; }
    .fb-cat:hover { background: var(--panel, #333); }
    .fb-cat.checked { border-color: var(--accent, #ffd166);
      background: var(--panel, #333); }
    .fb-form textarea { width: 100%; box-sizing: border-box;
      min-height: 90px; resize: vertical; font: inherit;
      padding: 6px 8px; border: 1px solid var(--border, #444);
      border-radius: 4px; background: var(--panel2, #1e1e1e);
      color: inherit; }
    .fb-form input[type="text"] { width: 100%; box-sizing: border-box;
      font: inherit; padding: 5px 8px;
      border: 1px solid var(--border, #444); border-radius: 4px;
      background: var(--panel2, #1e1e1e); color: inherit; }
    .fb-row { display: flex; align-items: center; gap: 8px;
      justify-content: space-between; flex-wrap: wrap; }
    .fb-count { color: var(--muted, #888); font-size: 0.85em; }
    .fb-count.over { color: #ff7070; }
    .fb-send { padding: 6px 14px; font: inherit; border-radius: 4px;
      border: 1px solid var(--accent, #ffd166);
      background: var(--accent, #ffd166); color: #222; cursor: pointer; }
    .fb-send:disabled { opacity: 0.5; cursor: not-allowed; }
    .fb-banner { padding: 6px 8px; border-radius: 4px; font-size: 0.9em;
      display: none; }
    .fb-banner.ok { display: block;
      background: rgba(80, 200, 120, 0.15);
      border: 1px solid rgba(80, 200, 120, 0.55); color: #8fe1a2; }
    .fb-banner.err { display: block;
      background: rgba(255, 110, 110, 0.15);
      border: 1px solid rgba(255, 110, 110, 0.55); color: #ff9898; }
    .feedback-block { margin-top: 12px; }
    .feedback-block > summary { cursor: pointer;
      color: var(--accent, #ffd166); }
    .feedback-block > .feedback-form-host { margin-top: 8px; }
  `;

  function ensureStyle() {
    if (document.getElementById('fb-style')) return;
    const s = document.createElement('style');
    s.id = 'fb-style';
    s.textContent = STYLE;
    document.head.appendChild(s);
  }

  function build(host, opts) {
    const page = opts.page || '';
    const getProjectName = opts.getProjectName || (() => '');

    host.innerHTML = '';

    const intro = document.createElement('p');
    intro.className = 'fb-hint';
    intro.textContent =
      'Tell me what you think — a bug, an idea, or just a comment. ' +
      'Everything here is read by your teacher.';
    host.appendChild(intro);

    const catRow = document.createElement('div');
    catRow.className = 'fb-cat-row';
    const radios = CATEGORIES.map(c => {
      const lbl = document.createElement('label');
      lbl.className = 'fb-cat';
      lbl.title = c.label;
      const r = document.createElement('input');
      r.type = 'radio';
      r.name = 'fb-cat-' + Math.random().toString(36).slice(2, 7);
      r.value = c.id;
      lbl.appendChild(r);
      const em = document.createElement('span');
      em.textContent = c.emoji + ' ' + c.label;
      lbl.appendChild(em);
      catRow.appendChild(lbl);
      return { input: r, label: lbl };
    });
    host.appendChild(catRow);

    const msg = document.createElement('textarea');
    msg.rows = 5;
    msg.maxLength = MSG_MAX;
    msg.placeholder = 'What would you like to tell us? (up to ' +
      MSG_MAX + ' characters)';
    host.appendChild(msg);

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.maxLength = NAME_MAX;
    nameInput.placeholder =
      'Your name (optional, so we can ask you about it later)';
    host.appendChild(nameInput);

    const row = document.createElement('div');
    row.className = 'fb-row';
    const count = document.createElement('span');
    count.className = 'fb-count';
    count.textContent = '0 / ' + MSG_MAX;
    const send = document.createElement('button');
    send.type = 'button';
    send.className = 'fb-send';
    send.textContent = 'Send';
    send.disabled = true;
    row.appendChild(count);
    row.appendChild(send);
    host.appendChild(row);

    const banner = document.createElement('div');
    banner.className = 'fb-banner';
    banner.setAttribute('role', 'status');
    host.appendChild(banner);

    function selectedCategory() {
      const hit = radios.find(r => r.input.checked);
      return hit ? hit.input.value : null;
    }

    function refresh() {
      const len = msg.value.length;
      count.textContent = len + ' / ' + MSG_MAX;
      count.classList.toggle('over', len > MSG_MAX);
      const cat = selectedCategory();
      radios.forEach(r => r.label.classList.toggle(
        'checked', r.input.checked));
      send.disabled = !cat || len === 0 || len > MSG_MAX;
    }

    function showBanner(kind, text) {
      banner.className = 'fb-banner ' + kind;
      banner.textContent = text;
    }
    function clearBanner() {
      banner.className = 'fb-banner';
      banner.textContent = '';
    }

    radios.forEach(r => r.input.addEventListener('change', refresh));
    msg.addEventListener('input', refresh);

    send.addEventListener('click', async () => {
      if (send.disabled) return;
      clearBanner();
      send.disabled = true;
      const payload = {
        category: selectedCategory(),
        message: msg.value.trim(),
        name: nameInput.value.trim(),
        page: page,
        projectName: (function () {
          try { return String(getProjectName() || ''); }
          catch (_) { return ''; }
        })(),
      };
      try {
        const r = await fetch('/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await r.json().catch(() => ({}));
        if (r.ok && data && data.ok) {
          msg.value = '';
          refresh();
          showBanner('ok', 'Thanks — sent!');
          setTimeout(() => {
            if (banner.classList.contains('ok')) clearBanner();
          }, 3000);
          return;
        }
        const err = (data && data.error) || 'send failed';
        showBanner('err', "Couldn't send (" + err + ') — try again.');
      } catch (_) {
        showBanner('err',
          "Couldn't send — check your connection and try again.");
      } finally {
        refresh();
      }
    });

    refresh();
  }

  window.Feedback = {
    mountInto(host, opts) {
      if (!host || host.dataset.fbMounted === '1') return;
      ensureStyle();
      build(host, opts || {});
      host.dataset.fbMounted = '1';
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureStyle, { once: true });
  } else {
    ensureStyle();
  }
})();
