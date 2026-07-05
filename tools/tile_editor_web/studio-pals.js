/*
 * PALS mode (redesign Phase 1.3).
 *
 * The one place to set every colour: the shared backdrop + 4 background
 * palettes + 4 sprite palettes, each 3 colours from the 64-colour NES
 * set. Slot 0 is locked everywhere (backdrop for BG, transparent for
 * sprites) — you cannot draw with it. Editing recolours the LIVE TV
 * immediately. Reads/writes state.universal_bg / bg_palettes /
 * sprite_palettes (the same schema the old palette panels used).
 */
(function (global) {
  'use strict';
  var UI = global.StudioUI;
  var el = UI.el;
  var R = function () { return global.NesRender; };

  // Selected editable slot: {kind:'backdrop'|'bg'|'sp', pal, slot}
  var sel = { kind: 'bg', pal: 0, slot: 0 };

  function usageBg(state, palIdx) {
    var n = 0;
    (state.backgrounds || []).forEach(function (bg) {
      var nt = bg.nametable || [];
      for (var r = 0; r < nt.length; r++) for (var c = 0; c < (nt[r] || []).length; c++) {
        if (nt[r][c] && (nt[r][c].palette | 0) === palIdx) n++;
      }
    });
    return n;
  }
  function usageSp(state, palIdx) {
    var n = 0;
    (state.sprites || []).forEach(function (sp) {
      (sp.cells || []).forEach(function (row) { (row || []).forEach(function (cell) {
        if (cell && !cell.empty && (cell.palette | 0) === palIdx) n++;
      }); });
    });
    return n;
  }

  function swatch(css, opts) {
    opts = opts || {};
    return el('button', {
      class: 'swatch' + (opts.sel ? ' sel' : '') + (opts.locked ? ' locked' : ''),
      style: 'background:' + css, title: opts.title || '',
      onclick: opts.onclick,
    });
  }

  function paletteStrip(ctx, state, kind, palIdx) {
    var isBg = kind === 'bg';
    var pal = (isBg ? state.bg_palettes : state.sprite_palettes)[palIdx] || { slots: [0, 0, 0] };
    var used = isBg ? usageBg(state, palIdx) : usageSp(state, palIdx);
    var strip = el('div', { class: 'pal-strip' }, [
      el('span', { class: 'label', text: (isBg ? 'BG ' : 'SP ') + palIdx }),
    ]);
    // Slot 0 (locked).
    if (isBg) {
      strip.appendChild(swatch(R().nesRgb(state.universal_bg), { locked: true, title: 'Slot 0 = shared backdrop (edit under Backdrop)' }));
    } else {
      strip.appendChild(swatch('transparent', { locked: true, title: 'Slot 0 = transparent (cannot draw with it)' }));
    }
    // Slots 1-3 (editable).
    for (var i = 0; i < 3; i++) (function (si) {
      var isSel = sel.kind === kind && sel.pal === palIdx && sel.slot === si;
      strip.appendChild(swatch(R().nesRgb(pal.slots[si]), {
        sel: isSel, title: 'Slot ' + (si + 1) + ' — click to select, then pick a colour below',
        onclick: function () { sel = { kind: kind, pal: palIdx, slot: si }; ctx.renderDock(); },
      }));
    })(i);
    strip.appendChild(el('span', { class: 'dock-note', style: 'margin:0 0 0 8px',
      text: used + ' cell' + (used === 1 ? '' : 's') }));
    return strip;
  }

  function currentValue(state) {
    if (sel.kind === 'backdrop') return state.universal_bg;
    var arr = sel.kind === 'bg' ? state.bg_palettes : state.sprite_palettes;
    return (arr[sel.pal] || { slots: [0, 0, 0] }).slots[sel.slot];
  }
  function assign(ctx, idx) {
    var state = ctx.getState();
    ctx.pushUndo();
    if (sel.kind === 'backdrop') state.universal_bg = idx;
    else {
      var arr = sel.kind === 'bg' ? state.bg_palettes : state.sprite_palettes;
      arr[sel.pal].slots[sel.slot] = idx;
    }
    ctx.renderLive(); ctx.renderDock(); ctx.markDirty();
  }

  function renderDock(dock, ctx) {
    var state = ctx.getState();

    // Backdrop.
    var bdSec = UI.section('Backdrop (shared)');
    var bdSel = sel.kind === 'backdrop';
    var bdRow = el('div', { class: 'pal-strip' + (bdSel ? ' sel' : '') }, [
      el('span', { class: 'label', text: 'BG0' }),
      swatch(R().nesRgb(state.universal_bg), { sel: bdSel, onclick: function () { sel = { kind: 'backdrop' }; ctx.renderDock(); } }),
      el('span', { class: 'dock-note', style: 'margin:0 0 0 8px', text: 'Every BG palette shares this as colour 0.' }),
    ]);
    bdSec.appendChild(bdRow);
    dock.appendChild(bdSec);

    // BG palettes.
    var bgSec = UI.section('Background palettes');
    for (var b = 0; b < 4; b++) bgSec.appendChild(paletteStrip(ctx, state, 'bg', b));
    dock.appendChild(bgSec);

    // Sprite palettes.
    var spSec = UI.section('Sprite palettes');
    for (var sp = 0; sp < 4; sp++) spSec.appendChild(paletteStrip(ctx, state, 'sp', sp));
    spSec.appendChild(el('div', { class: 'dock-note', text: 'Sprite colour 0 is always transparent — outlines need a real colour.' }));
    dock.appendChild(spSec);

    // Master 64-colour grid.
    var pickSec = UI.section('Pick a colour', el('span', { class: 'chip', text: sel.kind === 'backdrop' ? 'backdrop' : (sel.kind.toUpperCase() + ' ' + sel.pal + '.' + (sel.slot + 1)) }));
    var grid = el('div', { class: 'master-grid' });
    var cur = currentValue(state);
    for (var idx = 0; idx < 64; idx++) (function (ci) {
      grid.appendChild(swatch(R().nesRgb(ci), {
        sel: ci === cur, title: '$' + ci.toString(16).toUpperCase(),
        onclick: function () { assign(ctx, ci); },
      }));
    })(idx);
    pickSec.appendChild(grid);
    dock.appendChild(pickSec);
  }

  global.StudioModes = global.StudioModes || {};
  global.StudioModes.pals = {
    stageTools: [],           // PALS has no TV tools — the TV just recolours live
    renderDock: renderDock,
    onEnter: function () {},
    // Test hooks
    _sel: function () { return sel; },
    _select: function (o) { sel = o; },
  };
})(typeof window !== 'undefined' ? window : globalThis);
