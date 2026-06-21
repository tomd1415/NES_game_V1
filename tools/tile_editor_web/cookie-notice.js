/* EU cookie / local-storage notice.
 *
 * The editor uses only strictly-functional client storage: localStorage to
 * keep the pupil's projects in their own browser, and — ONLY if they choose to
 * sign in — one HttpOnly session cookie.  No tracking, no analytics, no third
 * parties.  A short, dismissible banner explains this; the dismissal is
 * remembered in localStorage so it shows once per browser.
 *
 * Auto-mounts on every page.  Self-contained (own styles), no dependencies.
 */
(function (global) {
  'use strict';
  var ACK_KEY = 'nes_editor.cookie_notice_ack';

  function acked() {
    try { return global.localStorage && localStorage.getItem(ACK_KEY) === '1'; }
    catch (_) { return false; }
  }
  function remember() {
    try { localStorage.setItem(ACK_KEY, '1'); } catch (_) {}
  }

  function injectStyles() {
    if (document.getElementById('cookie-notice-css')) return;
    var css = [
      '#cookie-notice {',
      '  position: fixed; left: 12px; right: 12px; bottom: 12px; z-index: 9999;',
      '  max-width: 760px; margin: 0 auto;',
      '  background: var(--panel, #1f1b30); color: var(--fg, #f4f4f4);',
      '  border: 1px solid var(--border, #3a3352); border-radius: 8px;',
      '  box-shadow: 0 8px 28px rgba(0,0,0,0.55);',
      '  padding: 12px 14px; font-size: 0.9em; line-height: 1.45;',
      '  display: flex; gap: 12px; align-items: center; flex-wrap: wrap;',
      '}',
      '#cookie-notice .cn-text { flex: 1 1 320px; }',
      '#cookie-notice .cn-text b { color: var(--accent, #ffd866); }',
      '#cookie-notice button {',
      '  background: #3a2f50; color: var(--accent, #ffd866);',
      '  border: 1px solid var(--accent, #ffd866); border-radius: 4px;',
      '  padding: 7px 14px; cursor: pointer; font: inherit; white-space: nowrap;',
      '}',
      '#cookie-notice button:hover { background: #4a3d66; }',
    ].join('\n');
    var style = document.createElement('style');
    style.id = 'cookie-notice-css';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function mount() {
    if (acked()) return;
    if (document.getElementById('cookie-notice')) return;
    injectStyles();
    var bar = document.createElement('div');
    bar.id = 'cookie-notice';
    bar.setAttribute('role', 'note');
    bar.setAttribute('aria-label', 'Storage notice');

    var text = document.createElement('div');
    text.className = 'cn-text';
    text.innerHTML =
      '<b>🍪 A note on storage.</b> This site saves your projects in your own ' +
      'browser (local storage) so your work is here when you come back. If you ' +
      'choose to sign in, it also sets one login cookie. There is no tracking, ' +
      'no advertising and nothing is shared with anyone else.';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Got it';
    btn.addEventListener('click', function () { remember(); bar.remove(); });

    bar.appendChild(text);
    bar.appendChild(btn);
    document.body.appendChild(bar);
  }

  function init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mount);
    } else { mount(); }
  }

  global.CookieNotice = { mount: mount };
  init();
})(typeof window !== 'undefined' ? window : globalThis);
