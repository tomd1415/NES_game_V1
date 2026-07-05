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
    { id: 'style', name: 'Style', ico: '🎮', minLevel: 0,
      sub: 'Your game style and all of its style-specific options in one place.' },
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
  var viewScreen = { x: 0, y: 0 };   // which screen the TV shows (bug #7, multi-screen bgs)
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
    // Multi-screen viewport (bug #7): which screen the TV shows, and the
    // background's screen dimensions. Offsets are in TILE units.
    viewScreen: function () { clampViewScreen(); return { x: viewScreen.x, y: viewScreen.y }; },
    setViewScreen: function (x, y) { viewScreen.x = x | 0; viewScreen.y = y | 0; clampViewScreen(); },
    viewOffset: function () { clampViewScreen(); return { cx: viewScreen.x * SCREEN_W, cy: viewScreen.y * SCREEN_H }; },
    bgScreens: function () { return bgScreens(activeBackground()); },
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
  function bgScreens(bg) {
    var d = (bg && bg.dimensions) || {};
    return { x: Math.max(1, d.screens_x | 0 || 1), y: Math.max(1, d.screens_y | 0 || 1) };
  }
  function clampViewScreen() {
    var s = bgScreens(activeBackground());
    if (viewScreen.x > s.x - 1) viewScreen.x = s.x - 1;
    if (viewScreen.y > s.y - 1) viewScreen.y = s.y - 1;
    if (viewScreen.x < 0) viewScreen.x = 0;
    if (viewScreen.y < 0) viewScreen.y = 0;
  }
  function packRgb(idx) {
    var c = window.NesRender.NES_PALETTE_RGB[idx & 0x3F];
    return (255 << 24) | (c[2] << 16) | (c[1] << 8) | c[0]; // ABGR little-endian
  }
  function renderLive() {
    renderRulers();
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
    clampViewScreen();
    var offX = viewScreen.x * SCREEN_W, offY = viewScreen.y * SCREEN_H;
    for (var cy = 0; cy < SCREEN_H; cy++) {
      var row = nt[cy + offY] || [];
      for (var cx = 0; cx < SCREEN_W; cx++) {
        var cell = row[cx + offX] || { tile: 0, palette: 0 };
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
    var playOpts = {
      mode: 'browser',
      onStatus: function (kind, msg) {
        $('tv-hint').textContent = msg;
      },
      onRom: function (rom) {
        window.NesEmulator.open(rom, { title: state.name || 'game' })
          .then(function () { setTvState(true); renderLive(); });
      },
    };
    // Ejected (hand-coded) projects compile the pupil's own C, not the blocks.
    if (state.ejected && typeof state.customMainC === 'string' && state.customMainC.length) {
      playOpts.customMainC = state.customMainC;
    }
    window.PlayPipeline.play(state, playOpts).then(function (res) {
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
        '<span>' + m.name + '</span><span class="lock" hidden>🔒</span>';
      b.addEventListener('click', function () {
        if (b.classList.contains('locked')) {
          // Bug #4: locked modes are visible so pupils see more exists —
          // clicking one nudges them to raise the level instead of hiding it.
          var need = (m.minLevel >= LEVELS.advanced) ? 'Advanced' : 'Maker';
          flashLevelHint('🔒 ' + m.name + ' unlocks at ' + need + ' level — change “Level” (top-right).');
          return;
        }
        selectMode(m.id);
      });
      rail.appendChild(b);
    });
    applyLevelGating();
    highlightMode();
  }
  var _hintTimer = null;
  function flashLevelHint(msg) {
    var h = $('level-hint'); if (!h) return;
    h.textContent = msg; h.classList.add('flash');
    if (_hintTimer) clearTimeout(_hintTimer);
    _hintTimer = setTimeout(function () { h.classList.remove('flash'); updateLevelHint(); }, 4000);
  }
  function updateLevelHint() {
    var h = $('level-hint'); if (!h) return;
    if (h.classList.contains('flash')) return;
    h.textContent = currentLevel === 'beginner'
      ? '🔒 Beginner — pick Maker/Advanced to unlock more'
      : (currentLevel === 'maker' ? 'Maker — most tools unlocked' : 'Advanced — everything unlocked');
  }
  function applyLevelGating() {
    var lvl = LEVELS[currentLevel] || 0;
    Array.prototype.forEach.call(document.querySelectorAll('.mode-btn'), function (b) {
      var m = MODES.find(function (mm) { return mm.id === b.dataset.mode; });
      var locked = !!(m && m.minLevel > lvl);
      b.classList.toggle('locked', locked);
      var lk = b.querySelector('.lock'); if (lk) lk.hidden = !locked;
      b.hidden = false; // show locked modes rather than hiding them (bug #4)
    });
    updateLevelHint();
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

  // Live cursor read-out — the WORLD tile (x, y) under the pointer, shown in the
  // box below the screen.  Blank outside WORLD mode (other modes edit a
  // different coordinate space).
  function updateCoords(evt) {
    var el = $('tv-coords'); if (!el) return;
    if (currentMode !== 'world') { el.textContent = ''; return; }
    var cell = tvCellFromEvent(evt);
    if (!cell.inBounds) { el.textContent = 'x –, y –'; return; }
    var off = { cx: 0, cy: 0 };
    try { off = ctx.viewOffset(); } catch (e) {}
    el.textContent = 'x ' + (cell.cx + off.cx) + ', y ' + (cell.cy + off.cy);
  }

  // Faint tile-coordinate guides around the screen edges (WORLD only).  Numbers
  // reflect the world column/row (the on-screen tile + the current view offset).
  function renderRulers() {
    var el = $('tv-rulers'); if (!el) return;
    if (currentMode !== 'world') { el.innerHTML = ''; var c = $('tv-coords'); if (c) c.textContent = ''; return; }
    var off = { cx: 0, cy: 0 };
    try { off = ctx.viewOffset(); } catch (e) {}
    var html = '';
    [0, 4, 8, 12, 16, 20, 24, 28, 31].forEach(function (c) {
      var pct = c / SCREEN_W * 100;
      html += '<span class="rt col" style="left:' + pct + '%"></span>' +
              '<span class="rk col" style="left:' + pct + '%">' + (c + off.cx) + '</span>';
    });
    [0, 4, 8, 12, 16, 20, 24, 29].forEach(function (r) {
      var pct = r / SCREEN_H * 100;
      html += '<span class="rt row" style="top:' + pct + '%"></span>' +
              '<span class="rk row" style="top:' + pct + '%">' + (r + off.cy) + '</span>';
    });
    el.innerHTML = html;
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
    // Finer progressive disclosure (1.7): a tool may declare a minLevel and
    // the shell hides it below that level, so Beginner sees a calmer toolbar.
    var lvl = LEVELS[currentLevel] || 0;
    function toolAllowed(t) { return !t.minLevel || lvl >= (LEVELS[t.minLevel] || 0); }
    tools = tools.filter(toolAllowed);
    moreTools = moreTools.filter(toolAllowed);
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
    // Re-render the dock AND the stage toolbar so level-gated controls and
    // tools (e.g. WORLD's ⛰ Type / ▦ Select, the RULES reactions matrix)
    // appear/disappear immediately, not only on the next mode switch.
    var mod = window.StudioModes && window.StudioModes[currentMode];
    renderStageToolbar(mod && mod.renderDock ? mod : null);
    renderDock();
    refreshQuestsAndAttention();
  }

  // ---- New starter game (bug #3/#5) -------------------------------------
  // Creates a fresh starter platformer as a NEW project (current work is
  // saved separately), so Beginner always has something playable to start
  // from — the fix for "there is no starting game".
  // Build a fresh project from the starter with the given id (from
  // StudioStarter.list()), register it, and switch to it.  Falls back to the
  // default starter when the id is unknown or the registry is unavailable.
  function makeStarter(id) {
    var starters = (window.StudioStarter.list && window.StudioStarter.list()) || [];
    var chosen = null;
    for (var i = 0; i < starters.length; i++) { if (starters[i].id === id) chosen = starters[i]; }
    var n = (Storage.listProjects() || []).length + 1;
    var fresh = chosen ? chosen.create({ name: chosen.label + ' ' + n })
                       : window.StudioStarter.create({ name: 'My Game ' + n });
    Storage.createProject(fresh.name, fresh); // registers + sets active
    state = Storage.loadCurrent() || fresh;
    undoStack.length = 0; redoStack.length = 0;
    $('project-name').value = state.name || '';
    if (window.StudioModes && window.StudioModes.world) selectMode('world');
    renderLive(); renderDock(); refreshQuestsAndAttention();
    setSaveState('saved');
    if (window.renderProjectsMenu) { try { window.renderProjectsMenu(); } catch (e) {} }
    // A new project may target a newer engine than the last one — refresh the
    // engine button / advisor affordance.
    if (typeof refreshEngineButton === 'function') { try { refreshEngineButton(); } catch (e) {} }
  }

  function onNewGame() {
    Storage.flushPending();
    var starters = (window.StudioStarter.list && window.StudioStarter.list()) || [];
    // One starter (or no modal helper) → keep the simple confirm flow.
    if (starters.length <= 1 || !(window.StudioUI && window.StudioUI.modal)) {
      if (!confirm('Start a fresh starter game?\n\nYour current project stays saved — you can switch back to it from the projects menu anytime.')) return;
      makeStarter(starters[0] && starters[0].id);
      return;
    }
    // Multiple starters → a picker so the pupil can choose which sample to load.
    var el = window.StudioUI.el;
    var body = starters.map(function (s) {
      return el('div', { class: 'dock-note', style: 'margin:6px 0;line-height:1.35' }, [
        el('strong', { text: s.emoji + '  ' + s.label }),
        el('div', { text: s.desc }),
      ]);
    });
    var actions = starters.map(function (s, i) {
      return { label: s.emoji + ' ' + s.label, value: s.id, kind: i === 0 ? 'primary' : null };
    });
    actions.push({ label: 'Cancel', value: null });
    window.StudioUI.modal({
      title: 'Load a starter game',
      sub: 'Your current project stays saved — switch back anytime from the projects menu.',
      bodyNodes: body,
      actions: actions,
    }).then(function (id) { if (id) makeStarter(id); });
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

  // ---- 8-sprites-per-scanline analysis (Phase 3.2) ----------------------
  // The PPU draws at most 8 hardware (8×8) sprites on any scanline; extras
  // flicker or drop out. Each non-empty metasprite cell of a placed scene
  // instance is one hardware sprite spanning 8 scanlines from its top.
  function computeScanlineLoad(s) {
    var rows = new Array(240);
    for (var i = 0; i < 240; i++) rows[i] = 0;
    var scene = s.builder && s.builder.modules && s.builder.modules.scene;
    var insts = (scene && scene.config && scene.config.instances) || [];
    insts.forEach(function (inst) {
      var sp = (s.sprites || [])[inst.spriteIdx];
      if (!sp) return;
      var W = sp.width || 2, H = sp.height || 2;
      for (var cr = 0; cr < H; cr++) for (var cc = 0; cc < W; cc++) {
        var cell = sp.cells && sp.cells[cr] && sp.cells[cr][cc];
        if (!cell || cell.empty) continue;
        var top = (inst.y | 0) + cr * 8;
        for (var yy = top; yy < top + 8; yy++) if (yy >= 0 && yy < 240) rows[yy]++;
      }
    });
    var maxLoad = 0, overflowRows = 0;
    for (var y = 0; y < 240; y++) { if (rows[y] > maxLoad) maxLoad = rows[y]; if (rows[y] > 8) overflowRows++; }
    return { rows: rows, maxLoad: maxLoad, overflowRows: overflowRows };
  }
  function scanlineProblem(s) {
    var load = computeScanlineLoad(s);
    if (load.overflowRows <= 0) return null;
    return {
      severity: 'warn',
      message: load.overflowRows + ' scanline' + (load.overflowRows === 1 ? '' : 's') +
        ' have more than 8 sprites (busiest: ' + load.maxLoad + '). The NES draws only 8 sprites per line — the extras flicker or vanish.',
      fix: 'Spread placed characters out vertically, or use fewer / smaller ones.',
      jumpTo: 'background',
    };
  }

  function refreshQuestsAndAttention() {
    refreshBudgets();
    refreshEngineButton();
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
    // Studio-side supplemental checks the shared validators don't cover yet.
    try { var sl = scanlineProblem(state); if (sl) problems.push(sl); } catch (e) {}
    // Progressive disclosure (1.7): Beginners see only build-blocking errors —
    // warnings (often pointing at Maker-level controls) wait until Maker.
    if ((LEVELS[currentLevel] || 0) < LEVELS.maker) {
      problems = problems.filter(function (p) { return p.severity === 'error'; });
    }
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
  // Whole-project JSON round-trip (Phase 3.5). Export the canonical state;
  // import parses + migrates + snapshots-current-first, so it is lossless
  // and undoable.
  function exportProject() {
    Storage.flushPending();
    var blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = (state.name || 'game').replace(/[^a-zA-Z0-9_-]+/g, '_') + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function importProjectText(text) {
    var parsed;
    try { parsed = JSON.parse(text); }
    catch (e) { alert('That is not a valid project file.'); return false; }
    var migrated = migrateState(parsed);
    var err = validateState(migrated);
    if (err) { alert('That project file is not valid: ' + err); return false; }
    Storage.saveSnapshot(state, 'before_import');
    state = migrated;
    if (state.selectedBgIdx == null) state.selectedBgIdx = 0;
    state.selectedBgIdx = Math.min(state.selectedBgIdx, state.backgrounds.length - 1);
    Storage.renameCurrent(state, state.name || 'imported project');
    Storage.saveCurrent(state);
    $('project-name').value = state.name || '';
    renderLive(); renderDock(); refreshQuestsAndAttention();
    setSaveState('saved');
    return true;
  }
  // ---- CHR (.chr) round-trip (Phase 3.5) --------------------------------
  // NES pattern-table format: 16 bytes/tile — 8 bytes of bitplane 0 (bit per
  // pixel: value & 1) then 8 bytes of bitplane 1 (value >> 1). Two banks
  // (BG then sprite), 256 tiles each = 8192 bytes total.
  function encodeChr(state) {
    var banks = [state.bg_tiles || [], state.sprite_tiles || []];
    var out = new Uint8Array(2 * 256 * 16);
    var o = 0;
    banks.forEach(function (pool) {
      for (var i = 0; i < 256; i++) {
        var px = (pool[i] && pool[i].pixels) || null;
        for (var y = 0; y < 8; y++) {
          var p0 = 0, p1 = 0;
          for (var x = 0; x < 8; x++) {
            var v = px ? (px[y][x] | 0) : 0;
            p0 = (p0 << 1) | (v & 1);
            p1 = (p1 << 1) | ((v >> 1) & 1);
          }
          out[o + y] = p0; out[o + 8 + y] = p1;
        }
        o += 16;
      }
    });
    return out;
  }
  function decodeChrInto(state, bytes) {
    // Accept exactly two banks (8192 bytes); tolerate a single 4096-byte bank
    // by treating it as BG only.
    var banks = [state.bg_tiles, state.sprite_tiles];
    var o = 0;
    for (var b = 0; b < 2; b++) {
      var pool = banks[b];
      for (var i = 0; i < 256; i++) {
        if (o + 16 > bytes.length) return;
        var tile = pool[i] || (pool[i] = { name: '', pixels: [] });
        if (!Array.isArray(tile.pixels) || tile.pixels.length !== 8) {
          tile.pixels = []; for (var r = 0; r < 8; r++) tile.pixels.push([0, 0, 0, 0, 0, 0, 0, 0]);
        }
        for (var y = 0; y < 8; y++) {
          var p0 = bytes[o + y], p1 = bytes[o + 8 + y];
          for (var x = 0; x < 8; x++) {
            var bit = 7 - x;
            tile.pixels[y][x] = ((p0 >> bit) & 1) | (((p1 >> bit) & 1) << 1);
          }
        }
        o += 16;
      }
    }
  }
  function exportChr() {
    Storage.flushPending();
    var blob = new Blob([encodeChr(state)], { type: 'application/octet-stream' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = (state.name || 'game').replace(/[^a-zA-Z0-9_-]+/g, '_') + '.chr';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function importChrBytes(bytes) {
    if (!bytes || bytes.length < 16) { alert('That .chr file looks empty.'); return false; }
    Storage.saveSnapshot(state, 'before_import');
    decodeChrInto(state, bytes);
    Storage.saveCurrent(state);
    renderLive(); renderDock(); refreshQuestsAndAttention();
    setSaveState('saved');
    return true;
  }

  // ---- Palette (.pal) round-trip (Phase 3.5) ----------------------------
  // 32-byte NES palette: 4 BG groups then 4 sprite groups of 4 bytes each
  // ([backdrop, slot1, slot2, slot3]); backdrop is shared, stored once.
  function encodePal(s) {
    var out = new Uint8Array(32);
    var ub = (s.universal_bg | 0) & 0x3F;
    for (var i = 0; i < 4; i++) {
      var bp = ((s.bg_palettes || [])[i] || { slots: [0, 0, 0] }).slots;
      var sp = ((s.sprite_palettes || [])[i] || { slots: [0, 0, 0] }).slots;
      out[i * 4] = ub; out[i * 4 + 1] = bp[0] & 0x3F; out[i * 4 + 2] = bp[1] & 0x3F; out[i * 4 + 3] = bp[2] & 0x3F;
      out[16 + i * 4] = ub; out[16 + i * 4 + 1] = sp[0] & 0x3F; out[16 + i * 4 + 2] = sp[1] & 0x3F; out[16 + i * 4 + 3] = sp[2] & 0x3F;
    }
    return out;
  }
  function importPalBytes(bytes) {
    if (!bytes || bytes.length < 32) { alert('That .pal file must be at least 32 bytes.'); return false; }
    Storage.saveSnapshot(state, 'before_import');
    state.universal_bg = bytes[0] & 0x3F;
    if (!Array.isArray(state.bg_palettes)) state.bg_palettes = [];
    if (!Array.isArray(state.sprite_palettes)) state.sprite_palettes = [];
    for (var i = 0; i < 4; i++) {
      state.bg_palettes[i] = { slots: [bytes[i * 4 + 1] & 0x3F, bytes[i * 4 + 2] & 0x3F, bytes[i * 4 + 3] & 0x3F] };
      state.sprite_palettes[i] = { slots: [bytes[16 + i * 4 + 1] & 0x3F, bytes[16 + i * 4 + 2] & 0x3F, bytes[16 + i * 4 + 3] & 0x3F] };
    }
    Storage.saveCurrent(state);
    renderLive(); renderDock(); refreshQuestsAndAttention();
    setSaveState('saved');
    return true;
  }

  // ---- Nametable (.nam) round-trip (Phase 3.5) --------------------------
  // 1024 bytes: 960 tile indices (32×30 row-major) + 64 attribute bytes
  // (8×8 grid; each byte packs four 2×2-tile quadrants, 2 bits each). Acts
  // on the active 8×8 background (metatile bgs are skipped).
  var NAM_QUADS = [[0, 0], [0, 1], [1, 0], [1, 1]];
  function encodeNam(bg) {
    var out = new Uint8Array(1024);
    var nt = bg.nametable || [];
    for (var r = 0; r < 30; r++) for (var c = 0; c < 32; c++) {
      out[r * 32 + c] = ((nt[r] && nt[r][c]) ? (nt[r][c].tile | 0) : 0) & 0xFF;
    }
    for (var ar = 0; ar < 8; ar++) for (var ac = 0; ac < 8; ac++) {
      var byte = 0;
      for (var q = 0; q < 4; q++) {
        var qr = ar * 4 + NAM_QUADS[q][0] * 2, qc = ac * 4 + NAM_QUADS[q][1] * 2;
        var cell = nt[qr] && nt[qr][qc];
        byte |= (((cell ? cell.palette : 0) & 3) << (q * 2));
      }
      out[960 + ar * 8 + ac] = byte;
    }
    return out;
  }
  function importNamBytes(bytes) {
    if (!bytes || bytes.length < 1024) { alert('That .nam file must be at least 1024 bytes.'); return false; }
    var bg = activeBackground();
    if (bg && bg.tileMode === '16x16') { alert('This background uses 16×16 blocks — revert to 8×8 in WORLD before importing a .nam.'); return false; }
    Storage.saveSnapshot(state, 'before_import');
    var nt = bg.nametable;
    for (var r = 0; r < 30; r++) for (var c = 0; c < 32; c++) {
      if (nt[r] && nt[r][c]) nt[r][c].tile = bytes[r * 32 + c];
    }
    for (var ar = 0; ar < 8; ar++) for (var ac = 0; ac < 8; ac++) {
      var byte = bytes[960 + ar * 8 + ac];
      for (var q = 0; q < 4; q++) {
        var pal = (byte >> (q * 2)) & 3;
        var qr = ar * 4 + NAM_QUADS[q][0] * 2, qc = ac * 4 + NAM_QUADS[q][1] * 2;
        for (var dr = 0; dr < 2; dr++) for (var dc = 0; dc < 2; dc++) {
          var rr = qr + dr, cc = qc + dc;
          if (rr < 30 && cc < 32 && nt[rr] && nt[rr][cc]) nt[rr][cc].palette = pal;
        }
      }
    }
    Storage.saveCurrent(state);
    renderLive(); renderDock(); refreshQuestsAndAttention();
    setSaveState('saved');
    return true;
  }
  function downloadBytes(bytes, filename) {
    var blob = new Blob([bytes], { type: 'application/octet-stream' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
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

  // ---- Engine version advisor (E-V3) ------------------------------------
  function projectEngine() { return (state && state.engineVersion) | 0 || 1; }
  function latestEngine() { return window.NES_ENGINE_VERSION || 1; }
  function refreshEngineButton() {
    var b = $('btn-engine'); if (!b) return;
    var outdated = projectEngine() < latestEngine();
    b.textContent = '⚙ Engine v' + projectEngine();
    b.classList.toggle('primary', outdated);
    b.title = outdated
      ? 'This game was made with engine v' + projectEngine() + '. Latest is v' + latestEngine() + ' — see what changed.'
      : 'Engine v' + projectEngine() + ' (latest).';
  }
  // Parse tools/engines/CHANGELOG.md into { version, body } entries.
  function parseChangelog(md) {
    var entries = [], cur = null;
    md.split('\n').forEach(function (line) {
      var m = line.match(/^##\s+v(\d+)\b(.*)$/);
      if (m) { cur = { version: parseInt(m[1], 10), heading: 'v' + m[1] + (m[2] || ''), lines: [] }; entries.push(cur); }
      else if (cur) cur.lines.push(line);
    });
    return entries;
  }
  function openEngineAdvisor() {
    var bd = document.createElement('div');
    bd.className = 'modal-backdrop open';
    var proj = projectEngine(), latest = latestEngine();
    bd.innerHTML = '<div class="modal" role="dialog" aria-modal="true">' +
      '<h2>⚙ NES engine</h2>' +
      '<div class="modal-sub">This game targets engine <b>v' + proj + '</b>. Latest is <b>v' + latest + '</b>.</div>' +
      '<div id="engine-advisor-body" style="font-size:12px;line-height:1.6;color:var(--muted);max-height:50vh;overflow:auto">Loading changelog…</div>' +
      '<div class="modal-actions">' +
        (proj < latest ? '<button class="btn primary" id="engine-update" type="button">Update this game to v' + latest + '</button>' : '') +
        '<button class="btn" id="engine-close" type="button">Close</button>' +
      '</div></div>';
    document.body.appendChild(bd);
    function close() { if (bd.parentNode) bd.parentNode.removeChild(bd); }
    bd.addEventListener('click', function (e) { if (e.target === bd) close(); });
    bd.querySelector('#engine-close').addEventListener('click', close);
    var upd = bd.querySelector('#engine-update');
    if (upd) upd.addEventListener('click', function () {
      pushUndo();
      state.engineVersion = latest;
      markDirty(); refreshEngineButton();
      close();
    });
    fetch('engine/CHANGELOG.md', { cache: 'no-store' }).then(function (r) { return r.text(); }).then(function (md) {
      var body = document.getElementById('engine-advisor-body'); if (!body) return;
      var entries = parseChangelog(md).filter(function (e) { return e.version > proj; });
      if (!entries.length) { body.textContent = proj >= latest ? 'You are on the latest engine — nothing to update.' : 'No changelog entries found.'; return; }
      body.innerHTML = '<p><strong style="color:var(--text)">What changed since your engine (v' + proj + '):</strong></p>' +
        entries.map(function (e) {
          return '<div style="margin-top:8px"><strong style="color:var(--accent)">' + escapeHtml(e.heading) + '</strong><br>' +
            escapeHtml(e.lines.join('\n').trim()).replace(/\n/g, '<br>') + '</div>';
        }).join('');
    }).catch(function () {
      var body = document.getElementById('engine-advisor-body');
      if (body) body.textContent = 'Could not load the changelog.';
    });
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

    // Load the active project, but never boot into a broken/empty state:
    // if the stored project is missing, invalid, or throws while migrating,
    // fall back to a fresh starter game so the Studio is always usable.
    try {
      state = Storage.bootstrapCurrent(function () { return window.StudioStarter.create(); });
      state = migrateState(state);
      if (validateState(state)) throw new Error('invalid project: ' + validateState(state));
    } catch (e) {
      console.warn('[studio] could not load the saved project — starting a fresh game.', e);
      state = window.StudioStarter.create();
      try { Storage.createProject(state.name || 'My Game', state); } catch (e2) {}
    }
    // Guard against a technically-valid but contentless project (no
    // backgrounds / no sprites) that would look like "nothing loaded".
    if (!Array.isArray(state.backgrounds) || !state.backgrounds.length
        || !Array.isArray(state.sprites) || !state.sprites.length) {
      var seeded = window.StudioStarter.create();
      // Keep any name the pupil had chosen.
      if (state && state.name) seeded.name = state.name;
      state = seeded;
    }
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
    $('tm-export').addEventListener('click', exportProject);
    $('tm-import').addEventListener('click', function () { $('tm-import-file').click(); });
    $('tm-import-file').addEventListener('change', function () {
      var f = this.files[0]; if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        if (importProjectText(String(reader.result || ''))) $('tm-backdrop').classList.remove('open');
      };
      reader.readAsText(f);
      this.value = '';
    });
    $('tm-export-chr').addEventListener('click', exportChr);
    $('tm-import-chr').addEventListener('click', function () { $('tm-import-chr-file').click(); });
    $('tm-import-chr-file').addEventListener('change', function () {
      var f = this.files[0]; if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        if (importChrBytes(new Uint8Array(reader.result))) $('tm-backdrop').classList.remove('open');
      };
      reader.readAsArrayBuffer(f);
      this.value = '';
    });
    // .pal / .nam export + import (same pattern as .chr).
    function wireBinIo(exportId, importBtnId, fileId, encodeFn, ext, importFn) {
      $(exportId).addEventListener('click', function () {
        var bytes = encodeFn();
        if (bytes) downloadBytes(bytes, (state.name || 'game').replace(/[^a-zA-Z0-9_-]+/g, '_') + ext);
      });
      $(importBtnId).addEventListener('click', function () { $(fileId).click(); });
      $(fileId).addEventListener('change', function () {
        var f = this.files[0]; if (!f) return;
        var reader = new FileReader();
        reader.onload = function () {
          if (importFn(new Uint8Array(reader.result))) $('tm-backdrop').classList.remove('open');
        };
        reader.readAsArrayBuffer(f);
        this.value = '';
      });
    }
    wireBinIo('tm-export-pal', 'tm-import-pal', 'tm-import-pal-file', function () { return encodePal(state); }, '.pal', importPalBytes);
    wireBinIo('tm-export-nam', 'tm-import-nam', 'tm-import-nam-file', function () {
      var bg = activeBackground();
      if (bg && bg.tileMode === '16x16') { alert('This background uses 16×16 blocks — revert to 8×8 to export a .nam.'); return null; }
      return encodeNam(bg);
    }, '.nam', importNamBytes);
    $('tm-backdrop').addEventListener('click', function (e) {
      if (e.target === $('tm-backdrop')) $('tm-backdrop').classList.remove('open');
    });
    $('btn-help').addEventListener('click', openHelp);
    $('btn-engine').addEventListener('click', openEngineAdvisor);
    $('level-select').addEventListener('change', onLevelChange);
    $('btn-new-game').addEventListener('click', onNewGame);
    // Let the shared account menu offer "Load a starter game" too (bug: the
    // starter/projects aren't loading) — available even when signed out.
    window.onLoadStarterGame = onNewGame;
    if (window.AccountMenu && typeof window.AccountMenu.refresh === 'function') {
      try { window.AccountMenu.refresh(); } catch (e) {}
    }

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
      updateCoords(evt);
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
      var cel = $('tv-coords'); if (cel) cel.textContent = (currentMode === 'world') ? 'x –, y –' : '';
      tvDispatch('onTvLeave', evt);
    });

    // Resizable edit column — drag the dock's right edge; width persists.
    (function () {
      var resizer = $('dock-resizer'); if (!resizer) return;
      try {
        var saved = parseInt(localStorage.getItem('studio.dockWidth'), 10);
        if (saved >= 220 && saved <= 640) document.documentElement.style.setProperty('--dock-w', saved + 'px');
      } catch (e) {}
      var dragging = false;
      resizer.addEventListener('pointerdown', function (evt) {
        evt.preventDefault(); dragging = true; resizer.classList.add('dragging');
        try { resizer.setPointerCapture(evt.pointerId); } catch (e) {}
      });
      resizer.addEventListener('pointermove', function (evt) {
        if (!dragging) return;
        var left = resizer.parentNode.getBoundingClientRect().left;
        var w = Math.max(220, Math.min(640, Math.round(evt.clientX - left)));
        document.documentElement.style.setProperty('--dock-w', w + 'px');
      });
      function endResize() {
        if (!dragging) return; dragging = false; resizer.classList.remove('dragging');
        var w = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--dock-w'), 10);
        try { if (w) localStorage.setItem('studio.dockWidth', w); } catch (e) {}
      }
      resizer.addEventListener('pointerup', endResize);
      resizer.addEventListener('pointercancel', endResize);
      resizer.addEventListener('dblclick', function () {
        document.documentElement.style.setProperty('--dock-w', '310px');
        try { localStorage.setItem('studio.dockWidth', '310'); } catch (e) {}
      });
    })();
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
      exportJson: function () { return JSON.stringify(state); },
      importText: importProjectText,
      scanlineLoad: function () { return computeScanlineLoad(state); },
      exportChrBytes: function () { return encodeChr(state); },
      importChrBytes: importChrBytes,
      exportPalBytes: function () { return encodePal(state); },
      importPalBytes: importPalBytes,
      exportNamBytes: function () { return encodeNam(activeBackground()); },
      importNamBytes: importNamBytes,
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
