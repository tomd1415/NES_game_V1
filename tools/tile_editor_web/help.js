/* Shared help-popover tabs.
 *
 * Phase 1.2 of the post-pupil-fix pass.  Pupils asked for "the help
 * popover should come up with the page-specific help first, but the
 * rest of the help should be available via tabs like on the background
 * page, and the Feedback tab really needs to be there consistently".
 *
 * Each editor page already ships its own `<dialog id="help-dialog">`
 * with page-specific content.  Rather than port five blocks of HTML
 * into a shared module, this helper prepends a thin "page tabs" strip
 * to the existing dialog: the current page's label is active, the
 * four others are links that navigate to their page with `#help` in
 * the URL, and a 💬 Feedback button toggles an inline feedback panel
 * (wraps `feedback.js`'s `Feedback.mountInto`).
 *
 * Pages on the other side:
 *   1. Load `help.js` after `feedback.js`.
 *   2. In the `btn-help` click handler, call
 *      `HelpPopover.attachPageTabs(dlg, 'sprites')` before `showModal`.
 *   3. In the page's init, call
 *      `HelpPopover.maybeAutoOpen(() => showHelp())` so clicking a
 *      tab on another page lands here with the help dialog already
 *      open.
 *
 * Idempotent: attaching the strip twice is a no-op; feedback form is
 * only mounted on first expand.
 */
(function () {
  'use strict';

  // Canonical page list — ordered the same as the editor's nav bar so
  // pupils don't have to relearn the mapping inside the help dialog.
  const PAGES = [
    { id: 'backgrounds', href: 'index.html',     label: '🏞 Backgrounds' },
    { id: 'sprites',     href: 'sprites.html',   label: '🦸 Sprites' },
    { id: 'behaviour',   href: 'behaviour.html', label: '🚧 Behaviour' },
    { id: 'builder',     href: 'builder.html',   label: '🧱 Builder' },
    { id: 'code',        href: 'code.html',      label: '📝 Code' },
  ];

  let _stylesInjected = false;
  function ensureStyles() {
    if (_stylesInjected) return;
    _stylesInjected = true;
    const s = document.createElement('style');
    s.textContent = [
      '.help-page-tabs {',
      '  display: flex; flex-wrap: wrap; gap: 4px;',
      '  margin: -4px -4px 12px; padding: 4px 4px 8px;',
      '  border-bottom: 1px solid var(--border, #3a3560);',
      '  align-items: center;',
      '}',
      '.help-page-tab {',
      '  display: inline-block;',
      '  padding: 4px 10px;',
      '  border-radius: 4px;',
      '  font-size: 0.9em;',
      '  text-decoration: none;',
      '  color: var(--fg, #e0e0e0);',
      '  background: var(--panel2, #2a2640);',
      '  border: 1px solid var(--border, #3a3560);',
      '  cursor: pointer;',
      '  line-height: 1.3;',
      '  white-space: nowrap;',
      '}',
      '.help-page-tab:hover { border-color: var(--accent, #8b71e8); }',
      '.help-page-tab.active {',
      '  background: var(--accent, #8b71e8);',
      '  color: #000; font-weight: 600; cursor: default;',
      '}',
      '.help-page-tab.help-feedback-toggle { margin-left: auto; }',
      '.help-page-tab.help-feedback-toggle[aria-expanded="true"] {',
      '  background: var(--info, #6be0ff); color: #000;',
      '}',
      '.help-feedback-panel {',
      '  margin-bottom: 12px;',
      '  padding: 10px 12px;',
      '  background: var(--panel, #1f1b30);',
      '  border: 1px solid var(--border, #3a3560);',
      '  border-radius: 4px;',
      '}',
    ].join('\n');
    document.head.appendChild(s);
  }

  function attachPageTabs(dialog, currentPageId) {
    if (!dialog) return;
    // Idempotent — don't stack the strip on repeated shows.
    if (dialog.querySelector('.help-page-tabs')) return;
    ensureStyles();

    const strip = document.createElement('div');
    strip.className = 'help-page-tabs';
    strip.setAttribute('role', 'tablist');
    for (const p of PAGES) {
      if (p.id === currentPageId) {
        const here = document.createElement('span');
        here.className = 'help-page-tab active';
        here.textContent = p.label;
        here.setAttribute('aria-current', 'page');
        strip.appendChild(here);
      } else {
        const a = document.createElement('a');
        a.className = 'help-page-tab';
        a.href = p.href + '#help';
        a.textContent = p.label;
        a.title = 'Open ' + p.label + ' help';
        strip.appendChild(a);
      }
    }

    // Feedback toggle — wraps feedback.js's form in an inline panel.
    const feedbackBtn = document.createElement('button');
    feedbackBtn.type = 'button';
    feedbackBtn.className = 'help-page-tab help-feedback-toggle';
    feedbackBtn.textContent = '💬 Feedback';
    feedbackBtn.setAttribute('aria-expanded', 'false');
    feedbackBtn.title = 'Leave feedback for the teacher about this page';
    strip.appendChild(feedbackBtn);

    // Panel lives immediately after the strip and stays hidden until
    // toggled.  We mount the feedback form on the first expand only —
    // creating one per dialog-open would duplicate listeners.
    const panel = document.createElement('div');
    panel.className = 'help-feedback-panel';
    panel.hidden = true;
    const host = document.createElement('div');
    host.className = 'feedback-form-host';
    panel.appendChild(host);

    let mounted = false;
    feedbackBtn.addEventListener('click', () => {
      const expanded = feedbackBtn.getAttribute('aria-expanded') === 'true';
      feedbackBtn.setAttribute('aria-expanded', String(!expanded));
      panel.hidden = expanded;
      if (!expanded && !mounted && window.Feedback &&
          typeof window.Feedback.mountInto === 'function') {
        try {
          window.Feedback.mountInto(host, { source: currentPageId });
          mounted = true;
        } catch (e) {
          host.textContent = 'Feedback form failed to load: ' + e.message;
        }
      }
    });

    dialog.insertBefore(panel, dialog.firstChild);
    dialog.insertBefore(strip, dialog.firstChild);
  }

  /* Auto-open the help dialog when the URL has `#help` in it — used
   * when the pupil clicked a tab on another page's help popover.  The
   * caller passes a function that opens its own `<dialog id="help-
   * dialog">`; we just decide whether to fire it.  A short timeout
   * lets the host page finish its own init first. */
  function maybeAutoOpen(openFn) {
    if (typeof openFn !== 'function') return;
    if (window.location.hash !== '#help') return;
    setTimeout(openFn, 50);
  }

  window.HelpPopover = {
    PAGES: PAGES.slice(),
    attachPageTabs: attachPageTabs,
    maybeAutoOpen: maybeAutoOpen,
  };
})();
