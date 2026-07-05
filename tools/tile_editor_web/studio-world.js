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
      g.lineWidth = 2; g.strokeStyle = '#C72E00';
      for (var qy = 0; qy < SCREEN_H; qy += 2) {
        for (var qx = 0; qx < SCREEN_W; qx += 2) {
          var seen = -1, clash = false;
          for (var dy = 0; dy < 2 && !clash; dy++) for (var dx = 0; dx < 2; dx++) {
            var cc = nt[qy + dy] && nt[qy + dy][qx + dx];
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
      var c = bg.nametable[cell.cy] && bg.nametable[cell.cy][cell.cx];
      if (c) { stampTile = c.tile | 0; paintPalette = c.palette | 0; ctx.renderDock(); }
    },
    // Test/inspection hooks.
    _get: function () { return { stampTile: stampTile, paintPalette: paintPalette, paintType: paintType, showGrid: showGrid, selRect: selRect, clipboard: clipboard }; },
    _conflicts: function () { var s = global.Studio.getState(); return countAttrConflicts(s.backgrounds[s.selectedBgIdx] || s.backgrounds[0]); },
    _set: function (o) { if (o.stampTile != null) stampTile = o.stampTile; if (o.paintPalette != null) paintPalette = o.paintPalette; if (o.paintType != null) paintType = o.paintType; },
  };
})(typeof window !== 'undefined' ? window : globalThis);
