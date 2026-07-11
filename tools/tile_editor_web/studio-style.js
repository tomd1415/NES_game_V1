/* Studio — STYLE mode.
 *
 * One place for the game style and every style-specific option.  RULES keeps
 * the *shared* modules (damage, dialogue, win condition, reactions…); STYLE
 * shows only what matters for the chosen game type, so a pupil building an SMB
 * game finds jump feel, power-ups, blocks and the HUD together instead of
 * hunting through a flat module list.  (Decision D-10.)
 */
(function (global) {
  var UI = global.StudioUI;
  var el = UI.el;

  var GAME_TYPES = [
    { id: 'platformer', emoji: '🏃', label: 'Platformer', sub: 'Side-on, gravity + jump.' },
    { id: 'smb', emoji: '🍄', label: 'SMB platformer', sub: 'Run physics, variable jump, power-ups, blocks.' },
    { id: 'topdown', emoji: '🧭', label: 'Top-down', sub: 'Four-way, no gravity (Zelda-style).' },
    { id: 'runner', emoji: '🏃‍➡️', label: 'Auto-runner', sub: 'Auto-scroll, tap to jump.' },
    { id: 'racer', emoji: '🏎', label: 'Racer', sub: 'Steer + accelerate, top-down track.' },
  ];

  function gameCfg(s) {
    var m = s.builder && s.builder.modules && s.builder.modules.game;
    if (!m) return null;
    m.config = m.config || {};
    return m.config;
  }
  function p1Cfg(s) {
    var m = s.builder && s.builder.modules && s.builder.modules.players;
    if (!m || !m.submodules || !m.submodules.player1) return null;
    m.submodules.player1.config = m.submodules.player1.config || {};
    return m.submodules.player1.config;
  }
  // The globals module isn't in the default tree — create it on first edit.
  function globalsNode(s) {
    var m = s.builder.modules;
    if (!m.globals) m.globals = { enabled: true, config: { gravityPx: 1, jumpSpeedPx: 2, bobWhenWalking: false } };
    m.globals.enabled = true;
    m.globals.config = m.globals.config || {};
    return m.globals;
  }
  function moduleNode(s, id, def) {
    var m = s.builder.modules;
    if (!m[id]) m[id] = { enabled: false, config: def || {} };
    m[id].config = m[id].config || (def || {});
    return m[id];
  }

  // A number field bound to obj[key] (clamped), undoable.  Structure: a label +
  // input on one row, with any help text on its own line below (a .sfield —
  // separated from the next field with a divider so options don't blend).
  function numField(ctx, label, obj, key, min, max, help) {
    var inp = el('input', { type: 'number', min: min, max: max });
    inp.value = (obj[key] == null) ? '' : obj[key];
    inp.addEventListener('change', function () {
      var v = parseInt(inp.value, 10); if (isNaN(v)) return;
      ctx.pushUndo(); obj[key] = Math.max(min, Math.min(max, v)); ctx.markDirty();
    });
    var f = el('div', { class: 'sfield' }, [
      el('div', { class: 'srow' }, [el('span', { class: 'slabel', text: label }), inp]),
    ]);
    if (help) f.appendChild(el('div', { class: 'shelp', text: help }));
    return f;
  }
  function boolField(ctx, label, node, help, onToggle) {
    var w = el('label', { class: 'switch' });
    var cb = el('input', { type: 'checkbox' }); cb.checked = !!node.enabled;
    cb.addEventListener('change', function () {
      ctx.pushUndo(); node.enabled = cb.checked; if (onToggle) onToggle(); ctx.markDirty(); ctx.renderDock();
    });
    w.appendChild(cb); w.appendChild(el('span', { text: label }));
    var f = el('div', { class: 'sfield' }, [w]);
    if (help) f.appendChild(el('div', { class: 'shelp', text: help }));
    return f;
  }

  function renderTypePicker(dock, ctx, s, gc) {
    var sec = UI.section('Game style', el('span', { class: 'chip', text: gc.type || 'platformer' }));
    sec.appendChild(el('div', { class: 'dock-note', text: 'Pick how your game plays. Changing this swaps the options below.' }));
    var grid = el('div', { class: 'style-grid' });
    GAME_TYPES.forEach(function (t) {
      var on = (gc.type || 'platformer') === t.id;
      var card = el('button', { class: 'btn style-card' + (on ? ' primary' : ''), type: 'button',
        onclick: function () { if ((gc.type || 'platformer') === t.id) return; ctx.pushUndo(); gc.type = t.id; ctx.markDirty(); ctx.renderDock(); ctx.renderLive && ctx.renderLive(); } });
      card.appendChild(el('div', { style: 'font-size:1.4em', text: t.emoji }));
      card.appendChild(el('div', { style: 'font-weight:600', text: t.label }));
      card.appendChild(el('div', { class: 'dock-note', style: 'margin:0', text: t.sub }));
      grid.appendChild(card);
    });
    sec.appendChild(grid);
    dock.appendChild(sec);
  }

  function renderPlatformerish(dock, ctx, s, isSmb) {
    var p1 = p1Cfg(s), g = globalsNode(s).config;
    var phys = UI.section(isSmb ? 'SMB feel' : 'Movement & jump');
    if (isSmb) {
      phys.appendChild(el('div', { class: 'dock-note', text: 'SMB run physics (accelerate to a run, skid, variable-height jump) are always on for this style. Tune the feel here. (The generic "walk speed" in Rules does NOT apply to the SMB style — use Speed below.)' }));
      phys.appendChild(numField(ctx, 'Speed (1–5)', gameCfg(s), 'smbSpeed', 1, 5,
        '1 slow … 5 fast. 2 ≈ SMB (1.5 walk / 2.5 run px/frame); 5 ≈ 3 / 5. Hold B to run. Acceleration is snappy at every setting.'));
    }
    if (p1) phys.appendChild(numField(ctx, 'Jump height', p1, 'jumpHeight', 1, 60, 'Frames of rise — bigger = higher. ~14 clears about 5 tiles with the SMB fall.'));
    phys.appendChild(numField(ctx, 'Jump speed (px/frame)', g, 'jumpSpeedPx', 1, 6, 'Pixels risen per frame. 3 gives a snappy SMB arc.'));
    phys.appendChild(numField(ctx, 'Gravity', g, 'gravityPx', 0, 4, 'How fast things fall — the player and the enemies. 0 = floaty moon-jump, 4 = heavy.'));
    if (!isSmb && p1) phys.appendChild(numField(ctx, 'Walk speed', p1, 'walkSpeed', 1, 8, 'Pixels moved per frame.'));
    // Bob (folded in from the old Globals menu).
    var bobW = el('label', { class: 'switch' });
    var bobCb = el('input', { type: 'checkbox' }); bobCb.checked = !!g.bobWhenWalking;
    bobCb.addEventListener('change', function () { ctx.pushUndo(); g.bobWhenWalking = bobCb.checked; ctx.markDirty(); });
    bobW.appendChild(bobCb); bobW.appendChild(el('span', { text: 'Bob up/down when walking' }));
    phys.appendChild(el('div', { class: 'sfield' }, [bobW]));
    dock.appendChild(phys);

    if (isSmb) {
      // Power-ups + fireballs.
      var pu = moduleNode(s, 'powerups', { fireballTile: 9, fireballPal: 2 });
      var puSec = UI.section('Power-ups & fireballs', el('span', { class: 'chip', text: pu.enabled ? 'on' : 'off' }));
      puSec.appendChild(boolField(ctx, 'Enable power-ups (mushroom / fire / star / 1-Up)', pu,
        'A power state (small → super → fire) set by items; B throws a fireball in the fire state; a hit knocks you down to small instead of costing a life.'));
      if (pu.enabled) {
        puSec.appendChild(numField(ctx, 'Fireball tile', pu.config, 'fireballTile', 0, 255, 'Sprite tile drawn for a fireball.'));
        puSec.appendChild(numField(ctx, 'Fireball palette', pu.config, 'fireballPal', 0, 3));
        puSec.appendChild(el('div', { class: 'dock-note', text: 'Place power-up items (or set what ? blocks give) on the World page.' }));
      }
      dock.appendChild(puSec);

      // Blocks — a pointer to the WORLD editor.
      var blk = moduleNode(s, 'blocks', { blockList: [] });
      var count = (blk.config.blockList || []).length;
      var blkSec = UI.section('Blocks', el('span', { class: 'chip', text: count + ' placed' }));
      blkSec.appendChild(el('div', { class: 'dock-note', text: 'Coins, ? blocks (choose their contents) and bricks are placed on the World page.' }));
      blkSec.appendChild(el('button', { class: 'btn', text: 'Edit blocks in World →', onclick: function () { ctx.selectMode('world'); } }));
      dock.appendChild(blkSec);

      // HUD (engine v7).
      var hud = moduleNode(s, 'smbhud', { startTime: 400, startLives: 3, hudPal: 0 });
      var hudSec = UI.section('HUD', el('span', { class: 'chip', text: hud.enabled ? 'on' : 'off' }));
      hudSec.appendChild(boolField(ctx, 'Show coins / time / score / lives', hud,
        'A fixed status read-out across the top. Turn on Player HP (in Rules) so the timer / lives can end a life.'));
      if (hud.enabled) {
        hudSec.appendChild(numField(ctx, 'Start time', hud.config, 'startTime', 0, 999, 'Counts down about every 0.4s; hitting 0 is a death.'));
        hudSec.appendChild(numField(ctx, 'Lives', hud.config, 'startLives', 1, 9));
      }
      dock.appendChild(hudSec);

      // Flagpole finish (engine v8).
      var flag = moduleNode(s, 'flagpole', { x: 60 });
      var flagSec = UI.section('Flagpole finish', el('span', { class: 'chip', text: flag.enabled ? 'on' : 'off' }));
      flagSec.appendChild(boolField(ctx, 'End the level at a flagpole', flag,
        'Crossing the flagpole column wins the level (needs the Win condition on in Rules) with a score bonus.'));
      if (flag.enabled) flagSec.appendChild(numField(ctx, 'Flagpole column (tile)', flag.config, 'x', 0, 63, 'Paint a flagpole here; crossing it finishes the level.'));
      dock.appendChild(flagSec);

      // Pipes pointer (placed in World).
      var pipes = moduleNode(s, 'pipes', { pipeList: [] });
      var pipeSec = UI.section('Pipes', el('span', { class: 'chip', text: (pipes.config.pipeList || []).length + ' placed' }));
      pipeSec.appendChild(el('div', { class: 'dock-note', text: 'Down-to-enter warps (underground bonus sections) are placed on the World page.' }));
      pipeSec.appendChild(el('button', { class: 'btn', text: 'Edit pipes in World →', onclick: function () { ctx.selectMode('world'); } }));
      dock.appendChild(pipeSec);

      // Rendering (engine v9) — OAM flicker.
      var rend = moduleNode(s, 'smbrender', {});
      var rendSec = UI.section('Rendering', el('span', { class: 'chip', text: rend.enabled ? 'flicker on' : 'flicker off' }));
      rendSec.appendChild(boolField(ctx, 'Sprite flicker on busy screens', rend,
        'Real NES shows at most 8 sprites per scanline. On = a crowded row flickers (like real SMB) instead of some sprites vanishing.'));
      dock.appendChild(rendSec);
    }
  }

  function renderRacer(dock, ctx, s, gc) {
    var sec = UI.section('Racer options');
    sec.appendChild(numField(ctx, 'Top speed', gc, 'racerTopSpeed', 1, 4, 'How fast the car can go.'));
    sec.appendChild(numField(ctx, 'Laps to win', gc, 'racerLaps', 1, 9, 'Paint a checkpoint line to count laps.'));
    sec.appendChild(numField(ctx, 'Checkpoints / lap', gc, 'racerCheckpoints', 1, 2));
    dock.appendChild(sec);
  }
  function renderRunner(dock, ctx, s, gc) {
    var sec = UI.section('Auto-runner options');
    sec.appendChild(numField(ctx, 'Scroll speed', gc, 'autoscrollSpeed', 1, 4, 'How fast the world scrolls past. Tap (A / Up) to jump.'));
    var p1 = p1Cfg(s);
    if (p1) sec.appendChild(numField(ctx, 'Jump height', p1, 'jumpHeight', 1, 60, 'Frames of rise on a tap — bigger = higher jump.'));
    dock.appendChild(sec);
  }
  function renderTopdown(dock, ctx, s) {
    var p1 = p1Cfg(s);
    var sec = UI.section('Top-down options');
    if (p1) sec.appendChild(numField(ctx, 'Walk speed', p1, 'walkSpeed', 1, 8, 'Pixels moved per frame (four-way).'));
    sec.appendChild(el('div', { class: 'dock-note', text: 'No gravity or jumping in top-down. Use Damage / Dialogue / Win in Rules.' }));
    dock.appendChild(sec);
  }

  function renderDock(dock, ctx) {
    var s = ctx.getState();
    var gc = gameCfg(s);
    if (!gc) { dock.appendChild(el('div', { class: 'dock-note', text: 'No game module — open Rules.' })); return; }
    renderTypePicker(dock, ctx, s, gc);
    var t = gc.type || 'platformer';
    if (t === 'smb') renderPlatformerish(dock, ctx, s, true);
    else if (t === 'platformer') renderPlatformerish(dock, ctx, s, false);
    else if (t === 'racer') renderRacer(dock, ctx, s, gc);
    else if (t === 'runner' || t === 'autorunner') renderRunner(dock, ctx, s, gc);
    else if (t === 'topdown') renderTopdown(dock, ctx, s);
    dock.appendChild(el('div', { class: 'dock-section' }, [
      el('div', { class: 'dock-note', text: 'Shared behaviours (damage, dialogue, win condition, reactions) live in ⚙ Rules.' }),
    ]));
  }

  global.StudioModes = global.StudioModes || {};
  global.StudioModes.style = { stageTools: [], renderDock: renderDock };
})(typeof window !== 'undefined' ? window : globalThis);
