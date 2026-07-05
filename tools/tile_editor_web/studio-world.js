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
  var showTypes = false; // tile-type (behaviour) overlay toggle
  var BEH_COLORS = { 1: '#8d6e4b', 2: '#555555', 3: '#6aa3ff', 4: '#ffd866', 5: '#ff78a2', 6: '#c08a3c', 7: '#33dddd' };
  var hover = null;      // {cx,cy}
  var placeChar = -1;    // sprite index the Place tool drops (-1 = auto)
  var selInst = null;    // selected scene-instance id
  var dragInst = false;
  var selBlock = 0;      // selected 16×16 metatile block id to stamp

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

  // World size in tiles (multi-screen, bug #7).
  function worldCols(bg) { return SCREEN_W * Math.max(1, (bg && bg.dimensions && bg.dimensions.screens_x | 0) || 1); }
  function worldRows(bg) { return SCREEN_H * Math.max(1, (bg && bg.dimensions && bg.dimensions.screens_y | 0) || 1); }
  // TILE offset of the screen the TV is currently showing.
  function off(ctx) { return ctx.viewOffset ? ctx.viewOffset() : { cx: 0, cy: 0 }; }

  function ensureBehaviour(bg) {
    var cols = worldCols(bg), rows = worldRows(bg);
    if (!Array.isArray(bg.behaviour) || bg.behaviour.length !== rows
        || !Array.isArray(bg.behaviour[0]) || bg.behaviour[0].length !== cols) {
      var prev = Array.isArray(bg.behaviour) ? bg.behaviour : [];
      bg.behaviour = [];
      for (var r = 0; r < rows; r++) {
        var row = [];
        for (var c = 0; c < cols; c++) row.push((prev[r] && prev[r][c] != null) ? prev[r][c] : 0);
        bg.behaviour.push(row);
      }
    }
    return bg.behaviour;
  }

  // ---- Per-door destinations editor (engine v2) -------------------------
  var DOOR_TYPE_ID = 4; // behaviour id for "door"
  // Find every door tile (behaviour == DOOR) in a background's grid.
  function findDoorTiles(bg) {
    var out = [], beh = (bg && bg.behaviour) || [];
    for (var r = 0; r < beh.length; r++) {
      var row = beh[r] || [];
      for (var c = 0; c < row.length; c++) if ((row[c] | 0) === DOOR_TYPE_ID) out.push({ tx: c, ty: r });
    }
    return out;
  }
  function doorsModule(s) {
    if (!s.builder || !s.builder.modules) return null;
    var node = s.builder.modules.doors;
    if (!node) return null;
    if (!node.config) node.config = {};
    if (!Array.isArray(node.config.doorList)) node.config.doorList = [];
    return node;
  }
  function findDoorEntry(list, bgIdx, tx, ty) {
    for (var i = 0; i < list.length; i++) {
      var d = list[i];
      if ((d.bg | 0) === bgIdx && (d.tx | 0) === tx && (d.ty | 0) === ty) return d;
    }
    return null;
  }
  function renderDoorsSection(dock, ctx, s, bg) {
    if (!ctx.levelAtLeast('maker')) return;
    var node = doorsModule(s);
    if (!node) return;
    var doorTiles = findDoorTiles(bg);
    var bgIdx = s.selectedBgIdx | 0;
    var list = node.config.doorList;
    // Prune entries on THIS background whose door tile no longer exists.
    var present = {};
    doorTiles.forEach(function (t) { present[t.tx + ',' + t.ty] = 1; });
    for (var i = list.length - 1; i >= 0; i--) {
      if ((list[i].bg | 0) === bgIdx && !present[(list[i].tx | 0) + ',' + (list[i].ty | 0)]) list.splice(i, 1);
    }
    var sec = UI.section('Doors', el('span', { class: 'chip', text: 'destinations' }));
    if (!doorTiles.length) {
      sec.appendChild(el('div', { class: 'dock-note', text: 'Paint a Door tile (⛰ Type → Door) to place a door, then set where it leads here.' }));
      dock.appendChild(sec);
      return;
    }
    if (!node.enabled) node.enabled = true; // doors must be on for per-door to build
    sec.appendChild(el('div', { class: 'dock-note', text: 'Each door on this screen can send the player somewhere different — a spawn spot, and optionally another background (a room).' }));
    var bgCount = (s.backgrounds || []).length;
    doorTiles.forEach(function (t) {
      var d = findDoorEntry(list, bgIdx, t.tx, t.ty);
      if (!d) { d = { bg: bgIdx, tx: t.tx, ty: t.ty, spawnX: 24, spawnY: 120, targetBgIdx: -1 }; list.push(d); }
      var card = el('div', { style: 'border:2px solid var(--line);padding:6px;margin-top:6px' });
      card.appendChild(el('div', { class: 'dock-note', style: 'color:var(--sel)', text: '🚪 Door at tile ' + t.tx + ',' + t.ty }));
      function numField(label, key, min, max) {
        var inp = el('input', { type: 'number', min: min, max: max, style: 'width:64px' });
        inp.value = d[key];
        inp.addEventListener('change', function () {
          var v = parseInt(inp.value, 10); if (isNaN(v)) return;
          ctx.pushUndo(); d[key] = Math.max(min, Math.min(max, v)); ctx.markDirty();
        });
        return el('div', { class: 'field inline' }, [el('span', { text: label }), inp]);
      }
      card.appendChild(numField('Spawn X', 'spawnX', 0, 240));
      card.appendChild(numField('Spawn Y', 'spawnY', 16, 200));
      // Target background selector.
      var tgt = el('select');
      tgt.appendChild(el('option', { value: '-1', text: 'Same room' }));
      for (var b = 0; b < bgCount; b++) tgt.appendChild(el('option', { value: String(b), text: 'Room ' + (b + 1) + ((s.backgrounds[b] && s.backgrounds[b].name) ? ' (' + s.backgrounds[b].name + ')' : '') }));
      tgt.value = String(d.targetBgIdx == null ? -1 : d.targetBgIdx);
      tgt.addEventListener('change', function () { ctx.pushUndo(); d.targetBgIdx = parseInt(tgt.value, 10); ctx.markDirty(); });
      card.appendChild(el('div', { class: 'field' }, [el('span', { text: 'Leads to' }), tgt]));
      sec.appendChild(card);
    });
    dock.appendChild(sec);
  }

  // ---- Blocks editor (engine v6) — place ? / brick / coin blocks. --------
  function renderBlocksSection(dock, ctx, s, bg) {
    if (!ctx.levelAtLeast('maker')) return;
    var gt = (s.builder && s.builder.modules && s.builder.modules.game &&
              s.builder.modules.game.config && s.builder.modules.game.config.type) || 'platformer';
    var stEng = (s.engineVersion | 0) || (typeof window !== 'undefined' && window.NES_ENGINE_VERSION) || 1;
    var node = s.builder && s.builder.modules && s.builder.modules.blocks;
    if (!node) return;
    // Blocks are an SMB engine-v6 feature — only surface them where they build.
    if (gt !== 'smb' || stEng < 6) return;
    if (!node.config) node.config = { blockList: [] };
    if (!Array.isArray(node.config.blockList)) node.config.blockList = [];
    var list = node.config.blockList;
    var sec = UI.section('Blocks', el('span', { class: 'chip', text: '? / brick / coin' }));
    sec.appendChild(el('div', { class: 'dock-note', text: 'Coins collect on touch; ? blocks power you up when bumped from below; bricks break only while you\'re super. Position is in tiles (X 0–63, Y 0–29).' }));
    list.forEach(function (b, idx) {
      var card = el('div', { style: 'border:2px solid var(--line);padding:6px;margin-top:6px' });
      var kindSel = el('select');
      [['coin', '🪙 Coin (touch)'], ['question', '❓ ? block (bump)'], ['brick', '🧱 Brick (bump / break)']]
        .forEach(function (k) { kindSel.appendChild(el('option', { value: k[0], text: k[1] })); });
      kindSel.value = b.kind || 'question';
      kindSel.addEventListener('change', function () { ctx.pushUndo(); b.kind = kindSel.value; ctx.markDirty(); ctx.renderDock(); });
      card.appendChild(el('div', { class: 'field' }, [el('span', { text: 'Kind' }), kindSel]));
      // What comes out of a ? block (needs the Power-ups module for the items).
      if ((b.kind || 'question') === 'question') {
        var contentSel = el('select');
        [['coin', '🪙 Coin'], ['mushroom', '🍄 Super Mushroom'], ['fireflower', '🌼 Fire Flower'],
         ['star', '⭐ Starman'], ['oneup', '🍄 1-Up']].forEach(function (c) {
          contentSel.appendChild(el('option', { value: c[0], text: c[1] }));
        });
        contentSel.value = b.contents || 'coin';
        contentSel.addEventListener('change', function () { ctx.pushUndo(); b.contents = contentSel.value; ctx.markDirty(); });
        card.appendChild(el('div', { class: 'field' }, [el('span', { text: 'Contents' }), contentSel]));
      }
      function num(label, key, max) {
        var inp = el('input', { type: 'number', min: 0, max: max, style: 'width:56px' });
        inp.value = b[key] | 0;
        inp.addEventListener('change', function () {
          var v = parseInt(inp.value, 10); if (isNaN(v)) return;
          ctx.pushUndo(); b[key] = Math.max(0, Math.min(max, v)); ctx.markDirty();
        });
        return el('div', { class: 'field inline' }, [el('span', { text: label }), inp]);
      }
      card.appendChild(num('X (tile)', 'x', 63));
      card.appendChild(num('Y (tile)', 'y', 29));
      card.appendChild(num('Used tile', 'usedTile', 255));
      card.appendChild(el('div', { class: 'dock-note', text: 'Used tile: the background tile drawn once this block is consumed (0 = empty). For a ? block, point it at your "used block" tile.' }));
      card.appendChild(el('button', { class: 'btn', text: 'Remove', onclick: function () {
        ctx.pushUndo(); list.splice(idx, 1); ctx.markDirty(); ctx.renderDock();
      } }));
      sec.appendChild(card);
    });
    sec.appendChild(el('button', { class: 'btn primary', style: 'margin-top:6px', text: '+ Add block', onclick: function () {
      ctx.pushUndo(); node.enabled = true; list.push({ x: 8, y: 18, kind: 'question' });
      ctx.markDirty(); ctx.renderDock();
    } }));
    dock.appendChild(sec);
  }

  // ---- Pipes editor (engine v8) — Down-to-enter warps. -------------------
  function renderPipesSection(dock, ctx, s, bg) {
    if (!ctx.levelAtLeast('maker')) return;
    var gt = (s.builder && s.builder.modules && s.builder.modules.game &&
              s.builder.modules.game.config && s.builder.modules.game.config.type) || 'platformer';
    var stEng = (s.engineVersion | 0) || (typeof window !== 'undefined' && window.NES_ENGINE_VERSION) || 1;
    var node = s.builder && s.builder.modules && s.builder.modules.pipes;
    if (!node || gt !== 'smb' || stEng < 8) return;
    if (!node.config) node.config = { pipeList: [] };
    if (!Array.isArray(node.config.pipeList)) node.config.pipeList = [];
    var list = node.config.pipeList;
    var sec = UI.section('Pipes', el('span', { class: 'chip', text: 'Down to enter' }));
    sec.appendChild(el('div', { class: 'dock-note', text: 'Stand on a pipe cell and hold Down to warp. X/Y are the pipe cell (tiles); Spawn is where you appear (pixels) — e.g. warp Down into the lower half of a tall level.' }));
    list.forEach(function (p, idx) {
      var card = el('div', { style: 'border:2px solid var(--line);padding:6px;margin-top:6px' });
      function num(label, key, max) {
        var inp = el('input', { type: 'number', min: 0, max: max, style: 'width:56px' }); inp.value = p[key] | 0;
        inp.addEventListener('change', function () { var v = parseInt(inp.value, 10); if (isNaN(v)) return; ctx.pushUndo(); p[key] = Math.max(0, Math.min(max, v)); ctx.markDirty(); });
        return el('div', { class: 'field inline' }, [el('span', { text: label }), inp]);
      }
      card.appendChild(num('Pipe X (tile)', 'x', 63));
      card.appendChild(num('Pipe Y (tile)', 'y', 29));
      card.appendChild(num('Spawn X (px)', 'spawnX', 248));
      card.appendChild(num('Spawn Y (px)', 'spawnY', 224));
      card.appendChild(el('button', { class: 'btn', text: 'Remove', onclick: function () { ctx.pushUndo(); list.splice(idx, 1); ctx.markDirty(); ctx.renderDock(); } }));
      sec.appendChild(card);
    });
    sec.appendChild(el('button', { class: 'btn primary', style: 'margin-top:6px', text: '+ Add pipe', onclick: function () {
      ctx.pushUndo(); node.enabled = true; list.push({ x: 8, y: 26, spawnX: 24, spawnY: 40 }); ctx.markDirty(); ctx.renderDock();
    } }));
    dock.appendChild(sec);
  }

  // Resize a background to sx×sy screens (bug #7), preserving existing art.
  function resizeBackground(ctx, sx, sy) {
    var bg = activeBg(ctx);
    if (isMetatileBg(bg)) { alert('This background uses 16×16 blocks — revert to 8×8 first to resize.'); return; }
    ctx.pushUndo();
    bg.dimensions = { screens_x: sx, screens_y: sy };
    var cols = SCREEN_W * sx, rows = SCREEN_H * sy;
    var oldNt = bg.nametable || [];
    var nt = [];
    for (var r = 0; r < rows; r++) {
      var row = [];
      for (var c = 0; c < cols; c++) {
        var old = oldNt[r] && oldNt[r][c];
        row.push(old ? { tile: old.tile | 0, palette: old.palette | 0 } : { tile: 0, palette: 0 });
      }
      nt.push(row);
    }
    bg.nametable = nt;
    ensureBehaviour(bg);
    ctx.setViewScreen(0, 0);
    ctx.markDirty(); ctx.renderLive(); ctx.renderDock();
  }

  // ---- Painting (cx,cy are screen-local; +view offset → world) -----------
  function paintCell(ctx, cx, cy) {
    var s = ctx.getState();
    var bg = activeBg(ctx);
    if (isMetatileBg(bg)) return;
    var o = off(ctx); var wx = cx + o.cx, wy = cy + o.cy;
    var nt = bg.nametable;
    if (!nt[wy] || !nt[wy][wx]) return;
    var tool = ctx.getActiveTool();
    if (tool === 'stamp') {
      nt[wy][wx] = { tile: stampTile, palette: paintPalette };
      // Tile default-behaviour: placing a tile that has a default type also
      // sets this cell's behaviour to that type (e.g. a ground tile becomes
      // solid automatically). Override later with the ⛰ Type tool.
      var def = s.bg_tiles[stampTile] && s.bg_tiles[stampTile].defaultBehaviour;
      if (def != null) ensureBehaviour(bg)[wy][wx] = def | 0;
    } else if (tool === 'erase') {
      nt[wy][wx] = { tile: 0, palette: 0 };
      ensureBehaviour(bg)[wy][wx] = 0; // removing the tile clears its type
    } else if (tool === 'palette') {
      // Attribute granularity: a whole 2×2 quadrant shares one palette.
      var qx = wx - (wx % 2), qy = wy - (wy % 2);
      for (var dy = 0; dy < 2; dy++) for (var dx = 0; dx < 2; dx++) {
        var yy = qy + dy, xx = qx + dx;
        if (nt[yy] && nt[yy][xx]) nt[yy][xx].palette = paintPalette;
      }
    } else if (tool === 'type') {
      ensureBehaviour(bg)[wy][wx] = paintType;
    }
  }

  function floodFill(ctx, cx, cy) {
    var bg = activeBg(ctx);
    if (isMetatileBg(bg)) return;
    var o = off(ctx); var wx = cx + o.cx, wy = cy + o.cy;
    var cols = worldCols(bg), rows = worldRows(bg);
    var nt = bg.nametable;
    var tool = ctx.getActiveTool();
    if (tool === 'type') {
      var beh = ensureBehaviour(bg);
      var fromT = beh[wy][wx];
      if (fromT === paintType) return;
      floodGeneric(wx, wy, cols, rows, function (x, y) { return beh[y][x] === fromT; },
        function (x, y) { beh[y][x] = paintType; });
      return;
    }
    var target = nt[wy][wx];
    var fromTile = target.tile, fromPal = target.palette;
    var toTile = tool === 'erase' ? 0 : stampTile;
    var toPal = tool === 'erase' ? 0 : paintPalette;
    if (fromTile === toTile && fromPal === toPal) return;
    var s2 = ctx.getState();
    var def2 = tool === 'erase' ? 0 : (s2.bg_tiles[stampTile] && s2.bg_tiles[stampTile].defaultBehaviour);
    var beh2 = (tool === 'erase' || def2 != null) ? ensureBehaviour(bg) : null;
    floodGeneric(wx, wy, cols, rows,
      function (x, y) { return nt[y][x].tile === fromTile && nt[y][x].palette === fromPal; },
      function (x, y) { nt[y][x] = { tile: toTile, palette: toPal }; if (beh2) beh2[y][x] = def2 | 0; });
  }
  function floodGeneric(sx, sy, cols, rows, match, set) {
    var stack = [[sx, sy]], seen = {};
    while (stack.length) {
      var p = stack.pop(), x = p[0], y = p[1];
      if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
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
    var o = off(ctx), r = normRect(selRect), nt = bg.nametable, rows = [];
    for (var y = r.y0; y <= r.y1; y++) {
      var row = [];
      for (var x = r.x0; x <= r.x1; x++) {
        var c = (nt[y + o.cy] && nt[y + o.cy][x + o.cx]) || { tile: 0, palette: 0 };
        row.push({ tile: c.tile | 0, palette: c.palette | 0 });
      }
      rows.push(row);
    }
    clipboard = rows;
  }
  function pasteRegion(ctx) {
    if (!clipboard || !selRect) return;
    var bg = activeBg(ctx); if (isMetatileBg(bg)) return;
    var o = off(ctx), r = normRect(selRect), nt = bg.nametable;
    var cols = worldCols(bg), rows = worldRows(bg);
    ctx.pushUndo();
    for (var dy = 0; dy < clipboard.length; dy++) {
      for (var dx = 0; dx < clipboard[dy].length; dx++) {
        var yy = r.y0 + o.cy + dy, xx = r.x0 + o.cx + dx;
        if (yy >= rows || xx >= cols) continue;
        if (nt[yy] && nt[yy][xx]) nt[yy][xx] = { tile: clipboard[dy][dx].tile, palette: clipboard[dy][dx].palette };
      }
    }
    ctx.markDirty(); ctx.renderLive();
  }
  function clearRegion(ctx) {
    if (!selRect) return;
    var bg = activeBg(ctx); if (isMetatileBg(bg)) return;
    var o = off(ctx), r = normRect(selRect), nt = bg.nametable;
    ctx.pushUndo();
    for (var y = r.y0; y <= r.y1; y++) for (var x = r.x0; x <= r.x1; x++) {
      var yy = y + o.cy, xx = x + o.cx;
      if (nt[yy] && nt[yy][xx]) nt[yy][xx] = { tile: 0, palette: 0 };
    }
    ctx.markDirty(); ctx.renderLive();
  }

  var strokeOpen = false;
  function beginStroke(ctx, cell) {
    if (!cell.inBounds) return;
    ctx.pushUndo();
    strokeOpen = true;
    var tool = ctx.getActiveTool();
    if (isMetatileBg(activeBg(ctx))) { metatileStamp(ctx, cell, tool); ctx.renderLive(); return; }
    if (tool === 'fill') floodFill(ctx, cell.cx, cell.cy);
    else paintCell(ctx, cell.cx, cell.cy);
    ctx.renderLive();
  }
  // In 16×16 mode the TV stamps whole blocks: stamp tool → selected block,
  // erase → block 0.
  function metatileStamp(ctx, cell, tool) {
    var prev = selBlock;
    if (tool === 'erase') selBlock = 0;
    stampBlock(ctx, cell.cx, cell.cy);
    selBlock = prev;
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
    // Tile-type (behaviour) overlay: translucent colour per cell so a pupil
    // sees what each tile *does* at a glance.
    if (showTypes) {
      var tbg = _octx && activeBg(_octx);
      if (tbg && !isMetatileBg(tbg)) {
        var tbeh = tbg.behaviour || [];
        var to = off(_octx);
        g.globalAlpha = 0.45;
        for (var ty = 0; ty < SCREEN_H; ty++) {
          var trow = tbeh[ty + to.cy] || [];
          for (var tx = 0; tx < SCREEN_W; tx++) {
            var bid = trow[tx + to.cx] | 0;
            var col = BEH_COLORS[bid];
            if (!col) continue;
            g.fillStyle = col;
            g.fillRect(tx * 8, ty * 8, 8, 8);
          }
        }
        g.globalAlpha = 1;
      }
    }
    if (hover) {
      g.strokeStyle = '#FA9E00'; g.lineWidth = 2;
      g.strokeRect(hover.cx * 8, hover.cy * 8, 8, 8);
    }
    // Attribute-conflict flag (2.5): a 2×2 chunk can show only ONE palette on
    // the NES. If a pupil's four cells disagree, outline the chunk so the
    // "compile-time lie" is visible — colouring visibly respects the 2×2 rule.
    var cbg = _octx && activeBg(_octx);
    if (cbg && !isMetatileBg(cbg) && Array.isArray(cbg.nametable)) {
      var nt = cbg.nametable;
      var co = off(_octx);
      g.lineWidth = 2; g.strokeStyle = '#C72E00';
      for (var qy = 0; qy < SCREEN_H; qy += 2) {
        for (var qx = 0; qx < SCREEN_W; qx += 2) {
          var seen = -1, clash = false;
          for (var dy = 0; dy < 2 && !clash; dy++) for (var dx = 0; dx < 2; dx++) {
            var cc = nt[qy + dy + co.cy] && nt[qy + dy + co.cy][qx + dx + co.cx];
            var pv = cc ? (cc.palette | 0) : 0;
            if (seen < 0) seen = pv; else if (pv !== seen) { clash = true; break; }
          }
          if (clash) {
            g.strokeRect(qx * 8 + 1, qy * 8 + 1, 16 - 2, 16 - 2);
            g.beginPath(); g.moveTo(qx * 8 + 1, qy * 8 + 1); g.lineTo(qx * 8 + 15, qy * 8 + 15); g.stroke();
          }
        }
      }
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
  // De-overloaded, game-type-aware slot labels (3.4): the same slot ids mean
  // different things per game type, so name them honestly instead of showing
  // one generic label that lies about what the build does.
  function behLabels(ctx) {
    var s = ctx.getState();
    var gt = (s.builder && s.builder.modules && s.builder.modules.game
      && s.builder.modules.game.config && s.builder.modules.game.config.type) || 'platformer';
    var m = { 0: 'None', 1: 'Solid ground', 2: 'Wall', 3: 'Platform', 4: 'Door' };
    if (gt === 'racer') {
      m[5] = 'Checkpoint 1'; m[6] = 'Checkpoint 2'; m[7] = 'Finish line';
    } else if (gt === 'topdown') {
      m[5] = 'Trigger'; m[6] = 'Ladder'; m[7] = 'Hazard';
    } else if (gt === 'runner' || gt === 'autorunner') {
      m[5] = 'Trigger'; m[6] = 'Ladder'; m[7] = 'Spike';
    } else { // platformer + fallback
      m[5] = 'Trigger'; m[6] = 'Ladder'; m[7] = 'Spike';
    }
    return m;
  }

  // ---- 16×16 metatile block library (WORLD parity, #9) ------------------
  function ensureMtmap(bg) {
    // Metatile map is 16 wide × 15 tall (half a 32×30 screen). Fill missing.
    if (!Array.isArray(bg.mtmap)) bg.mtmap = [];
    for (var r = 0; r < 15; r++) {
      if (!Array.isArray(bg.mtmap[r])) bg.mtmap[r] = [];
      for (var c = 0; c < 16; c++) if (typeof bg.mtmap[r][c] !== 'number') bg.mtmap[r][c] = 0;
    }
    return bg.mtmap;
  }
  function promoteBg(ctx) {
    var bg = activeBg(ctx);
    if (isMetatileBg(bg) || !global.MetatileLib) return;
    ctx.pushUndo();
    global.MetatileLib.promote(bg);
    ensureMtmap(bg);
    selBlock = 0;
    ctx.markDirty(); ctx.renderLive(); ctx.renderDock();
  }
  function revertBg(ctx) {
    var bg = activeBg(ctx);
    if (!isMetatileBg(bg) || !global.MetatileLib) return;
    if (!confirm('Turn this background back into loose 8×8 tiles? Your current block layout is baked into the tiles first, so nothing on screen changes.')) return;
    ctx.pushUndo();
    var ex = global.MetatileLib.expand(bg);
    bg.nametable = ex.nametable;
    bg.behaviour = ex.behaviour;
    bg.tileMode = '8x8';
    delete bg.metatiles; delete bg.mtmap;
    ctx.markDirty(); ctx.renderLive(); ctx.renderDock();
  }
  function stampBlock(ctx, cx, cy) {
    var bg = activeBg(ctx);
    if (!isMetatileBg(bg)) return;
    var map = ensureMtmap(bg);
    var mr = cy >> 1, mc = cx >> 1;
    if (mr < 0 || mr >= map.length || mc < 0 || mc >= map[mr].length) return;
    if (map[mr][mc] === selBlock) return;
    map[mr][mc] = selBlock;
  }
  // Draw a block (its 4 tiles under its palette) into a small canvas.
  function blockCanvas(state, mt, sizePx) {
    var c = el('canvas', { width: sizePx, height: sizePx, style: 'image-rendering:pixelated;display:block' });
    var g = c.getContext('2d');
    var pal = global.NesRender.bgPaletteFor(state, (mt.palette | 0) & 3);
    g.fillStyle = global.NesRender.nesRgb(pal.slot0); g.fillRect(0, 0, sizePx, sizePx);
    var half = sizePx / 2, scale = half / 8;
    var tiles = mt.tiles || [];
    var quads = [[0, 0], [half, 0], [0, half], [half, half]];
    for (var k = 0; k < 4; k++) {
      UI.drawTilePixels(g, state.bg_tiles[(tiles[k] | 0)], pal, quads[k][0], quads[k][1], scale);
    }
    return c;
  }

  function renderMetatileDock(dock, ctx) {
    var s = ctx.getState();
    var bg = activeBg(ctx);
    var mts = bg.metatiles || [];
    ensureMtmap(bg);

    var head = UI.section('16×16 blocks', el('span', { class: 'chip', text: mts.length + ' block' + (mts.length === 1 ? '' : 's') }));
    head.appendChild(el('div', { class: 'dock-note', text: 'Paint whole 16×16 blocks in one click — build big levels fast. Editing a block updates it everywhere it appears.' }));
    head.appendChild(el('div', { class: 'row', style: 'margin-top:4px' }, [
      el('button', { class: 'btn', text: '+ New block', onclick: function () {
        ctx.pushUndo();
        bg.metatiles.push({ tiles: [0, 0, 0, 0], palette: paintPalette, behaviour: 0 });
        selBlock = bg.metatiles.length - 1;
        ctx.markDirty(); ctx.renderDock();
      } }),
      el('button', { class: 'btn', text: '↩ Revert to 8×8', onclick: function () { revertBg(ctx); } }),
    ]));
    dock.appendChild(head);

    // Block library strip.
    var libSec = UI.section('Block library', el('span', { class: 'chip', text: 'stamp' }));
    var strip = el('div', { class: 'tile-grid', style: 'grid-template-columns:repeat(6,1fr)' });
    mts.forEach(function (mt, id) {
      var cell = el('button', { class: 'tile-cell' + (id === selBlock ? ' sel' : ''), title: 'Block ' + id,
        onclick: function () { selBlock = id; ctx.renderDock(); } });
      cell.appendChild(blockCanvas(s, mt, 28));
      strip.appendChild(cell);
    });
    libSec.appendChild(strip);
    dock.appendChild(libSec);

    // Selected-block mini editor: 4 tile quadrants + palette + behaviour.
    var mt = mts[selBlock];
    if (mt) {
      var edSec = UI.section('Edit block ' + selBlock);
      var quadNames = ['Top-left', 'Top-right', 'Bottom-left', 'Bottom-right'];
      for (var q = 0; q < 4; q++) (function (qi) {
        var row = el('div', { class: 'field inline' }, [el('span', { text: quadNames[qi] })]);
        var num = el('input', { type: 'number', min: 0, max: 255, style: 'width:64px' });
        num.value = (mt.tiles[qi] | 0);
        num.addEventListener('change', function () {
          var v = Math.max(0, Math.min(255, parseInt(num.value, 10) || 0));
          ctx.pushUndo(); mt.tiles[qi] = v; ctx.markDirty(); ctx.renderLive(); ctx.renderDock();
        });
        row.appendChild(num);
        edSec.appendChild(row);
      })(q);
      // Palette.
      var palRow = el('div', { class: 'row' });
      for (var pp = 0; pp < 4; pp++) (function (pi) {
        palRow.appendChild(el('button', { class: 'btn' + (pi === (mt.palette | 0) ? ' primary' : ''), text: 'BG ' + pi,
          onclick: function () { ctx.pushUndo(); mt.palette = pi; ctx.markDirty(); ctx.renderLive(); ctx.renderDock(); } }));
      })(pp);
      edSec.appendChild(el('div', { class: 'field' }, [el('span', { text: 'Palette' }), palRow]));
      // Behaviour type.
      var behSel = el('select');
      var labels = behLabels(ctx);
      Object.keys(labels).forEach(function (id) { behSel.appendChild(el('option', { value: id, text: labels[id] })); });
      behSel.value = String(mt.behaviour | 0);
      behSel.addEventListener('change', function () { ctx.pushUndo(); mt.behaviour = parseInt(behSel.value, 10) || 0; ctx.markDirty(); ctx.renderLive(); });
      edSec.appendChild(el('div', { class: 'field' }, [el('span', { text: 'Whole-block type' }), behSel]));
      // Delete block.
      if (mts.length > 1) {
        edSec.appendChild(el('button', { class: 'btn', style: 'margin-top:6px', text: '🗑 Delete block ' + selBlock, onclick: function () {
          ctx.pushUndo();
          if (global.MetatileLib.deleteBlock(bg, selBlock)) { selBlock = 0; ctx.markDirty(); ctx.renderLive(); ctx.renderDock(); }
        } }));
      }
      edSec.appendChild(el('div', { class: 'dock-note', text: 'Tip: draw the actual 8×8 art in TILES; here you choose which four tiles make the block.' }));
      dock.appendChild(edSec);
    }

    // Full-screen preview works for metatile bgs too (renderBgInto expands? no —
    // expand first). Keep it available.
    dock.appendChild(el('div', { class: 'dock-section' }, [
      el('button', { class: 'btn', text: '⛶ Full-screen preview', onclick: function () { openPreview(ctx); } }),
    ]));
  }

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
    if (isMetatileBg(bg)) { renderMetatileDock(dock, ctx); return; }

    // --- World size + screen navigator (bug #7, Maker+) ---
    if (ctx.levelAtLeast('maker')) {
      var scr = ctx.bgScreens ? ctx.bgScreens() : { x: 1, y: 1 };
      var vs = ctx.viewScreen ? ctx.viewScreen() : { x: 0, y: 0 };
      var sizeSec = UI.section('World size', el('span', { class: 'chip', text: scr.x + '×' + scr.y + ' screens' }));
      var sizeRow = el('div', { class: 'row' });
      [[1, 1], [2, 1], [1, 2], [2, 2]].forEach(function (d) {
        sizeRow.appendChild(el('button', {
          class: 'btn' + (scr.x === d[0] && scr.y === d[1] ? ' primary' : ''),
          text: d[0] + '×' + d[1], title: d[0] + ' wide × ' + d[1] + ' tall screens',
          onclick: function () { resizeBackground(ctx, d[0], d[1]); },
        }));
      });
      sizeSec.appendChild(sizeRow);
      if (scr.x > 1 || scr.y > 1) {
        sizeSec.appendChild(el('div', { class: 'dock-note', text: 'Editing screen ' + (vs.x + 1) + ',' + (vs.y + 1) + ' of ' + scr.x + '×' + scr.y + '. Use the arrows to move around your world.' }));
        var nav = el('div', { class: 'row', style: 'margin-top:4px' });
        function navBtn(label, dx, dy, disabled) {
          return el('button', { class: 'btn', text: label, disabled: disabled ? 'disabled' : null,
            onclick: function () { ctx.setViewScreen(vs.x + dx, vs.y + dy); ctx.renderLive(); ctx.renderDock(); } });
        }
        nav.appendChild(navBtn('◀', -1, 0, vs.x <= 0));
        nav.appendChild(navBtn('▶', 1, 0, vs.x >= scr.x - 1));
        nav.appendChild(navBtn('▲', 0, -1, vs.y <= 0));
        nav.appendChild(navBtn('▼', 0, 1, vs.y >= scr.y - 1));
        sizeSec.appendChild(nav);
      } else {
        sizeSec.appendChild(el('div', { class: 'dock-note', text: 'Grow your level beyond one screen — the game scrolls to follow the player.' }));
      }
      dock.appendChild(sizeSec);
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
    var clashes = countAttrConflicts(bg);
    if (clashes > 0) {
      palSec.appendChild(el('div', { class: 'dock-note', style: 'color:var(--warn)',
        text: '⚠ ' + clashes + ' block' + (clashes === 1 ? '' : 's') + ' mix two palettes (red X on screen). The NES shows one palette per 2×2 block — recolour with 🎨 to fix.' }));
    }
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
    // In-context jump-in to TILES (2.4) for the selected stamp tile — Maker+.
    if (ctx.levelAtLeast('maker') && global.StudioModes.tiles && global.StudioModes.tiles.focus) {
      tileSec.appendChild(el('button', { class: 'btn', style: 'margin-top:6px', text: '✎ Edit tile #' + stampTile + ' in TILES', onclick: function () {
        global.StudioModes.tiles.focus(ctx, 'bg', stampTile);
      } }));
    }
    dock.appendChild(tileSec);

    // --- Tile type (behaviour) --- (Maker+: what a tile *does* is a
    // step beyond just drawing the picture.)
    if (ctx.levelAtLeast('maker')) {
    var typeSec = UI.section('Tile type', el('span', { class: 'chip', text: 'what it does' }));
    var labels = behLabels(ctx);
    Object.keys(labels).forEach(function (id) {
      id = +id;
      var row = el('div', { class: 'entity-row' + (id === paintType ? ' sel' : ''),
        onclick: function () { paintType = id; ctx.renderDock(); } }, [
        el('span', { class: 'grow', text: labels[id] }),
      ]);
      typeSec.appendChild(row);
    });
    typeSec.appendChild(el('div', { class: 'dock-note', text: 'With the ⛰ Type tool, paint what each tile does. These slots are named for your current game type — solid ground and platforms are what your hero stands on.' }));
    dock.appendChild(typeSec);

    // --- Doors: per-door destinations (engine v2, Maker+) ---
    renderDoorsSection(dock, ctx, s, bg);
    // --- Blocks: ? / brick / coin (engine v6, Maker+, SMB only) ---
    renderBlocksSection(dock, ctx, s, bg);
    // --- Pipes: Down-to-enter warps (engine v8, Maker+, SMB only) ---
    renderPipesSection(dock, ctx, s, bg);
    }

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
      // AI.  The SMB actor AIs (goomba/koopa) need engine v4+; show them once
      // the project targets v4 or later (they degrade to a walker on older
      // engines, so an old design that already picked one still loads fine).
      var aiSel = el('select', { 'data-ent-ai': '1' });
      var aiOpts = [
        ['static', 'static'], ['walker', 'walker'], ['chaser', 'chaser'],
      ];
      var stEng = (ctx.getState() && ctx.getState().engineVersion) ||
                  (typeof window !== 'undefined' && window.NES_ENGINE_VERSION) || 1;
      if (stEng >= 4 || selected.ai === 'goomba' || selected.ai === 'koopa') {
        aiOpts.push(['goomba', 'goomba (stomp to defeat)']);
        aiOpts.push(['koopa', 'koopa (stomp → shell → kick)']);
      }
      // v5 — a power-up item the player collects (needs the Power-ups module).
      if (stEng >= 5 || selected.ai === 'item') {
        aiOpts.push(['item', 'item (power-up the player collects)']);
      }
      aiOpts.forEach(function (a) { aiSel.appendChild(el('option', { value: a[0], text: a[1] })); });
      aiSel.value = selected.ai || 'static';
      aiSel.addEventListener('change', function () { ctx.pushUndo(); selected.ai = aiSel.value; ctx.markDirty(); ctx.renderDock(); });
      cfg.appendChild(el('div', { class: 'field' }, [el('span', { text: 'AI' }), aiSel]));
      // Power kind — only meaningful for an `item` entity.
      if (selected.ai === 'item') {
        var powSel = el('select');
        [['mushroom', '🍄 Super Mushroom (→ super)'], ['fireflower', '🌼 Fire Flower (→ fire)'],
         ['star', '⭐ Starman (invincible)'], ['oneup', '🍄 1-Up (heal)']].forEach(function (p) {
          powSel.appendChild(el('option', { value: p[0], text: p[1] }));
        });
        powSel.value = selected.power || 'mushroom';
        powSel.addEventListener('change', function () { ctx.pushUndo(); selected.power = powSel.value; ctx.markDirty(); });
        cfg.appendChild(el('div', { class: 'field' }, [el('span', { text: 'Power' }), powSel]));
      }
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

    // --- Selection / clipboard (region copy-paste) --- (Maker+)
    if (ctx.levelAtLeast('maker')) {
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
    }

    // --- Full-screen preview ---
    var prevSec = el('div', { class: 'dock-section' }, [
      el('button', { class: 'btn', text: '⛶ Full-screen preview', onclick: function () { openPreview(ctx); } }),
    ]);
    dock.appendChild(prevSec);

    // --- Promote to 16×16 blocks (Maker+) ---
    if (ctx.levelAtLeast('maker') && global.MetatileLib) {
      dock.appendChild(el('div', { class: 'dock-section' }, [
        el('button', { class: 'btn', text: '🧱 Promote to 16×16 blocks', title: 'Turn this background into reusable 16×16 blocks for building big levels fast.',
          onclick: function () { promoteBg(ctx); } }),
        el('div', { class: 'dock-note', text: 'Groups your art into reusable 16×16 blocks so you can paint big levels quickly. You can revert anytime.' }),
      ]));
    }

    // --- Grid + tile-type overlay toggles ---
    var gridSec = el('div', { class: 'dock-section' }, [
      el('label', { class: 'switch' }, [
        (function () { var c = el('input', { type: 'checkbox' }); c.checked = showGrid;
          c.addEventListener('change', function () { showGrid = c.checked; ctx.renderLive(); }); return c; })(),
        el('span', { text: 'Show grid' }),
      ]),
      el('label', { class: 'switch', style: 'margin-top:6px' }, [
        (function () { var c = el('input', { type: 'checkbox', 'data-toggle-types': '1' }); c.checked = showTypes;
          c.addEventListener('change', function () { showTypes = c.checked; ctx.renderLive(); }); return c; })(),
        el('span', { text: 'Show tile types' }),
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
    var nt = (isMetatileBg(bg) && global.MetatileLib) ? global.MetatileLib.expand(bg).nametable : bg.nametable;
    if (!Array.isArray(nt)) return;
    for (var cy = 0; cy < SCREEN_H; cy++) for (var cx = 0; cx < SCREEN_W; cx++) {
      if (!nt[cy] || !nt[cy][cx]) continue;
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

  // Count 2×2 chunks whose four cells disagree on palette (attribute lie).
  function countAttrConflicts(bg) {
    if (!bg || isMetatileBg(bg) || !Array.isArray(bg.nametable)) return 0;
    var nt = bg.nametable, n = 0;
    for (var qy = 0; qy < SCREEN_H; qy += 2) for (var qx = 0; qx < SCREEN_W; qx += 2) {
      var seen = -1, clash = false;
      for (var dy = 0; dy < 2 && !clash; dy++) for (var dx = 0; dx < 2; dx++) {
        var cc = nt[qy + dy] && nt[qy + dy][qx + dx];
        var pv = cc ? (cc.palette | 0) : 0;
        if (seen < 0) seen = pv; else if (pv !== seen) { clash = true; break; }
      }
      if (clash) n++;
    }
    return n;
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
      { id: 'place', label: '🧍 Place' },
      { id: 'type', label: '⛰ Type', minLevel: 'maker' },
      { id: 'select', label: '▦ Select', minLevel: 'maker' },
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
      if (isMetatileBg(activeBg(ctx))) { metatileStamp(ctx, cell, tool); ctx.renderLive(); return; }
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
      var o = off(ctx), wy = cell.cy + o.cy, wx = cell.cx + o.cx;
      var c = bg.nametable[wy] && bg.nametable[wy][wx];
      if (c) { stampTile = c.tile | 0; paintPalette = c.palette | 0; ctx.renderDock(); }
    },
    // Test/inspection hooks.
    _get: function () { return { stampTile: stampTile, paintPalette: paintPalette, paintType: paintType, showGrid: showGrid, showTypes: showTypes, selRect: selRect, clipboard: clipboard }; },
    _conflicts: function () { var s = global.Studio.getState(); return countAttrConflicts(s.backgrounds[s.selectedBgIdx] || s.backgrounds[0]); },
    _set: function (o) { if (o.stampTile != null) stampTile = o.stampTile; if (o.paintPalette != null) paintPalette = o.paintPalette; if (o.paintType != null) paintType = o.paintType; },
  };
})(typeof window !== 'undefined' ? window : globalThis);
