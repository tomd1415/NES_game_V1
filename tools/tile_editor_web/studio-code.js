/*
 * CODE mode (redesign Phase 1.5, read-first).
 *
 * Shows the real C the game is built from — read-first, per the "graduated
 * depth: code is one click away" principle. Full guided-region editing,
 * lessons, snippets and the C/asm toggle are an Advanced-level port that
 * lands later; this establishes the mode and the read-only view over the
 * actual template used by play-pipeline.js.
 */
(function (global) {
  'use strict';
  var UI = global.StudioUI;
  var el = UI.el;
  var cached = null;

  function renderDock(dock, ctx) {
    dock.appendChild(el('div', { class: 'dock-note',
      text: 'This is the real C your game compiles to (cc65). It is read-only here — ' +
        'editing C by hand is an Advanced feature that turns your project into a hand-coded game.' }));

    var pre = el('pre', { class: 'code-view', id: 'code-view',
      style: 'white-space:pre;overflow:auto;max-height:60vh;background:#000;border:2px solid var(--line);padding:8px;font-size:11px;color:var(--nes-green,#43F611)' });
    pre.textContent = cached || 'Loading main.c…';
    dock.appendChild(pre);

    if (cached == null) {
      fetch('builder-templates/platformer.c', { cache: 'no-store' })
        .then(function (r) { return r.text(); })
        .then(function (t) { cached = t; var v = document.getElementById('code-view'); if (v) v.textContent = t; })
        .catch(function () { var v = document.getElementById('code-view'); if (v) v.textContent = '// Could not load the template from the server.'; });
    }

    var adv = ctx.levelAtLeast('advanced');
    dock.appendChild(el('div', { class: 'dock-section' }, [
      el('div', { class: 'dock-note', text: adv
        ? 'Advanced: hand-editing C/asm and the guided-region editor land in a later step — for now this is the reference view.'
        : 'Switch to the Advanced level to unlock hand-editing (coming soon).' }),
    ]));
  }

  global.StudioModes = global.StudioModes || {};
  global.StudioModes.code = {
    stageTools: [],
    renderDock: renderDock,
  };
})(typeof window !== 'undefined' ? window : globalThis);
