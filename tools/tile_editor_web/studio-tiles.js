/*
 * TILES mode (redesign Phase 2).
 *
 * The missing primitive: draw & manage the 8×8 tiles in the two pattern
 * tables (256 BG + 256 sprite). Everything else (blocks, metasprites,
 * screens) references what is made here, so editing a tile propagates to
 * every reference by construction — the core NES "shared pattern table"
 * idea. Reads/writes state.bg_tiles / state.sprite_tiles.
 *
 * The TV shows the selected tile zoomed for painting; the dock holds the
 * 16×16 bank grid (free/used/orphan colour-coded), palette preview, tile
 * ops (clear/flip/rotate/duplicate) and a live "used by" readout.
 */
(function (global) {
  'use strict';
  var UI = global.StudioUI;
  var el = UI.el;

  var bank = 'bg';   // 'bg' | 'sprite'
  var selIdx = 1;
  var pen = 1;
  var palIdx = 0;
  var layout = null; // {ox, oy, scale}
  var strokeOpen = false;
  var dragFrom = null; // bank-grid drag source index (for reference-rewriting swap)

  function pool(state) { return bank === 'bg' ? state.bg_tiles : state.sprite_tiles; }

  // Dialogue glyph reservation (2.6). The dialogue engine maps each text
  // character to the BG tile at its ASCII code (space 0x20, digits 0x30-39,
  // A-Z 0x41-5A, a-z 0x61-7A), so those slots are spoken for when dialogue
  // is on — the pupil's CHR budget must show that honestly.
  function dialogueOn(state) {
    var b = state.builder && state.builder.modules && state.builder.modules.dialogue;
    return !!(b && b.enabled);
  }
  function isReservedGlyphSlot(idx) {
    return idx === 0x20 || (idx >= 0x30 && idx <= 0x39) ||
           (idx >= 0x41 && idx <= 0x5A) || (idx >= 0x61 && idx <= 0x7A);
  }
  function usage(state, idx) {
    return bank === 'bg' ? UI.bgTileUsage(state, idx) : UI.spriteTileUsage(state, idx);
  }
  function palFor(state) {
    return bank === 'bg' ? global.NesRender.bgPaletteFor(state, palIdx)
                         : global.NesRender.spritePaletteFor(state, palIdx);
  }

  // ---- TV: zoomed single-tile editor ------------------------------------
  function renderTV(g, ctx) {
    var state = ctx.getState();
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#000'; g.fillRect(0, 0, 256, 240);
    var scale = 26; // 8*26 = 208
    var ox = Math.floor((256 - 8 * scale) / 2), oy = Math.floor((240 - 8 * scale) / 2);
    layout = { ox: ox, oy: oy, scale: scale };
    var pal = palFor(state);
    // Backdrop / checker.
    for (var i = 0; i < 8; i++) for (var j = 0; j < 8; j++) {
      if (bank === 'bg') { g.fillStyle = global.NesRender.nesRgb(pal.slot0); }
      else { g.fillStyle = ((i + j) & 1) ? '#181818' : '#242424'; }
      g.fillRect(ox + i * scale, oy + j * scale, scale, scale);
    }
    UI.drawTilePixels(g, pool(state)[selIdx], pal, ox, oy, scale);
  }
  function onRenderOverlay(g) {
    if (!layout) return;
    g.globalAlpha = 0.35; g.strokeStyle = '#000'; g.lineWidth = 1;
    for (var k = 0; k <= 8; k++) {
      g.beginPath(); g.moveTo(layout.ox + k * layout.scale + 0.5, layout.oy); g.lineTo(layout.ox + k * layout.scale + 0.5, layout.oy + 8 * layout.scale); g.stroke();
      g.beginPath(); g.moveTo(layout.ox, layout.oy + k * layout.scale + 0.5); g.lineTo(layout.ox + 8 * layout.scale, layout.oy + k * layout.scale + 0.5); g.stroke();
    }
    g.globalAlpha = 1;
  }
  function pixelFromCell(cell) {
    if (!layout) return null;
    var x = Math.floor((cell.px - layout.ox) / layout.scale);
    var y = Math.floor((cell.py - layout.oy) / layout.scale);
    if (x < 0 || y < 0 || x > 7 || y > 7) return null;
    return { x: x, y: y };
  }
  function paint(ctx, p) {
    var tile = pool(ctx.getState())[selIdx];
    if (!tile || !tile.pixels) return;
    tile.pixels[p.y][p.x] = pen;
  }

  // ---- Tile ops ----------------------------------------------------------
  function tile(ctx) { return pool(ctx.getState())[selIdx]; }
  function opClear(ctx) { var t = tile(ctx); for (var y = 0; y < 8; y++) for (var x = 0; x < 8; x++) t.pixels[y][x] = 0; }
  function opFlipH(ctx) { var t = tile(ctx); t.pixels = t.pixels.map(function (r) { return r.slice().reverse(); }); }
  function opFlipV(ctx) { var t = tile(ctx); t.pixels = t.pixels.slice().reverse(); }
  function opRotate(ctx) {
    var t = tile(ctx), src = t.pixels, out = [];
    for (var y = 0; y < 8; y++) { var row = []; for (var x = 0; x < 8; x++) row.push(src[7 - x][y]); out.push(row); }
    t.pixels = out;
  }
  function opDuplicate(ctx) {
    var state = ctx.getState();
    var free = -1;
    for (var i = 1; i < 256; i++) { if (UI.isTileBlank(pool(state)[i]) && usage(state, i) === 0) { free = i; break; } }
    if (free < 0) { alert('No free tile slots in this bank.'); return; }
    pool(state)[free] = JSON.parse(JSON.stringify(tile(ctx)));
    selIdx = free;
  }

  // ---- Reference-rewriting swap (2.3) -----------------------------------
  // Exchange two slots' tile data AND rewrite every reference to them, so the
  // artwork stays visually put — a pure reorganisation of the pattern table.
  // Rewrites nametables + metatiles (BG bank) or metasprite cells (sprite
  // bank); the drag-swap is confined to the active bank (the two banks are
  // separate pattern tables in this data model).
  function swapTiles(state, a, b) {
    if (a === b) return;
    var arr = pool(state);
    var tmp = arr[a]; arr[a] = arr[b]; arr[b] = tmp;
    var remap = function (t) { t = t | 0; return t === a ? b : (t === b ? a : t); };
    if (bank === 'bg') {
      (state.backgrounds || []).forEach(function (bg) {
        (bg.nametable || []).forEach(function (row) {
          (row || []).forEach(function (c) { if (c) c.tile = remap(c.tile); });
        });
        (bg.metatiles || []).forEach(function (mt) {
          if (Array.isArray(mt.tiles)) mt.tiles = mt.tiles.map(remap);
        });
      });
    } else {
      (state.sprites || []).forEach(function (sp) {
        (sp.cells || []).forEach(function (row) {
          (row || []).forEach(function (c) { if (c && !c.empty) c.tile = remap(c.tile); });
        });
      });
    }
  }

  // ---- Dock --------------------------------------------------------------
  function renderDock(dock, ctx) {
    var state = ctx.getState();

    // Bank toggle.
    var bankSec = UI.section('Pattern table');
    bankSec.appendChild(el('div', { class: 'row' }, [
      tabBtn(ctx, 'bg', 'Background'),
      tabBtn(ctx, 'sprite', 'Sprite'),
    ]));
    dock.appendChild(bankSec);

    // Palette preview picker.
    var palSec = UI.section('Preview palette');
    var palRow = el('div', { class: 'row' });
    for (var p = 0; p < 4; p++) (function (pi) {
      palRow.appendChild(el('button', { class: 'btn' + (pi === palIdx ? ' primary' : ''), text: (bank === 'bg' ? 'BG ' : 'SP ') + pi,
        onclick: function () { palIdx = pi; ctx.renderLive(); ctx.renderDock(); } }));
    })(p);
    palSec.appendChild(palRow);
    dock.appendChild(palSec);

    // Pen.
    var penSec = UI.section('Pen');
    var pal = palFor(state);
    var cols = bank === 'bg'
      ? [pal.slot0, pal.slot1, pal.slot2, pal.slot3]
      : [null, pal.slot1, pal.slot2, pal.slot3];
    var penRow = el('div', { class: 'swatch-row' });
    for (var v = 0; v < 4; v++) (function (val) {
      var css = cols[val] == null ? 'transparent' : global.NesRender.nesRgb(cols[val]);
      penRow.appendChild(el('button', { class: 'swatch' + (val === pen ? ' sel' : ''), style: 'background:' + css,
        title: 'Value ' + val, onclick: function () { pen = val; ctx.renderDock(); } }));
    })(v);
    penSec.appendChild(penRow);
    dock.appendChild(penSec);

    // Ops.
    var opsSec = UI.section('Tile', el('span', { class: 'chip', text: '#' + selIdx }));
    opsSec.appendChild(el('div', { class: 'row' }, [
      opBtn(ctx, 'Clear', opClear), opBtn(ctx, 'Flip H', opFlipH), opBtn(ctx, 'Flip V', opFlipV),
      opBtn(ctx, 'Rotate', opRotate), opBtn(ctx, 'Duplicate', opDuplicate),
    ]));
    var t = pool(state)[selIdx];
    var nameIn = el('input', { class: 'mini-input', type: 'text', value: (t && t.name) || '', placeholder: 'tile name' });
    nameIn.addEventListener('change', function () { t.name = nameIn.value; ctx.markDirty(); });
    opsSec.appendChild(el('div', { class: 'field', style: 'margin-top:6px' }, [el('span', { text: 'Name' }), nameIn]));
    var used = usage(state, selIdx);
    opsSec.appendChild(el('div', { class: 'dock-note', text: 'Used by ' + used + ' reference' + (used === 1 ? '' : 's') +
      '. Editing this tile updates every one of them. Use [ and ] to step tiles.' }));
    dock.appendChild(opsSec);

    // Bank grid.
    var gridSec = UI.section(bank === 'bg' ? 'BG tiles (256)' : 'Sprite tiles (256)');
    var reservedActive = bank === 'bg' && dialogueOn(state);
    var grid = el('div', { class: 'tile-grid' });
    grid.style.gridTemplateColumns = 'repeat(16,1fr)';
    for (var idx = 0; idx < 256; idx++) (function (ti) {
      var tl = pool(state)[ti];
      var blank = UI.isTileBlank(tl);
      var u = usage(state, ti);
      var reserved = reservedActive && isReservedGlyphSlot(ti);
      var cls = 'tile-cell';
      if (ti === selIdx) cls += ' sel';
      else if (!blank && u === 0) cls += ' orphan';
      else if (u > 1) cls += ' shared';
      else if (u > 0) cls += ' used';
      if (reserved) cls += ' reserved';
      var cell = el('button', { class: cls, draggable: 'true',
        title: 'Tile ' + ti + (u ? ' — used ' + u + '×' : (blank ? ' — free' : ' — orphan'))
          + (reserved ? ' · reserved for dialogue glyph "' + String.fromCharCode(ti) + '"' : '') + ' · drag onto another to swap',
        onclick: function () { selIdx = ti; ctx.renderLive(); ctx.renderDock(); },
        ondragstart: function (e) { dragFrom = ti; if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(ti)); } },
        ondragover: function (e) { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'; },
        ondrop: function (e) {
          e.preventDefault();
          if (dragFrom == null || dragFrom === ti) { dragFrom = null; return; }
          ctx.pushUndo(); swapTiles(state, dragFrom, ti); selIdx = ti; dragFrom = null;
          ctx.markDirty(); ctx.renderLive(); ctx.renderDock(); ctx.refresh();
        } });
      var cvs = bank === 'bg' ? UI.bgTileCanvas(state, tl, palIdx, 16) : UI.spriteTileCanvas(state, tl, palIdx, 16);
      cell.appendChild(cvs);
      grid.appendChild(cell);
    })(idx);
    gridSec.appendChild(grid);
    gridSec.appendChild(el('div', { class: 'dock-note', text: 'Orange = shared · green = used · red = orphan (drawn but unused) · dim = free. Drag a tile onto another to swap slots — every reference follows, so nothing changes on screen.' }));
    if (reservedActive) {
      gridSec.appendChild(el('div', { class: 'dock-note', style: 'color:var(--nes-lav)',
        text: 'Ⓣ Dialogue is on: the slots marked T (space, 0-9, A-Z, a-z) are reserved for text glyphs. Paint letters there to make dialogue readable; use other slots for scenery so you don’t clash.' }));
    }
    dock.appendChild(gridSec);
  }
  function tabBtn(ctx, id, label) {
    return el('button', { class: 'btn' + (bank === id ? ' primary' : ''), text: label,
      onclick: function () { bank = id; selIdx = Math.min(selIdx, 255); ctx.renderLive(); ctx.renderDock(); } });
  }
  function opBtn(ctx, label, fn) {
    return el('button', { class: 'btn', text: label, onclick: function () {
      ctx.pushUndo(); fn(ctx); ctx.markDirty(); ctx.renderLive(); ctx.renderDock(); ctx.refresh();
    } });
  }

  global.StudioModes = global.StudioModes || {};
  global.StudioModes.tiles = {
    stageTools: [
      { id: 'pencil', label: '✏ Pencil' },
      { id: 'erase', label: '🩹 Erase' },
    ],
    moreTools: [{ id: 'fill', label: '🪣 Fill' }],
    renderTV: renderTV,
    onRenderOverlay: onRenderOverlay,
    renderDock: renderDock,
    onToolChange: function (id) { if (id === 'erase') pen = 0; else if (pen === 0) pen = 1; },
    onTvDown: function (cell, ctx) {
      var p = pixelFromCell(cell); if (!p) return;
      ctx.pushUndo(); strokeOpen = true;
      if (ctx.getActiveTool() === 'fill') fill(ctx, p); else paint(ctx, p);
      ctx.renderLive();
    },
    onTvMove: function (cell, ctx) {
      if (!strokeOpen || ctx.getActiveTool() === 'fill') return;
      var p = pixelFromCell(cell); if (!p) return; paint(ctx, p); ctx.renderLive();
    },
    onTvUp: function (cell, ctx) { if (strokeOpen) { strokeOpen = false; ctx.markDirty(); ctx.renderDock(); ctx.refresh(); } },
    onKey: function (evt, ctx) {
      if (evt.key === '[') { selIdx = Math.max(0, selIdx - 1); ctx.renderLive(); ctx.renderDock(); }
      else if (evt.key === ']') { selIdx = Math.min(255, selIdx + 1); ctx.renderLive(); ctx.renderDock(); }
      else if (evt.key === 'ArrowLeft') { selIdx = Math.max(0, selIdx - 1); ctx.renderLive(); ctx.renderDock(); }
      else if (evt.key === 'ArrowRight') { selIdx = Math.min(255, selIdx + 1); ctx.renderLive(); ctx.renderDock(); }
      else if (evt.key === 'ArrowUp') { selIdx = Math.max(0, selIdx - 16); ctx.renderLive(); ctx.renderDock(); }
      else if (evt.key === 'ArrowDown') { selIdx = Math.min(255, selIdx + 16); ctx.renderLive(); ctx.renderDock(); }
    },
    _get: function () { return { bank: bank, selIdx: selIdx, pen: pen }; },
    _set: function (o) { if (o.bank) bank = o.bank; if (o.selIdx != null) selIdx = o.selIdx; },
    // Test/inspection hook for the reference-rewriting swap (2.3).
    _swap: function (a, b) { swapTiles(global.Studio.getState(), a, b); },
    // In-context focus target (2.4): jump here from CHARS/WORLD.
    focus: function (ctx, b, idx) { if (b) bank = b; if (idx != null) selIdx = Math.max(0, Math.min(255, idx | 0)); ctx.selectMode('tiles'); },
  };

  function fill(ctx, p) {
    var t = tile(ctx);
    var from = t.pixels[p.y][p.x];
    if (from === pen) return;
    var stack = [[p.x, p.y]];
    while (stack.length) {
      var q = stack.pop(), x = q[0], y = q[1];
      if (x < 0 || y < 0 || x > 7 || y > 7 || t.pixels[y][x] !== from) continue;
      t.pixels[y][x] = pen;
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
