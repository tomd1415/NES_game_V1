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
  var shapeStart = null; // line/rect start (sprite-space {sx,sy})
  var shapeEnd = null;   // line/rect current end

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
      UI.drawTilePixels(g, tile, pal, ox + cc * 8 * scale, oy + cr * 8 * scale, scale, cell.flipH, cell.flipV);
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
    // Live line/rect preview.
    if (strokeOpen && shapeStart && shapeEnd) {
      var tool = ctx.getActiveTool();
      if (tool === 'line' || tool === 'rect') {
        g.fillStyle = 'rgba(250,158,0,0.55)';
        shapePixels(shapeStart, shapeEnd, tool).forEach(function (pt) {
          if (pt.sx < 0 || pt.sy < 0 || pt.sx >= layout.w || pt.sy >= layout.h) return;
          g.fillRect(layout.originX + pt.sx * s, layout.originY + pt.sy * s, s, s);
        });
      }
    }
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
    // Map the clicked (screen) pixel back through the cell's flip so a
    // flipped cell paints where the user aimed, not its mirror.
    var sx = cell.flipH ? 7 - p.tx : p.tx;
    var sy = cell.flipV ? 7 - p.ty : p.ty;
    tile.pixels[sy][sx] = pen;
  }

  // ---- Shared-tile "Duplicate first" safeguard ---------------------------
  // Tiles painted here are shared CHR — editing one changes every character
  // (and cell) that references it. Before the first stroke on a shared tile
  // we warn, offering: duplicate a private copy, change everywhere, cancel.
  var ackTiles = {};   // tileIdx -> true once the user has chosen for it

  // List other cells (this or another character) that reference tileIdx,
  // excluding the cell being edited. Human-readable for the dialog.
  function otherUsesOfTile(state, tileIdx, sp, cr, cc) {
    var uses = [];
    (state.sprites || []).forEach(function (osp) {
      (osp.cells || []).forEach(function (row, r) {
        (row || []).forEach(function (cell, c) {
          if (!cell || cell.empty || (cell.tile | 0) !== tileIdx) return;
          if (osp === sp && r === cr && c === cc) return; // the cell we're editing
          uses.push({ text: (osp.name || 'character') + ' — cell (' + (r + 1) + ',' + (c + 1) + ')' });
        });
      });
    });
    return uses;
  }

  function clonePixels(px) { return px.map(function (r) { return r.slice(); }); }

  // Decide how to handle a paint on a (possibly shared) tile. `proceed()`
  // does the actual pixel write + renders (NO pushUndo — this function owns
  // undo so a "duplicate then paint" gesture is a single undo unit).
  function guardSharedThen(ctx, p, proceed) {
    var state = ctx.getState();
    var sp = current(ctx);
    var cell = sp.cells[p.cr][p.cc];
    // Empty cell → paint allocates a fresh tile; nothing shared to protect.
    if (cell.empty) { ctx.pushUndo(); proceed(); return; }
    var idx = cell.tile | 0;
    if (idx === 0 || ackTiles[idx]) { ctx.pushUndo(); proceed(); return; }
    var uses = otherUsesOfTile(state, idx, sp, p.cr, p.cc);
    if (!uses.length) { ackTiles[idx] = true; ctx.pushUndo(); proceed(); return; }

    var list = el('ul', { class: 'shared-list', style: 'margin:6px 0;padding-left:18px;font-size:11px;color:var(--muted);max-height:140px;overflow:auto' });
    uses.slice(0, 20).forEach(function (u) { list.appendChild(el('li', { text: u.text })); });
    if (uses.length > 20) list.appendChild(el('li', { text: '…and ' + (uses.length - 20) + ' more' }));

    UI.modal({
      title: 'This tile is shared',
      sub: 'Tile 0x' + idx.toString(16).toUpperCase() + ' is used in ' + uses.length + ' other place'
        + (uses.length === 1 ? '' : 's') + '. Editing it changes them all.',
      bodyNodes: [list],
      actions: [
        { label: 'Cancel', value: 'cancel' },
        { label: 'Change everywhere', value: 'everywhere' },
        { label: 'Duplicate first & edit copy', value: 'duplicate', kind: 'primary' },
      ],
    }).then(function (choice) {
      if (choice === 'cancel' || choice == null) return;
      if (choice === 'everywhere') { ackTiles[idx] = true; ctx.pushUndo(); proceed(); return; }
      // duplicate: copy the tile into a free slot and point THIS cell at it,
      // all under one undo with the paint that follows.
      var dst = freeSpriteTile(state);
      if (dst < 0) {
        UI.modal({ title: 'No free tiles', sub: 'All 256 sprite tiles are in use — free one in TILES, then try again.',
          actions: [{ label: 'OK', value: 'ok', kind: 'primary' }] });
        return;
      }
      ctx.pushUndo();
      var src = state.sprite_tiles[idx];
      state.sprite_tiles[dst] = { pixels: clonePixels(src.pixels), name: src.name ? src.name + '_copy' : '' };
      cell.tile = dst; cell.empty = false;
      ackTiles[dst] = true;
      proceed(); ctx.renderDock();
    });
  }

  // ---- Dock --------------------------------------------------------------
  function renderDock(dock, ctx) {
    var state = ctx.getState();
    var arr = sprites(ctx);

    // --- Character list ---
    var listSec = UI.section('Characters', el('button', { class: 'btn', id: 'chars-new', text: '+ New', onclick: function () {
      ctx.pushUndo();
      arr.push(makeSprite('character ' + (arr.length + 1)));
      // Give the new character a default reaction map so RULES stays aligned.
      if (global.StudioRules) global.StudioRules.syncReactions(state);
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
      row.addEventListener('click', function () { selIdx = idx; ackTiles = {}; ctx.renderLive(); ctx.renderDock(); });
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
        // Bug #18 — give the copy its OWN tiles so editing it won't change the
        // original. Map each distinct source tile to a fresh slot (preserving
        // the sprite's internal tile reuse); the blank tile 0 stays shared, and
        // if the 256-slot pool is full we fall back to sharing that tile (the
        // paint-time shared-tile safeguard still protects it).
        var remap = {};
        (copy.cells || []).forEach(function (row) {
          (row || []).forEach(function (cell) {
            if (!cell || cell.empty) return;
            var oldIdx = cell.tile | 0;
            if (oldIdx === 0) return;
            if (remap[oldIdx] == null) {
              var src = state.sprite_tiles[oldIdx];
              if (!src || !src.pixels) { remap[oldIdx] = oldIdx; return; }
              var dst = freeSpriteTile(state);
              if (dst < 0) { remap[oldIdx] = oldIdx; return; }
              state.sprite_tiles[dst] = { pixels: clonePixels(src.pixels), name: src.name ? src.name + '_copy' : '' };
              remap[oldIdx] = dst;
            }
            cell.tile = remap[oldIdx];
          });
        });
        arr.splice(selIdx + 1, 0, copy);
        // Keep behaviour_reactions index-aligned with the sprite list.
        if (Array.isArray(state.behaviour_reactions)) {
          var srcR = state.behaviour_reactions[selIdx];
          var dupR = srcR ? JSON.parse(JSON.stringify(srcR))
            : (global.StudioRules ? global.StudioRules.defaultReactionMap(copy, selIdx + 1) : {});
          state.behaviour_reactions.splice(selIdx + 1, 0, dupR);
        }
        selIdx += 1;
        ctx.markDirty(); ctx.renderLive(); ctx.renderDock();
      } }),
      el('button', { class: 'btn', text: 'Delete', onclick: function () {
        if (arr.length <= 1) { alert('Keep at least one character.'); return; }
        if (!confirm('Delete "' + (sp.name || 'character') + '"?')) return;
        ctx.pushUndo(); arr.splice(selIdx, 1);
        if (Array.isArray(state.behaviour_reactions)) state.behaviour_reactions.splice(selIdx, 1);
        selIdx = Math.max(0, selIdx - 1);
        ctx.markDirty(); ctx.renderLive(); ctx.renderDock(); ctx.refresh();
      } }),
    ]));
    // Non-destructive whole-character transforms (Maker+): rearrange cells +
    // toggle per-cell flip flags. Shared tile pixels are never touched, so
    // other characters using the same tiles are unaffected.
    if (ctx.levelAtLeast('maker')) {
      propSec.appendChild(el('div', { class: 'row', style: 'margin-top:4px' }, [
        el('button', { class: 'btn', text: '⇋ Flip H', title: 'Mirror left/right', onclick: function () {
          ctx.pushUndo(); flipChar(sp, 'h'); ctx.markDirty(); ctx.renderLive(); ctx.renderDock();
        } }),
        el('button', { class: 'btn', text: '⇵ Flip V', title: 'Mirror up/down', onclick: function () {
          ctx.pushUndo(); flipChar(sp, 'v'); ctx.markDirty(); ctx.renderLive(); ctx.renderDock();
        } }),
      ]));
    }
    dock.appendChild(propSec);

    // --- Pen ---
    var penSec = UI.section('Pen', el('span', { class: 'chip', text: 'draw' }));

    // Palette picker (bug #1): choose which of the 4 sprite palettes this
    // character draws with. Applies to all its cells so the Pen colours,
    // the canvas and the LIVE render all agree.
    var curPal = (sp.cells[0][0] && sp.cells[0][0].palette) || 0;
    var palPick = el('div', { class: 'row', 'data-char-pal': '1' });
    for (var ppi = 0; ppi < 4; ppi++) (function (p) {
      var sPal = global.NesRender.spritePaletteFor(state, p);
      var btn = el('button', { class: 'btn' + (p === curPal ? ' primary' : ''), title: 'Sprite palette ' + p, 'data-pal': String(p),
        onclick: function () {
          ctx.pushUndo();
          sp.cells.forEach(function (row) { row.forEach(function (cell) { cell.palette = p; }); });
          ctx.markDirty(); ctx.renderLive(); ctx.renderDock();
        } });
      // Tiny 3-colour swatch strip so pupils see each palette.
      [sPal.slot1, sPal.slot2, sPal.slot3].forEach(function (c) {
        btn.appendChild(el('span', { style: 'display:inline-block;width:7px;height:7px;margin-left:2px;vertical-align:middle;border:1px solid #000;background:' + global.NesRender.nesRgb(c) }));
      });
      btn.insertBefore(document.createTextNode('SP ' + p), btn.firstChild);
      palPick.appendChild(btn);
    })(ppi);
    penSec.appendChild(el('div', { class: 'field' }, [el('span', { text: 'Palette' }), palPick]));

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
    // In-context jump-in to TILES (2.4), focused on this character's first
    // tile — Maker+, since TILES itself is a Maker mode.
    if (ctx.levelAtLeast('maker') && global.StudioModes.tiles && global.StudioModes.tiles.focus) {
      penSec.appendChild(el('button', { class: 'btn', style: 'margin-top:6px', text: '✎ Edit these tiles in TILES', onclick: function () {
        global.StudioModes.tiles.focus(ctx, 'sprite', firstTileOf(sp));
      } }));
    }
    dock.appendChild(penSec);

    // Animations are a Maker-level concept (a still character is fine for a
    // first game); hide the whole section for Beginners.
    if (ctx.levelAtLeast('maker')) renderAnimations(dock, ctx);
  }

  var animSel = null;
  var previewTimer = null;   // animation preview interval id
  var previewFrame = 0;
  function stopPreview() { if (previewTimer) { clearInterval(previewTimer); previewTimer = null; } }
  function startPreview(ctx, an, cv) {
    stopPreview();
    var state = ctx.getState();
    var g = cv.getContext('2d');
    previewFrame = 0;
    var draw = function () {
      var idx = an.frames[previewFrame % an.frames.length];
      var sp = state.sprites[idx];
      g.clearRect(0, 0, cv.width, cv.height);
      g.fillStyle = '#101010'; g.fillRect(0, 0, cv.width, cv.height);
      if (sp) global.NesRender.drawSpriteIntoCtx(g, sp, state, cv.width, cv.height);
      previewFrame++;
    };
    draw();
    previewTimer = setInterval(draw, Math.max(30, Math.round(1000 / (an.fps || 8))));
  }
  function ensureAnim(ctx) {
    var s = ctx.getState();
    if (!Array.isArray(s.animations)) s.animations = [];
    if (!s.animation_assignments) s.animation_assignments = { walk: null, jump: null, attack: null };
    if (typeof s.nextAnimationId !== 'number' || s.nextAnimationId < 1) s.nextAnimationId = 1;
    return s;
  }
  function renderAnimations(dock, ctx) {
    stopPreview();   // any dock rebuild invalidates the previous preview canvas
    var s = ensureAnim(ctx);
    var sec = UI.section('Animations', el('button', { class: 'btn', text: '+ New', onclick: function () {
      ctx.pushUndo();
      // #17 — tag the new animation for the SELECTED character's role so
      // enemies and pickups can animate too (the engine + server bake
      // ANIM_ENEMY_WALK / ANIM_PICKUP_IDLE from role+style-tagged animations).
      // Player is the default and keeps its walk auto-wire.
      var selRole = (s.sprites[selIdx] && s.sprites[selIdx].role) || 'player';
      var an;
      if (selRole === 'enemy') {
        an = { id: s.nextAnimationId++, name: 'enemy walk', frames: [selIdx], fps: 6, role: 'enemy', style: 'walk' };
      } else if (selRole === 'pickup') {
        an = { id: s.nextAnimationId++, name: 'pickup bob', frames: [selIdx], fps: 4, role: 'pickup', style: 'idle' };
      } else {
        var noWalk = s.animation_assignments.walk == null;
        an = { id: s.nextAnimationId++, name: (noWalk ? 'walk' : 'anim ' + s.animations.length),
          frames: [selIdx], fps: 8, role: 'player', style: noWalk ? 'walk' : 'custom' };
        // Auto-wire the first walk animation so the player animates + the
        // "no walk animation" warning clears immediately.
        if (noWalk) s.animation_assignments.walk = an.id;
      }
      s.animations.push(an);
      animSel = an.id;
      ctx.markDirty(); ctx.renderDock(); ctx.refresh();
    } }));

    s.animations.forEach(function (an) {
      var row = el('div', { class: 'entity-row anim-row' + (an.id === animSel ? ' sel' : '') }, [
        el('span', { class: 'grow', text: (an.name || 'anim') + ' — ' + an.frames.length + 'f @' + an.fps }),
        el('span', { class: 'chip', style: 'font-size:10px;opacity:0.75', text: (an.role || 'player') + (an.style ? '·' + an.style : '') }),
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

      // Animation preview player.
      var pv = el('canvas', { width: 48, height: 48, style: 'image-rendering:pixelated;border:1px solid var(--line);background:#101010' });
      var playBtn = el('button', { class: 'btn', text: '▶ Preview' });
      playBtn.addEventListener('click', function () {
        if (previewTimer) { stopPreview(); playBtn.textContent = '▶ Preview'; }
        else if (cur.frames.length) { startPreview(ctx, cur, pv); playBtn.textContent = '⏸ Stop'; }
      });
      box.appendChild(el('div', { class: 'row', style: 'margin-top:6px;align-items:center;gap:8px' }, [pv, playBtn]));
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

  // Mirror a whole metasprite: reverse cell order along the axis and toggle
  // the matching per-cell flip flag. Non-destructive to the shared tiles.
  function flipChar(sp, axis) {
    if (axis === 'h') {
      sp.cells = sp.cells.map(function (row) {
        return row.slice().reverse().map(function (cell) {
          if (!cell.empty) cell.flipH = !cell.flipH;
          return cell;
        });
      });
    } else {
      sp.cells = sp.cells.slice().reverse().map(function (row) {
        return row.map(function (cell) {
          if (!cell.empty) cell.flipV = !cell.flipV;
          return cell;
        });
      });
    }
  }

  // The first tile a character actually draws with (for the TILES jump-in).
  function firstTileOf(sp) {
    var rows = sp && sp.cells || [];
    for (var r = 0; r < rows.length; r++) for (var c = 0; c < rows[r].length; c++) {
      var cell = rows[r][c];
      if (cell && !cell.empty) return cell.tile | 0;
    }
    return 1;
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
      { id: 'line', label: '📏 Line' },
      { id: 'rect', label: '▭ Rect' },
    ],
    renderTV: renderTV,
    onRenderOverlay: onRenderOverlay,
    renderDock: renderDock,
    onEnter: function (ctx) { if (selIdx >= sprites(ctx).length) selIdx = 0; ackTiles = {}; },
    onExit: function () { stopPreview(); },
    onToolChange: function (id) { if (id === 'erase') pen = 0; else if (pen === 0) pen = 1; },
    onTvDown: function (cell, ctx) {
      var p = pixelFromCell(cell); if (!p) return;
      var tool = ctx.getActiveTool();
      if (tool === 'line' || tool === 'rect') {
        ctx.pushUndo(); strokeOpen = true;
        shapeStart = { sx: p.sx, sy: p.sy }; shapeEnd = { sx: p.sx, sy: p.sy };
        ctx.renderLive(); return;
      }
      // The shared-tile guard owns pushUndo; proceed() only paints + renders.
      guardSharedThen(ctx, p, function () {
        strokeOpen = true;
        if (tool === 'fill') fillTile(ctx, p); else paintPixel(ctx, p);
        ctx.markDirty(); ctx.renderLive();
      });
    },
    onTvMove: function (cell, ctx) {
      if (!strokeOpen) return;
      var tool = ctx.getActiveTool();
      var p = pixelFromCell(cell); if (!p) return;
      if (tool === 'line' || tool === 'rect') { shapeEnd = { sx: p.sx, sy: p.sy }; ctx.renderLive(); return; }
      if (tool === 'fill') return;
      paintPixel(ctx, p); ctx.renderLive();
    },
    onTvUp: function (cell, ctx) {
      if (!strokeOpen) return;
      var tool = ctx.getActiveTool();
      if ((tool === 'line' || tool === 'rect') && shapeStart) {
        commitShape(ctx, tool);
        shapeStart = null; shapeEnd = null;
      }
      strokeOpen = false; ctx.markDirty(); ctx.renderLive(); ctx.renderDock(); ctx.refresh();
    },
    _get: function () { return { selIdx: selIdx, pen: pen }; },
    _select: function (i) { selIdx = i; },
  };

  // Line + rectangle over the whole metasprite (bug #2). Pixels are in
  // sprite-space (sx,sy) spanning width*8 × height*8; each maps to its cell +
  // tile and paints via paintPixel (which handles allocation + flip).
  function shapePixels(a, b, tool) {
    var pts = [];
    if (tool === 'line') {
      var x0 = a.sx, y0 = a.sy, x1 = b.sx, y1 = b.sy;
      var dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
      var sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx + dy;
      while (true) {
        pts.push({ sx: x0, sy: y0 });
        if (x0 === x1 && y0 === y1) break;
        var e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
      }
    } else {
      var lx = Math.min(a.sx, b.sx), rx = Math.max(a.sx, b.sx);
      var ty = Math.min(a.sy, b.sy), by = Math.max(a.sy, b.sy);
      for (var x = lx; x <= rx; x++) { pts.push({ sx: x, sy: ty }); pts.push({ sx: x, sy: by }); }
      for (var y = ty; y <= by; y++) { pts.push({ sx: lx, sy: y }); pts.push({ sx: rx, sy: y }); }
    }
    return pts;
  }
  function paintSpritePixel(ctx, sx, sy) {
    var sp = current(ctx);
    if (!sp || sx < 0 || sy < 0 || sx >= sp.width * 8 || sy >= sp.height * 8) return;
    paintPixel(ctx, { cr: sy >> 3, cc: sx >> 3, tx: sx & 7, ty: sy & 7 });
  }
  function commitShape(ctx, tool) {
    shapePixels(shapeStart, shapeEnd || shapeStart, tool).forEach(function (pt) {
      paintSpritePixel(ctx, pt.sx, pt.sy);
    });
  }

  // Flood fill within a single tile-cell.
  function fillTile(ctx, p) {
    var state = ctx.getState();
    var sp = current(ctx);
    var cell = sp.cells[p.cr][p.cc];
    if (cell.empty) { var t = freeSpriteTile(state); if (t < 0) return; cell.tile = t; cell.empty = false; }
    var tile = state.sprite_tiles[cell.tile];
    var sx0 = cell.flipH ? 7 - p.tx : p.tx;
    var sy0 = cell.flipV ? 7 - p.ty : p.ty;
    var from = tile.pixels[sy0][sx0];
    if (from === pen) return;
    var stack = [[sx0, sy0]];
    while (stack.length) {
      var q = stack.pop(), x = q[0], y = q[1];
      if (x < 0 || y < 0 || x > 7 || y > 7) continue;
      if (tile.pixels[y][x] !== from) continue;
      tile.pixels[y][x] = pen;
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
