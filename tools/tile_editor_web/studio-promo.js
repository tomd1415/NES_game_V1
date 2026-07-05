/*
 * studio-promo.js — a small dismissible banner on the *old* pages inviting
 * pupils/teachers to try the new unified Studio (studio.html).
 *
 * Self-contained: no dependencies, inline styles (so it can't clash with a
 * page's CSS), NES-palette colours to match the tool. Dismissal is
 * remembered in localStorage so it never nags. Deliberately does NOT change
 * the default page — the seven pages stay the default until switch-over.
 */
(function () {
  'use strict';
  var KEY = 'studioPromoDismissed';
  // Don't show on the Studio itself, and respect a previous dismissal.
  if (/studio\.html$/i.test(location.pathname)) return;
  try { if (localStorage.getItem(KEY) === '1') return; } catch (e) { /* ignore */ }

  function build() {
    if (document.getElementById('studio-promo')) return;
    var bar = document.createElement('div');
    bar.id = 'studio-promo';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'New Studio available');
    bar.style.cssText = [
      'position:fixed', 'left:0', 'right:0', 'bottom:0', 'z-index:99999',
      'display:flex', 'align-items:center', 'gap:12px', 'flex-wrap:wrap',
      'padding:10px 14px', 'box-sizing:border-box',
      'background:#001018', 'border-top:3px solid #FA9E00',
      'color:#FFFFFF', 'font-family:ui-monospace,Menlo,Consolas,monospace',
      'font-size:13px', 'line-height:1.4',
      'box-shadow:0 -4px 18px rgba(0,0,0,.5)',
    ].join(';');

    var msg = document.createElement('div');
    msg.style.cssText = 'flex:1 1 260px;min-width:220px';
    msg.innerHTML =
      '<strong style="color:#FA9E00">✨ New: the NES Studio</strong> — ' +
      'the seven pages rebuilt into one game-first editor. ' +
      '<span style="color:#FF7757">Early testing build — expect rough edges, and your work here is safe.</span> ' +
      'Feedback is <em>really</em> welcome!';

    var open = document.createElement('a');
    open.id = 'studio-promo-open';
    open.href = 'studio.html';
    open.textContent = 'Open the Studio →';
    open.style.cssText = [
      'flex:0 0 auto', 'text-decoration:none', 'cursor:pointer',
      'background:#FA9E00', 'color:#000000', 'font-weight:700',
      'padding:7px 12px', 'border:2px solid #FA9E00', 'border-radius:2px',
    ].join(';');

    var dismiss = document.createElement('button');
    dismiss.id = 'studio-promo-dismiss';
    dismiss.type = 'button';
    dismiss.textContent = 'Not now';
    dismiss.style.cssText = [
      'flex:0 0 auto', 'cursor:pointer',
      'background:transparent', 'color:#ABABAB',
      'padding:7px 10px', 'border:2px solid #4E4E4E', 'border-radius:2px',
      'font:inherit',
    ].join(';');
    dismiss.addEventListener('click', function () {
      try { localStorage.setItem(KEY, '1'); } catch (e) { /* ignore */ }
      if (bar.parentNode) bar.parentNode.removeChild(bar);
    });

    bar.appendChild(msg);
    bar.appendChild(open);
    bar.appendChild(dismiss);
    document.body.appendChild(bar);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();
