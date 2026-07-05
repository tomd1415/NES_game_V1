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

  // ---- Sprite-reactions matrix (ported from behaviour.html) --------------
  // Per sprite × tile-type → what happens when they touch. The verb VALUES
  // are the contract the cc65 pipeline reads, so keep them identical to
  // behaviour.html; only the shown label is friendlier for KS3.
  var REACTION_VERBS = ['ignore', 'block', 'land', 'land_top', 'bounce', 'exit', 'call_handler'];
  var VERB_LABELS = {
    ignore: 'ignore — pass straight through',
    block: 'block — can’t pass',
    land: 'land — stand on it',
    land_top: 'land on top only',
    bounce: 'bounce off',
    exit: 'exit — go through (door)',
    call_handler: 'run my code',
  };

  // Same defaults behaviour.html/index.html/sprites.html seed, so a project
  // opened in either place agrees on the starting reactions.
  function defaultReactionMap(sprite, idx) {
    // Match behaviour.html/index.html/sprites.html exactly so a project
    // opened in any of them seeds identical defaults (state is shared).
    var isHero = (sprite && sprite.role === 'hero') || idx === 0;
    return isHero
      ? { 1: 'land', 2: 'block',  3: 'land_top', 4: 'exit',   5: 'call_handler', 6: 'ignore', 7: 'ignore' }
      : { 1: 'land', 2: 'bounce', 3: 'ignore',   4: 'ignore', 5: 'call_handler', 6: 'ignore', 7: 'ignore' };
  }

  // Keep behaviour_reactions aligned with the sprite list — backfill new
  // sprites with defaults, trim removed ones. Idempotent.
  function syncReactions(s) {
    if (!Array.isArray(s.behaviour_reactions)) s.behaviour_reactions = [];
    var sprites = Array.isArray(s.sprites) ? s.sprites : [];
    while (s.behaviour_reactions.length < sprites.length) {
      var idx = s.behaviour_reactions.length;
      s.behaviour_reactions.push(defaultReactionMap(sprites[idx], idx));
    }
    if (s.behaviour_reactions.length > sprites.length) {
      s.behaviour_reactions.length = sprites.length;
    }
    return s.behaviour_reactions;
  }

  // A tile-type is worth a column if it is a real, named type (id 0 = none
  // never fires a reaction).
  function usableTypes(s) {
    return (s.behaviour_types || []).filter(function (t) {
      return t && t.id !== 0 && !!((t.name && String(t.name).trim()) || (t.label && String(t.label).trim()));
    });
  }

  var selectedReactSprite = 0;   // which sprite the reactions card is editing

  function renderReactionsCard(container, ctx) {
    var s = ctx.getState();
    var card = el('div', { class: 'rule-card on expanded' });
    var head = el('div', { class: 'head' });
    head.appendChild(el('span', { class: 'card-title', text: 'Sprite reactions' }));
    head.appendChild(el('span', { class: 'chip', text: 'maker' }));
    card.appendChild(head);
    var body = el('div', { class: 'body' });

    body.appendChild(el('div', { class: 'dock-note',
      text: 'Pick a character, then say what happens when it touches each kind of tile. “Run my code” hands the collision to the Code page.' }));

    var sprites = Array.isArray(s.sprites) ? s.sprites : [];
    if (!sprites.length) {
      body.appendChild(el('div', { class: 'dock-note',
        text: 'No characters yet — design one in CHARS, then come back to set its reactions.' }));
      card.appendChild(body);
      container.appendChild(card);
      return;
    }
    var reactions = syncReactions(s);
    if (selectedReactSprite >= sprites.length) selectedReactSprite = 0;

    // Character picker.
    var pickWrap = el('div', { class: 'field' });
    pickWrap.appendChild(el('span', { text: 'Character' }));
    var pick = el('select', { 'data-react-sprite': '1' });
    sprites.forEach(function (sp, i) {
      pick.appendChild(el('option', { value: String(i),
        text: (sp.name || ('character ' + (i + 1))) + (sp.role ? ' (' + sp.role + ')' : '') }));
    });
    pick.value = String(selectedReactSprite);
    pick.addEventListener('change', function () {
      selectedReactSprite = parseInt(pick.value, 10) || 0;
      ctx.renderDock();
    });
    pickWrap.appendChild(pick);
    body.appendChild(pickWrap);

    var types = usableTypes(s);
    var rmap = reactions[selectedReactSprite] || (reactions[selectedReactSprite] = defaultReactionMap(sprites[selectedReactSprite], selectedReactSprite));

    // One row per tile-type: swatch + name + verb dropdown.
    types.forEach(function (t) {
      var f = el('div', { class: 'field' });
      var lab = el('span', {}, []);
      var rgb = null;
      try { if (t.color != null && global.NesRender) rgb = global.NesRender.nesRgb(t.color); } catch (e) { rgb = null; }
      if (rgb) {
        lab.appendChild(el('span', { style: 'display:inline-block;width:10px;height:10px;margin-right:5px;'
          + 'vertical-align:middle;border:1px solid var(--line);background:' + rgb }));
      }
      lab.appendChild(document.createTextNode('Touches ' + (t.label || t.name)));
      f.appendChild(lab);
      var sel = el('select', { 'data-react-type': String(t.id) });
      REACTION_VERBS.forEach(function (verb) {
        sel.appendChild(el('option', { value: verb, text: VERB_LABELS[verb] || verb }));
      });
      sel.value = rmap[t.id] || 'ignore';
      sel.addEventListener('change', function () {
        ctx.pushUndo();
        rmap[t.id] = sel.value;
        ctx.markDirty();
      });
      f.appendChild(sel);
      body.appendChild(f);
    });

    card.appendChild(body);
    container.appendChild(card);
  }

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

    // Sprite-reactions matrix — Maker-level and up (progressive disclosure).
    if (ctx.levelAtLeast('maker')) {
      var reactSec = UI.section('Reactions', el('span', { class: 'chip', text: 'what touching does' }));
      renderReactionsCard(reactSec, ctx);
      dock.appendChild(reactSec);
    }

    dock.appendChild(el('div', { class: 'dock-section' }, [
      el('button', { class: 'btn', text: '↻ Reset modules to defaults', onclick: function () {
        if (!confirm('Reset all game rules to their defaults? (Undoable.)')) return;
        ctx.pushUndo();
        ctx.getState().builder = global.BuilderDefaults();
        ctx.markDirty(); ctx.refresh(); ctx.renderDock();
      } }),
    ]));
  }

  // Expose the reactions helpers so CHARS can keep behaviour_reactions
  // aligned when sprites are added / duplicated / deleted (same contract
  // sprites.html maintains), and so tests can assert the defaults.
  global.StudioRules = {
    defaultReactionMap: defaultReactionMap,
    syncReactions: syncReactions,
    REACTION_VERBS: REACTION_VERBS,
  };

  global.StudioModes = global.StudioModes || {};
  global.StudioModes.rules = {
    stageTools: [],
    renderDock: renderDock,
  };
})(typeof window !== 'undefined' ? window : globalThis);
