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

  // --- Power-up + fireball art (engine v5) --------------------------------
  // Single 8x8 sprite tiles so the items read clearly without eating the bank.
  var FIREBALL = tileFrom('fireball', [
    '..1111..',
    '.113311.',
    '11333311',
    '13333331',
    '13333331',
    '11333311',
    '.113311.',
    '..1111..',
  ]);
  var MUSHROOM = tileFrom('mushroom', [
    '..1111..',
    '.133331.',
    '13313331',
    '13133131',
    '11333311',
    '..1221..',
    '..1221..',
    '..1111..',
  ]);
  var FLOWER = tileFrom('flower', [
    '..1..1..',
    '.131131.',
    '13313311',
    '13333331',
    '.133331.',
    '...22...',
    '..2222..',
    '...22...',
  ]);
  var STAR = tileFrom('star', [
    '...11...',
    '...11...',
    '.111111.',
    '.111111.',
    '11111111',
    '.111111.',
    '.11..11.',
    '.1....1.',
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
      // Scene: SMB-style enemies (engine v4) + the villager.  The slime art is
      // reused for a Goomba (stomp to defeat) and a Koopa (stomp -> shell ->
      // kick).  On a pre-v4 engine both fall back to a plain walker.
      if (m.scene) {
        m.scene.config = m.scene.config || {};
        m.scene.config.instances = [
          { id: 1, spriteIdx: 1, x: 200, y: 200, ai: 'goomba', speed: 1 },
          { id: 2, spriteIdx: 2, x: 64, y: 200, ai: 'static', speed: 1 },
          { id: 3, spriteIdx: 1, x: 150, y: 136, ai: 'koopa', speed: 1 },
        ];
      }
      // Per-door destination (engine v2): the door loops back to the start.
      if (m.doors) {
        m.doors.enabled = true;
        m.doors.config = m.doors.config || {};
        m.doors.config.doorList = [{ bg: 0, tx: 28, ty: 27, spawnX: 24, spawnY: 176, targetBgIdx: -1 }];
      }
    }

    // The starter loops via a door (no trigger tile), so the default reach-a-
    // trigger win condition can never fire and only shows a red "no trigger
    // tiles" warning.  Turn it off so a freshly-loaded starter is clean; a
    // pupil adds a win when they are ready.  (DECISION: ship without a win
    // rather than paint a goal tile — revisit if a starter goal is wanted.)
    turnOffWin(state);

    // Stamp the engine this project is authored for (versioning/fallback).
    if (typeof global.NES_ENGINE_VERSION === 'number') {
      state.engineVersion = global.NES_ENGINE_VERSION;
    }

    return state;
  }

  // Seed the four shared background tiles (+ their default behaviour so
  // re-painting in WORLD auto-applies the right type) and the 1..8 sprite
  // tiles.  Shared by every starter so they all read consistently.
  function seedSharedTiles(state) {
    state.bg_tiles[1] = GROUND;  state.bg_tiles[1].defaultBehaviour = 1; // solid
    state.bg_tiles[2] = BRICK;   state.bg_tiles[2].defaultBehaviour = 3; // platform
    state.bg_tiles[3] = LADDER;  state.bg_tiles[3].defaultBehaviour = 6; // ladder
    state.bg_tiles[4] = DOOR;    state.bg_tiles[4].defaultBehaviour = 4; // door
    state.sprite_tiles[1] = HEAD_L;
    state.sprite_tiles[2] = HEAD_R;
    state.sprite_tiles[3] = BODY_L;
    state.sprite_tiles[4] = BODY_R;
    state.sprite_tiles[5] = EN_TL;
    state.sprite_tiles[6] = EN_TR;
    state.sprite_tiles[7] = EN_BL;
    state.sprite_tiles[8] = EN_BR;
  }

  // ---------------------------------------------------------------------
  // Starter 2 — "SMB showcase": every engine v3 + v4 feature in one game.
  //   v3  the `smb` game style — variable-height jump (tap = short hop /
  //       hold = full jump, run take-off jumps higher) + fixed-point
  //       horizontal physics (accelerate to a run, friction, skid).
  //   v4  Goomba (walk off ledges, stomp to defeat + bounce, side-touch
  //       hurts) and Koopa (stomp -> shell -> kick a sliding shell that
  //       chains kills).  Plus hearts/HP + damage, an NPC with dialogue,
  //       a climbable ladder and a per-door warp — so a pupil can see the
  //       whole toolbox wired up and working.
  // ---------------------------------------------------------------------
  function createSmb(opts) {
    opts = opts || {};
    if (!global.DefaultState || typeof global.DefaultState.create !== 'function') {
      throw new Error('StudioStarter.createSmb: DefaultState is not loaded');
    }
    var state = global.DefaultState.create({
      name: opts.name || 'SMB Showcase',
      template: 'platformer',   // the smb style reuses the platformer engine
      now: opts.now,
    });
    seedSharedTiles(state);
    // A goal flag (bg tile 5) — reaching it wins.  defaultBehaviour 5 = trigger,
    // which the "reach a trigger tile" win condition looks for.
    state.bg_tiles[5] = tileFrom('goal', [
      '..1111..',
      '..1111..',
      '..11....',
      '..1.....',
      '..1.....',
      '..1.....',
      '..1.....',
      '..1.....',
    ]);
    state.bg_tiles[5].defaultBehaviour = 5;
    // A ? block (bg tile 6) — painted solid so you stand on it + bonk from below.
    state.bg_tiles[6] = tileFrom('qblock', [
      '11111111',
      '13113131',
      '13131131',
      '11131131',
      '11113131',
      '11111311',
      '11113111',
      '11111111',
    ]);
    state.bg_tiles[6].defaultBehaviour = 1;
    // Power-up + fireball sprite tiles (9..12).  The engine draws the fireball
    // from tile 9 (BW_FIREBALL_TILE below); the item sprites use 10..12.
    state.sprite_tiles[9] = FIREBALL;
    state.sprite_tiles[10] = MUSHROOM;
    state.sprite_tiles[11] = FLOWER;
    state.sprite_tiles[12] = STAR;

    // A two-screen-wide scrolling level (64 tiles across) so the SMB run
    // physics and one-way scroll actually have room to breathe.
    var bg = state.backgrounds[0];
    var SCREEN_H = 30, WORLD_W = 64;   // 2 screens of 32 columns
    bg.dimensions = { screens_x: 2, screens_y: 1 };
    bg.nametable = [];
    bg.behaviour = [];
    for (var r = 0; r < SCREEN_H; r++) {
      var ntrow = [], brow = [];
      for (var c = 0; c < WORLD_W; c++) { ntrow.push({ tile: 0, palette: 0 }); brow.push(0); }
      bg.nametable.push(ntrow); bg.behaviour.push(brow);
    }
    function put(x, y, tile, beh) { bg.nametable[y][x] = { tile: tile, palette: 0 }; bg.behaviour[y][x] = beh; }
    function ground(x0, x1) { for (var x = x0; x <= x1; x++) { put(x, 28, 1, 1); put(x, 29, 1, 1); } }
    function platform(x0, x1, y) { for (var x = x0; x <= x1; x++) put(x, y, 2, 3); }

    // Ground with two pits to jump (a Goomba can walk off a ledge into them).
    ground(0, 14);
    ground(17, 46);
    ground(49, 63);
    // A ladder up to the first platform, then a rising run of platforms across
    // both screens — a running take-off clears the higher, farther gaps.
    for (var ly = 25; ly <= 27; ly++) put(3, ly, 3, 6);
    platform(4, 7, 24);
    platform(10, 13, 20);
    platform(24, 27, 22);
    platform(40, 43, 21);
    platform(54, 57, 18);
    // Interactive blocks (v6): a ? block (gives a mushroom) and a brick, floating
    // at jump height so you bump them from below.
    put(6, 22, 6, 1);    // ? block
    put(24, 20, 2, 1);   // brick
    // The goal flag on the far-right ground — scroll the whole level to win.
    put(61, 27, 5, 5);
    // A warp door back to the start, on the first screen's right ledge.
    put(45, 27, 4, 4);

    state.behaviour_types = defaultBehaviourTypes();
    // Sprites: hero, a Goomba + a Koopa (slime art, separate defs so the AI
    // reads clearly), an NPC villager, and the three power-up items (1x1,
    // flying so they stay put where they are placed).
    var goomba = enemySprite(); goomba.name = 'Goomba';
    var koopa = enemySprite(); koopa.name = 'Koopa';
    function itemSprite(name, tile, pal) {
      return { name: name, role: 'pickup', flying: true, width: 1, height: 1, cells: [[cell(tile, pal)]] };
    }
    state.sprites = [
      playerSprite(), goomba, koopa, npcSprite(),
      itemSprite('Mushroom', 10, 2), itemSprite('Fire Flower', 11, 1), itemSprite('Starman', 12, 3),
    ];

    if (typeof global.BuilderDefaults === 'function') {
      state.builder = global.BuilderDefaults();
      var m = state.builder.modules;
      // v3: the SMB game style (variable jump + fixed-point horizontal).
      // Speed 3 (2 walk / 3.25 run px/f) — a livelier pace than the authentic 2.
      if (m.game) { m.game.config = m.game.config || {}; m.game.config.type = 'smb'; m.game.config.smbSpeed = 3; }
      // SMB-tuned physics: a snappy rise (3 px/f) paired with the engine's
      // slightly-faster smb fall, and a jump-height budget that clears ~4-5
      // tiles standing / more with a running take-off — closer to the original.
      // (The globals module isn't in the default tree, so create it here.)
      m.globals = { enabled: true, config: { gravityPx: 2, jumpSpeedPx: 3, bobWhenWalking: false } };
      // Hearts / HP + damage, so enemies are a real threat and the stomp /
      // demote-on-hit interplay is visible.  Jump height tuned for the arc.
      if (m.players && m.players.submodules && m.players.submodules.player1) {
        m.players.submodules.player1.config.maxHp = 3;
        m.players.submodules.player1.config.startX = 16;
        m.players.submodules.player1.config.startY = 200;
        m.players.submodules.player1.config.jumpHeight = 14;  // × 3 px = ~5 tiles
      }
      if (m.damage) { m.damage.enabled = true; m.damage.config = m.damage.config || {}; m.damage.config.amount = 1; }
      // v5: power-ups + fireballs.  Fireball draws from sprite tile 9.
      if (m.powerups) {
        m.powerups.enabled = true;
        m.powerups.config = m.powerups.config || {};
        m.powerups.config.fireballTile = 9;
        m.powerups.config.fireballPal = 2;
      }
      // NPC dialogue near the start.
      if (m.dialogue) { m.dialogue.enabled = true; m.dialogue.config = m.dialogue.config || {}; m.dialogue.config.text = 'GRAB THE FLOWER!'; }
      // Scene: enemies to stomp/kick + fireball, and the three power-ups spread
      // across the two screens (Mushroom early, Fire Flower mid, Starman late).
      if (m.scene) {
        m.scene.config = m.scene.config || {};
        m.scene.config.instances = [
          { id: 1, spriteIdx: 3, x: 40,  y: 200, ai: 'static', speed: 1 },                 // NPC villager
          { id: 2, spriteIdx: 4, x: 88,  y: 152, ai: 'item', power: 'mushroom' },          // Mushroom on the row-20 platform
          { id: 3, spriteIdx: 1, x: 96,  y: 200, ai: 'goomba', speed: 1 },                 // ground Goomba
          { id: 4, spriteIdx: 1, x: 200, y: 176, ai: 'goomba', speed: 1 },                 // Goomba on the row-22 platform
          { id: 5, spriteIdx: 2, x: 260, y: 200, ai: 'koopa', speed: 1 },                  // Koopa on the right of screen 1
          { id: 6, spriteIdx: 5, x: 336, y: 160, ai: 'item', power: 'fireflower' },        // Fire Flower on the row-21 platform
          { id: 7, spriteIdx: 1, x: 380, y: 200, ai: 'goomba', speed: 1 },                 // screen-2 ground Goomba
          { id: 8, spriteIdx: 6, x: 440, y: 136, ai: 'item', power: 'star' },              // Starman on the high row-18 platform
          { id: 9, spriteIdx: 1, x: 500, y: 200, ai: 'goomba', speed: 1 },                 // last Goomba before the flag
        ];
      }
      // Per-door warp (engine v2): the door loops back to the spawn point.
      if (m.doors) {
        m.doors.enabled = true;
        m.doors.config = m.doors.config || {};
        m.doors.config.doorList = [{ bg: 0, tx: 45, ty: 27, spawnX: 16, spawnY: 200, targetBgIdx: -1 }];
      }
      // v6: interactive blocks — a ? block (mushroom) + a brick (break when super).
      if (m.blocks) {
        m.blocks.enabled = true;
        m.blocks.config = m.blocks.config || { blockList: [] };
        m.blocks.config.blockList = [
          { x: 6, y: 22, kind: 'question', contents: 'mushroom', usedTile: 2 },
          { x: 24, y: 20, kind: 'brick', usedTile: 0 },
        ];
        m.blocks.config.dispTiles = { mushroom: 10, fireflower: 11, star: 12, oneup: 10 };
      }
      // v7: HUD (coins / time / score / lives).
      if (m.smbhud) {
        m.smbhud.enabled = true;
        m.smbhud.config = m.smbhud.config || {};
        m.smbhud.config.startTime = 400;
        m.smbhud.config.startLives = 3;
      }
      // v8: flagpole finish at the goal column (win_condition provides the win).
      if (m.flagpole) {
        m.flagpole.enabled = true;
        m.flagpole.config = m.flagpole.config || {};
        m.flagpole.config.x = 61;
      }
      // v9: OAM flicker so a crowded row flickers instead of dropping sprites.
      if (m.smbrender) m.smbrender.enabled = true;
    }

    if (typeof global.NES_ENGINE_VERSION === 'number') {
      state.engineVersion = global.NES_ENGINE_VERSION;
    }
    return state;
  }

  // Blank a background to `sx`×`sy` screens and return {bg, put}.  Shared by the
  // style starters below so they all size + paint the same way.
  function blankBg(state, sx, sy) {
    var bg = state.backgrounds[0];
    var W = 32 * sx, H = 30 * sy;
    bg.dimensions = { screens_x: sx, screens_y: sy };
    bg.nametable = []; bg.behaviour = [];
    for (var r = 0; r < H; r++) {
      var nt = [], bh = [];
      for (var c = 0; c < W; c++) { nt.push({ tile: 0, palette: 0 }); bh.push(0); }
      bg.nametable.push(nt); bg.behaviour.push(bh);
    }
    return {
      bg: bg, W: W, H: H,
      put: function (x, y, tile, beh) { if (bg.nametable[y] && bg.nametable[y][x]) { bg.nametable[y][x] = { tile: tile, palette: 0 }; bg.behaviour[y][x] = beh; } },
    };
  }
  function turnOffWin(state) {
    try { var wc = state.builder.modules.win_condition; if (wc) wc.enabled = false; } catch (e) {}
  }
  function stampEngine(state) {
    if (typeof global.NES_ENGINE_VERSION === 'number') state.engineVersion = global.NES_ENGINE_VERSION;
  }

  // --- Top-down adventure: a walled room, a walker + a villager -------------
  function createTopdown(opts) {
    opts = opts || {};
    var state = global.DefaultState.create({ name: opts.name || 'Top-down Adventure', template: 'platformer', now: opts.now });
    seedSharedTiles(state);
    state.behaviour_types = defaultBehaviourTypes();
    state.sprites = [playerSprite(), enemySprite(), npcSprite()];
    var g = blankBg(state, 1, 1);
    // Wall border (solid ground blocks the player in top-down too), open middle.
    for (var x = 0; x < g.W; x++) { g.put(x, 0, 1, 1); g.put(x, g.H - 1, 1, 1); }
    for (var y = 0; y < g.H; y++) { g.put(0, y, 1, 1); g.put(g.W - 1, y, 1, 1); }
    // A short interior wall to make the room feel like a room, plus a door.
    for (var iy = 6; iy <= 13; iy++) g.put(18, iy, 1, 1);
    g.put(g.W - 1, 15, 4, 4);   // door on the right wall
    state.builder = global.BuilderDefaults();
    var m = state.builder.modules;
    m.game.config.type = 'topdown';
    if (m.behaviour_walls) m.behaviour_walls.enabled = true;
    if (m.players && m.players.submodules && m.players.submodules.player1) {
      m.players.submodules.player1.config.startX = 96;
      m.players.submodules.player1.config.startY = 120;
    }
    if (m.scene) {
      m.scene.config = m.scene.config || {};
      m.scene.config.instances = [
        { id: 1, spriteIdx: 1, x: 180, y: 120, ai: 'walker', speed: 1 },
        { id: 2, spriteIdx: 2, x: 64, y: 80, ai: 'static', speed: 1 },
      ];
    }
    if (m.dialogue) { m.dialogue.enabled = true; m.dialogue.config = m.dialogue.config || {}; m.dialogue.config.text = 'FIND THE DOOR'; }
    turnOffWin(state);          // top-down win is added later; keep attention clean
    stampEngine(state);
    return state;
  }

  // --- Auto-runner: 4-screen track, a floor with a gap, a spike ------------
  function createRunner(opts) {
    opts = opts || {};
    var state = global.DefaultState.create({ name: opts.name || 'Auto-runner', template: 'platformer', now: opts.now });
    seedSharedTiles(state);
    state.behaviour_types = defaultBehaviourTypes().concat([{ id: 7, name: 'spike', label: 'Spike', color: 0x16 }]);
    state.bg_tiles[5] = tileFrom('spike', [
      '........', '........', '...1....', '..111...', '..111...', '.11111..', '11111111', '11111111',
    ]);
    state.bg_tiles[5].defaultBehaviour = 7;
    state.sprites = [playerSprite()];
    var g = blankBg(state, 4, 1);   // ≥2 screens wide (runner needs a scrolling world)
    function floor(x0, x1) { for (var x = x0; x <= x1; x++) { g.put(x, 28, 1, 1); g.put(x, 29, 1, 1); } }
    floor(0, 40); floor(45, g.W - 1);         // a small gap to jump at 41-44
    for (var p = 20; p <= 23; p++) g.put(p, 24, 2, 3);   // a platform (brick) to hop
    g.put(50, 27, 5, 7);                       // one spike after the gap
    state.builder = global.BuilderDefaults();
    var m = state.builder.modules;
    m.game.config = m.game.config || {};
    m.game.config.type = 'runner';
    m.game.config.autoscrollSpeed = 2;
    if (m.behaviour_walls) m.behaviour_walls.enabled = true;
    if (m.dialogue) m.dialogue.enabled = false;   // dialogue is unsupported in runner builds
    if (m.players && m.players.submodules && m.players.submodules.player1) {
      m.players.submodules.player1.config.startX = 24;
      m.players.submodules.player1.config.startY = 176;
    }
    turnOffWin(state);
    stampEngine(state);
    return state;
  }

  // --- Top-down racer: a rectangular ring track with a finish + checkpoint --
  function createRacer(opts) {
    opts = opts || {};
    var state = global.DefaultState.create({ name: opts.name || 'Mini GP', template: 'platformer', now: opts.now });
    seedSharedTiles(state);
    state.behaviour_types = defaultBehaviourTypes().concat([{ id: 7, name: 'finish', label: 'Finish', color: 0x30 }]);
    state.bg_tiles[5] = tileFrom('finish', [
      '13131313', '31313131', '13131313', '31313131', '13131313', '31313131', '13131313', '31313131',
    ]);
    state.bg_tiles[5].defaultBehaviour = 7;    // finish line
    state.bg_tiles[6] = tileFrom('checkpoint', [
      '.222222.', '2......2', '2.2222.2', '2.2..2.2', '2.2..2.2', '2.2222.2', '2......2', '.222222.',
    ]);
    state.bg_tiles[6].defaultBehaviour = 5;    // checkpoint 1 (trigger slot)
    // A simple top-down car (points up): two tiles mirrored left/right so the
    // whole 2×2 metasprite reads as a car, not the walking hero.
    state.sprite_tiles[13] = tileFrom('car-top', [
      '....1111', '...11111', '..111111', '..113311', '..113311', '..111111', '.2111111', '.2111111',
    ]);
    state.sprite_tiles[14] = tileFrom('car-bot', [
      '..111111', '..111111', '..113311', '..113311', '..111111', '.2111111', '.2111111', '..111111',
    ]);
    function carCell(tile, flip) { return { tile: tile, palette: 0, flipH: !!flip, flipV: false, priority: false, empty: false }; }
    var car = {
      name: 'Car', role: 'player', flying: false, width: 2, height: 2,
      cells: [[carCell(13, false), carCell(13, true)], [carCell(14, false), carCell(14, true)]],
    };
    state.sprites = [car];
    var g = blankBg(state, 2, 2);   // racer needs ≥2 screens on an axis
    // Solid outer border (2 thick) + a solid central block → a road ring.
    for (var x = 0; x < g.W; x++) { g.put(x, 0, 1, 1); g.put(x, 1, 1, 1); g.put(x, g.H - 2, 1, 1); g.put(x, g.H - 1, 1, 1); }
    for (var y = 0; y < g.H; y++) { g.put(0, y, 1, 1); g.put(1, y, 1, 1); g.put(g.W - 2, y, 1, 1); g.put(g.W - 1, y, 1, 1); }
    for (var by = 12; by <= g.H - 13; by++) { for (var bx = 12; bx <= g.W - 13; bx++) g.put(bx, by, 1, 1); }
    // Finish line across the top straight; checkpoint across the bottom straight.
    for (var fy = 2; fy <= 11; fy++) g.put(32, fy, 5, 7);
    for (var cy = g.H - 12; cy <= g.H - 3; cy++) g.put(32, cy, 6, 5);
    state.builder = global.BuilderDefaults();
    var m = state.builder.modules;
    m.game.config = m.game.config || {};
    m.game.config.type = 'racer';
    m.game.config.racerTopSpeed = 3;
    m.game.config.racerLaps = 2;
    m.game.config.racerCheckpoints = 1;
    if (m.players && m.players.submodules && m.players.submodules.player1) {
      m.players.submodules.player1.config.startX = 48;    // on the top-left road
      m.players.submodules.player1.config.startY = 48;
    }
    turnOffWin(state);   // the racer wins by laps, not a trigger tile (which it reuses)
    stampEngine(state);
    return state;
  }

  // Style → (plain starter factory, tutorial manifest id).
  var STYLES = {
    platformer: { create: create,        manifest: 'first-game' },
    smb:        { create: createSmb,     manifest: 'smb-first' },
    topdown:    { create: createTopdown, manifest: 'topdown-first' },
    runner:     { create: createRunner,  manifest: 'runner-first' },
    racer:      { create: createRacer,   manifest: 'racer-first' },
  };

  // Build the guided-tutorial variant of a style: its ready-made starter plus a
  // `tutorial` marker (studio-tutorial.js opens the step panel when it sees it).
  function tutorialFor(style, opts) {
    var def = STYLES[style] || STYLES.platformer;
    var state = def.create(opts || {});
    // The basics platformer loops via a door with no trigger tile, which trips
    // the win-condition validator — quieten it for the tutorial.
    if (style === 'platformer') turnOffWin(state);
    state.tutorial = { active: true, id: def.manifest, step: 0 };
    return state;
  }

  // Back-compat: the original platformer tutorial entry/handler.
  function createTutorial(opts) { return tutorialFor('platformer', opts); }

  // Registry of selectable starters, so the Studio can offer a picker.
  // `create(opts)` builds a fresh project; `min` is the engine the starter
  // needs to shine (advisory — starters degrade gracefully on older engines).
  function list() {
    return [
      {
        id: 'tutorial', emoji: '🎓', label: 'Guided tutorial',
        desc: 'The best place to start. A ready-made game walks you through the editor one small step at a time — name your hero, change a colour, build the world, tweak the rules, and play it.',
        create: createTutorial,
      },
      {
        id: 'basics', emoji: '🎮', label: 'Platformer basics',
        desc: 'A gentle single-screen platformer: hero, an enemy, an NPC to talk to, a ladder and a door. Best place to learn the editor.',
        create: create,
      },
      {
        id: 'smb', emoji: '🍄', label: 'SMB showcase', min: 5,
        desc: 'A two-screen scrolling level with the whole SMB toolbox: run physics + variable jump (v3), Goomba stomps and a kickable Koopa shell (v4), Mushroom / Fire Flower / Starman power-ups with B-button fireballs (v5), ? blocks + bricks (v6), a coins/time/score/lives HUD (v7), a flagpole finish (v8) and sprite flicker (v9) — plus hearts, dialogue, a ladder and a warp door.',
        create: createSmb,
      },
      {
        id: 'topdown', emoji: '🧭', label: 'Top-down adventure',
        desc: 'A four-way, no-gravity room to explore: walls you cannot walk through, a wandering enemy, a villager to talk to, and a door.',
        create: createTopdown,
      },
      {
        id: 'runner', emoji: '🏃', label: 'Auto-runner',
        desc: 'A side-scroller that moves by itself: run and jump a gap and a platform, dodge a spike. Set the scroll speed in Rules.',
        create: createRunner,
      },
      {
        id: 'racer', emoji: '🏎️', label: 'Top-down racer',
        desc: 'A top-down racing track: steer, accelerate and brake around a ring, cross the finish line and a checkpoint each lap.',
        create: createRacer,
      },
    ];
  }

  global.StudioStarter = {
    create: create, createSmb: createSmb,
    createTopdown: createTopdown, createRunner: createRunner, createRacer: createRacer,
    createTutorial: createTutorial, tutorialFor: tutorialFor,
    list: list, tileFrom: tileFrom,
  };
})(typeof window !== 'undefined' ? window : globalThis);
