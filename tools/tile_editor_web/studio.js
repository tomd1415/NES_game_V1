/*
 * NES Studio — Phase 0 shell logic.
 *
 * Ties the shared modules (storage.js, default-state.js, sprite-render.js,
 * builder-*, play-pipeline.js, emulator.js) into the four-region unified
 * workspace: mode rail · contextual dock · the TV · quest log, plus the
 * persistent chrome (project name, Play, save/snapshot, Time Machine,
 * expertise-level switch, a11y / account / feedback / storage notice).
 *
 * Phase 0 deliberately ships EMPTY docks for most modes — the shell,
 * shared state, the TV's LIVE/PLAY split, and the progress-safety uplift
 * are the deliverable. Phase 1 fills the docks in.
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var SCREEN_W = 32, SCREEN_H = 30;

  // ---- Modes -------------------------------------------------------------
  // minLevel: 0 Beginner · 1 Maker · 2 Advanced (progressive disclosure).
  var LEVELS = { beginner: 0, maker: 1, advanced: 2 };
  var MODES = [
    { id: 'world', name: 'World', ico: '🗺', minLevel: 0,
      sub: 'Stamp blocks & entities onto the live screen; set tile type; assemble the level.' },
    { id: 'chars', name: 'Chars', ico: '🦸', minLevel: 0,
      sub: 'Every character (metasprite) + its role. Draw by assembling shared tiles.' },
    { id: 'tiles', name: 'Tiles', ico: '🧩', minLevel: 1,
      sub: 'The 8×8 tiles in the two pattern tables. Everything references what is made here.' },
    { id: 'pals', name: 'Pals', ico: '🎨', minLevel: 1,
      sub: 'Backdrop + 4 background + 4 sprite palettes of 3, from the 64-colour NES set.' },
    { id: 'rules', name: 'Rules', ico: '⚙', minLevel: 0,
      sub: 'How the game behaves — movement, damage, win condition, reactions.' },
    { id: 'sound', name: 'Sound', ico: '🎵', minLevel: 1,
      sub: 'Music & sound effects.' },
    { id: 'code', name: 'Code', ico: '💻', minLevel: 2,
      sub: 'The real C (and, at Advanced, 6502 asm) the game compiles to.' },
  ];

  // ---- Persistent app state ---------------------------------------------
  var Storage = null;
  var state = null;
  var currentMode = 'world';
  var currentLevel = 'beginner';
  var playedThisSession = false;
  var saveTimer = null;
  var activeTool = null;
  var undoStack = [];
  var redoStack = [];
  var UNDO_LIMIT = 40;

  // ---- Undo / redo (in-memory, distinct from snapshots) -----------------
  function cloneState(s) { return JSON.parse(JSON.stringify(s)); }
  function pushUndo() {
    undoStack.push(cloneState(state));
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    redoStack.length = 0;
  }
  function undo() {
    if (!undoStack.length) return;
    redoStack.push(cloneState(state));
    state = undoStack.pop();
    afterExternalStateChange();
  }
  function redo() {
    if (!redoStack.length) return;
    undoStack.push(cloneState(state));
    state = redoStack.pop();
    afterExternalStateChange();
  }
  function afterExternalStateChange() {
    if (state.selectedBgIdx == null) state.selectedBgIdx = 0;
    state.selectedBgIdx = Math.min(state.selectedBgIdx, state.backgrounds.length - 1);
    Storage.saveCurrent(state);
    $('project-name').value = state.name || '';
    renderLive();
    renderDock();
    refreshQuestsAndAttention();
    setSaveState('saved');
  }

  // ---- Shared context handed to every mode module -----------------------
  var ctx = {
    getState: function () { return state; },
    setState: function (s) { state = s; },
    markDirty: function () { markDirty(); },
    pushUndo: pushUndo,
    renderLive: function () { renderLive(); },
    renderDock: function () { renderDock(); },
    refresh: function () { refreshQuestsAndAttention(); },
    getLevel: function () { return currentLevel; },
    levelAtLeast: function (name) { return (LEVELS[currentLevel] || 0) >= (LEVELS[name] || 0); },
    getActiveTool: function () { return activeTool; },
    activeBackground: function () { return activeBackground(); },
    tvCanvas: function () { return $('tv-canvas'); },
    NesRender: function () { return window.NesRender; },
    selectMode: function (id) { selectMode(id); },
  };

  // ---- State migration / validation for the storage layer ---------------
  function migrateState(s) {
    if (!s || typeof s !== 'object') return s;
    if (!Array.isArray(s.bg_tiles)) s.bg_tiles = [];
    if (!Array.isArray(s.sprite_tiles)) s.sprite_tiles = [];
    if (!Array.isArray(s.backgrounds) || !s.backgrounds.length) {
      // Reseed a starter rather than crash on a corrupt/blank slot.
      return window.StudioStarter.create();
    }
    if (typeof s.selectedBgIdx !== 'number') s.selectedBgIdx = 0;
    if (window.MetatileLib && typeof window.MetatileLib.migrate === 'function') {
      window.MetatileLib.migrate(s);
    }
    // Additive: ensure a builder tree so RULES/validators/PLAY have one.
    if ((!s.builder || s.builder.version !== 1) && typeof window.BuilderDefaults === 'function') {
      s.builder = window.BuilderDefaults();
    }
    return s;
  }
  function validateState(s) {
    if (!s || typeof s !== 'object') return 'not an object';
    if (!Array.isArray(s.backgrounds)) return 'missing backgrounds';
    if (!Array.isArray(s.bg_tiles)) return 'missing bg_tiles';
    return null; // valid
  }

  // ---- Save / snapshot / backup (progress safety) -----------------------
  function setSaveState(kind) {
    var dot = $('save-dot'), txt = $('save-text');
    dot.className = '';
    if (kind === 'dirty') { dot.classList.add('dirty'); txt.textContent = 'Saving…'; }
    else if (kind === 'error') { dot.classList.add('error'); txt.textContent = 'Save error'; }
    else { txt.textContent = 'Saved'; }
  }
  function flushSave() {
    var res = Storage.saveCurrent(state);
    setSaveState(res && res.ok ? 'saved' : 'error');
  }
  // Debounced autosave-on-change (mirrors the old pages' autosave).
  function markDirty() {
    setSaveState('dirty');
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { saveTimer = null; flushSave(); }, 350);
    refreshQuestsAndAttention();
  }

  // ---- The TV: LIVE render ----------------------------------------------
  function activeBackground() {
    return state.backgrounds[state.selectedBgIdx] || state.backgrounds[0];
  }
  // Return the 8×8 nametable grid for the active background, expanding a
  // 16×16 metatile background exactly like the server does.
  function activeNametable() {
    var bg = activeBackground();
    if (bg && bg.tileMode === '16x16' && window.MetatileLib) {
      return window.MetatileLib.expand(bg).nametable;
    }
    return (bg && bg.nametable) || [];
  }
  function packRgb(idx) {
    var c = window.NesRender.NES_PALETTE_RGB[idx & 0x3F];
    return (255 << 24) | (c[2] << 16) | (c[1] << 8) | c[0]; // ABGR little-endian
  }
  function renderLive() {
    var canvas = $('tv-canvas');
    var g = canvas.getContext('2d');
    var mod = window.StudioModes && window.StudioModes[currentMode];
    // A mode may take over the TV entirely (e.g. CHARS/TILES paint canvas).
    if (mod && typeof mod.renderTV === 'function') {
      try { mod.renderTV(g, ctx); } catch (e) { console.error('[studio] renderTV', e); }
      if (typeof mod.onRenderOverlay === 'function') { try { mod.onRenderOverlay(g, ctx); } catch (e2) {} }
      return;
    }
    var img = g.createImageData(256, 240);
    var buf = new Uint32Array(img.data.buffer);
    var nt = activeNametable();
    var tiles = state.bg_tiles || [];
    for (var cy = 0; cy < SCREEN_H; cy++) {
      var row = nt[cy] || [];
      for (var cx = 0; cx < SCREEN_W; cx++) {
        var cell = row[cx] || { tile: 0, palette: 0 };
        var pal = window.NesRender.bgPaletteFor(state, cell.palette || 0);
        var slots = [pal.slot0, pal.slot1, pal.slot2, pal.slot3];
        var packed = [packRgb(slots[0]), packRgb(slots[1]), packRgb(slots[2]), packRgb(slots[3])];
        var tile = tiles[cell.tile | 0];
        var px = (tile && tile.pixels) || null;
        var baseX = cx * 8, baseY = cy * 8;
        for (var y = 0; y < 8; y++) {
          var prow = px ? px[y] : null;
          var o = (baseY + y) * 256 + baseX;
          for (var x = 0; x < 8; x++) {
            var v = prow ? (prow[x] | 0) : 0;
            buf[o + x] = packed[v];
          }
        }
      }
    }
    g.putImageData(img, 0, 0);
    // Modes may suppress the idle hero preview while painting.
    if (!(mod && mod.hidePlayerPreview)) drawPlayerPreview(g);
    // Modes may draw an overlay (grid, hover cell, selection) on top.
    if (mod && typeof mod.onRenderOverlay === 'function') {
      try { mod.onRenderOverlay(g, ctx); } catch (e) {}
    }
  }
  // A calm LIVE preview of the hero at its resting spot on the floor, so
  // the TV is game-first rather than an empty map.
  function drawPlayerPreview(ctx) {
    var sprites = state.sprites || [];
    var player = null;
    for (var i = 0; i < sprites.length; i++) {
      if (sprites[i] && sprites[i].role === 'player') { player = sprites[i]; break; }
    }
    if (!player) return;
    var w = (player.width || 2) * 8, h = (player.height || 2) * 8;
    var off = document.createElement('canvas');
    off.width = w; off.height = h;
    window.NesRender.drawSpriteIntoCtx(off.getContext('2d'), player, state, w, h);
    var restY = (SCREEN_H - 2) * 8 - h; // stood on the two-row floor
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, 32, Math.max(0, restY));
  }

  // ---- The TV: PLAY ------------------------------------------------------
  function setTvState(live) {
    var lbl = $('tv-state-label'), hint = $('tv-hint');
    if (live) { lbl.textContent = 'Live'; hint.textContent = 'Editing the current screen live — press ▶ Play to run it.'; }
    else { lbl.textContent = 'Playing'; hint.textContent = 'Compiling and running your game…'; }
  }
  function onPlay() {
    var btn = $('btn-play');
    if (btn.disabled) return;
    btn.disabled = true;
    // Progress-safety: snapshot BEFORE running (design-principles §1).
    Storage.flushPending();
    Storage.saveSnapshot(state, 'before_play');
    playedThisSession = true;
    setTvState(false);
    setSaveState('dirty');
    window.PlayPipeline.play(state, {
      mode: 'browser',
      onStatus: function (kind, msg) {
        $('tv-hint').textContent = msg;
      },
      onRom: function (rom) {
        window.NesEmulator.open(rom, { title: state.name || 'game' })
          .then(function () { setTvState(true); renderLive(); });
      },
    }).then(function (res) {
      setSaveState('saved');
      refreshQuestsAndAttention();
      if (!res || res.ok === false || !res.rom_b64) { setTvState(true); }
    }).catch(function () {
      setTvState(true);
    }).finally(function () {
      btn.disabled = false;
    });
  }

  // ---- Mode rail + dock --------------------------------------------------
  function buildModeRail() {
    var rail = $('mode-rail');
    rail.innerHTML = '';
    MODES.forEach(function (m) {
      var b = document.createElement('button');
      b.className = 'mode-btn';
      b.type = 'button';
      b.dataset.mode = m.id;
      b.innerHTML = '<span class="ico" aria-hidden="true">' + m.ico + '</span>' +
        '<span>' + m.name + '</span>';
      b.addEventListener('click', function () { selectMode(m.id); });
      rail.appendChild(b);
    });
    applyLevelGating();
    highlightMode();
  }
  function applyLevelGating() {
    var lvl = LEVELS[currentLevel] || 0;
    Array.prototype.forEach.call(document.querySelectorAll('.mode-btn'), function (b) {
      var m = MODES.find(function (mm) { return mm.id === b.dataset.mode; });
      b.hidden = !!(m && m.minLevel > lvl);
    });
    // If the active mode just became hidden, fall back to World.
    var activeM = MODES.find(function (mm) { return mm.id === currentMode; });
    if (activeM && activeM.minLevel > lvl) selectMode('world');
  }
  function highlightMode() {
    Array.prototype.forEach.call(document.querySelectorAll('.mode-btn'), function (b) {
      b.classList.toggle('active', b.dataset.mode === currentMode);
    });
  }
  function selectMode(id) {
    var prev = window.StudioModes && window.StudioModes[currentMode];
    if (prev && typeof prev.onExit === 'function') { try { prev.onExit(ctx); } catch (e) {} }
    currentMode = id;
    highlightMode();
    var m = MODES.find(function (mm) { return mm.id === id; });
    $('stage-mode-name').textContent = m ? m.name : id;
    var mod = window.StudioModes && window.StudioModes[id];
    renderStageToolbar(mod && mod.renderDock ? mod : null);
    renderDock();
    if (mod && typeof mod.onEnter === 'function') { try { mod.onEnter(ctx); } catch (e) {} }
    renderLive();
  }
  // Map a pointer event on the TV canvas to an 8×8 nametable cell + pixel.
  function tvCellFromEvent(evt) {
    var canvas = $('tv-canvas');
    var r = canvas.getBoundingClientRect();
    var sx = canvas.width / r.width, sy = canvas.height / r.height;
    var px = (evt.clientX - r.left) * sx;
    var py = (evt.clientY - r.top) * sy;
    return {
      px: px, py: py,
      cx: Math.max(0, Math.min(SCREEN_W - 1, Math.floor(px / 8))),
      cy: Math.max(0, Math.min(SCREEN_H - 1, Math.floor(py / 8))),
      inBounds: px >= 0 && py >= 0 && px < canvas.width && py < canvas.height,
    };
  }
  function renderDock() {
    var dock = $('dock');
    var m = MODES.find(function (mm) { return mm.id === currentMode; });
    dock.innerHTML = '';
    var h = document.createElement('h2'); h.textContent = m.name; dock.appendChild(h);
    var sub = document.createElement('div'); sub.className = 'dock-sub'; sub.textContent = m.sub;
    dock.appendChild(sub);

    // Delegate to the mode's plugin module if one is registered. The
    // stage toolbar is built once per mode (in selectMode), NOT here —
    // renderDock is called on every dock interaction and must not reset
    // the active tool.
    var mod = window.StudioModes && window.StudioModes[currentMode];
    if (mod && typeof mod.renderDock === 'function') {
      try { mod.renderDock(dock, ctx); }
      catch (e) { console.error('[studio] ' + currentMode + ' dock failed', e); }
      return;
    }

    var ph = document.createElement('div');
    ph.className = 'placeholder';
    ph.textContent = 'This mode arrives later in the redesign. The shell, the shared ' +
      'project, the live TV and the safety net are ready now — the ' + m.name +
      ' tools dock in here next.';
    dock.appendChild(ph);
  }

  // The stage toolbar shows a mode's tools (design §4.2: "two tools by
  // default, more behind a disclosure"). A mode without a module keeps the
  // Phase-0 scaffold toolbar.
  function renderStageToolbar(mod) {
    var bar = $('stage-toolbar');
    // Preserve the trailing mode-name label; rebuild the tool buttons.
    Array.prototype.slice.call(bar.querySelectorAll('.tool, .more-tools-btn')).forEach(function (t) { t.remove(); });
    var nameEl = $('stage-mode-name');
    var tools = (mod && mod.stageTools) || [
      { id: 'select', label: '▣ Select' },
      { id: 'paint', label: '✎ Paint' },
    ];
    var moreTools = (mod && mod.moreTools) || [];
    // At levels where fewer tools apply, a mode can filter its own lists;
    // the shell just renders what it is given.
    activeTool = null;
    function addToolButton(tool, makeActive) {
      var b = document.createElement('button');
      b.className = 'tool' + (makeActive ? ' active' : '');
      b.type = 'button';
      b.dataset.tool = tool.id;
      b.textContent = tool.label;
      if (tool.title) b.title = tool.title;
      if (makeActive) { activeTool = tool.id; }
      b.addEventListener('click', function () {
        bar.querySelectorAll('.tool').forEach(function (o) { o.classList.remove('active'); });
        b.classList.add('active');
        activeTool = tool.id;
        if (mod && mod.onToolChange) mod.onToolChange(tool.id, ctx);
      });
      bar.insertBefore(b, nameEl);
      return b;
    }
    tools.forEach(function (tool, i) { addToolButton(tool, i === 0); });
    if (moreTools.length) {
      var more = document.createElement('button');
      more.className = 'tool more-tools-btn';
      more.type = 'button';
      more.textContent = 'More tools ▾';
      more.addEventListener('click', function () {
        more.remove();
        moreTools.forEach(function (tool) { addToolButton(tool, false); });
      });
      bar.insertBefore(more, nameEl);
    }
  }

  // ---- Level switch ------------------------------------------------------
  function loadLevel() {
    var prefs = Storage.readPrefs() || {};
    currentLevel = LEVELS[prefs.studioLevel] !== undefined ? prefs.studioLevel : 'beginner';
    $('level-select').value = currentLevel;
  }
  function onLevelChange() {
    currentLevel = $('level-select').value;
    var prefs = Storage.readPrefs() || {};
    prefs.studioLevel = currentLevel;
    Storage.writePrefs(prefs);
    applyLevelGating();
    highlightMode();
  }

  // ---- Quests + Needs attention -----------------------------------------
  function computeQuests() {
    var bg = activeBackground();
    var hasArt = false;
    var nt = (bg && bg.nametable) || [];
    for (var r = 0; r < nt.length && !hasArt; r++) {
      for (var c = 0; c < (nt[r] || []).length; c++) {
        if (nt[r][c] && (nt[r][c].tile | 0) !== 0) { hasArt = true; break; }
      }
    }
    var hasPlayer = (state.sprites || []).some(function (s) { return s && s.role === 'player'; });
    return [
      { title: 'Meet your hero', done: hasPlayer,
        hint: 'A character with the Player role rides in the TV.' },
      { title: 'Build some ground', done: hasArt,
        hint: 'Paint background tiles so your hero has a world to stand in.' },
      { title: 'Take it for a spin', done: playedThisSession,
        hint: 'Press ▶ Play to compile and run your game in the TV.' },
      { title: 'Add a second screen', done: (state.backgrounds || []).length > 1,
        hint: 'Use “+ Background” in the World dock to grow your world.' },
    ];
  }
  // ---- CHR / OAM budget meters (Phase 3.1) ------------------------------
  function countUsedTiles(pool) {
    var n = 0;
    for (var i = 0; i < pool.length; i++) { if (!window.StudioUI.isTileBlank(pool[i])) n++; }
    return n;
  }
  function budgetBar(label, used, max, hint) {
    var pct = Math.min(100, Math.round(used / max * 100));
    var cls = 'budget' + (pct >= 100 ? ' full' : (pct >= 80 ? ' warn' : ''));
    var d = document.createElement('div');
    d.className = cls;
    d.innerHTML = '<div class="blabel"><span>' + escapeHtml(label) + '</span>' +
      '<span class="val">' + used + '/' + max + '</span></div>' +
      '<div class="bar"><div class="fill" style="width:' + pct + '%"></div></div>' +
      (hint ? '<div class="dock-note" style="margin-top:2px">' + escapeHtml(hint) + '</div>' : '');
    return d;
  }
  function refreshBudgets() {
    var bl = $('budget-list');
    if (!bl) return;
    bl.innerHTML = '';
    var bgUsed = countUsedTiles(state.bg_tiles || []);
    var spUsed = countUsedTiles(state.sprite_tiles || []);
    var sprN = (state.sprites || []).length;
    bl.appendChild(budgetBar('CHR — background tiles', bgUsed, 256,
      bgUsed > 200 ? 'Reuse tiles to fit the cartridge.' : ''));
    bl.appendChild(budgetBar('CHR — sprite tiles', spUsed, 256, ''));
    bl.appendChild(budgetBar('Characters (OAM 64)', sprN, 64, ''));
  }

  function refreshQuestsAndAttention() {
    refreshBudgets();
    var ql = $('quest-list');
    ql.innerHTML = '';
    computeQuests().forEach(function (q) {
      var el = document.createElement('div');
      el.className = 'quest' + (q.done ? ' done' : '');
      el.innerHTML = '<span class="tick" aria-hidden="true">' + (q.done ? '✓' : '') + '</span>' +
        '<span><span class="q-title">' + escapeHtml(q.title) + '</span><br>' +
        '<span style="color:var(--muted)">' + escapeHtml(q.hint) + '</span></span>';
      ql.appendChild(el);
    });

    var al = $('attn-list');
    al.innerHTML = '';
    var problems = [];
    try {
      if (window.BuilderValidators) problems = window.BuilderValidators.validate(state) || [];
    } catch (e) { problems = []; }
    if (!problems.length) {
      var ok = document.createElement('div');
      ok.className = 'attn-empty';
      ok.textContent = '✓ Nothing needs attention — your game builds cleanly.';
      al.appendChild(ok);
      return;
    }
    problems.forEach(function (p) {
      var item = document.createElement('div');
      item.className = 'attn-item ' + (p.severity === 'error' ? 'error' : 'warn');
      item.innerHTML = '<div class="sev">' + (p.severity === 'error' ? '✗ Error' : '⚠ Warning') + '</div>' +
        '<div>' + escapeHtml(p.message || '') + '</div>' +
        (p.fix ? '<div class="fix">' + escapeHtml(p.fix) + '</div>' : '');
      var dest = jumpDestination(p.jumpTo);
      if (dest) {
        var btn = document.createElement('button');
        btn.className = 'btn';
        btn.style.marginTop = '6px';
        btn.textContent = 'Fix in ' + dest.label + ' →';
        btn.addEventListener('click', function () { selectMode(dest.mode); });
        item.appendChild(btn);
      }
      al.appendChild(item);
    });
  }
  // Map the validators' old-page jumpTo targets onto Studio modes so
  // "Needs attention" is actionable inside the Studio (Phase 1.6).
  function jumpDestination(jumpTo) {
    if (!jumpTo) return null;
    var t = String(jumpTo).toLowerCase();
    if (t.indexOf('sprite') >= 0) return { mode: 'chars', label: 'Chars' };
    if (t.indexOf('behaviour') >= 0) return { mode: 'world', label: 'World' };
    if (t.indexOf('index') >= 0 || t.indexOf('background') >= 0) return { mode: 'world', label: 'World' };
    if (t.indexOf('builder') >= 0) return { mode: 'rules', label: 'Rules' };
    if (t.indexOf('audio') >= 0) return { mode: 'sound', label: 'Sound' };
    if (t.indexOf('code') >= 0) return { mode: 'code', label: 'Code' };
    if (t.indexOf('palette') >= 0 || t.indexOf('pal') >= 0) return { mode: 'pals', label: 'Pals' };
    return null;
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  // ---- Time Machine ------------------------------------------------------
  function openTimeMachine() {
    var body = $('tm-body');
    body.innerHTML = '';
    var snaps = Storage.listSnapshots() || [];
    var backups = Storage.listBackups() || [];

    if (!snaps.length && !backups.length) {
      var none = document.createElement('div');
      none.className = 'attn-empty';
      none.textContent = 'No earlier versions yet — they build up as you work ' +
        '(a snapshot every 30 seconds, before every Play, and an emergency backup every 5 minutes).';
      body.appendChild(none);
    } else {
      if (snaps.length) body.appendChild(sectionTitle('Snapshots (keeps ' + Storage.MAX_SNAPSHOTS + ')'));
      snaps.forEach(function (s) { body.appendChild(snapRow(s, false)); });
      if (backups.length) body.appendChild(sectionTitle('Emergency backups (keeps ' + Storage.MAX_BACKUPS + ')'));
      backups.forEach(function (s) { body.appendChild(snapRow(s, true)); });
    }
    $('tm-backdrop').classList.add('open');
  }
  function sectionTitle(txt) {
    var d = document.createElement('div');
    d.className = 'tm-section-title';
    d.textContent = txt;
    return d;
  }
  function snapRow(entry, isBackup) {
    var row = document.createElement('div');
    row.className = 'snap-row';
    var when = new Date(entry.ts);
    var meta = document.createElement('div');
    meta.className = 'meta';
    meta.innerHTML = '<div>' + escapeHtml(entry.name || 'project') + '</div>' +
      '<div class="when">' + when.toLocaleString() + '</div>' +
      (entry.reason ? '<div class="reason">' + escapeHtml(entry.reason) + '</div>' : '');
    var btn = document.createElement('button');
    btn.className = 'btn';
    btn.type = 'button';
    btn.textContent = 'Restore';
    btn.addEventListener('click', function () { restoreSnapshot(entry, isBackup); });
    row.appendChild(meta);
    row.appendChild(btn);
    return row;
  }
  function restoreSnapshot(entry) {
    var restored = Storage.loadSnapshot(entry.key);
    if (!restored) { alert('Sorry — that version could not be read.'); return; }
    // Snapshot the CURRENT state first, so a restore is itself undoable.
    Storage.saveSnapshot(state, 'before_recovery');
    state = migrateState(restored);
    Storage.saveCurrent(state);
    $('project-name').value = state.name || '';
    state.selectedBgIdx = Math.min(state.selectedBgIdx || 0, (state.backgrounds.length - 1));
    renderLive();
    renderDock();
    refreshQuestsAndAttention();
    setSaveState('saved');
    $('tm-backdrop').classList.remove('open');
  }

  // ---- Publish to gallery ------------------------------------------------
  function openPublish() {
    $('pub-title-input').value = state.name || '';
    $('pub-status').textContent = '';
    $('pub-backdrop').classList.add('open');
  }
  function bytesToBase64(bytes) {
    var CHUNK = 0x8000, out = '';
    for (var i = 0; i < bytes.length; i += CHUNK) {
      out += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(out);
  }
  async function captureRomPreview(rom, frames) {
    if (window.NesEmulator && window.NesEmulator.ensureJsnes) await window.NesEmulator.ensureJsnes();
    if (!window.jsnes) throw new Error('jsnes did not load');
    var canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 240;
    var g = canvas.getContext('2d');
    var img = g.createImageData(256, 240);
    var fb = new Uint32Array(img.data.buffer);
    var nes = new window.jsnes.NES({
      onFrame: function (buf) { for (var i = 0; i < buf.length; i++) fb[i] = 0xff000000 | buf[i]; },
      onAudioSample: function () {},
    });
    var romStr = '';
    for (var j = 0; j < rom.length; j++) romStr += String.fromCharCode(rom[j]);
    nes.loadROM(romStr);
    for (var f = 0; f < frames; f++) nes.frame();
    g.putImageData(img, 0, 0);
    return canvas.toDataURL('image/png');
  }
  async function doPublish() {
    var status = $('pub-status'), submit = $('pub-submit');
    var title = ($('pub-title-input').value || '').trim();
    if (!title) { status.textContent = 'A title is required.'; return; }
    submit.disabled = true;
    status.textContent = 'Building ROM…';
    try {
      var rom = null;
      var result = await window.PlayPipeline.play(state, {
        mode: 'browser', download: false,
        onStatus: function (_c, msg) { status.textContent = msg; },
        onRom: function (bytes) { rom = bytes; },
      });
      if (!rom || !result || !result.ok) { status.textContent = '✗ Build failed — check Needs attention.'; submit.disabled = false; return; }
      status.textContent = 'Capturing preview…';
      var dataUrl = await captureRomPreview(rom, 60);
      status.textContent = 'Uploading…';
      var res = await fetch('/gallery/publish', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title,
          description: ($('pub-desc-input').value || '').trim(),
          pupil_handle: ($('pub-handle-input').value || '').trim(),
          project: state,
          rom_b64: bytesToBase64(rom),
          preview_b64: dataUrl.split(',')[1],
          source_page: 'builder',
        }),
      });
      var data = await res.json();
      if (!data.ok) { status.textContent = '✗ ' + (data.error || 'Publish failed'); submit.disabled = false; return; }
      status.innerHTML = '✓ Published! <a href="gallery.html" target="_blank" style="color:var(--sel)">Open the gallery</a>.';
      submit.disabled = false;
    } catch (e) {
      status.textContent = '✗ ' + (e && e.message ? e.message : 'Publish failed');
      submit.disabled = false;
    }
  }

  // ---- Help + feedback modal --------------------------------------------
  function openHelp() {
    var bd = $('help-backdrop');
    if (!bd) {
      bd = document.createElement('div');
      bd.id = 'help-backdrop';
      bd.className = 'modal-backdrop';
      bd.innerHTML =
        '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="help-title">' +
        '<h2 id="help-title">? Help</h2>' +
        '<div class="modal-sub">NES Studio — the unified game-making workspace.</div>' +
        '<div style="font-size:12px;line-height:1.7;color:var(--muted)">' +
        '<p><strong style="color:var(--text)">Modes</strong> (left rail): World, Chars, Tiles, ' +
        'Pals, Rules, Sound, Code. Higher <em>levels</em> reveal more modes.</p>' +
        '<p><strong style="color:var(--text)">The TV</strong> shows your game live. ' +
        '▶ Play compiles it and runs it in the emulator.</p>' +
        '<p><strong style="color:var(--text)">Your work is safe:</strong> it autosaves on every ' +
        'change, snapshots every 30 seconds and before every Play, and keeps emergency backups. ' +
        'Use ⟲ Time Machine to step back — restoring always snapshots your current work first.</p>' +
        '</div>' +
        '<div class="tm-section-title">Send feedback</div>' +
        '<div id="feedback-host"></div>' +
        '<div class="modal-actions"><button class="btn" id="help-close" type="button">Close</button></div>' +
        '</div>';
      document.body.appendChild(bd);
      bd.addEventListener('click', function (e) { if (e.target === bd) bd.classList.remove('open'); });
      bd.querySelector('#help-close').addEventListener('click', function () { bd.classList.remove('open'); });
    }
    if (window.Feedback && typeof window.Feedback.mountInto === 'function') {
      window.Feedback.mountInto(bd.querySelector('#feedback-host'), { source: 'studio' });
    }
    bd.classList.add('open');
  }

  // ---- Boot --------------------------------------------------------------
  function boot() {
    Storage = window.createTileEditorStorage({ migrateState: migrateState, validateState: validateState });
    window.Storage = Storage; // shared account-menu.js reads this

    state = Storage.bootstrapCurrent(function () { return window.StudioStarter.create(); });
    state = migrateState(state);
    Storage.saveCurrent(state);

    // Register the flush hook so debounced edits persist before reload/switch.
    Storage.setFlushHook(function () {
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
      Storage.saveCurrent(state);
    });

    // Chrome: project name.
    var nameEl = $('project-name');
    nameEl.value = state.name || '';
    nameEl.addEventListener('input', function () {
      state.name = Storage.renameCurrent(state, nameEl.value);
      markDirty();
    });

    // Chrome buttons.
    $('btn-play').addEventListener('click', onPlay);
    $('btn-publish').addEventListener('click', openPublish);
    $('pub-cancel').addEventListener('click', function () { $('pub-backdrop').classList.remove('open'); });
    $('pub-submit').addEventListener('click', doPublish);
    $('pub-backdrop').addEventListener('click', function (e) {
      if (e.target === $('pub-backdrop')) $('pub-backdrop').classList.remove('open');
    });
    $('btn-time-machine').addEventListener('click', openTimeMachine);
    $('tm-close').addEventListener('click', function () { $('tm-backdrop').classList.remove('open'); });
    $('tm-backdrop').addEventListener('click', function (e) {
      if (e.target === $('tm-backdrop')) $('tm-backdrop').classList.remove('open');
    });
    $('btn-help').addEventListener('click', openHelp);
    $('level-select').addEventListener('change', onLevelChange);

    // TV pointer interaction — delegated to the active mode module.
    // A mode implements onTvDown/onTvMove/onTvUp(cell, ctx, evt).
    var tv = $('tv-canvas');
    var painting = false;
    function tvDispatch(fnName, evt) {
      var mod = window.StudioModes && window.StudioModes[currentMode];
      if (!mod || typeof mod[fnName] !== 'function') return;
      var cell = tvCellFromEvent(evt);
      try { mod[fnName](cell, ctx, evt); } catch (e) { console.error('[studio] TV ' + fnName, e); }
    }
    tv.addEventListener('pointerdown', function (evt) {
      evt.preventDefault();
      painting = true;
      try { tv.setPointerCapture(evt.pointerId); } catch (e) {}
      tvDispatch('onTvDown', evt);
    });
    tv.addEventListener('pointermove', function (evt) {
      tvDispatch('onTvHover', evt);
      if (painting) tvDispatch('onTvMove', evt);
    });
    function endPaint(evt) {
      if (!painting) return;
      painting = false;
      tvDispatch('onTvUp', evt);
    }
    tv.addEventListener('pointerup', endPaint);
    tv.addEventListener('pointercancel', endPaint);
    tv.addEventListener('pointerleave', function (evt) {
      tvDispatch('onTvLeave', evt);
    });
    tv.addEventListener('contextmenu', function (evt) {
      // Right-click is the eyedropper in paint modes — never a browser menu.
      var mod = window.StudioModes && window.StudioModes[currentMode];
      if (mod && mod.onTvRightClick) { evt.preventDefault(); mod.onTvRightClick(tvCellFromEvent(evt), ctx, evt); }
    });

    // Undo / redo — global, in-memory (distinct from snapshots).
    window.addEventListener('keydown', function (evt) {
      var typing = /^(INPUT|TEXTAREA|SELECT)$/.test((evt.target && evt.target.tagName) || '');
      if (typing) return;
      var mod = (evt.metaKey || evt.ctrlKey);
      if (mod && !evt.shiftKey && evt.key.toLowerCase() === 'z') { evt.preventDefault(); undo(); }
      else if (mod && (evt.key.toLowerCase() === 'y' || (evt.shiftKey && evt.key.toLowerCase() === 'z'))) { evt.preventDefault(); redo(); }
      else {
        var m2 = window.StudioModes && window.StudioModes[currentMode];
        if (m2 && m2.onKey) m2.onKey(evt, ctx);
      }
    });

    // Shared chrome modules.
    try { if (window.AccountMenu) window.AccountMenu.mount(); } catch (e) {}
    try { if (window.CookieNotice) window.CookieNotice.mount(); } catch (e) {}

    // Snapshot / backup cadence (progress-safety guarantees).
    setInterval(function () { Storage.saveSnapshot(state, 'auto_30s'); }, 30000);
    setInterval(function () { Storage.saveBackup(state); }, 5 * 60000);
    window.addEventListener('beforeunload', function () {
      Storage.flushPending();
      Storage.saveSnapshot(state, 'before_unload');
    });

    loadLevel();
    buildModeRail();
    selectMode('world');
    renderLive();
    refreshQuestsAndAttention();
    setSaveState('saved');

    // Expose a tiny surface for the Playwright suite to assert on.
    window.Studio = {
      getState: function () { return state; },
      getMode: function () { return currentMode; },
      getLevel: function () { return currentLevel; },
      selectMode: selectMode,
      renderLive: renderLive,
      refresh: refreshQuestsAndAttention,
      undo: undo,
      redo: redo,
      ctx: ctx,
      _play: onPlay,
    };
    document.body.dataset.studioReady = '1';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
