/*
 * WORLD mode (redesign Phase 1.1).
 *
 * Stamp tiles, colour and tile-types onto the *live* nametable in the TV,
 * and manage the project's backgrounds. Reads/writes the same schema the
 * old Backgrounds + Behaviour pages use: state.backgrounds[i].nametable
 * (32×30 of {tile,palette}) and .behaviour (32×30 of type ids).
 *
 * Absorbs: index.html tile/palette painting + behaviour.html tile-type
 * painting + background management. Metatile (16×16) block editing is a
 * later pass — this handles 8×8 backgrounds (the starter + default).
 */
(function (global) {
  'use strict';
  var UI = global.StudioUI;
  var el = UI.el;
  var SCREEN_W = 32, SCREEN_H = 30;

  var stampTile = 1;     // selected bg tile to paint
  var paintPalette = 0;  // selected bg palette (0-3)
  var paintType = 1;     // selected behaviour type id (solid_ground)
  var showGrid = true;
  var hover = null;      // {cx,cy}
  var placeChar = -1;    // sprite index the Place tool drops (-1 = auto)
  var selInst = null;    // selected scene-instance id
  var dragInst = false;

  // Scene instances live on the builder tree (state.builder.modules.scene).
  function sceneInstances(ctx) {
    var s = ctx.getState();
    if (!s.builder || !s.builder.modules) return [];
    var node = s.builder.modules.scene;
    if (!node) return [];
    if (!node.config) node.config = {};
    if (!Array.isArray(node.config.instances)) node.config.instances = [];
    return node.config.instances;
  }
  function nextInstId(list) { var m = 0; list.forEach(function (i) { if ((i.id | 0) > m) m = i.id | 0; }); return m + 1; }
  function spriteSize(state, idx) {
    var sp = (state.sprites || [])[idx];
    return { w: (sp && sp.width ? sp.width : 2) * 8, h: (sp && sp.height ? sp.height : 2) * 8 };
  }
  function defaultPlaceChar(state) {
    var arr = state.sprites || [];
    for (var i = 0; i < arr.length; i++) if (arr[i] && arr[i].role !== 'player') return i;
    return arr.length ? 0 : -1;
  }
  function instanceAt(ctx, px, py) {
    var state = ctx.getState();
    var list = sceneInstances(ctx);
    for (var i = list.length - 1; i >= 0; i--) {
      var sz = spriteSize(state, list[i].spriteIdx);
      if (px >= list[i].x && px < list[i].x + sz.w && py >= list[i].y && py < list[i].y + sz.h) return list[i];
    }
    return null;
  }

  function activeBg(ctx) {
    var s = ctx.getState();
    return s.backgrounds[s.selectedBgIdx] || s.backgrounds[0];
  }
  function isMetatileBg(bg) { return bg && bg.tileMode === '16x16'; }

  function ensureBehaviour(bg) {
    if (!Array.isArray(bg.behaviour) || bg.behaviour.length !== SCREEN_H) {
      bg.behaviour = [];
      for (var r = 0; r < SCREEN_H; r++) {
        var row = [];
        for (var c = 0; c < SCREEN_W; c++) row.push(0);
        bg.behaviour.push(row);
      }
    }
    return bg.behaviour;
  }

  // ---- Painting ----------------------------------------------------------
  function paintCell(ctx, cx, cy) {
    var s = ctx.getState();
    var bg = activeBg(ctx);
    if (isMetatileBg(bg)) return;
    var nt = bg.nametable;
    if (!nt[cy] || !nt[cy][cx]) return;
    var tool = ctx.getActiveTool();
    if (tool === 'stamp') {
      nt[cy][cx] = { tile: stampTile, palette: paintPalette };
    } else if (tool === 'erase') {
      nt[cy][cx] = { tile: 0, palette: 0 };
    } else if (tool === 'palette') {
      // Attribute granularity: a whole 2×2 quadrant shares one palette.
      var qx = cx - (cx % 2), qy = cy - (cy % 2);
      for (var dy = 0; dy < 2; dy++) for (var dx = 0; dx < 2; dx++) {
        var yy = qy + dy, xx = qx + dx;
        if (nt[yy] && nt[yy][xx]) nt[yy][xx].palette = paintPalette;
      }
    } else if (tool === 'type') {
      ensureBehaviour(bg)[cy][cx] = paintType;
    }
  }

  function floodFill(ctx, cx, cy) {
    var bg = activeBg(ctx);
    if (isMetatileBg(bg)) return;
    var nt = bg.nametable;
    var tool = ctx.getActiveTool();
    if (tool === 'type') {
      var beh = ensureBehaviour(bg);
      var fromT = beh[cy][cx];
      if (fromT === paintType) return;
      floodGeneric(cx, cy, function (x, y) { return beh[y][x] === fromT; },
        function (x, y) { beh[y][x] = paintType; });
      return;
    }
    var target = nt[cy][cx];
    var fromTile = target.tile, fromPal = target.palette;
    var toTile = tool === 'erase' ? 0 : stampTile;
    var toPal = tool === 'erase' ? 0 : paintPalette;
    if (fromTile === toTile && fromPal === toPal) return;
    floodGeneric(cx, cy,
      function (x, y) { return nt[y][x].tile === fromTile && nt[y][x].palette === fromPal; },
      function (x, y) { nt[y][x] = { tile: toTile, palette: toPal }; });
  }
  function floodGeneric(sx, sy, match, set) {
    var stack = [[sx, sy]], seen = {};
    while (stack.length) {
      var p = stack.pop(), x = p[0], y = p[1];
      if (x < 0 || y < 0 || x >= SCREEN_W || y >= SCREEN_H) continue;
      var k = x + ',' + y;
      if (seen[k]) continue;
      if (!match(x, y)) continue;
      seen[k] = 1; set(x, y);
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
  }

  // ---- Region select / copy / paste -------------------------------------
  var selRect = null;     // {x0,y0,x1,y1} in cell coords (may be un-normalised while dragging)
  var selecting = false;
  var clipboard = null;   // 2D array of {tile,palette}
  function normRect(r) {
    return { x0: Math.min(r.x0, r.x1), y0: Math.min(r.y0, r.y1),
             x1: Math.max(r.x0, r.x1), y1: Math.max(r.y0, r.y1) };
  }
  function copyRegion(ctx) {
    if (!selRect) return;
    var bg = activeBg(ctx); if (isMetatileBg(bg)) return;
    var r = normRect(selRect), nt = bg.nametable, rows = [];
    for (var y = r.y0; y <= r.y1; y++) {
      var row = [];
      for (var x = r.x0; x <= r.x1; x++) {
        var c = (nt[y] && nt[y][x]) || { tile: 0, palette: 0 };
        row.push({ tile: c.tile | 0, palette: c.palette | 0 });
      }
      rows.push(row);
    }
    clipboard = rows;
  }
  function pasteRegion(ctx) {
    if (!clipboard || !selRect) return;
    var bg = activeBg(ctx); if (isMetatileBg(bg)) return;
    var r = normRect(selRect), nt = bg.nametable;
    ctx.pushUndo();
    for (var dy = 0; dy < clipboard.length; dy++) {
      for (var dx = 0; dx < clipboard[dy].length; dx++) {
        var yy = r.y0 + dy, xx = r.x0 + dx;
        if (yy >= SCREEN_H || xx >= SCREEN_W) continue;
        if (nt[yy] && nt[yy][xx]) nt[yy][xx] = { tile: clipboard[dy][dx].tile, palette: clipboard[dy][dx].palette };
      }
    }
    ctx.markDirty(); ctx.renderLive();
  }
  function clearRegion(ctx) {
    if (!selRect) return;
    var bg = activeBg(ctx); if (isMetatileBg(bg)) return;
    var r = normRect(selRect), nt = bg.nametable;
    ctx.pushUndo();
    for (var y = r.y0; y <= r.y1; y++) for (var x = r.x0; x <= r.x1; x++) {
      if (nt[y] && nt[y][x]) nt[y][x] = { tile: 0, palette: 0 };
    }
    ctx.markDirty(); ctx.renderLive();
  }

  var strokeOpen = false;
  function beginStroke(ctx, cell) {
    if (!cell.inBounds) return;
    ctx.pushUndo();
    strokeOpen = true;
    var tool = ctx.getActiveTool();
    if (tool === 'fill') floodFill(ctx, cell.cx, cell.cy);
    else paintCell(ctx, cell.cx, cell.cy);
    ctx.renderLive();
  }

  // ---- Entity placement --------------------------------------------------
  function placeDown(ctx, cell) {
    if (!cell.inBounds) return;
    var state = ctx.getState();
    var hit = instanceAt(ctx, cell.px, cell.py);
    if (hit) { selInst = hit.id; dragInst = true; ctx.renderDock(); ctx.renderLive(); return; }
    var idx = placeChar >= 0 ? placeChar : defaultPlaceChar(state);
    if (idx < 0) { alert('Make a character in CHARS first.'); return; }
    ctx.pushUndo();
    var list = sceneInstances(ctx);
    var sz = spriteSize(state, idx);
    var inst = { id: nextInstId(list), spriteIdx: idx,
      x: Math.max(0, Math.min(256 - sz.w, Math.round(cell.px - sz.w / 2))),
      y: Math.max(0, Math.min(240 - sz.h, Math.round(cell.py - sz.h / 2))),
      ai: 'static', speed: 1 };
    list.push(inst);
    selInst = inst.id;
    ctx.markDirty(); ctx.renderDock(); ctx.renderLive();
  }
  function moveSelected(ctx, cell) {
    var state = ctx.getState();
    var list = sceneInstances(ctx);
    var inst = list.find(function (i) { return i.id === selInst; });
    if (!inst) return;
    var sz = spriteSize(state, inst.spriteIdx);
    inst.x = Math.max(0, Math.min(256 - sz.w, Math.round(cell.px - sz.w / 2)));
    inst.y = Math.max(0, Math.min(240 - sz.h, Math.round(cell.py - sz.h / 2)));
    ctx.renderLive();
  }

  // ---- Overlay (entities + grid + hover) --------------------------------
  var _octx = null; // set each render so overlay can read state
  function drawInstances(g) {
    if (!_octx) return;
    var state = _octx.getState();
    var list = sceneInstances(_octx);
    list.forEach(function (inst) {
      var sp = (state.sprites || [])[inst.spriteIdx];
      if (!sp) return;
      var sz = spriteSize(state, inst.spriteIdx);
      var off = document.createElement('canvas');
      off.width = sz.w; off.height = sz.h;
      global.NesRender.drawSpriteIntoCtx(off.getContext('2d'), sp, state, sz.w, sz.h);
      g.imageSmoothingEnabled = false;
      g.drawImage(off, inst.x, inst.y);
      if (inst.id === selInst) {
        g.strokeStyle = '#2CD5F6'; g.lineWidth = 1;
        g.strokeRect(inst.x - 0.5, inst.y - 0.5, sz.w + 1, sz.h + 1);
      }
    });
  }
  function onRenderOverlay(g, ctx) {
    _octx = ctx;
    drawInstances(g);
    if (!showGrid && !hover) return;
    if (showGrid) {
      g.globalAlpha = 0.25;
      g.strokeStyle = '#000';
      g.lineWidth = 1;
      for (var x = 0; x <= SCREEN_W; x++) { g.beginPath(); g.moveTo(x * 8 + 0.5, 0); g.lineTo(x * 8 + 0.5, 240); g.stroke(); }
      for (var y = 0; y <= SCREEN_H; y++) { g.beginPath(); g.moveTo(0, y * 8 + 0.5); g.lineTo(256, y * 8 + 0.5); g.stroke(); }
      // 2×2 attribute chunk lines, brighter.
      g.globalAlpha = 0.5; g.strokeStyle = '#2CD5F6';
      for (var ax = 0; ax <= SCREEN_W; ax += 2) { g.beginPath(); g.moveTo(ax * 8 + 0.5, 0); g.lineTo(ax * 8 + 0.5, 240); g.stroke(); }
      for (var ay = 0; ay <= SCREEN_H; ay += 2) { g.beginPath(); g.moveTo(0, ay * 8 + 0.5); g.lineTo(256, ay * 8 + 0.5); g.stroke(); }
      g.globalAlpha = 1;
    }
    if (hover) {
      g.strokeStyle = '#FA9E00'; g.lineWidth = 2;
      g.strokeRect(hover.cx * 8, hover.cy * 8, 8, 8);
    }
    if (selRect) {
      var r = normRect(selRect);
      g.strokeStyle = '#43F611'; g.lineWidth = 2;
      g.strokeRect(r.x0 * 8, r.y0 * 8, (r.x1 - r.x0 + 1) * 8, (r.y1 - r.y0 + 1) * 8);
      g.globalAlpha = 0.12; g.fillStyle = '#43F611';
      g.fillRect(r.x0 * 8, r.y0 * 8, (r.x1 - r.x0 + 1) * 8, (r.y1 - r.y0 + 1) * 8);
      g.globalAlpha = 1;
    }
  }

  // ---- Dock --------------------------------------------------------------
  var BEH_LABELS = {
    0: 'None', 1: 'Solid ground', 2: 'Wall', 3: 'Platform',
    4: 'Door', 5: 'Trigger', 6: 'Ladder',
  };

  function renderDock(dock, ctx) {
    var s = ctx.getState();

    // --- Backgrounds ---
    var bgSec = UI.section('Backgrounds');
    (s.backgrounds || []).forEach(function (bg, idx) {
      var row = el('div', { class: 'entity-row bg-row' + (idx === s.selectedBgIdx ? ' sel' : '') }, [
        el('span', { class: 'grow', text: bg.name || ('background ' + (idx + 1)) }),
        el('button', { class: 'icon-btn', title: 'Rename', text: '✎', onclick: function (e) {
          e.stopPropagation();
          var name = prompt('Rename background', bg.name || '');
          if (name != null) { bg.name = name; ctx.markDirty(); ctx.renderDock(); }
        } }),
        el('button', { class: 'icon-btn', title: 'Delete', text: '🗑', onclick: function (e) {
          e.stopPropagation();
          if (s.backgrounds.length <= 1) { alert('Keep at least one background.'); return; }
          if (!confirm('Delete "' + (bg.name || 'background') + '"?')) return;
          ctx.pushUndo();
          s.backgrounds.splice(idx, 1);
          s.selectedBgIdx = Math.max(0, s.selectedBgIdx - (idx <= s.selectedBgIdx ? 1 : 0));
          ctx.markDirty(); ctx.renderLive(); ctx.renderDock();
        } }),
      ]);
      row.addEventListener('click', function () {
        s.selectedBgIdx = idx; ctx.renderLive(); ctx.renderDock(); ctx.markDirty();
      });
      bgSec.appendChild(row);
    });
    bgSec.appendChild(el('div', { class: 'row', style: 'margin-top:6px' }, [
      el('button', { class: 'btn', id: 'world-add-bg', text: '+ New', onclick: function () {
        ctx.pushUndo();
        var fresh = global.StudioStarter.create();
        var nb = fresh.backgrounds[0];
        nb.name = 'background ' + (s.backgrounds.length + 1);
        s.backgrounds.push(nb);
        s.selectedBgIdx = s.backgrounds.length - 1;
        ctx.renderLive(); ctx.renderDock(); ctx.markDirty();
      } }),
      el('button', { class: 'btn', text: 'Duplicate', onclick: function () {
        ctx.pushUndo();
        var copy = JSON.parse(JSON.stringify(s.backgrounds[s.selectedBgIdx]));
        copy.name = (copy.name || 'background') + ' copy';
        s.backgrounds.push(copy); s.selectedBgIdx = s.backgrounds.length - 1;
        ctx.renderLive(); ctx.renderDock(); ctx.markDirty();
      } }),
    ]));
    dock.appendChild(bgSec);

    var bg = activeBg(ctx);
    if (isMetatileBg(bg)) {
      dock.appendChild(el('div', { class: 'placeholder', style: 'margin-top:12px',
        text: 'This background uses 16×16 blocks. Block editing arrives in a later pass — 8×8 backgrounds paint fully here.' }));
      return;
    }

    // --- Paint palette ---
    var palSec = UI.section('Paint colour');
    for (var p = 0; p < 4; p++) (function (pi) {
      var strip = el('div', { class: 'pal-strip' + (pi === paintPalette ? ' sel' : ''),
        onclick: function () { paintPalette = pi; ctx.renderDock(); } }, [
        el('span', { class: 'label', text: 'BG ' + pi }),
      ]);
      var pal = (s.bg_palettes[pi] || { slots: [0, 0, 0] }).slots;
      strip.appendChild(swatchEl(global.NesRender.nesRgb(s.universal_bg), 'backdrop'));
      pal.forEach(function (c) { strip.appendChild(swatchEl(global.NesRender.nesRgb(c))); });
      palSec.appendChild(strip);
    })(p);
    palSec.appendChild(el('div', { class: 'dock-note', text: 'Backdrop colour is shared by every palette. Colour is chosen per 2×2 block on the NES — use the 🎨 Colour tool.' }));
    dock.appendChild(palSec);

    // --- Tiles ---
    var tileSec = UI.section('Tiles', el('span', { class: 'chip', text: 'stamp' }));
    var grid = el('div', { class: 'tile-grid' });
    var count = 64;
    for (var i = 0; i < count; i++) (function (idx) {
      var used = UI.bgTileUsage(s, idx) > 0;
      var blank = UI.isTileBlank(s.bg_tiles[idx]);
      var cell = el('button', { class: 'tile-cell' + (idx === stampTile ? ' sel' : '') + (used && !blank ? ' used' : ''),
        title: 'Tile ' + idx + (used ? ' (in use)' : ''),
        onclick: function () { stampTile = idx; ctx.renderDock(); } });
      cell.appendChild(UI.bgTileCanvas(s, s.bg_tiles[idx], paintPalette, 28));
      grid.appendChild(cell);
    })(i);
    tileSec.appendChild(grid);
    tileSec.appendChild(el('div', { class: 'dock-note', text: 'Pick a tile, then paint it onto the screen. Right-click a screen cell to pick up its tile.' }));
    dock.appendChild(tileSec);

    // --- Tile type (behaviour) ---
    var typeSec = UI.section('Tile type', el('span', { class: 'chip', text: 'what it does' }));
    Object.keys(BEH_LABELS).forEach(function (id) {
      id = +id;
      var row = el('div', { class: 'entity-row' + (id === paintType ? ' sel' : ''),
        onclick: function () { paintType = id; ctx.renderDock(); } }, [
        el('span', { class: 'grow', text: BEH_LABELS[id] }),
      ]);
      typeSec.appendChild(row);
    });
    typeSec.appendChild(el('div', { class: 'dock-note', text: 'With the ⛰ Type tool, paint what each tile does — solid ground and platforms are what your hero stands on.' }));
    dock.appendChild(typeSec);

    // --- Entities (scene instances) ---
    var entSec = UI.section('Entities', el('span', { class: 'chip', text: 'place' }));
    var chars = s.sprites || [];
    var placeSel = el('select', { 'data-place-char': '1' });
    if (placeChar < 0) placeChar = defaultPlaceChar(s);
    chars.forEach(function (sp, i) {
      if (sp.role === 'player') return; // players are placed via RULES start X/Y
      placeSel.appendChild(el('option', { value: i, text: (sp.name || 'character ' + i) + ' (' + sp.role + ')' }));
    });
    placeSel.value = String(placeChar);
    placeSel.addEventListener('change', function () { placeChar = parseInt(placeSel.value, 10); });
    entSec.appendChild(el('div', { class: 'field' }, [el('span', { text: 'Character to place' }), placeSel]));
    entSec.appendChild(el('div', { class: 'dock-note', text: 'Pick the 🧍 Place tool, then click the screen to drop a character. Click one to select and drag it.' }));

    var list = sceneInstances(ctx);
    list.forEach(function (inst) {
      var sp = chars[inst.spriteIdx];
      var row = el('div', { class: 'entity-row ent-row' + (inst.id === selInst ? ' sel' : '') }, [
        el('span', { class: 'grow', text: (sp && sp.name ? sp.name : 'char') + ' @ ' + inst.x + ',' + inst.y }),
        el('button', { class: 'icon-btn', title: 'Delete', text: '🗑', onclick: function (e) {
          e.stopPropagation();
          ctx.pushUndo();
          var i = list.indexOf(inst); if (i >= 0) list.splice(i, 1);
          if (selInst === inst.id) selInst = null;
          ctx.markDirty(); ctx.renderDock(); ctx.renderLive();
        } }),
      ]);
      row.addEventListener('click', function () { selInst = inst.id; ctx.renderDock(); ctx.renderLive(); });
      entSec.appendChild(row);
    });

    // Per-instance config for the selected entity.
    var selected = list.find(function (i) { return i.id === selInst; });
    if (selected) {
      var cfg = el('div', { style: 'border:2px solid var(--sel);padding:8px;margin-top:6px' });
      cfg.appendChild(el('div', { class: 'dock-note', style: 'color:var(--sel)', text: 'Selected entity' }));
      // Character
      var cSel = el('select');
      chars.forEach(function (sp, i) { if (sp.role !== 'player') cSel.appendChild(el('option', { value: i, text: sp.name || ('character ' + i) })); });
      cSel.value = String(selected.spriteIdx);
      cSel.addEventListener('change', function () { ctx.pushUndo(); selected.spriteIdx = parseInt(cSel.value, 10); ctx.markDirty(); ctx.renderDock(); ctx.renderLive(); });
      cfg.appendChild(el('div', { class: 'field' }, [el('span', { text: 'Character' }), cSel]));
      // AI
      var aiSel = el('select', { 'data-ent-ai': '1' });
      ['static', 'walker', 'chaser'].forEach(function (a) { aiSel.appendChild(el('option', { value: a, text: a })); });
      aiSel.value = selected.ai || 'static';
      aiSel.addEventListener('change', function () { ctx.pushUndo(); selected.ai = aiSel.value; ctx.markDirty(); });
      cfg.appendChild(el('div', { class: 'field' }, [el('span', { text: 'AI' }), aiSel]));
      // Speed
      var spd = el('input', { type: 'number', min: 1, max: 4 }); spd.value = selected.speed || 1;
      spd.addEventListener('change', function () { ctx.pushUndo(); selected.speed = Math.max(1, Math.min(4, parseInt(spd.value, 10) || 1)); ctx.markDirty(); });
      cfg.appendChild(el('div', { class: 'field' }, [el('span', { text: 'Speed (1–4)' }), spd]));
      // X / Y
      var xy = el('div', { class: 'row' }, [
        el('span', { text: 'X' }), numInput(ctx, selected, 'x', 0, 248),
        el('span', { text: 'Y' }), numInput(ctx, selected, 'y', 0, 232),
      ]);
      cfg.appendChild(el('div', { class: 'field' }, [xy]));
      entSec.appendChild(cfg);
    }
    dock.appendChild(entSec);

    // --- Selection / clipboard (region copy-paste) ---
    var selSec = UI.section('Selection', el('span', { class: 'chip', text: '▦ region' }));
    selSec.appendChild(el('div', { class: 'dock-note', text: selRect
      ? 'Region ' + (normRect(selRect).x1 - normRect(selRect).x0 + 1) + '×' + (normRect(selRect).y1 - normRect(selRect).y0 + 1)
        + ' selected. Copy it, then select a spot and Paste (paste anchors at the region’s top-left).'
      : 'Pick ▦ Select and drag a box on the screen to copy/paste chunks of your level.' }));
    selSec.appendChild(el('div', { class: 'row' }, [
      el('button', { class: 'btn', text: '⧉ Copy', onclick: function () { copyRegion(ctx); ctx.renderDock(); } }),
      el('button', { class: 'btn' + (clipboard ? '' : ' disabled'), text: '📋 Paste',
        onclick: function () { if (clipboard) pasteRegion(ctx); } }),
    ]));
    selSec.appendChild(el('div', { class: 'row', style: 'margin-top:4px' }, [
      el('button', { class: 'btn', text: '⌫ Clear region', onclick: function () { clearRegion(ctx); } }),
      el('button', { class: 'btn', text: '✕ Deselect', onclick: function () { selRect = null; ctx.renderLive(); ctx.renderDock(); } }),
    ]));
    if (clipboard) selSec.appendChild(el('div', { class: 'dock-note', text: 'Clipboard holds ' + clipboard[0].length + '×' + clipboard.length + ' tiles.' }));
    dock.appendChild(selSec);

    // --- Full-screen preview ---
    var prevSec = el('div', { class: 'dock-section' }, [
      el('button', { class: 'btn', text: '⛶ Full-screen preview', onclick: function () { openPreview(ctx); } }),
    ]);
    dock.appendChild(prevSec);

    // --- Grid toggle ---
    var gridSec = el('div', { class: 'dock-section' }, [
      el('label', { class: 'switch' }, [
        (function () { var c = el('input', { type: 'checkbox' }); c.checked = showGrid;
          c.addEventListener('change', function () { showGrid = c.checked; ctx.renderLive(); }); return c; })(),
        el('span', { text: 'Show grid' }),
      ]),
    ]);
    dock.appendChild(gridSec);
  }

  // Render a background's nametable cleanly (no grid/entities) into a canvas.
  function renderBgInto(cv, bg, state, scale) {
    var g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    var backdrop = global.NesRender.nesRgb(state.universal_bg);
    g.fillStyle = backdrop; g.fillRect(0, 0, cv.width, cv.height);
    if (isMetatileBg(bg)) return;
    var nt = bg.nametable;
    for (var cy = 0; cy < SCREEN_H; cy++) for (var cx = 0; cx < SCREEN_W; cx++) {
      var c = (nt[cy] && nt[cy][cx]) || { tile: 0, palette: 0 };
      var tile = state.bg_tiles[c.tile | 0];
      var pal = global.NesRender.bgPaletteFor(state, c.palette | 0);
      UI.drawTilePixels(g, tile, pal, cx * 8 * scale, cy * 8 * scale, scale);
    }
  }
  function openPreview(ctx) {
    var state = ctx.getState();
    var bg = activeBg(ctx);
    var scale = 2;
    var cv = el('canvas', { width: SCREEN_W * 8 * scale, height: SCREEN_H * 8 * scale,
      style: 'image-rendering:pixelated;max-width:100%;border:2px solid var(--line);display:block;margin:0 auto' });
    renderBgInto(cv, bg, state, scale);
    UI.modal({
      title: '⛶ ' + (bg.name || 'background'),
      sub: 'Full-screen preview — the background exactly as the NES draws it (no grid or entities).',
      bodyNodes: [cv],
      actions: [{ label: 'Close', value: 'close', kind: 'primary' }],
    });
  }

  function swatchEl(css, cls) {
    return el('span', { class: 'swatch' + (cls ? ' ' + cls : ''), style: 'width:18px;height:18px;background:' + css });
  }
  function numInput(ctx, obj, key, min, max) {
    var n = el('input', { type: 'number', min: min, max: max, style: 'width:56px' });
    n.value = obj[key];
    n.addEventListener('change', function () {
      var v = parseInt(n.value, 10); if (isNaN(v)) return;
      ctx.pushUndo(); obj[key] = Math.max(min, Math.min(max, v));
      ctx.markDirty(); ctx.renderLive();
    });
    return n;
  }

  global.StudioModes = global.StudioModes || {};
  global.StudioModes.world = {
    hidePlayerPreview: false,
    stageTools: [
      { id: 'stamp', label: '🖌 Stamp' },
      { id: 'erase', label: '🩹 Erase' },
    ],
    moreTools: [
      { id: 'fill', label: '🪣 Fill' },
      { id: 'palette', label: '🎨 Colour' },
      { id: 'type', label: '⛰ Type' },
      { id: 'place', label: '🧍 Place' },
      { id: 'select', label: '▦ Select' },
    ],
    renderDock: renderDock,
    onRenderOverlay: onRenderOverlay,
    onEnter: function () { hover = null; selecting = false; },
    onToolChange: function (id, ctx) { ctx.renderDock(); ctx.renderLive(); },
    onTvDown: function (cell, ctx) {
      var tool = ctx.getActiveTool();
      if (tool === 'place') { placeDown(ctx, cell); return; }
      if (tool === 'select') {
        if (!cell.inBounds) return;
        selecting = true; selRect = { x0: cell.cx, y0: cell.cy, x1: cell.cx, y1: cell.cy };
        ctx.renderLive(); return;
      }
      beginStroke(ctx, cell);
    },
    onTvMove: function (cell, ctx) {
      var tool = ctx.getActiveTool();
      if (tool === 'place') { if (dragInst) moveSelected(ctx, cell); return; }
      if (tool === 'select') {
        if (!selecting || !cell.inBounds) return;
        selRect.x1 = cell.cx; selRect.y1 = cell.cy; ctx.renderLive(); return;
      }
      if (!strokeOpen || !cell.inBounds) return;
      if (tool === 'fill') return; // fill is a single action
      paintCell(ctx, cell.cx, cell.cy);
      ctx.renderLive();
    },
    onTvUp: function (cell, ctx) {
      if (selecting) { selecting = false; selRect = normRect(selRect); ctx.renderDock(); return; }
      if (dragInst) { dragInst = false; ctx.markDirty(); ctx.renderDock(); return; }
      if (strokeOpen) { strokeOpen = false; ctx.markDirty(); ctx.refresh(); }
    },
    onTvHover: function (cell, ctx) {
      var h = cell.inBounds ? { cx: cell.cx, cy: cell.cy } : null;
      if (!h && !hover) return;
      if (h && hover && h.cx === hover.cx && h.cy === hover.cy) return;
      hover = h; ctx.renderLive();
    },
    onTvLeave: function (cell, ctx) { if (hover) { hover = null; ctx.renderLive(); } },
    onTvRightClick: function (cell, ctx) {
      var bg = activeBg(ctx);
      if (isMetatileBg(bg) || !cell.inBounds) return;
      var c = bg.nametable[cell.cy] && bg.nametable[cell.cy][cell.cx];
      if (c) { stampTile = c.tile | 0; paintPalette = c.palette | 0; ctx.renderDock(); }
    },
    // Test/inspection hooks.
    _get: function () { return { stampTile: stampTile, paintPalette: paintPalette, paintType: paintType, showGrid: showGrid, selRect: selRect, clipboard: clipboard }; },
    _set: function (o) { if (o.stampTile != null) stampTile = o.stampTile; if (o.paintPalette != null) paintPalette = o.paintPalette; if (o.paintType != null) paintType = o.paintType; },
  };
})(typeof window !== 'undefined' ? window : globalThis);
