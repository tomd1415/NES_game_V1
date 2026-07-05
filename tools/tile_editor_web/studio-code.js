/*
 * CODE mode (redesign Phase 1.5 + 3.6).
 *
 * Read-first: shows the real C the game compiles to. At Advanced level a
 * pupil can *eject* to hand-coded C — the game then builds from their
 * edited main.c (via play-pipeline's customMainC path) instead of the
 * visual blocks. An explicit ejected state + a Return path replaces the
 * old "silently-inert Builder" trap; RULES shows a banner while ejected.
 *
 * Full CodeMirror guided-region editing, the lessons/snippets libraries and
 * the symbol reference are further CODE-port polish that layer on top of
 * this whole-file editor.
 */
(function (global) {
  'use strict';
  var UI = global.StudioUI;
  var el = UI.el;
  var cached = null;   // raw platformer.c template text (for assembling on eject)

  function ensureTemplate(cb) {
    if (cached != null) { cb(); return; }
    fetch('builder-templates/platformer.c', { cache: 'no-store' })
      .then(function (r) { return r.text(); })
      .then(function (t) { cached = t; cb(); })
      .catch(function () { cached = ''; cb(); });
  }

  function ejectToCode(ctx) {
    var s = ctx.getState();
    var A = global.BuilderAssembler;
    if (!A || typeof A.assemble !== 'function' || !cached) {
      alert('The code is still loading — try again in a moment.');
      return;
    }
    if (!confirm('Turn this into a hand-coded game? You will edit the real C directly, and the visual blocks stop driving the build until you return.')) return;
    ctx.pushUndo();
    try { s.customMainC = A.assemble(s, cached); }
    catch (e) { alert('Could not generate the C to edit: ' + e.message); return; }
    s.ejected = true;
    ctx.markDirty(); ctx.renderDock(); ctx.refresh();
  }
  function returnToBlocks(ctx) {
    var s = ctx.getState();
    if (!confirm('Return to the visual editor? Your hand-edited C is kept as a backup, but the game builds from your blocks again.')) return;
    ctx.pushUndo();
    s.ejected = false;
    ctx.markDirty(); ctx.renderDock(); ctx.refresh();
  }

  function renderDock(dock, ctx) {
    var s = ctx.getState();
    var adv = ctx.levelAtLeast('advanced');

    // ---- Ejected (hand-coded) state -----------------------------------
    if (s.ejected) {
      dock.appendChild(el('div', { class: 'rule-card on expanded' }, [
        el('div', { class: 'head' }, [el('span', { class: 'card-title', text: '✎ Hand-coded game' })]),
        el('div', { class: 'body' }, [
          el('div', { class: 'dock-note', text: 'This game builds from your own C now. The visual blocks (World, Rules…) no longer change the build until you return.' }),
        ]),
      ]));
      var ta = el('textarea', { class: 'code-edit', id: 'code-edit', spellcheck: 'false',
        style: 'width:100%;height:52vh;background:#000;border:2px solid var(--line);padding:8px;font-size:11px;line-height:1.4;color:var(--nes-green,#43F611);font-family:var(--mono);white-space:pre;overflow:auto' });
      ta.value = s.customMainC || '';
      ta.readOnly = !adv;
      ta.addEventListener('input', function () { s.customMainC = ta.value; ctx.markDirty(); });
      dock.appendChild(ta);
      if (!adv) dock.appendChild(el('div', { class: 'dock-note', text: 'Switch to the Advanced level to edit this code.' }));
      dock.appendChild(el('div', { class: 'dock-section' }, [
        el('button', { class: 'btn', text: '↩ Return to visual editor', onclick: function () { returnToBlocks(ctx); } }),
      ]));
      return;
    }

    // ---- Read-first generated C ---------------------------------------
    dock.appendChild(el('div', { class: 'dock-note',
      text: 'This is the real C your game compiles to (cc65). It is read-only here — editing C by hand turns your project into a hand-coded game.' }));

    var pre = el('pre', { class: 'code-view', id: 'code-view',
      style: 'white-space:pre;overflow:auto;max-height:56vh;background:#000;border:2px solid var(--line);padding:8px;font-size:11px;color:var(--nes-green,#43F611)' });
    pre.textContent = cached || 'Loading main.c…';
    dock.appendChild(pre);
    ensureTemplate(function () { var v = document.getElementById('code-view'); if (v && cached) v.textContent = cached; });

    dock.appendChild(el('div', { class: 'dock-section' }, [
      adv
        ? el('button', { class: 'btn', text: '✂ Edit as hand-coded C', onclick: function () { ejectToCode(ctx); } })
        : el('div', { class: 'dock-note', text: 'Switch to the Advanced level to hand-edit the C.' }),
    ]));
  }

  global.StudioModes = global.StudioModes || {};
  global.StudioModes.code = {
    stageTools: [],
    renderDock: renderDock,
  };
})(typeof window !== 'undefined' ? window : globalThis);
