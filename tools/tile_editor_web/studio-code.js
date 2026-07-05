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
  var activeCm = null; // the live CodeMirror instance (ejected editor), if any

  // A small curated snippet/symbol library the Code page also offered — the
  // handful of helpers a pupil most often wants when hand-coding.
  var SNIPPETS = [
    { label: 'Pad read', code: 'unsigned char pad = pad_poll(0);\n' },
    { label: 'If A pressed', code: 'if (pad & PAD_A) {\n  // jump / action\n}\n' },
    { label: 'Move sprite', code: 'player_x += 1; // move right\n' },
    { label: 'Set a tile', code: 'set_tile(col, row, tile_id);\n' },
    { label: 'Wait a frame', code: 'ppu_wait_nmi();\n' },
    { label: 'Comment block', code: '/* -------------------------------------------------\n * \n * ------------------------------------------------- */\n' },
  ];

  function insertSnippet(ctx, code) {
    var s = ctx.getState();
    if (activeCm) {
      activeCm.replaceSelection(code);
      activeCm.focus();
      s.customMainC = activeCm.getValue();
      ctx.markDirty();
      return;
    }
    var ta = document.getElementById('code-edit');
    if (ta) {
      var start = ta.selectionStart || ta.value.length;
      ta.value = ta.value.slice(0, start) + code + ta.value.slice(ta.selectionEnd || start);
      s.customMainC = ta.value;
      ctx.markDirty();
    }
  }

  function snippetBar(ctx) {
    var sec = UI.section('Insert snippet', el('span', { class: 'chip', text: 'C helpers' }));
    var sel = el('select', { id: 'code-snippet-select' });
    sel.appendChild(el('option', { value: '', text: '— pick a snippet —' }));
    SNIPPETS.forEach(function (sn, i) { sel.appendChild(el('option', { value: String(i), text: sn.label })); });
    sel.addEventListener('change', function () {
      var i = parseInt(sel.value, 10);
      if (!isNaN(i) && SNIPPETS[i]) insertSnippet(ctx, SNIPPETS[i].code);
      sel.value = '';
    });
    sec.appendChild(el('div', { class: 'field' }, [sel]));
    sec.appendChild(el('div', { class: 'dock-note', text: 'Drops a ready-made C helper at your cursor.' }));
    return sec;
  }

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
    activeCm = null; // any prior CodeMirror instance is being torn down

    // ---- Ejected (hand-coded) state -----------------------------------
    if (s.ejected) {
      dock.appendChild(el('div', { class: 'rule-card on expanded' }, [
        el('div', { class: 'head' }, [el('span', { class: 'card-title', text: '✎ Hand-coded game' })]),
        el('div', { class: 'body' }, [
          el('div', { class: 'dock-note', text: 'This game builds from your own C now. The visual blocks (World, Rules…) no longer change the build until you return.' }),
        ]),
      ]));
      // Snippets palette (Advanced): insert common C helpers at the cursor.
      if (adv) dock.appendChild(snippetBar(ctx));

      // Prefer a CodeMirror editor (C syntax highlighting); fall back to a
      // plain textarea when the library isn't present (or non-Advanced).
      if (adv && global.CodeMirror) {
        var host = el('div', { id: 'code-cm' });
        dock.appendChild(host);
        var cm = global.CodeMirror(host, {
          value: s.customMainC || '',
          mode: 'text/x-csrc',
          theme: 'dracula',
          lineNumbers: true,
          styleActiveLine: true,
          tabSize: 2,
          indentUnit: 2,
        });
        cm.on('change', function () { s.customMainC = cm.getValue(); ctx.markDirty(); });
        activeCm = cm;
      } else {
        activeCm = null;
        var ta = el('textarea', { class: 'code-edit', id: 'code-edit', spellcheck: 'false',
          style: 'width:100%;height:52vh;background:#000;border:2px solid var(--line);padding:8px;font-size:11px;line-height:1.4;color:var(--nes-green,#43F611);font-family:var(--mono);white-space:pre;overflow:auto' });
        ta.value = s.customMainC || '';
        ta.readOnly = !adv;
        ta.addEventListener('input', function () { s.customMainC = ta.value; ctx.markDirty(); });
        dock.appendChild(ta);
        if (!adv) dock.appendChild(el('div', { class: 'dock-note', text: 'Switch to the Advanced level to edit this code.' }));
      }
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
    onExit: function () { activeCm = null; },
  };
})(typeof window !== 'undefined' ? window : globalThis);
