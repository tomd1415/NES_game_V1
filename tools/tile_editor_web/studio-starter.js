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

  function cell(tile, palette) {
    return { tile: tile, palette: palette, flipH: false, flipV: false, priority: false, empty: false };
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

    // Shared background tiles: slot 1 = ground, slot 2 = brick.
    state.bg_tiles[1] = GROUND;
    state.bg_tiles[2] = BRICK;

    // Shared sprite tiles: slots 1..4 = the 2x2 hero.
    state.sprite_tiles[1] = HEAD_L;
    state.sprite_tiles[2] = HEAD_R;
    state.sprite_tiles[3] = BODY_L;
    state.sprite_tiles[4] = BODY_R;

    // Paint a floor + a floating platform on the active background.
    var bg = state.backgrounds[0];
    var SCREEN_W = 32, SCREEN_H = 30;
    // Behaviour grid alongside the nametable (solid ground under foot).
    bg.behaviour = [];
    for (var r = 0; r < SCREEN_H; r++) {
      var brow = [];
      for (var c = 0; c < SCREEN_W; c++) brow.push(0);
      bg.behaviour.push(brow);
    }
    // Two-row ground floor along the bottom.
    for (var gy = SCREEN_H - 2; gy < SCREEN_H; gy++) {
      for (var gx = 0; gx < SCREEN_W; gx++) {
        bg.nametable[gy][gx] = { tile: 1, palette: 0 };
        bg.behaviour[gy][gx] = 1; // solid_ground
      }
    }
    // A little floating brick platform to hint at level building.
    for (var px = 12; px <= 17; px++) {
      bg.nametable[20][px] = { tile: 2, palette: 0 };
      bg.behaviour[20][px] = 3; // platform
    }

    state.behaviour_types = defaultBehaviourTypes();
    state.sprites = [playerSprite()];

    // Seed the builder module tree so RULES/validators and PLAY have a
    // real platformer to work with (additive; fortifyState would inject
    // defaults anyway, but seeding here keeps LIVE state and PLAY in sync).
    if (typeof global.BuilderDefaults === 'function') {
      state.builder = global.BuilderDefaults();
    }

    return state;
  }

  global.StudioStarter = { create: create, tileFrom: tileFrom };
})(typeof window !== 'undefined' ? window : globalThis);
