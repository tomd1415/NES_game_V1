/*
 * Studio starter project (Phase 0).
 *
 * "Game-first, never a blank canvas" (design-principles §1): the Studio
 * must boot straight into a working, editable game rather than the blank
 * DefaultState. This factory takes the shared DefaultState platformer and
 * paints a small, honest starter on top of the *real* tile-first model —
 * a couple of shared background tiles, a ground floor on the nametable,
 * matching solid-ground behaviour, and one 2x2 player metasprite that
 * assembles shared sprite tiles.
 *
 * It writes only the canonical schema (bg_tiles / sprite_tiles /
 * backgrounds[].nametable / sprites[].cells / behaviour_types), so a
 * project made here loads on every old page too — the migration stays
 * additive (phased-plan guardrails).
 *
 * Depends on window.DefaultState (default-state.js).
 */
(function (global) {
  'use strict';

  // Build an 8x8 tile from 8 strings of 8 chars each:
  //   '.' -> 0 (colour 0 / backdrop / transparent), '1'..'3' -> 1..3.
  function tileFrom(name, rows) {
    var pixels = [];
    for (var y = 0; y < 8; y++) {
      var line = rows[y] || '........';
      var row = [];
      for (var x = 0; x < 8; x++) {
        var ch = line[x];
        row.push(ch === '1' ? 1 : ch === '2' ? 2 : ch === '3' ? 3 : 0);
      }
      pixels.push(row);
    }
    return { name: name, pixels: pixels };
  }

  // --- Background art -----------------------------------------------------
  // Palette 0 default slots are [0x29 green, 0x19 green, 0x07 brown].
  // Ground: a grassy top edge (1) over dirt (3) with a couple of specks (2).
  var GROUND = tileFrom('ground', [
    '11111111',
    '13313313',
    '33333333',
    '33323333',
    '33333333',
    '33333323',
    '33333333',
    '32333333',
  ]);
  // Brick block for floating platforms.
  var BRICK = tileFrom('brick', [
    '33333333',
    '31111113',
    '31111113',
    '33333333',
    '11133111',
    '11133111',
    '11133111',
    '33333333',
  ]);

  // --- Player metasprite art (2x2 = 16x16) --------------------------------
  // Sprite palette 0 default slots are [0x27 orange, 0x17 red-brown, 0x30 white].
  // A simple hero: body (1), outline/shade (2), eyes (3=white).
  var HEAD_L = tileFrom('hero_head_l', [
    '....2222',
    '...21111',
    '..211111',
    '..211311',
    '..211311',
    '..211111',
    '..211111',
    '...21111',
  ]);
  var HEAD_R = tileFrom('hero_head_r', [
    '2222....',
    '11112...',
    '111112..',
    '113112..',
    '113112..',
    '111112..',
    '111112..',
    '11112...',
  ]);
  var BODY_L = tileFrom('hero_body_l', [
    '...21111',
    '..211111',
    '..211111',
    '..21111.',
    '..2111..',
    '..211...',
    '..211...',
    '..22....',
  ]);
  var BODY_R = tileFrom('hero_body_r', [
    '11112...',
    '111112..',
    '111112..',
    '.11112..',
    '..1112..',
    '...112..',
    '...112..',
    '....22..',
  ]);

  // Ladder (climbable) — two rails + rungs.
  var LADDER = tileFrom('ladder', [
    '.2....2.',
    '.2....2.',
    '.222222.',
    '.2....2.',
    '.2....2.',
    '.222222.',
    '.2....2.',
    '.2....2.',
  ]);
  // Door — a framed doorway with a knob (3).
  var DOOR = tileFrom('door', [
    '.222222.',
    '.211112.',
    '.211112.',
    '.211112.',
    '.211132.',
    '.211112.',
    '.211112.',
    '.221122.',
  ]);

  // --- Enemy metasprite art (a rounded slime, 2x2) ------------------------
  var EN_TL = tileFrom('slime_tl', [
    '........',
    '........',
    '...1111.',
    '..111111',
    '..111111',
    '..113311',
    '..111111',
    '..111111',
  ]);
  var EN_TR = tileFrom('slime_tr', [
    '........',
    '........',
    '.1111...',
    '111111..',
    '111111..',
    '113311..',
    '111111..',
    '111111..',
  ]);
  var EN_BL = tileFrom('slime_bl', [
    '..111111',
    '..111111',
    '..111111',
    '...11111',
    '....1111',
    '.....111',
    '........',
    '........',
  ]);
  var EN_BR = tileFrom('slime_br', [
    '111111..',
    '111111..',
    '111111..',
    '11111...',
    '1111....',
    '111.....',
    '........',
    '........',
  ]);

  function cell(tile, palette) {
    return { tile: tile, palette: palette, flipH: false, flipV: false, priority: false, empty: false };
  }
  function enemySprite() {
    return {
      name: 'Slime', role: 'enemy', flying: false, width: 2, height: 2,
      cells: [[cell(5, 2), cell(6, 2)], [cell(7, 2), cell(8, 2)]], // sprite palette 2
    };
  }
  function npcSprite() {
    // Reuses the hero tiles under sprite palette 1 so it reads as a villager.
    return {
      name: 'Villager', role: 'npc', flying: false, width: 2, height: 2,
      cells: [[cell(1, 1), cell(2, 1)], [cell(3, 1), cell(4, 1)]],
    };
  }

  function playerSprite() {
    return {
      name: 'Hero',
      role: 'player',
      flying: false,
      width: 2,
      height: 2,
      // Sprite tiles land at indices 1..4 (see create()).
      cells: [
        [cell(1, 0), cell(2, 0)],
        [cell(3, 0), cell(4, 0)],
      ],
    };
  }

  // Behaviour-type ids mirror behaviour.html defaultBehaviourTypes() /
  // builder-validators behaviourIdByName fallback.
  function defaultBehaviourTypes() {
    return [
      { id: 0, name: 'none', label: 'None', color: 0x0F },
      { id: 1, name: 'solid_ground', label: 'Solid ground', color: 0x07 },
      { id: 2, name: 'wall', label: 'Wall', color: 0x00 },
      { id: 3, name: 'platform', label: 'Platform', color: 0x28 },
      { id: 4, name: 'door', label: 'Door', color: 0x14 },
      { id: 5, name: 'trigger', label: 'Trigger', color: 0x2A },
      { id: 6, name: 'ladder', label: 'Ladder', color: 0x21 },
    ];
  }

  // opts.name — starter project name (default 'My First Game')
  // opts.now  — ISO timestamp for metadata (tests pass a fixed value)
  function create(opts) {
    opts = opts || {};
    if (!global.DefaultState || typeof global.DefaultState.create !== 'function') {
      throw new Error('StudioStarter.create: DefaultState is not loaded');
    }
    var state = global.DefaultState.create({
      name: opts.name || 'My First Game',
      template: 'platformer',
      now: opts.now,
    });

    // Shared background tiles + their default behaviour, so re-painting any
    // of them in WORLD auto-applies the right type (tile default-behaviour).
    state.bg_tiles[1] = GROUND;  state.bg_tiles[1].defaultBehaviour = 1; // solid
    state.bg_tiles[2] = BRICK;   state.bg_tiles[2].defaultBehaviour = 3; // platform
    state.bg_tiles[3] = LADDER;  state.bg_tiles[3].defaultBehaviour = 6; // ladder
    state.bg_tiles[4] = DOOR;    state.bg_tiles[4].defaultBehaviour = 4; // door

    // Shared sprite tiles: 1..4 = hero (also reused by the NPC), 5..8 = slime.
    state.sprite_tiles[1] = HEAD_L;
    state.sprite_tiles[2] = HEAD_R;
    state.sprite_tiles[3] = BODY_L;
    state.sprite_tiles[4] = BODY_R;
    state.sprite_tiles[5] = EN_TL;
    state.sprite_tiles[6] = EN_TR;
    state.sprite_tiles[7] = EN_BL;
    state.sprite_tiles[8] = EN_BR;

    var bg = state.backgrounds[0];
    var SCREEN_W = 32, SCREEN_H = 30;
    bg.behaviour = [];
    for (var r = 0; r < SCREEN_H; r++) {
      var brow = [];
      for (var c = 0; c < SCREEN_W; c++) brow.push(0);
      bg.behaviour.push(brow);
    }
    function put(x, y, tile, beh) { bg.nametable[y][x] = { tile: tile, palette: 0 }; bg.behaviour[y][x] = beh; }
    // Two-row ground floor along the bottom.
    for (var gy = SCREEN_H - 2; gy < SCREEN_H; gy++) {
      for (var gx = 0; gx < SCREEN_W; gx++) put(gx, gy, 1, 1);
    }
    // Two floating brick platforms.
    for (var p1 = 4; p1 <= 8; p1++) put(p1, 22, 2, 3);
    for (var p2 = 14; p2 <= 19; p2++) put(p2, 18, 2, 3);
    // A ladder from the lower platform down to the floor (col 6).
    for (var ly = 23; ly <= 27; ly++) put(6, ly, 3, 6);
    // A door standing on the floor near the right edge.
    put(28, 27, 4, 4);

    state.behaviour_types = defaultBehaviourTypes();
    state.sprites = [playerSprite(), enemySprite(), npcSprite()];

    // Seed the builder module tree, then turn on a starter feature set:
    // hearts (HP), an enemy that damages, an NPC with dialogue, and a door.
    if (typeof global.BuilderDefaults === 'function') {
      state.builder = global.BuilderDefaults();
      var m = state.builder.modules;
      // Hearts / HP: 3 HP + the damage-on-touch system.
      if (m.players && m.players.submodules && m.players.submodules.player1) {
        m.players.submodules.player1.config.maxHp = 3;
        m.players.submodules.player1.config.startX = 24;
        m.players.submodules.player1.config.startY = 176;
      }
      if (m.damage) { m.damage.enabled = true; m.damage.config = m.damage.config || {}; m.damage.config.amount = 1; }
      // NPC dialogue.
      if (m.dialogue) { m.dialogue.enabled = true; m.dialogue.config = m.dialogue.config || {}; m.dialogue.config.text = 'HI THERE'; }
      // Scene: place the slime and the villager on the floor.
      if (m.scene) {
        m.scene.config = m.scene.config || {};
        m.scene.config.instances = [
          { id: 1, spriteIdx: 1, x: 200, y: 200, ai: 'walker', speed: 1 },
          { id: 2, spriteIdx: 2, x: 64, y: 200, ai: 'static', speed: 1 },
        ];
      }
      // Per-door destination (engine v2): the door loops back to the start.
      if (m.doors) {
        m.doors.enabled = true;
        m.doors.config = m.doors.config || {};
        m.doors.config.doorList = [{ bg: 0, tx: 28, ty: 27, spawnX: 24, spawnY: 176, targetBgIdx: -1 }];
      }
    }

    // Stamp the engine this project is authored for (versioning/fallback).
    if (typeof global.NES_ENGINE_VERSION === 'number') {
      state.engineVersion = global.NES_ENGINE_VERSION;
    }

    return state;
  }

  global.StudioStarter = { create: create, tileFrom: tileFrom };
})(typeof window !== 'undefined' ? window : globalThis);
