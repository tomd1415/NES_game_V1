/* Phase 4.1 accessibility module — shared across every editor page.
 *
 * Auto-injects two controls into the page header on load:
 *
 *   - Text size: 100% / 125% / 150% / 175%.  Scales body font-size
 *     (so headings + buttons + labels in em/rem units scale with it)
 *     and exposes `--ui-scale` as a CSS custom property for any
 *     future bespoke uses.  Persisted as `prefs.uiScale`.
 *
 *   - Theme: Standard / High contrast.  Toggles
 *     `<html data-ui-theme="high-contrast">`, which an injected
 *     <style> block matches to override the page's :root CSS
 *     variables with WCAG-AA pairings.  Persisted as `prefs.uiTheme`.
 *
 * Reads / writes via the existing `Storage.readPrefs / writePrefs`
 * API from storage.js, so prefs propagate across all five editor
 * pages on the next load.  Browser zoom (Ctrl-+/-) is the right
 * tool for canvas scaling — every canvas in the editor already has
 * `image-rendering: pixelated`, so engineering a separate canvas
 * scale would only duplicate functionality the browser provides.
 */
(function () {
  'use strict';

  const SCALES = [
    { value: '1',     label: '100%' },
    { value: '1.25',  label: '125%' },
    { value: '1.5',   label: '150%' },
    { value: '1.75',  label: '175%' },
  ];

  const THEMES = [
    { value: 'default',       label: 'Standard' },
    { value: 'high-contrast', label: 'High contrast' },
  ];

  const BASE_FONT_PX = 13;  // matches every editor page's body rule.

  /* Storage helpers — fall back to no-op if storage.js failed to
   * load (e.g. opening a file directly without the playground
   * server) so the controls still function for the current page. */
  function readPrefs() {
    try {
      if (typeof Storage !== 'undefined' && typeof Storage.readPrefs === 'function') {
        return Storage.readPrefs() || {};
      }
    } catch (_) {}
    return {};
  }

  function writePrefs(p) {
    try {
      if (typeof Storage !== 'undefined' && typeof Storage.writePrefs === 'function') {
        Storage.writePrefs(p);
      }
    } catch (_) {}
  }

  function applyScale(scale) {
    const n = parseFloat(scale) || 1;
    document.documentElement.style.setProperty('--ui-scale', String(n));
    if (document.body) {
      document.body.style.fontSize = (BASE_FONT_PX * n) + 'px';
    }
  }

  function applyTheme(theme) {
    const t = (theme === 'high-contrast') ? 'high-contrast' : 'default';
    document.documentElement.setAttribute('data-ui-theme', t);
  }

  /* Inject the high-contrast variable overrides + control styles
   * once per page.  Appended last so its :root selector wins on
   * cascade order against the page's own :root block. */
  function injectStyles() {
    if (document.getElementById('a11y-injected-css')) return;
    const css = [
      ':root[data-ui-theme="high-contrast"] {',
      '  --bg:        #000000;',
      '  --panel:     #0a0a0a;',
      '  --panel2:    #1a1a1a;',
      '  --border:    #ffffff;',
      '  --fg:        #ffffff;',
      '  --muted:     #d8d8d8;',
      '  --accent:    #ffff00;',
      '  --good:      #00ff66;',
      '  --warn:      #ff5050;',
      '  --info:      #66ffff;',
      '  --shadow:    0 4px 16px rgba(0,0,0,0.85);',
      '}',
      /* Higher-contrast borders on inputs / buttons / cards in HC mode
       * — the existing page CSS often hides the border behind a panel
       * fill, which fails AA in high contrast. */
      ':root[data-ui-theme="high-contrast"] button,',
      ':root[data-ui-theme="high-contrast"] select,',
      ':root[data-ui-theme="high-contrast"] input[type=text],',
      ':root[data-ui-theme="high-contrast"] textarea {',
      '  border: 1px solid var(--fg) !important;',
      '}',
      /* Header control group styling.  Plain enough to match every
       * page's header without per-page CSS. */
      '.a11y-controls {',
      '  display: inline-flex;',
      '  gap: 0.6em;',
      '  align-items: center;',
      '  margin-left: auto;',
      '  font-size: 0.85em;',
      '  color: var(--muted);',
      '}',
      '.a11y-controls label {',
      '  display: inline-flex;',
      '  gap: 0.3em;',
      '  align-items: center;',
      '}',
      '.a11y-controls select {',
      '  font: inherit;',
      '  padding: 2px 4px;',
      '}',
    ].join('\n');
    const style = document.createElement('style');
    style.id = 'a11y-injected-css';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function buildSelect(id, options, current) {
    const sel = document.createElement('select');
    sel.id = id;
    for (const opt of options) {
      const o = document.createElement('option');
      o.value = opt.value;
      o.textContent = opt.label;
      if (opt.value === current) o.selected = true;
      sel.appendChild(o);
    }
    return sel;
  }

  function injectControl(prefs) {
    if (document.querySelector('.a11y-controls')) return;
    const header = document.querySelector('.app-header');
    if (!header) return;

    const wrap = document.createElement('div');
    wrap.className = 'a11y-controls';
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', 'Accessibility');

    const scaleLabel = document.createElement('label');
    scaleLabel.appendChild(document.createTextNode('Text size '));
    const scaleSel = buildSelect('a11y-scale', SCALES, String(prefs.uiScale || '1'));
    scaleSel.setAttribute('aria-label', 'Text size');
    scaleLabel.appendChild(scaleSel);

    const themeLabel = document.createElement('label');
    themeLabel.appendChild(document.createTextNode('Theme '));
    const themeSel = buildSelect('a11y-theme', THEMES, prefs.uiTheme || 'default');
    themeSel.setAttribute('aria-label', 'Theme');
    themeLabel.appendChild(themeSel);

    wrap.appendChild(scaleLabel);
    wrap.appendChild(themeLabel);
    header.appendChild(wrap);

    scaleSel.addEventListener('change', e => {
      const v = e.target.value;
      applyScale(v);
      const p = readPrefs();
      p.uiScale = v;
      writePrefs(p);
    });

    themeSel.addEventListener('change', e => {
      const v = e.target.value;
      applyTheme(v);
      const p = readPrefs();
      p.uiTheme = v;
      writePrefs(p);
    });
  }

  function init() {
    injectStyles();
    const prefs = readPrefs();
    applyScale(prefs.uiScale || '1');
    applyTheme(prefs.uiTheme || 'default');
    injectControl(prefs);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* Expose a tiny debug surface for the regression suite + tour. */
  window.A11y = {
    apply(prefs) {
      if (prefs && typeof prefs === 'object') {
        if ('uiScale' in prefs) applyScale(prefs.uiScale);
        if ('uiTheme' in prefs) applyTheme(prefs.uiTheme);
      }
    },
    current() {
      return {
        uiScale: document.documentElement.style.getPropertyValue('--ui-scale') || '1',
        uiTheme: document.documentElement.getAttribute('data-ui-theme') || 'default',
      };
    },
    SCALES, THEMES,
  };
})();
