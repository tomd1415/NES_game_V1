/*
 * CHARS mode (redesign Phase 1.2).
 *
 * The list of every character (metasprite) + its role, and drawing a
 * character by *assembling shared tiles*. The TV becomes a zoomed paint
 * canvas for the selected character; painting a pixel edits the shared
 * sprite_tile the cell points at (so edits propagate — the core NES
 * "everything references tiles" idea). Reads/writes state.sprites[] and
 * state.sprite_tiles[] — the same schema as the old Sprites page.
 *
 * Background-tile drawing is NOT here (it moves to TILES) — this dock
 * does one job: characters.
 */
(function (global) {
  'use strict';
  var UI = global.StudioUI;
  var el = UI.el;

  var ROLES = ['player', 'npc', 'enemy', 'item', 'tool', 'powerup', 'pickup',
    'projectile', 'decoration', 'hud', 'other'];

  var selIdx = 0;    // selected sprite index
  var pen = 1;       // 0=erase/transparent, 1-3 = palette colours
  var layout = null; // {originX, originY, scale, w, h} for pointer mapping
  var strokeOpen = false;

  function sprites(ctx) { return ctx.getState().sprites || (ctx.getState().sprites = []); }
  function current(ctx) {
    var arr = sprites(ctx);
    if (selIdx >= arr.length) selIdx = arr.length - 1;
    if (selIdx < 0) selIdx = 0;
    return arr[selIdx] || null;
  }
  function emptyCell() { return { tile: 0, palette: 0, flipH: false, flipV: false, priority: false, empty: true }; }
  function makeSprite(name) {
    return { name: name || 'character', role: 'other', flying: false, width: 2, height: 2,
      cells: [[emptyCell(), emptyCell()], [emptyCell(), emptyCell()]] };
  }

  function freeSpriteTile(state) {
    for (var i = 1; i < 256; i++) {
      if (UI.isTileBlank(state.sprite_tiles[i]) && UI.spriteTileUsage(state, i) === 0) return i;
    }
    return -1;
  }

  // ---- TV: zoomed sprite editor -----------------------------------------
  function renderTV(g, ctx) {
    var state = ctx.getState();
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#000'; g.fillRect(0, 0, 256, 240);
    var sp = current(ctx);
    if (!sp) { layout = null; return; }
    var w = sp.width * 8, h = sp.height * 8;
    var scale = Math.max(1, Math.floor(Math.min(216 / h, 232 / w)));
    var ox = Math.floor((256 - w * scale) / 2), oy = Math.floor((240 - h * scale) / 2);
    layout = { originX: ox, originY: oy, scale: scale, w: w, h: h };
    // Checkerboard for transparency.
    for (var i = 0; i < w; i++) for (var j = 0; j < h; j++) {
      g.fillStyle = ((Math.floor(i / 4) + Math.floor(j / 4)) & 1) ? '#181818' : '#242424';
      g.fillRect(ox + i * scale, oy + j * scale, scale, scale);
    }
    // Cells → tiles.
    for (var cr = 0; cr < sp.height; cr++) for (var cc = 0; cc < sp.width; cc++) {
      var cell = sp.cells[cr][cc];
      if (!cell || cell.empty) continue;
      var tile = state.sprite_tiles[cell.tile];
      var pal = global.NesRender.spritePaletteFor(state, cell.palette);
      UI.drawTilePixels(g, tile, pal, ox + cc * 8 * scale, oy + cr * 8 * scale, scale);
    }
  }
  function onRenderOverlay(g, ctx) {
    if (!layout) return;
    var sp = current(ctx);
    var s = layout.scale;
    g.globalAlpha = 0.3; g.strokeStyle = '#000'; g.lineWidth = 1;
    for (var x = 0; x <= layout.w; x++) { g.beginPath(); g.moveTo(layout.originX + x * s + 0.5, layout.originY); g.lineTo(layout.originX + x * s + 0.5, layout.originY + layout.h * s); g.stroke(); }
    for (var y = 0; y <= layout.h; y++) { g.beginPath(); g.moveTo(layout.originX, layout.originY + y * s + 0.5); g.lineTo(layout.originX + layout.w * s, layout.originY + y * s + 0.5); g.stroke(); }
    // Cell boundaries brighter.
    g.globalAlpha = 0.7; g.strokeStyle = '#2CD5F6';
    for (var cx = 0; cx <= sp.width; cx++) { g.beginPath(); g.moveTo(layout.originX + cx * 8 * s + 0.5, layout.originY); g.lineTo(layout.originX + cx * 8 * s + 0.5, layout.originY + layout.h * s); g.stroke(); }
    for (var cy = 0; cy <= sp.height; cy++) { g.beginPath(); g.moveTo(layout.originX, layout.originY + cy * 8 * s + 0.5); g.lineTo(layout.originX + layout.w * s, layout.originY + cy * 8 * s + 0.5); g.stroke(); }
    g.globalAlpha = 1;
  }

  function pixelFromCell(cell) {
    if (!layout) return null;
    var sx = Math.floor((cell.px - layout.originX) / layout.scale);
    var sy = Math.floor((cell.py - layout.originY) / layout.scale);
    if (sx < 0 || sy < 0 || sx >= layout.w || sy >= layout.h) return null;
    return { sx: sx, sy: sy, cc: Math.floor(sx / 8), cr: Math.floor(sy / 8), tx: sx % 8, ty: sy % 8 };
  }
  function paintPixel(ctx, p) {
    var state = ctx.getState();
    var sp = current(ctx);
    var cell = sp.cells[p.cr][p.cc];
    if (cell.empty) {
      var t = freeSpriteTile(state);
      if (t < 0) return; // sprite CHR full
      cell.tile = t; cell.empty = false;
    }
    var tile = state.sprite_tiles[cell.tile];
    if (!tile || !tile.pixels) return;
    tile.pixels[p.ty][p.tx] = pen;
  }

  // ---- Dock --------------------------------------------------------------
  function renderDock(dock, ctx) {
    var state = ctx.getState();
    var arr = sprites(ctx);

    // --- Character list ---
    var listSec = UI.section('Characters', el('button', { class: 'btn', text: '+ New', onclick: function () {
      ctx.pushUndo();
      arr.push(makeSprite('character ' + (arr.length + 1)));
      selIdx = arr.length - 1;
      ctx.markDirty(); ctx.renderLive(); ctx.renderDock();
    } }));
    arr.forEach(function (sp, idx) {
      var row = el('div', { class: 'entity-row char-row' + (idx === selIdx ? ' sel' : '') });
      var thumb = UI.spriteCanvas(state, sp, 26);
      thumb.className = 'thumb';
      row.appendChild(thumb);
      row.appendChild(el('span', { class: 'grow', text: sp.name || ('character ' + idx) }));
      row.appendChild(el('span', { class: 'chip', text: sp.role || 'other' }));
      row.addEventListener('click', function () { selIdx = idx; ctx.renderLive(); ctx.renderDock(); });
      listSec.appendChild(row);
    });
    dock.appendChild(listSec);

    var sp = current(ctx);
    if (!sp) {
      dock.appendChild(el('div', { class: 'placeholder', text: 'No characters yet — press + New to make one.' }));
      return;
    }

    // --- Character properties ---
    var propSec = UI.section('This character');
    var nameIn = el('input', { class: 'mini-input', type: 'text', value: sp.name || '' });
    nameIn.addEventListener('change', function () { sp.name = nameIn.value; ctx.markDirty(); ctx.renderDock(); });
    propSec.appendChild(el('div', { class: 'field' }, [el('span', { text: 'Name' }), nameIn]));

    // Role (the notes.md question: where to set a character's role).
    var roleSel = el('select', { 'data-role': '1' });
    ROLES.forEach(function (r) { roleSel.appendChild(el('option', { value: r, text: r })); });
    roleSel.value = sp.role || 'other';
    roleSel.addEventListener('change', function () { ctx.pushUndo(); sp.role = roleSel.value; ctx.markDirty(); ctx.renderDock(); ctx.refresh(); });
    propSec.appendChild(el('div', { class: 'field' }, [el('span', { text: 'Role' }), roleSel]));

    var flyWrap = el('label', { class: 'switch' });
    var flyCb = el('input', { type: 'checkbox' }); flyCb.checked = !!sp.flying;
    flyCb.addEventListener('change', function () { sp.flying = flyCb.checked; ctx.markDirty(); });
    flyWrap.appendChild(flyCb); flyWrap.appendChild(el('span', { text: 'Flying (ignore gravity)' }));
    propSec.appendChild(el('div', { class: 'field' }, [flyWrap]));

    // Dimensions.
    var dimRow = el('div', { class: 'row' }, [
      el('span', { text: 'Size' }),
      dimSelect(ctx, sp, 'width'), el('span', { text: '×' }), dimSelect(ctx, sp, 'height'),
      el('span', { class: 'dock-note', style: 'margin:0', text: 'tiles' }),
    ]);
    propSec.appendChild(el('div', { class: 'field' }, [dimRow]));

    propSec.appendChild(el('div', { class: 'row', style: 'margin-top:6px' }, [
      el('button', { class: 'btn', text: 'Duplicate', onclick: function () {
        ctx.pushUndo();
        var copy = JSON.parse(JSON.stringify(sp)); copy.name = (sp.name || 'character') + ' copy';
        arr.splice(selIdx + 1, 0, copy); selIdx += 1;
        ctx.markDirty(); ctx.renderLive(); ctx.renderDock();
      } }),
      el('button', { class: 'btn', text: 'Delete', onclick: function () {
        if (arr.length <= 1) { alert('Keep at least one character.'); return; }
        if (!confirm('Delete "' + (sp.name || 'character') + '"?')) return;
        ctx.pushUndo(); arr.splice(selIdx, 1); selIdx = Math.max(0, selIdx - 1);
        ctx.markDirty(); ctx.renderLive(); ctx.renderDock(); ctx.refresh();
      } }),
    ]));
    dock.appendChild(propSec);

    // --- Pen ---
    var penSec = UI.section('Pen', el('span', { class: 'chip', text: 'draw' }));
    var palRow = el('div', { class: 'swatch-row' });
    var spPal = global.NesRender.spritePaletteFor(state, (sp.cells[0][0] && sp.cells[0][0].palette) || 0);
    var colors = [null, spPal.slot1, spPal.slot2, spPal.slot3];
    for (var v = 0; v < 4; v++) (function (val) {
      var css = val === 0 ? 'transparent' : global.NesRender.nesRgb(colors[val]);
      var sw = el('button', { class: 'swatch' + (val === pen ? ' sel' : '') + (val === 0 ? ' locked' : ''),
        style: 'background:' + css, title: val === 0 ? 'Erase (transparent)' : 'Colour ' + val,
        onclick: function () { pen = val; ctx.renderDock(); } });
      palRow.appendChild(sw);
    })(v);
    penSec.appendChild(palRow);
    penSec.appendChild(el('div', { class: 'dock-note', text: 'Draw on the big canvas. Each 8×8 cell is a shared tile — editing it updates every character that uses it.' }));
    dock.appendChild(penSec);

    renderAnimations(dock, ctx);
  }

  var animSel = null;
  function ensureAnim(ctx) {
    var s = ctx.getState();
    if (!Array.isArray(s.animations)) s.animations = [];
    if (!s.animation_assignments) s.animation_assignments = { walk: null, jump: null, attack: null };
    if (typeof s.nextAnimationId !== 'number' || s.nextAnimationId < 1) s.nextAnimationId = 1;
    return s;
  }
  function renderAnimations(dock, ctx) {
    var s = ensureAnim(ctx);
    var sec = UI.section('Animations', el('button', { class: 'btn', text: '+ New', onclick: function () {
      ctx.pushUndo();
      var noWalk = s.animation_assignments.walk == null;
      var an = { id: s.nextAnimationId++, name: (noWalk ? 'walk' : 'anim ' + s.animations.length),
        frames: [selIdx], fps: 8, role: 'player', style: noWalk ? 'walk' : 'custom' };
      s.animations.push(an);
      animSel = an.id;
      // Auto-wire the first walk animation so the player animates + the
      // "no walk animation" warning clears immediately.
      if (noWalk) s.animation_assignments.walk = an.id;
      ctx.markDirty(); ctx.renderDock(); ctx.refresh();
    } }));

    s.animations.forEach(function (an) {
      var row = el('div', { class: 'entity-row anim-row' + (an.id === animSel ? ' sel' : '') }, [
        el('span', { class: 'grow', text: (an.name || 'anim') + ' — ' + an.frames.length + 'f @' + an.fps }),
        el('button', { class: 'icon-btn', title: 'Delete', text: '🗑', onclick: function (e) {
          e.stopPropagation();
          ctx.pushUndo();
          var i = s.animations.indexOf(an); if (i >= 0) s.animations.splice(i, 1);
          ['walk', 'jump', 'attack'].forEach(function (k) { if (s.animation_assignments[k] === an.id) s.animation_assignments[k] = null; });
          if (animSel === an.id) animSel = null;
          ctx.markDirty(); ctx.renderDock(); ctx.refresh();
        } }),
      ]);
      row.addEventListener('click', function () { animSel = an.id; ctx.renderDock(); });
      sec.appendChild(row);
    });

    var cur = s.animations.find(function (a) { return a.id === animSel; });
    if (cur) {
      var box = el('div', { style: 'border:2px solid var(--sel);padding:8px;margin-top:6px' });
      var nameIn = el('input', { class: 'mini-input', type: 'text', value: cur.name });
      nameIn.addEventListener('change', function () { cur.name = nameIn.value; ctx.markDirty(); ctx.renderDock(); });
      box.appendChild(el('div', { class: 'field' }, [el('span', { text: 'Name' }), nameIn]));
      var fpsIn = el('input', { type: 'number', min: 1, max: 60 }); fpsIn.value = cur.fps;
      fpsIn.addEventListener('change', function () { cur.fps = Math.max(1, Math.min(60, parseInt(fpsIn.value, 10) || 8)); ctx.markDirty(); ctx.renderDock(); });
      box.appendChild(el('div', { class: 'field' }, [el('span', { text: 'Speed (fps)' }), fpsIn]));
      box.appendChild(el('div', { class: 'dock-note', text: 'Frames: ' + cur.frames.map(function (f) { var sp = (s.sprites[f]); return sp ? (sp.name || f) : f; }).join(', ') }));
      box.appendChild(el('button', { class: 'btn', style: 'margin-top:4px', text: '+ Add this character as a frame', onclick: function () {
        ctx.pushUndo(); cur.frames.push(selIdx); ctx.markDirty(); ctx.renderDock();
      } }));
      if (cur.frames.length > 1) {
        box.appendChild(el('button', { class: 'btn', style: 'margin-top:4px', text: 'Remove last frame', onclick: function () {
          ctx.pushUndo(); cur.frames.pop(); ctx.markDirty(); ctx.renderDock();
        } }));
      }
      sec.appendChild(box);
    }

    // Walk / jump / attack assignments (the server-facing contract).
    var asgn = el('div', { style: 'margin-top:8px' });
    ['walk', 'jump', 'attack'].forEach(function (kind) {
      var sel2 = el('select', { 'data-assign': kind });
      sel2.appendChild(el('option', { value: '', text: '(none)' }));
      s.animations.forEach(function (an) { sel2.appendChild(el('option', { value: String(an.id), text: an.name || ('anim ' + an.id) })); });
      sel2.value = s.animation_assignments[kind] == null ? '' : String(s.animation_assignments[kind]);
      sel2.addEventListener('change', function () {
        ctx.pushUndo();
        s.animation_assignments[kind] = sel2.value === '' ? null : parseInt(sel2.value, 10);
        ctx.markDirty(); ctx.refresh();
      });
      asgn.appendChild(el('div', { class: 'field' }, [el('span', { text: kind[0].toUpperCase() + kind.slice(1) + ' animation' }), sel2]));
    });
    sec.appendChild(asgn);
    dock.appendChild(sec);
  }

  function dimSelect(ctx, sp, dim) {
    var sel = el('select');
    for (var i = 1; i <= 8; i++) sel.appendChild(el('option', { value: i, text: i }));
    sel.value = sp[dim];
    sel.addEventListener('change', function () {
      ctx.pushUndo();
      resize(sp, dim, parseInt(sel.value, 10));
      ctx.markDirty(); ctx.renderLive(); ctx.renderDock();
    });
    return sel;
  }
  function resize(sp, dim, n) {
    sp[dim] = n;
    var W = sp.width, H = sp.height;
    var cells = [];
    for (var r = 0; r < H; r++) {
      var row = [];
      for (var c = 0; c < W; c++) {
        row.push((sp.cells[r] && sp.cells[r][c]) ? sp.cells[r][c] : emptyCell());
      }
      cells.push(row);
    }
    sp.cells = cells;
  }

  global.StudioModes = global.StudioModes || {};
  global.StudioModes.chars = {
    stageTools: [
      { id: 'pencil', label: '✏ Pencil' },
      { id: 'erase', label: '🩹 Erase' },
    ],
    moreTools: [
      { id: 'fill', label: '🪣 Fill' },
    ],
    renderTV: renderTV,
    onRenderOverlay: onRenderOverlay,
    renderDock: renderDock,
    onEnter: function (ctx) { if (selIdx >= sprites(ctx).length) selIdx = 0; },
    onToolChange: function (id) { if (id === 'erase') pen = 0; else if (pen === 0) pen = 1; },
    onTvDown: function (cell, ctx) {
      var p = pixelFromCell(cell); if (!p) return;
      ctx.pushUndo(); strokeOpen = true;
      var tool = ctx.getActiveTool();
      if (tool === 'fill') fillTile(ctx, p); else paintPixel(ctx, p);
      ctx.renderLive();
    },
    onTvMove: function (cell, ctx) {
      if (!strokeOpen || ctx.getActiveTool() === 'fill') return;
      var p = pixelFromCell(cell); if (!p) return;
      paintPixel(ctx, p); ctx.renderLive();
    },
    onTvUp: function (cell, ctx) { if (strokeOpen) { strokeOpen = false; ctx.markDirty(); ctx.renderDock(); ctx.refresh(); } },
    _get: function () { return { selIdx: selIdx, pen: pen }; },
    _select: function (i) { selIdx = i; },
  };

  // Flood fill within a single tile-cell.
  function fillTile(ctx, p) {
    var state = ctx.getState();
    var sp = current(ctx);
    var cell = sp.cells[p.cr][p.cc];
    if (cell.empty) { var t = freeSpriteTile(state); if (t < 0) return; cell.tile = t; cell.empty = false; }
    var tile = state.sprite_tiles[cell.tile];
    var from = tile.pixels[p.ty][p.tx];
    if (from === pen) return;
    var stack = [[p.tx, p.ty]];
    while (stack.length) {
      var q = stack.pop(), x = q[0], y = q[1];
      if (x < 0 || y < 0 || x > 7 || y > 7) continue;
      if (tile.pixels[y][x] !== from) continue;
      tile.pixels[y][x] = pen;
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
