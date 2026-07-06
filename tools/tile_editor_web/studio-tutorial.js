/*
 * Studio tutorial runtime.  Drives the manifest in tutorial-first-game.js
 * (window.STUDIO_TUTORIALS) inside the live Studio: renders the current step,
 * runs its declarative check against the real project state, advances on a
 * pass, and persists progress in `state.tutorial.step` (per project, survives
 * reload + export).  Loaded before studio.js; started by studio.js when it
 * loads a project whose `state.tutorial.active` is set.
 *
 * Checks are deliberately lenient — ANY light edit passes.  A `base` snapshot
 * taken when the tutorial first opens is what each check diffs against, so we
 * never demand the pupil match an exact target.
 */
(function (global) {
  'use strict';

  var ctx = null;
  var tut = null;
  var played = false;
  var playHooked = false;

  function studio() { return global.Studio || null; }
  function getState() {
    if (ctx && typeof ctx.getState === 'function') return ctx.getState();
    var s = studio(); return s && typeof s.getState === 'function' ? s.getState() : null;
  }
  function markDirty() { if (ctx && typeof ctx.markDirty === 'function') ctx.markDirty(); }

  // --- state readers the checks share ---------------------------------------
  function playerName(s) {
    var p = (s.sprites || []).find(function (x) { return x && x.role === 'player'; });
    return p ? (p.name || '') : '';
  }
  function solidId(s) {
    var t = (s.behaviour_types || []).find(function (x) { return x && x.name === 'solid_ground'; });
    return t ? (t.id | 0) : 1;
  }
  function solidCount(s) {
    var id = solidId(s), n = 0;
    (s.backgrounds || []).forEach(function (bg) {
      var b = bg && bg.behaviour;
      if (!Array.isArray(b)) return;
      b.forEach(function (row) { if (Array.isArray(row)) row.forEach(function (v) { if ((v | 0) === id) n++; }); });
    });
    return n;
  }
  // Any painted behaviour cell (solid / wall / platform / …) — style-agnostic,
  // so "paint some walls / track / platforms" all just mean "paint something".
  function behaviourCount(s) {
    var n = 0;
    (s.backgrounds || []).forEach(function (bg) {
      var b = bg && bg.behaviour;
      if (!Array.isArray(b)) return;
      b.forEach(function (row) { if (Array.isArray(row)) row.forEach(function (v) { if ((v | 0) !== 0) n++; }); });
    });
    return n;
  }
  function palKey(s) { return JSON.stringify([s.universal_bg, s.bg_palettes, s.sprite_palettes]); }
  function tileKey(s) { return JSON.stringify([s.bg_tiles, s.sprite_tiles]); }
  function builderKey(s) { return JSON.stringify((s.builder && s.builder.modules) || {}); }

  function snapshot(s) {
    return {
      playerName: playerName(s),
      palKey: palKey(s),
      tileKey: tileKey(s),
      groundCount: solidCount(s),
      behaviourCount: behaviourCount(s),
      builderKey: builderKey(s),
    };
  }

  // --- declarative check registry -------------------------------------------
  var CHECKS = {
    spriteRenamed: function (s, base) { return playerName(s) !== base.playerName; },
    paletteChanged: function (s, base) { return palKey(s) !== base.palKey; },
    tileChanged: function (s, base) { return tileKey(s) !== base.tileKey; },
    groundAdded: function (s, base, p) { return solidCount(s) >= base.groundCount + ((p && p.min) || 1); },
    behaviourAdded: function (s, base, p) { return behaviourCount(s) >= (base.behaviourCount || 0) + ((p && p.min) || 1); },
    builderChanged: function (s, base) { return builderKey(s) !== base.builderKey; },
    played: function () { return played; },
  };

  // --- progress -------------------------------------------------------------
  function prog() { var s = getState(); return (s && s.tutorial) || { step: 0 }; }
  function stepIndex() { return prog().step | 0; }
  function currentStep() { return tut && tut.steps[stepIndex()]; }
  function isComplete() { return tut && stepIndex() >= tut.steps.length; }

  // --- DOM helpers ----------------------------------------------------------
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function inner() { return document.getElementById('tutorial-inner'); }

  function showPanel(on) {
    var main = document.querySelector('.studio-main');
    if (main) main.classList.toggle('tutorial-on', !!on);
    var region = document.getElementById('tutorial-region');
    if (region) region.hidden = !on;
  }

  // Flash the REAL button/icon the pupil should use (the "Show me" pointer).
  var _flashTimer = null;
  function flashTarget(sel) {
    if (!sel) return;
    var target = document.querySelector(sel);
    if (!target) return;
    target.classList.add('tut-flash');
    try { target.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) {}
    if (_flashTimer) clearTimeout(_flashTimer);
    _flashTimer = setTimeout(function () { target.classList.remove('tut-flash'); }, 2800);
  }

  // Unlock the areas the tutorial visits: raise the Studio level to the
  // tutorial's minLevel (Tiles/Pals are Maker-level) so no step is locked.
  var LEVEL_ORDER = { beginner: 0, maker: 1, advanced: 2 };
  function ensureLevel() {
    var need = tut && tut.minLevel;
    if (!need) return;
    var s = studio();
    var cur = (s && typeof s.getLevel === 'function') ? s.getLevel() : 'beginner';
    if ((LEVEL_ORDER[cur] || 0) >= (LEVEL_ORDER[need] || 0)) return;
    var sel = document.getElementById('level-select');
    if (sel) { sel.value = need; sel.dispatchEvent(new Event('change', { bubbles: true })); }
  }

  // The quests / needs-attention column is not needed during a guided tutorial —
  // collapse it (it flashes if a real warning appears, handled in studio.js).
  function collapseQuests(on) {
    var main = document.querySelector('.studio-main');
    if (main) main.classList.toggle('quests-collapsed', !!on);
  }

  var feedbackEl = null;
  function setFeedback(msg, kind) {
    if (!feedbackEl) return;
    feedbackEl.textContent = msg || '';
    feedbackEl.className = 'tut-feedback' + (kind ? ' ' + kind : '');
  }

  // --- render ---------------------------------------------------------------
  function render() {
    var host = inner();
    if (!host || !tut) return;
    host.innerHTML = '';
    feedbackEl = null;

    var total = tut.steps.length;
    var done = Math.min(stepIndex(), total);

    var head = el('div', 'tut-head');
    head.appendChild(el('div', 'tut-kicker', '🎓 ' + tut.title));
    var bar = el('div', 'tut-progress');
    var fill = el('div', 'tut-progress-fill');
    fill.style.width = Math.round((done / total) * 100) + '%';
    bar.appendChild(fill);
    head.appendChild(bar);
    head.appendChild(el('div', 'tut-progress-text', isComplete() ? 'All steps done' : ('Step ' + (done + 1) + ' of ' + total)));
    host.appendChild(head);

    if (isComplete()) {
      renderComplete(host);
      return;
    }

    var step = currentStep();
    var card = el('div', 'tut-card');
    card.appendChild(el('div', 'tut-chapter', step.chapter));
    var titleRow = el('div', 'tut-titlerow');
    if (step.icon) { var ic = el('span', 'tut-icon', step.icon); ic.setAttribute('aria-hidden', 'true'); titleRow.appendChild(ic); }
    titleRow.appendChild(el('h3', 'tut-title', step.title));
    card.appendChild(titleRow);
    card.appendChild(el('p', 'tut-instruction', step.instruction));
    if (step.why) card.appendChild(el('p', 'tut-why', step.why));
    if (step.finishedEnough) card.appendChild(el('p', 'tut-enough', 'Finished enough: ' + step.finishedEnough));

    var actions = el('div', 'tut-actions');
    var check = el('button', 'tut-btn primary', '✓ Check my work');
    check.type = 'button'; check.dataset.act = 'check';
    check.addEventListener('click', doCheck);
    actions.appendChild(check);
    // Show me: jump to the mode AND flash the real button/icon the pupil needs.
    if (step.mode || step.flashSelector) {
      var show = el('button', 'tut-btn', '👀 Show me');
      show.type = 'button'; show.dataset.act = 'showme';
      show.addEventListener('click', function () {
        var s = studio();
        if (step.mode && s && typeof s.selectMode === 'function') s.selectMode(step.mode);
        var sel = step.flashSelector || (step.mode ? '.mode-btn[data-mode="' + step.mode + '"]' : null);
        flashTarget(sel);
        setFeedback(step.mode ? ('I opened ' + step.mode.toUpperCase() + ' and pointed at the button to press.')
                              : 'I pointed at the button to press.', 'info');
      });
      actions.appendChild(show);
    }
    var hint = el('button', 'tut-btn', '💡 Hint');
    hint.type = 'button'; hint.dataset.act = 'hint';
    hint.addEventListener('click', function () { setFeedback(step.hint || 'Try the Show me button.', 'info'); });
    actions.appendChild(hint);
    card.appendChild(actions);

    feedbackEl = el('div', 'tut-feedback');
    card.appendChild(feedbackEl);
    host.appendChild(card);
  }

  function renderComplete(host) {
    var card = el('div', 'tut-card tut-complete');
    card.appendChild(el('h3', 'tut-title', '🎉 You made your first game!'));
    card.appendChild(el('p', 'tut-instruction', 'You named your hero, changed how it looks, built the world, tweaked the rules, and played it. Keep building, or start again any time.'));
    var actions = el('div', 'tut-actions');
    var keep = el('button', 'tut-btn primary', 'Keep building');
    keep.type = 'button'; keep.dataset.act = 'keep';
    keep.addEventListener('click', function () {
      var s = getState();
      if (s && s.tutorial) { s.tutorial.active = false; markDirty(); }
      showPanel(false);
    });
    actions.appendChild(keep);
    card.appendChild(actions);
    host.appendChild(card);
  }

  var NOT_YET = [
    'Not yet — give it a try, then press Check my work again.',
    'Almost. Have a go at the step, then Check my work.',
  ];
  function doCheck() {
    var s = getState();
    if (!s || !s.tutorial || !s.tutorial.base) return;
    var step = currentStep();
    if (!step) return;
    var fn = CHECKS[step.check && step.check.type];
    var pass = fn ? !!fn(s, s.tutorial.base, step.check && step.check.params) : true;
    if (pass) advance();
    else setFeedback(step.hint ? ('Not yet. ' + step.hint) : NOT_YET[0], 'wait');
  }

  function advance() {
    var s = getState();
    if (!s || !s.tutorial) return;
    s.tutorial.step = Math.min((s.tutorial.step | 0) + 1, tut.steps.length);
    markDirty();
    render();
    // Silent visual celebration (no sound) — a brief highlight of the panel.
    var region = document.getElementById('tutorial-region');
    if (region) { region.classList.add('tut-celebrate'); setTimeout(function () { region.classList.remove('tut-celebrate'); }, 700); }
  }

  function hookPlay() {
    if (playHooked) return;
    var b = document.getElementById('btn-play');
    if (!b) return;
    b.addEventListener('click', function () {
      played = true;
      var step = currentStep();
      if (step && step.check && step.check.type === 'played') setTimeout(advance, 60);
    });
    playHooked = true;
  }

  // --- public API -----------------------------------------------------------
  function start(c) {
    if (c) ctx = c;
    var s = getState();
    if (!s) return;
    if (!s.tutorial) s.tutorial = { active: true, step: 0 };
    if (!s.tutorial.active) s.tutorial.active = true;
    var id = s.tutorial.id || 'first-game';
    tut = (global.STUDIO_TUTORIALS || {})[id] || (global.STUDIO_TUTORIALS || {})['first-game'];
    if (!tut) return;
    if (!s.tutorial.base) { s.tutorial.base = snapshot(s); markDirty(); }
    ensureLevel();       // unlock Tiles/Pals etc. before any step points at them
    hookPlay();
    showPanel(true);
    collapseQuests(true);
    render();
  }

  function isActive() {
    var s = getState();
    return !!(s && s.tutorial && s.tutorial.active);
  }

  global.StudioTutorial = {
    start: start,
    isActive: isActive,
    render: render,
    stepIndex: stepIndex,     // for tests / progress display
    stepCount: function () { return tut ? tut.steps.length : 0; },
    isComplete: isComplete,
    _checks: CHECKS,          // exposed for tests
    _snapshot: snapshot,      // exposed for tests
  };
})(typeof window !== 'undefined' ? window : this);
