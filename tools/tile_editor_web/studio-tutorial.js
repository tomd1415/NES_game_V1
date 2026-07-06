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
  function mods(s) { return (s.builder && s.builder.modules) || {}; }
  function modEnabled(s, id) {
    var parts = String(id).split('.'), node = mods(s)[parts[0]];
    for (var i = 1; i < parts.length && node; i++) node = node.submodules ? node.submodules[parts[i]] : null;
    return !!(node && node.enabled);
  }
  function sceneCount(s) { try { return (mods(s).scene.config.instances || []).length; } catch (e) { return 0; } }
  function bgCount(s) { return (s.backgrounds || []).length; }
  function dialogueText(s) { try { return (mods(s).dialogue.config.text || ''); } catch (e) { return ''; } }
  function behIdByName(s, name) { var t = (s.behaviour_types || []).find(function (x) { return x && x.name === name; }); return t ? (t.id | 0) : -1; }
  function behTypeCount(s, name) {
    var id = behIdByName(s, name); if (id < 0) return 0; var n = 0;
    (s.backgrounds || []).forEach(function (bg) { var b = bg && bg.behaviour; if (!Array.isArray(b)) return; b.forEach(function (row) { if (Array.isArray(row)) row.forEach(function (v) { if ((v | 0) === id) n++; }); }); });
    return n;
  }
  var TRACK_MODS = ['doors', 'smbhud', 'dialogue', 'damage', 'blocks', 'powerups', 'flagpole', 'pickups', 'win_condition', 'players.player2', 'behaviour_walls'];
  var TRACK_BEH = ['solid_ground', 'wall', 'platform', 'door', 'trigger', 'ladder', 'spike', 'finish'];
  function snapshotMods(s) { var o = {}; TRACK_MODS.forEach(function (id) { o[id] = modEnabled(s, id); }); return o; }
  function snapshotBeh(s) { var o = {}; TRACK_BEH.forEach(function (n) { o[n] = behTypeCount(s, n); }); return o; }

  function snapshot(s) {
    return {
      playerName: playerName(s),
      palKey: palKey(s), tileKey: tileKey(s),
      groundCount: solidCount(s), behaviourCount: behaviourCount(s),
      builderKey: builderKey(s),
      sceneCount: sceneCount(s), bgCount: bgCount(s), dialogueText: dialogueText(s),
      mods: snapshotMods(s), beh: snapshotBeh(s),
    };
  }

  // --- declarative check registry -------------------------------------------
  // Every check is diffed against the PER-STEP baseline (re-taken each time a
  // step becomes current), so sequential "paint/add more" steps each need a
  // fresh action.  All are lenient — any qualifying edit passes.
  var CHECKS = {
    spriteRenamed: function (s, base) { return playerName(s) !== base.playerName; },
    paletteChanged: function (s, base) { return palKey(s) !== base.palKey; },
    tileChanged: function (s, base) { return tileKey(s) !== base.tileKey; },
    groundAdded: function (s, base, p) { return solidCount(s) >= base.groundCount + ((p && p.min) || 1); },
    behaviourAdded: function (s, base, p) { return behaviourCount(s) >= (base.behaviourCount || 0) + ((p && p.min) || 1); },
    behaviourTypePainted: function (s, base, p) { var name = (p && p.name) || 'wall'; return behTypeCount(s, name) >= ((base.beh && base.beh[name]) || 0) + ((p && p.min) || 1); },
    sceneInstanceAdded: function (s, base, p) { return sceneCount(s) >= (base.sceneCount || 0) + ((p && p.min) || 1); },
    backgroundAdded: function (s, base) { return bgCount(s) > (base.bgCount || 0); },
    dialogueChanged: function (s, base) { return dialogueText(s) !== (base.dialogueText || ''); },
    moduleEnabledChanged: function (s, base, p) { var id = p && p.id; if (!id) return false; return modEnabled(s, id) !== !!(base.mods && base.mods[id]); },
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

  // --- teacher settings (class defaults) + pair mode ------------------------
  function teacherConfig() {
    try {
      var p = (global.Storage && global.Storage.readPrefs && global.Storage.readPrefs()) || {};
      return p.teacherConfig || {};
    } catch (e) { return {}; }
  }
  function hintsAllowed() { return teacherConfig().hints !== false; }
  // Pair mode is NEVER forced: a pupil can always turn it off; with the class
  // default set to "choose" it starts off until the pupil turns it on.
  function pairMode() {
    var cfg = teacherConfig();
    var s = getState();
    var pupil = s && s.tutorial ? s.tutorial.pair : undefined;   // pupil override
    if (cfg.pairing === 'pair') return pupil !== false;
    if (cfg.pairing === 'choose') return pupil === true;
    return false;   // solo (default)
  }
  function pairOffered() { var p = teacherConfig().pairing; return p === 'pair' || p === 'choose'; }
  function setPair(on) {
    var s = getState();
    if (s && s.tutorial) { s.tutorial.pair = !!on; markDirty(); }
    render();
  }
  function beep() {
    try {
      var AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return;
      var ctx2 = new AC(), o = ctx2.createOscillator(), g = ctx2.createGain();
      o.type = 'square'; o.frequency.value = 660; g.gain.value = 0.05;
      o.connect(g); g.connect(ctx2.destination); o.start();
      setTimeout(function () { o.stop(); ctx2.close(); }, 140);
    } catch (e) {}
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

    // Optional pair-programming banner (never forced; always toggleable).
    if (pairOffered()) {
      var pm = pairMode();
      var pair = el('div', 'tut-pair' + (pm ? ' on' : ''));
      pair.appendChild(el('div', 'tut-pair-head', pm ? '👥 Pair mode on' : '👥 Pair mode off'));
      if (pm) pair.appendChild(el('div', 'tut-pair-roles', 'Driver: mouse & keyboard · Navigator: read the step + press Check. Swap after each step.'));
      var toggle = el('button', 'tut-btn', pm ? 'Work solo' : '👥 Work in a pair');
      toggle.type = 'button'; toggle.dataset.act = 'pair';
      toggle.addEventListener('click', function () { setPair(!pm); });
      pair.appendChild(toggle);
      host.appendChild(pair);
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
    if (hintsAllowed() && (step.mode || step.flashSelector)) {
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
    if (hintsAllowed()) {
      var hint = el('button', 'tut-btn', '💡 Hint');
      hint.type = 'button'; hint.dataset.act = 'hint';
      hint.addEventListener('click', function () { setFeedback(step.hint || 'Try the Show me button.', 'info'); });
      actions.appendChild(hint);
    }
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
    // Re-baseline for the NEW step, so its "add/paint more" delta starts from
    // here (not from the whole tutorial's start).
    s.tutorial.base = snapshot(s);
    markDirty();
    render();
    // Celebration honours the teacher setting: visual (default) / sound / off.
    var celebrate = teacherConfig().celebration || 'visual';
    if (celebrate !== 'off') {
      var region = document.getElementById('tutorial-region');
      if (region) { region.classList.add('tut-celebrate'); setTimeout(function () { region.classList.remove('tut-celebrate'); }, 700); }
      if (celebrate === 'sound') beep();
    }
    // Pair hand-off cue.
    if (pairMode() && !isComplete()) setFeedback('🔄 Swap! Navigator becomes Driver for the next step.', 'info');
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

  // A teacher can reorder / add / remove steps (studio.js step editor); the
  // result is stored in prefs.tutorialOverrides[id].steps.  Validate defensively
  // so a bad override never breaks the tutorial — fall back to the base steps.
  function applyOverride(id, base) {
    try {
      var p = (global.Storage && global.Storage.readPrefs && global.Storage.readPrefs()) || {};
      var ov = (p.tutorialOverrides || {})[id];
      if (!ov || !Array.isArray(ov.steps)) return base;
      var steps = ov.steps.filter(function (st) { return st && st.check && st.check.type && st.title; });
      if (!steps.length) return base;
      return { id: base.id, title: base.title, minLevel: base.minLevel, intro: base.intro, steps: steps };
    } catch (e) { return base; }
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
    tut = applyOverride(id, tut);   // teacher's edited steps, if any
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
    currentCheck: function () { var st = currentStep(); return st ? st.check : null; },
    isComplete: isComplete,
    _checks: CHECKS,          // exposed for tests
    _snapshot: snapshot,      // exposed for tests
  };
})(typeof window !== 'undefined' ? window : this);
