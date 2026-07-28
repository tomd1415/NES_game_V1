/*
 * Shared UI helpers for the Studio mode modules (window.StudioUI).
 *
 * Small, dependency-light DOM + canvas helpers so WORLD / CHARS / TILES /
 * PALS render tiles, swatches and lists consistently. Rendering delegates
 * to window.NesRender for the single NES-palette source of truth.
 */
(function (global) {
  'use strict';

  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') n.className = attrs[k];
        else if (k === 'text') n.textContent = attrs[k];
        else if (k === 'html') n.innerHTML = attrs[k];
        else if (k === 'style') n.style.cssText = attrs[k];
        else if (k.slice(0, 2) === 'on' && typeof attrs[k] === 'function') {
          n.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
        } else if (attrs[k] != null) n.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach(function (c) {
      if (c == null) return;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  }

  function section(title, rightNode) {
    var head = el('div', { class: 'title' }, [title]);
    if (rightNode) head.appendChild(rightNode);
    return el('div', { class: 'dock-section' }, [head]);
  }

  // Draw an 8×8 tile (values 0-3) into a 2d context using a bg/sprite
  // palette resolver. `pal` is a {slot0,slot1,slot2,slot3} from NesRender.
  function drawTilePixels(g, tile, pal, ox, oy, scale, flipH, flipV) {
    var R = global.NesRender;
    for (var y = 0; y < 8; y++) {
      var sy = flipV ? 7 - y : y;
      var prow = (tile && tile.pixels && tile.pixels[sy]) || null;
      for (var x = 0; x < 8; x++) {
        var sx = flipH ? 7 - x : x;
        var v = prow ? (prow[sx] | 0) : 0;
        var rgb = R.pixelRgb(v, pal);
        if (!rgb) continue; // transparent (sprite colour 0)
        g.fillStyle = rgb;
        g.fillRect(ox + x * scale, oy + y * scale, scale, scale);
      }
    }
  }

  // A canvas showing one bg tile under a chosen bg palette.
  function bgTileCanvas(state, tile, palIdx, sizePx) {
    var R = global.NesRender;
    var c = el('canvas');
    c.width = sizePx; c.height = sizePx;
    var g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    var pal = R.bgPaletteFor(state, palIdx || 0);
    // Fill backdrop first so value-0 pixels read as the backdrop colour.
    g.fillStyle = R.nesRgb(pal.slot0);
    g.fillRect(0, 0, sizePx, sizePx);
    drawTilePixels(g, tile, pal, 0, 0, sizePx / 8);
    return c;
  }

  function spriteTileCanvas(state, tile, palIdx, sizePx) {
    var R = global.NesRender;
    var c = el('canvas');
    c.width = sizePx; c.height = sizePx;
    var g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    // Checkerboard so transparency reads.
    g.fillStyle = '#181818'; g.fillRect(0, 0, sizePx, sizePx);
    g.fillStyle = '#242424';
    for (var i = 0; i < 8; i++) for (var j = 0; j < 8; j++) {
      if ((i + j) & 1) g.fillRect(i * sizePx / 8, j * sizePx / 8, sizePx / 8, sizePx / 8);
    }
    drawTilePixels(g, tile, R.spritePaletteFor(state, palIdx || 0), 0, 0, sizePx / 8);
    return c;
  }

  // Whole composite metasprite → canvas (uses NesRender.drawSpriteIntoCtx).
  function spriteCanvas(state, sp, sizePx) {
    var c = el('canvas');
    var w = (sp && sp.width ? sp.width : 2) * 8;
    var h = (sp && sp.height ? sp.height : 2) * 8;
    var scale = Math.max(1, Math.floor(sizePx / Math.max(w, h)));
    c.width = w * scale; c.height = h * scale;
    var g = c.getContext('2d');
    global.NesRender.drawSpriteIntoCtx(g, sp, state, c.width, c.height);
    return c;
  }

  // Count how many bg/sprite tile references point at tile index `idx`.
  function bgTileUsage(state, idx) {
    var n = 0;
    (state.backgrounds || []).forEach(function (bg) {
      var nt = bg.nametable || [];
      for (var r = 0; r < nt.length; r++) for (var c = 0; c < (nt[r] || []).length; c++) {
        if (nt[r][c] && (nt[r][c].tile | 0) === idx) n++;
      }
      (bg.metatiles || []).forEach(function (mt) {
        (mt.tiles || []).forEach(function (t) { if ((t | 0) === idx) n++; });
      });
    });
    return n;
  }
  function spriteTileUsage(state, idx) {
    var n = 0;
    (state.sprites || []).forEach(function (sp) {
      (sp.cells || []).forEach(function (row) {
        (row || []).forEach(function (cell) {
          if (cell && !cell.empty && (cell.tile | 0) === idx) n++;
        });
      });
    });
    return n;
  }

  function isTileBlank(tile) {
    if (!tile || !tile.pixels) return true;
    for (var y = 0; y < 8; y++) for (var x = 0; x < 8; x++) {
      if ((tile.pixels[y][x] | 0) !== 0) return false;
    }
    return true;
  }

  // A one-off modal built on the shared .modal-backdrop/.modal chrome.
  // opts: { title, sub?, bodyNodes?: Node[], actions: [{label, kind?, value}] }
  // Returns a Promise resolving to the chosen action's `value` (or null if
  // dismissed by backdrop click / Escape). `kind:'primary'` styles a button.
  function modal(opts) {
    return new Promise(function (resolve) {
      var bd = el('div', { class: 'modal-backdrop open' });
      var box = el('div', { class: 'modal' + (opts.wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true' });
      if (opts.title) box.appendChild(el('h2', { text: opts.title }));
      if (opts.sub) box.appendChild(el('div', { class: 'modal-sub', text: opts.sub }));
      (opts.bodyNodes || []).forEach(function (n) { if (n) box.appendChild(n); });
      var acts = el('div', { class: 'modal-actions' });
      function done(v) { if (bd.parentNode) bd.parentNode.removeChild(bd); resolve(v); }
      (opts.actions || []).forEach(function (a) {
        acts.appendChild(el('button', {
          class: 'btn' + (a.kind === 'primary' ? ' primary' : ''), type: 'button',
          text: a.label, onclick: function () { done(a.value); },
        }));
      });
      box.appendChild(acts);
      bd.appendChild(box);
      bd.addEventListener('click', function (e) { if (e.target === bd) done(null); });
      document.addEventListener('keydown', function esc(e) {
        if (e.key === 'Escape') { document.removeEventListener('keydown', esc); done(null); }
      });
      document.body.appendChild(bd);
    });
  }

  global.StudioUI = {
    el: el,
    section: section,
    modal: modal,
    drawTilePixels: drawTilePixels,
    bgTileCanvas: bgTileCanvas,
    spriteTileCanvas: spriteTileCanvas,
    spriteCanvas: spriteCanvas,
    bgTileUsage: bgTileUsage,
    spriteTileUsage: spriteTileUsage,
    isTileBlank: isTileBlank,
  };
})(typeof window !== 'undefined' ? window : globalThis);
