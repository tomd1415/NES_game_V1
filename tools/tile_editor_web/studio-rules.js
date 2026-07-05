/*
 * RULES mode (redesign Phase 1.4).
 *
 * Re-houses the Builder's module tree (window.BuilderModules /
 * BuilderDefaults) as cards inside the Studio dock. Reads/writes
 * state.builder.modules exactly like builder.html did, so the same
 * validators, cc65 emitters and golden-ROM contract apply — changes take
 * effect on the next ▶ Play.
 *
 * Scene *instance placement* is WORLD's job (entity placement on the TV);
 * RULES keeps the game-wide modules. The card list is schema-driven, so
 * it grows automatically as builder-modules.js gains fields.
 */
(function (global) {
  'use strict';
  var UI = global.StudioUI;
  var el = UI.el;

  // Card order (top-level module ids). Submodules render nested.
  var CARD_ORDER = ['game', 'globals', 'players', 'scene', 'pickups', 'spawn',
    'damage', 'hud', 'doors', 'dialogue', 'behaviour_walls', 'win_condition'];
  // Modules that are structural — no on/off toggle.
  var REQUIRED = { game: 1, players: 1, scene: 1 };

  function builderTree(ctx) {
    var s = ctx.getState();
    if (!s.builder || s.builder.version !== 1) {
      s.builder = (typeof global.BuilderDefaults === 'function') ? global.BuilderDefaults() : { version: 1, modules: {} };
    }
    return s.builder;
  }

  function ensureConfig(node, def) {
    if (!node.config) node.config = {};
    var dc = def && def.defaultConfig;
    if (dc) Object.keys(dc).forEach(function (k) { if (node.config[k] === undefined) node.config[k] = dc[k]; });
    return node.config;
  }

  function renderField(ctx, node, def, field) {
    var cfg = ensureConfig(node, def);
    var wrap = el('div', { class: 'field' });
    var commit = function (v) {
      ctx.pushUndo();
      cfg[field.key] = v;
      ctx.markDirty(); ctx.refresh();
    };
    if (field.type === 'bool') {
      var w = el('label', { class: 'switch' });
      var cb = el('input', { type: 'checkbox' });
      cb.checked = !!cfg[field.key];
      cb.addEventListener('change', function () { commit(cb.checked); });
      w.appendChild(cb); w.appendChild(el('span', { text: field.label }));
      wrap.appendChild(w);
    } else if (field.type === 'enum') {
      wrap.appendChild(el('span', { text: field.label }));
      var sel = el('select');
      (field.options || []).forEach(function (o) {
        var opt = el('option', { value: o.value, text: o.label });
        sel.appendChild(opt);
      });
      sel.value = cfg[field.key];
      sel.addEventListener('change', function () { commit(sel.value); ctx.renderDock(); });
      wrap.appendChild(sel);
    } else if (field.type === 'spriteRef') {
      wrap.appendChild(el('span', { text: field.label }));
      var ss = el('select');
      ss.appendChild(el('option', { value: '-1', text: '(none)' }));
      (ctx.getState().sprites || []).forEach(function (sp, i) {
        ss.appendChild(el('option', { value: String(i), text: sp.name || ('sprite ' + i) }));
      });
      ss.value = String(cfg[field.key] == null ? -1 : cfg[field.key]);
      ss.addEventListener('change', function () { commit(parseInt(ss.value, 10)); });
      wrap.appendChild(ss);
    } else if (field.type === 'text') {
      wrap.appendChild(el('span', { text: field.label }));
      var ti = el('input', { type: 'text' });
      ti.value = cfg[field.key] == null ? '' : cfg[field.key];
      if (field.maxLength) ti.maxLength = field.maxLength;
      ti.addEventListener('change', function () { commit(ti.value); });
      wrap.appendChild(ti);
    } else { // int / default
      wrap.appendChild(el('span', { text: field.label }));
      var ni = el('input', { type: 'number' });
      if (field.min != null) ni.min = field.min;
      if (field.max != null) ni.max = field.max;
      if (field.step != null) ni.step = field.step;
      ni.value = cfg[field.key] == null ? '' : cfg[field.key];
      ni.addEventListener('change', function () {
        var v = parseInt(ni.value, 10);
        if (isNaN(v)) return;
        if (field.min != null) v = Math.max(field.min, v);
        if (field.max != null) v = Math.min(field.max, v);
        ni.value = v; commit(v);
      });
      wrap.appendChild(ni);
    }
    if (field.help) wrap.appendChild(el('div', { class: 'dock-note', text: field.help }));
    return wrap;
  }

  function renderCard(container, ctx, id, node) {
    var def = (global.BuilderModules && global.BuilderModules[id]) || { label: id, schema: [] };
    var enabled = !!node.enabled;
    var required = !!REQUIRED[id.split('.')[0]] && id.indexOf('.') < 0;
    var card = el('div', { class: 'rule-card' + (enabled ? ' on' : '') + (enabled ? ' expanded' : '') });

    var head = el('div', { class: 'head' });
    var titleWrap = el('div', { class: 'row', style: 'cursor:pointer' }, [
      el('span', { class: 'card-title', text: def.label || id }),
    ]);
    titleWrap.addEventListener('click', function () { card.classList.toggle('expanded'); });
    head.appendChild(titleWrap);

    if (!required) {
      var sw = el('label', { class: 'switch' });
      var cb = el('input', { type: 'checkbox', 'data-module': id });
      cb.checked = enabled;
      cb.addEventListener('change', function () {
        ctx.pushUndo();
        node.enabled = cb.checked;
        ctx.markDirty(); ctx.refresh(); ctx.renderDock();
      });
      sw.appendChild(cb); sw.appendChild(el('span', { text: cb.checked ? 'On' : 'Off' }));
      head.appendChild(sw);
    } else {
      head.appendChild(el('span', { class: 'chip', text: 'always on' }));
    }
    card.appendChild(head);

    var body = el('div', { class: 'body' });
    if (def.description) body.appendChild(el('div', { class: 'dock-note', text: def.description }));
    (def.schema || []).forEach(function (field) {
      body.appendChild(renderField(ctx, node, def, field));
    });
    // Nested submodules (e.g. players.player1 / player2).
    if (node.submodules) {
      Object.keys(node.submodules).forEach(function (subId) {
        renderCard(body, ctx, id + '.' + subId, node.submodules[subId]);
      });
    }
    card.appendChild(body);
    container.appendChild(card);
  }

  function renderDock(dock, ctx) {
    var tree = builderTree(ctx);
    var gt = (tree.modules.game && tree.modules.game.config && tree.modules.game.config.type) || 'platformer';
    dock.appendChild(el('div', { class: 'dock-note',
      text: 'How your game behaves. Changes apply the next time you press ▶ Play. Current game type: ' + gt + '.' }));

    var sec = UI.section('Modules');
    CARD_ORDER.forEach(function (id) {
      var node = tree.modules[id];
      if (!node) return;
      renderCard(sec, ctx, id, node);
    });
    dock.appendChild(sec);

    dock.appendChild(el('div', { class: 'dock-section' }, [
      el('button', { class: 'btn', text: '↻ Reset modules to defaults', onclick: function () {
        if (!confirm('Reset all game rules to their defaults? (Undoable.)')) return;
        ctx.pushUndo();
        ctx.getState().builder = global.BuilderDefaults();
        ctx.markDirty(); ctx.refresh(); ctx.renderDock();
      } }),
    ]));
  }

  global.StudioModes = global.StudioModes || {};
  global.StudioModes.rules = {
    stageTools: [],
    renderDock: renderDock,
  };
})(typeof window !== 'undefined' ? window : globalThis);
