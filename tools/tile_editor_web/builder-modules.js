/*
 * Builder module catalogue — chunk 1.
 *
 * Each entry describes one module or submodule the Builder page can
 * render in its tree.  The object is keyed by dotted id (`players`,
 * `players.player1`) so the assembler + validators can look up handlers
 * by the same key the UI uses.
 *
 * A module entry may contain any subset of:
 *
 *   - label         : short human string shown in the accordion header
 *   - description   : one-sentence explainer, shown under the label
 *   - parent        : optional parent module id (for submodules)
 *   - defaultConfig : initial config object when first ticked
 *   - schema        : array of typed field descriptors the UI renders:
 *                     { key, label, type, min, max, step, help,
 *                       options, readOnly }
 *                     `type` is one of 'int' | 'bool' | 'enum' | 'sprite'
 *                     | 'animation'.  'sprite' and 'animation' render
 *                     as pickers that present choices from state.
 *   - applyToTemplate(template, node, state) : optional pure function
 *                     that transforms the template string and returns a
 *                     new one.  The assembler runs these in
 *                     MODULE_ORDER (see builder-assembler.js).
 *
 * Chunk 1 ships two modules — `game` and `players` (with `players.player1`
 * submodule).  The existing //>> regions in platformer.c (walk_speed,
 * player_start, jump_height) are how values make it into the output;
 * nothing new needs adding to the template itself.
 */
(function () {
  'use strict';

  const A = window.BuilderAssembler;
  if (!A) {
    throw new Error('builder-modules.js must load after builder-assembler.js');
  }

  const modules = Object.create(null);

  // --------------------------------------------------------------------
  // Game type — picks the base template in Phase B when topdown lands.
  // For chunk 1 only `platformer` is implemented, but shipping the enum
  // now keeps the state shape stable.
  // --------------------------------------------------------------------
  modules['game'] = {
    label: 'Game type',
    description: 'What kind of game is this?  Platformer = side-on with ' +
      'gravity, jumping and ladders.  Top-down = Pokémon / Zelda feel: ' +
      'four-way movement, no gravity, no jumping.  All other modules ' +
      '(damage, dialogue, doors, pickups, …) work the same in either ' +
      'mode — only the player physics changes.',
    defaultConfig: { type: 'platformer' },
    schema: [
      {
        key: 'type',
        label: 'Type',
        type: 'enum',
        options: [
          { value: 'platformer', label: '🏃 Platformer (side-on, gravity + jump)' },
          { value: 'topdown',    label: '🧭 Top-down (four-way, no gravity)' },
        ],
      },
    ],
    // Phase 3.1: top-down support.  Both styles share one template
    // (`platformer.c`).  We just emit a `BW_GAME_STYLE` macro that the
    // template's preprocessor uses to pick which player-vertical block
    // to compile — gravity + jump + ladder for platformer (default),
    // 4-way movement with collision for top-down.  Default value of 0
    // matches Step_Playground's stock main.c so the byte-identical-
    // baseline test still holds when no Builder modules are ticked.
    applyToTemplate(template, node /*, state */) {
      const c = (node && node.config) || {};
      const isTopdown = c.type === 'topdown';
      // Platformer: emit nothing (BW_GAME_STYLE defaults to 0 in the
      // template's `#ifndef`).  Keeps the no-modules-ticked path
      // byte-for-byte identical to today.
      if (!isTopdown) return template;
      return A.appendToSlot(template, 'declarations', [
        '/* Builder game module — top-down style. */',
        '#define BW_GAME_STYLE 1',
      ].join('\n'));
    },
  };

  // --------------------------------------------------------------------
  // Players — container module.  Chunk 1 only renders Player 1; a
  // second-player submodule ships in Phase B.
  // --------------------------------------------------------------------
  modules['players'] = {
    label: 'Players',
    description: 'Who controls a sprite?  Tick Player 2 below to add ' +
      'a second character driven by Controller 2 — you\'ll need a ' +
      'second sprite tagged Player on the Sprites page for it to have ' +
      'art to draw.',
    // `count` is legacy; the per-player submodule enabled flags are
    // the real source of truth now.  Left in state so old saves
    // round-trip without migrations.
    defaultConfig: { count: 1 },
    schema: [],
  };

  modules['players.player1'] = {
    parent: 'players',
    label: 'Player 1',
    description: 'The main character — tagged by role = Player on the ' +
      'Sprites page.  Walks with ← / →, jumps with ↑.',
    defaultConfig: {
      startX: 60,
      startY: 120,
      walkSpeed: 1,
      jumpHeight: 20,
      maxHp: 0,   // 0 = no HP system; Phase B wires this up.
    },
    schema: [
      {
        key: 'startX',
        label: 'Start X (0 = left, 240 = right)',
        type: 'int',
        min: 0,
        max: 240,
        step: 4,
        help: 'Where the player spawns horizontally.',
      },
      {
        key: 'startY',
        label: 'Start Y (16 = top, 200 = bottom)',
        type: 'int',
        min: 16,
        max: 200,
        step: 4,
        help: 'Where the player spawns vertically. Paint SOLID_GROUND ' +
          'or PLATFORM tiles below this point or the player will drop.',
      },
      {
        key: 'walkSpeed',
        label: 'Walk speed (px/frame)',
        type: 'int',
        min: 1,
        max: 4,
        help: '1 = slow, 2 = normal, 3 = fast, 4 = very fast.',
      },
      {
        key: 'jumpHeight',
        label: 'Jump height',
        type: 'int',
        min: 8,
        max: 40,
        help: 'Bigger number = higher jump (try 10–40).',
      },
      {
        key: 'maxHp',
        label: 'Max HP (0 = no damage system)',
        type: 'int',
        min: 0,
        max: 9,
        help: '0 = the player never takes damage.  Set 1–9 and tick ' +
          'the Damage module below to let enemies hurt the player.',
      },
    ],
    applyToTemplate(template, node, state) {
      const c = (node && node.config) || {};
      const walkSpeed  = A.clampInt(c.walkSpeed, 1, 8, 1);
      const jumpHeight = A.clampInt(c.jumpHeight, 1, 60, 20);
      const startX     = A.clampInt(c.startX, 0, 240, 60);
      const startY     = A.clampInt(c.startY, 16, 200, 120);
      const maxHp      = A.clampInt(c.maxHp, 0, 9, 0);
      template = A.replaceRegion(template, 'walk_speed', [
        '    unsigned char walk_speed = ' + walkSpeed + ';'
      ]);
      template = A.replaceRegion(template, 'jump_height', [
        '                jmp_up = ' + jumpHeight + ';'
      ]);
      // `player_start` sits inside main() with two-space indent on each
      // line to match the surrounding scope.
      template = A.replaceRegion(template, 'player_start', [
        '    px = ' + startX + ';',
        '    py = ' + startY + ';'
      ]);
      // HP on/off is flipped by whether maxHp is > 0 AND the damage
      // module is enabled.  The damage module itself emits the
      // collision + freeze logic; the player module only exposes the
      // `PLAYER_MAX_HP` constant so the damage block can reference it.
      const damage = state && state.builder && state.builder.modules &&
        state.builder.modules.damage;
      const damageOn = !!(damage && damage.enabled);
      if (maxHp > 0 && damageOn) {
        template = A.appendToSlot(template, 'declarations', [
          '#define PLAYER_HP_ENABLED 1',
          '#define PLAYER_MAX_HP ' + maxHp,
        ].join('\n'));
      }
      return template;
    },
  };

  // --------------------------------------------------------------------
  // Player 2 — opt-in second character, driven by the second NES
  // controller.  Uses the second sprite tagged Player on the Sprites
  // page (findSpritesByRole[1]).  See builder-plan-player2.md for the
  // full plan, especially the "MVP omissions" list (no ladder, no
  // ceiling-bonk, no per-player animation).
  // --------------------------------------------------------------------
  modules['players.player2'] = {
    parent: 'players',
    label: 'Player 2',
    description: 'A second character controlled by Controller 2.  ' +
      'Needs a second sprite tagged Player on the Sprites page so it ' +
      'has art to draw.  Walks + jumps with the same controls as ' +
      'Player 1; no ladder support in this first version.',
    defaultConfig: {
      startX: 180,
      startY: 120,
      walkSpeed: 1,
      jumpHeight: 20,
      maxHp: 0,
    },
    schema: [
      {
        key: 'startX',
        label: 'Start X (0 = left, 240 = right)',
        type: 'int',
        min: 0, max: 240, step: 4,
        help: 'Where Player 2 spawns horizontally.',
      },
      {
        key: 'startY',
        label: 'Start Y (16 = top, 200 = bottom)',
        type: 'int',
        min: 16, max: 200, step: 4,
        help: 'Where Player 2 spawns vertically. Paint a floor tile ' +
          'below or Player 2 will drop.',
      },
      {
        key: 'walkSpeed',
        label: 'Walk speed (px/frame)',
        type: 'int',
        min: 1, max: 4,
        help: '1 = slow, 2 = normal, 3 = fast.',
      },
      {
        key: 'jumpHeight',
        label: 'Jump height',
        type: 'int',
        min: 8, max: 40,
        help: 'Bigger number = higher jump.',
      },
      {
        key: 'maxHp',
        label: 'Max HP (0 = P2 never takes damage)',
        type: 'int',
        min: 0, max: 9,
        help: '0 = Player 2 is invincible.  Set 1–9 and tick the ' +
          'Damage module to let enemies hurt Player 2 too.',
      },
    ],
    applyToTemplate(template, node, state) {
      const c = (node && node.config) || {};
      const walkSpeed  = A.clampInt(c.walkSpeed, 1, 8, 1);
      const jumpHeight = A.clampInt(c.jumpHeight, 1, 60, 20);
      // P2's start position comes through scene.inc as PLAYER2_X / Y
      // (emitted by the server from the /play payload's playerStart2),
      // so we don't replace `player2_start` here — it already reads
      // the right symbols.  Only the speed + jump regions need
      // injection.
      template = A.replaceRegion(template, 'player2_walk_speed', [
        'unsigned char walk_speed2 = ' + walkSpeed + ';'
      ]);
      template = A.replaceRegion(template, 'player2_jump_height', [
        '            jmp_up2 = ' + jumpHeight + ';'
      ]);
      // Phase B+ round 1a: emit PLAYER2_HP_ENABLED + PLAYER2_MAX_HP
      // only when P2 is on AND damage module is on AND maxHp > 0.
      // Keeps the preprocessor gate conservative so single-player
      // or damage-off games don't pay the P2 HP cost.
      const maxHp = A.clampInt(c.maxHp, 0, 9, 0);
      const damage = state && state.builder && state.builder.modules &&
        state.builder.modules.damage;
      const damageOn = !!(damage && damage.enabled);
      if (maxHp > 0 && damageOn) {
        template = A.appendToSlot(template, 'declarations', [
          '#define PLAYER2_HP_ENABLED 1',
          '#define PLAYER2_MAX_HP ' + maxHp,
        ].join('\n'));
      }
      return template;
    },
  };

  // --------------------------------------------------------------------
  // Scene — explicit placement of sprite instances.  When empty, the
  // Builder auto-places every non-player sprite and the walker/chaser
  // modules apply to every ROLE_ENEMY sprite.  When the pupil adds
  // instances here, those take over: walker/chaser become no-ops and
  // the assembler emits per-instance AI.  Sprite reuse drops out for
  // free — two instances can point at the same spriteIdx.
  // --------------------------------------------------------------------
  modules['scene'] = {
    label: 'Scene',
    description: 'Choose exactly which sprites appear in the game, ' +
      'where, and what each one does.  Click an empty spot on the ' +
      'preview to drop a sprite, or use the + Add instance button.  ' +
      'Drag any sprite (including the player) to move it.  You can ' +
      'place the same sprite more than once — handy for three ' +
      'identical goombas.  Leave the list empty and the Builder ' +
      'will auto-place one of each non-player sprite for you.',
    detailedHelp: [
      'A scene instance is one sprite placement.  Each instance ' +
      'points at a sprite definition (its art + role) and says ' +
      'where it appears + what AI drives it.',
      'Three enemies drawn as the same "goomba" sprite?  Add three ' +
      'instances all pointing at the goomba.  One walks, one chases, ' +
      'one stands still?  Pick the AI per instance.',
      'Leaving the list empty falls back to auto-placement: one ' +
      'copy of every non-player sprite, spread along the mid-line.  ' +
      'Handy when you\'re starting a project; swap to explicit ' +
      'instances once you want control.',
    ],
    defaultConfig: {
      instances: [],   // [{ id, spriteIdx, x, y, ai }]
    },
    schema: [],
    customRender: true,   // builder.html renders the dynamic list itself
    applyToTemplate(template, node, state) {
      const instances = (node && node.config && node.config.instances) || [];
      if (instances.length === 0) return template;  // auto-placement handles it

      const sprites = (state && state.sprites) || [];
      const parts = [
        '        // [builder] scene — per-instance AI for manually-placed sprites.',
      ];
      let emitted = 0;
      for (let i = 0; i < instances.length; i++) {
        const inst = instances[i] || {};
        const sp = sprites[inst.spriteIdx];
        if (!sp) continue;
        const ai = inst.ai || 'static';
        if (sp.role === 'enemy' && ai === 'walker') {
          emitted++;
          parts.push(
            '        // instance ' + i + ' — ' + (sp.name || '?') +
              ' walks side to side');
          parts.push('        {');
          parts.push('            static signed char bw_dir_' + i + ' = 1;');
          parts.push('            unsigned char bw_ew = ss_w[' + i + '] << 3;');
          parts.push('            if (bw_dir_' + i + ' > 0) {');
          parts.push('                if (ss_x[' + i + '] + bw_ew + 1 < 255) ss_x[' + i + '] += 1;');
          parts.push('                else bw_dir_' + i + ' = -1;');
          parts.push('            } else {');
          parts.push('                if (ss_x[' + i + '] > 0) ss_x[' + i + '] -= 1;');
          parts.push('                else bw_dir_' + i + ' = 1;');
          parts.push('            }');
          parts.push('        }');
        } else if (sp.role === 'enemy' && ai === 'chaser') {
          emitted++;
          parts.push(
            '        // instance ' + i + ' — ' + (sp.name || '?') +
              ' chases the player');
          parts.push('        if (ss_x[' + i + '] + 1 <= px) ss_x[' + i + '] += 1;');
          parts.push('        else if (ss_x[' + i + '] >= px + 1) ss_x[' + i + '] -= 1;');
          parts.push('        if (ss_y[' + i + '] + 1 <= py) ss_y[' + i + '] += 1;');
          parts.push('        else if (ss_y[' + i + '] >= py + 1) ss_y[' + i + '] -= 1;');
        }
        // `static` and non-enemy roles: nothing to emit.  Pickups and
        // decorations just sit where they were placed.
      }
      if (emitted === 0) return template;  // only static instances
      return A.appendToSlot(template, 'per_frame', parts.join('\n'));
    },
  };

  // Note: the legacy `enemies` / `enemies.walker` / `enemies.chaser`
  // modules lived here until 2026-04-24.  They emitted a global per-
  // frame loop over every ROLE_ENEMY sprite, but the Scene module's
  // per-instance AI dropdown (Static / Walker / Chaser on each placed
  // enemy) is strictly more expressive and no pupil was using the old
  // modules.  Removing them avoids the "Walkers are on, but no sprite
  // is tagged Enemy" noise on fresh projects with no enemy sprite.

  // --------------------------------------------------------------------
  // Pickups — sprites tagged ROLE_PICKUP vanish on touch and add to
  // a counter.  The counter itself can drive the "collect them all"
  // win condition below.
  // --------------------------------------------------------------------
  modules['pickups'] = {
    label: 'Pickups',
    description: 'Sprites tagged Pickup on the Sprites page disappear ' +
      'when the player touches them.  Use them for coins, keys, or ' +
      'anything collectible.  A counter (total / collected) is kept so ' +
      'the Win condition can wait for the player to gather them all.',
    defaultConfig: {},
    schema: [],
    applyToTemplate(template, node, state) {
      template = A.appendToSlot(template, 'declarations', [
        'unsigned char bw_pickup_count = 0;  // [builder] pickups — collected so far',
        'unsigned char bw_pickup_total = 0;  // [builder] pickups — total on the level',
      ].join('\n'));
      template = A.appendToSlot(template, 'init', [
        '    // [builder] pickups — count every ROLE_PICKUP sprite so',
        '    // "collect them all" win conditions know the target.',
        '    bw_pickup_total = 0;',
        '    for (i = 0; i < NUM_STATIC_SPRITES; i++) {',
        '        if (ss_role[i] == ROLE_PICKUP) bw_pickup_total++;',
        '    }',
      ].join('\n'));
      const body = [
        '        // [builder] pickups — AABB collide each player vs every',
        '        // ROLE_PICKUP sprite.  Collected pickups fly off-screen',
        '        // (y = 0xFF) and stay there; bw_pickup_count ticks up.',
        '        // Under PLAYER2_ENABLED the same check runs for P2 so',
        '        // either player can pick things up.',
        '        for (i = 0; i < NUM_STATIC_SPRITES; i++) {',
        '            if (ss_role[i] != ROLE_PICKUP) continue;',
        '            if (ss_y[i] >= 240) continue;       // already collected',
        '            if (!(px + (PLAYER_W << 3) <= ss_x[i] ||',
        '                  px >= ss_x[i] + (ss_w[i] << 3) ||',
        '                  py + (PLAYER_H << 3) <= ss_y[i] ||',
        '                  py >= ss_y[i] + (ss_h[i] << 3))) {',
        '                ss_y[i] = 0xFF;',
        '                bw_pickup_count++;',
        '                continue;',
        '            }',
        '#if PLAYER2_ENABLED',
        '            if (!(px2 + (PLAYER2_W << 3) <= ss_x[i] ||',
        '                  px2 >= ss_x[i] + (ss_w[i] << 3) ||',
        '                  py2 + (PLAYER2_H << 3) <= ss_y[i] ||',
        '                  py2 >= ss_y[i] + (ss_h[i] << 3))) {',
        '                ss_y[i] = 0xFF;',
        '                bw_pickup_count++;',
        '            }',
        '#endif',
        '        }',
      ].join('\n');
      return A.appendToSlot(template, 'per_frame', body);
    },
  };

  // --------------------------------------------------------------------
  // Behaviour walls — informational.  The stock platformer template
  // ALREADY respects SOLID_GROUND / WALL / PLATFORM / LADDER tiles
  // painted on the Behaviour page (see the existing walk / jump /
  // gravity code in platformer.c).  The module is therefore a "this
  // is how walls work" explainer for pupils, plus a validator that
  // warns if the pupil hasn't painted any wall tiles yet.  Kept as
  // an enabled-by-default tickbox so pupils *see* that the behaviour
  // map matters, and can uncheck it if they want a frictionless
  // playground (which is a no-op in chunk 2 — Phase B may add a
  // "ignore behaviour map" switch that actually disables the checks).
  // --------------------------------------------------------------------
  // --------------------------------------------------------------------
  // Damage — enemies hurt the player on touch (Phase B finale chunk A).
  // Needs Player 1's Max HP set above 0; validator enforces.  When on,
  // the module emits an AABB collision loop into per_frame that
  // decrements player_hp and starts an invincibility window on hit,
  // plus a freeze block that triggers when HP reaches 0.
  // --------------------------------------------------------------------
  modules['damage'] = {
    label: 'Damage',
    description: 'When Player 1 touches a sprite tagged Enemy, the ' +
      'player loses HP and flashes briefly so you see the hit land.  ' +
      'When HP reaches 0, the screen tints blue — game over.  Pair ' +
      'with HUD to show hearts.',
    detailedHelp: [
      'Damage checks every frame whether Player 1 is overlapping an ' +
      'Enemy-tagged sprite using an axis-aligned-bounding-box check ' +
      '(AABB) — the standard platformer collision.',
      'On a hit, Player 1 loses Damage-per-touch HP and becomes ' +
      'invincible for Invincibility frames.  During invincibility, ' +
      'enemies can walk through the player without triggering again.',
      'When HP reaches 0, the player freezes, the screen tints pale ' +
      'blue, and the game ends (matches the Win condition\'s pale-red ' +
      'tint — same vocabulary, different outcome).',
      'Requires Player 1\'s Max HP > 0; the Builder blocks Play if ' +
      'you tick Damage without raising Max HP.',
    ],
    defaultConfig: {
      amount: 1,
      invincibilityFrames: 30,
    },
    schema: [
      {
        key: 'amount',
        label: 'Damage per touch',
        type: 'int',
        min: 1, max: 9,
        help: 'How much HP is lost per enemy touch.',
      },
      {
        key: 'invincibilityFrames',
        label: 'Invincibility after hit (frames — 60 = 1 sec)',
        type: 'int',
        min: 0, max: 120,
        help: 'Player can\'t be hit again for this many frames after ' +
          'each hit.  0 = instant repeat hits.',
      },
    ],
    applyToTemplate(template, node, state) {
      const c = (node && node.config) || {};
      const amount = A.clampInt(c.amount, 1, 9, 1);
      const iframes = A.clampInt(c.invincibilityFrames, 0, 120, 30);
      template = A.appendToSlot(template, 'declarations', [
        '#define DAMAGE_AMOUNT ' + amount,
        '#define INVINCIBILITY_FRAMES ' + iframes,
      ].join('\n'));
      const body = [
        '        // [builder] damage — enemies hurt the player(s) on touch.',
        '#if PLAYER_HP_ENABLED',
        '        if (!player_dead && player_iframes == 0) {',
        '            unsigned char dmg_hit = 0;',
        '            for (i = 0; i < NUM_STATIC_SPRITES; i++) {',
        '                if (ss_role[i] != ROLE_ENEMY) continue;',
        '                if (ss_y[i] >= 240) continue;',
        '                if (px + (PLAYER_W << 3) <= ss_x[i]) continue;',
        '                if (px >= ss_x[i] + (ss_w[i] << 3)) continue;',
        '                if (py + (PLAYER_H << 3) <= ss_y[i]) continue;',
        '                if (py >= ss_y[i] + (ss_h[i] << 3)) continue;',
        '                dmg_hit = 1; break;',
        '            }',
        '            if (dmg_hit) {',
        '                player_hp = (player_hp > DAMAGE_AMOUNT)',
        '                          ? (player_hp - DAMAGE_AMOUNT) : 0;',
        '                player_iframes = INVINCIBILITY_FRAMES;',
        '                if (player_hp == 0) player_dead = 1;',
        '            }',
        '        } else if (player_iframes > 0) {',
        '            player_iframes--;',
        '        }',
        '        if (player_dead) {',
        '            jumping = 0; jmp_up = 0; prev_pad = 0xFF;',
        '            walk_speed = 0; climb_speed = 0;',
        '        }',
        '#endif',
        '#if PLAYER2_HP_ENABLED',
        '        /* Phase B+ round 1a — Player 2 takes damage too.  Mirrors',
        '         * the P1 block variable-for-variable. */',
        '        if (!player2_dead && player2_iframes == 0) {',
        '            unsigned char dmg2_hit = 0;',
        '            for (i = 0; i < NUM_STATIC_SPRITES; i++) {',
        '                if (ss_role[i] != ROLE_ENEMY) continue;',
        '                if (ss_y[i] >= 240) continue;',
        '                if (px2 + (PLAYER2_W << 3) <= ss_x[i]) continue;',
        '                if (px2 >= ss_x[i] + (ss_w[i] << 3)) continue;',
        '                if (py2 + (PLAYER2_H << 3) <= ss_y[i]) continue;',
        '                if (py2 >= ss_y[i] + (ss_h[i] << 3)) continue;',
        '                dmg2_hit = 1; break;',
        '            }',
        '            if (dmg2_hit) {',
        '                player2_hp = (player2_hp > DAMAGE_AMOUNT)',
        '                           ? (player2_hp - DAMAGE_AMOUNT) : 0;',
        '                player2_iframes = INVINCIBILITY_FRAMES;',
        '                if (player2_hp == 0) player2_dead = 1;',
        '            }',
        '        } else if (player2_iframes > 0) {',
        '            player2_iframes--;',
        '        }',
        '        if (player2_dead) {',
        '            jumping2 = 0; jmp_up2 = 0; prev_pad2 = 0xFF;',
        '            walk_speed2 = 0;',
        '        }',
        '#endif',
        '        /* Game-over tint fires when every HP-enabled player is',
        '         * dead.  Single-player: P1 dead alone triggers it.  Two-',
        '         * player: both must be down. */',
        '#if PLAYER_HP_ENABLED && PLAYER2_HP_ENABLED',
        '        if (player_dead && player2_dead) PPU_MASK = 0x1F | 0x80;',
        '#elif PLAYER_HP_ENABLED',
        '        if (player_dead) PPU_MASK = 0x1F | 0x80;',
        '#elif PLAYER2_HP_ENABLED',
        '        if (player2_dead) PPU_MASK = 0x1F | 0x80;',
        '#endif',
      ].join('\n');
      return A.appendToSlot(template, 'per_frame', body);
    },
  };

  // --------------------------------------------------------------------
  // HUD — draw N hearts at the top of the screen, one per remaining HP.
  // Uses a sprite tagged `hud` on the Sprites page as the heart icon.
  // Rendered via OAM sprites in the per-frame OAM loop; no PPU writes,
  // no font-tile seed.  Active only when both HUD_ENABLED and
  // PLAYER_HP_ENABLED are on — the template's #if gate enforces.
  // --------------------------------------------------------------------
  modules['hud'] = {
    label: 'HUD (hearts)',
    description: 'Show hearts at the top of the screen — one per ' +
      'remaining HP.  Tag a small sprite as HUD on the Sprites page ' +
      'to choose the heart icon.',
    defaultConfig: {},
    schema: [],
    // No applyToTemplate — the template\'s built-in #if HUD_ENABLED
    // block reads hud_tiles / hud_attrs directly from scene.inc.
    // The server only emits those when a sprite has role=hud, so the
    // Builder's job here is just to surface the module.
  };

  // --------------------------------------------------------------------
  // Doors (Phase B finale chunk C, narrowed-scope MVP).  The full
  // plan called for multi-background scene transitions — that's a
  // bigger change (parallel nametable emission + runtime PPU swap)
  // so this chunk ships the simpler variant: walking onto a DOOR
  // tile teleports the player to a configured spawn point in the
  // same background.  Still useful: secret passages, fall-off-map
  // respawns, "portals" to another part of the map.  The multi-bg
  // story slots cleanly on top once pupils ask for it.
  // --------------------------------------------------------------------
  modules['doors'] = {
    label: 'Doors',
    description: 'Paint a tile as Door on the Behaviour page.  When ' +
      'the player (or Player 2) walks onto it, they teleport to the ' +
      'spawn point below — and if you set a Target background, the ' +
      'room swaps to that background too.  Leave Target at -1 for a ' +
      'same-room teleport (secret passages, fall-off-map respawns).',
    detailedHelp: [
      'Doors are a tile-based event: whenever the player\'s centre ' +
      'tile matches a behaviour marked Door, the player is moved to ' +
      'the spawn point you configure here.',
      'If Target background is 0 or higher, the room itself swaps ' +
      'at the same moment — the BG nametable from that background ' +
      'gets blitted into the PPU while rendering is briefly off.  ' +
      'Classic room-to-room NES gameplay.',
      'If Target background is -1, the door is a same-room ' +
      'teleport — secret passages, fall-off-map respawns, puzzle ' +
      'shortcuts.',
      'All doors share the same (spawn, target) in this MVP.  ' +
      'Per-door config is a future UI upgrade.',
    ],
    defaultConfig: {
      spawnX: 24,
      spawnY: 120,
      targetBgIdx: -1,
    },
    schema: [
      {
        key: 'spawnX',
        label: 'Spawn X (0 = left, 240 = right)',
        type: 'int',
        min: 0, max: 240, step: 4,
        help: 'Where the player appears after going through a door.',
      },
      {
        key: 'spawnY',
        label: 'Spawn Y (16 = top, 200 = bottom)',
        type: 'int',
        min: 16, max: 200, step: 4,
        help: 'Y coordinate of the spawn point.',
      },
      {
        key: 'targetBgIdx',
        label: 'Target background (-1 = same room)',
        type: 'int',
        min: -1, max: 9,
        help: '-1 keeps the same background.  0, 1, 2… swap to that ' +
          'background index — paint that many backgrounds first.',
      },
    ],
    applyToTemplate(template, node, state) {
      const c = (node && node.config) || {};
      const spawnX = A.clampInt(c.spawnX, 0, 240, 24);
      const spawnY = A.clampInt(c.spawnY, 16, 200, 120);
      const bgs = (state && state.backgrounds) || [];
      const rawTarget = (c.targetBgIdx == null) ? -1 : (c.targetBgIdx | 0);
      // Valid if in range of backgrounds[]; otherwise same-room.
      const multiBg = rawTarget >= 0 && rawTarget < bgs.length;
      if (multiBg) {
        template = A.appendToSlot(template, 'declarations', [
          '#define BW_DOORS_MULTIBG_ENABLED 1',
          '#define BW_DOOR_TARGET_BG ' + rawTarget,
        ].join('\n'));
      }
      const swap = multiBg
        ? '                if (current_bg != BW_DOOR_TARGET_BG) load_background_n(BW_DOOR_TARGET_BG);'
        : null;
      const lines = [
        '        // [builder] doors — step on a BEHAVIOUR_DOOR tile → teleport' +
          (multiBg ? ' + room swap.' : '.'),
        '        {',
        '            unsigned char bw_door_pcentre = behaviour_at(',
        '                (unsigned int)((px + ((PLAYER_W << 3) >> 1)) >> 3),',
        '                (unsigned int)((py + ((PLAYER_H << 3) >> 1)) >> 3));',
        '            if (bw_door_pcentre == BEHAVIOUR_DOOR) {',
        swap,
        '                px = ' + spawnX + ';',
        '                py = ' + spawnY + ';',
        '                jumping = 0; jmp_up = 0;',
        '            }',
        '#if PLAYER2_ENABLED',
        '            {',
        '                unsigned char bw_door_p2centre = behaviour_at(',
        '                    (unsigned int)((px2 + ((PLAYER2_W << 3) >> 1)) >> 3),',
        '                    (unsigned int)((py2 + ((PLAYER2_H << 3) >> 1)) >> 3));',
        '                if (bw_door_p2centre == BEHAVIOUR_DOOR) {',
        swap,
        '                    px2 = ' + spawnX + ';',
        '                    py2 = ' + spawnY + ';',
        '                    jumping2 = 0; jmp_up2 = 0;',
        '                }',
        '            }',
        '#endif',
        '        }',
      ].filter(l => l !== null);
      return A.appendToSlot(template, 'per_frame', lines.join('\n'));
    },
  };

  // --------------------------------------------------------------------
  // Dialogue (Phase B+ Round 2).  When the player is near an NPC-
  // tagged sprite AND presses B, a text box appears at the bottom
  // of the screen.  A second B press closes it.  Text is rendered
  // using the pupil's BG tiles interpreted as ASCII — pupils paint
  // A..Z at tile indices 0x41..0x5A (classic ASCII convention) so
  // the string literals in the emitted code map directly to the
  // tiles they painted.
  // --------------------------------------------------------------------
  modules['dialogue'] = {
    label: 'Dialogue (NPC talk)',
    description: 'Press B near an NPC sprite to pop up a text box.  ' +
      'Press B again to close it.  You need to paint letter tiles ' +
      'on the Backgrounds page at the ASCII positions (A = tile 0x41, ' +
      'B = 0x42, … Z = 0x5A; 0 = 0x30, … 9 = 0x39; space = 0x20).',
    defaultConfig: {
      text: 'HELLO',
      text2: '',
      text3: '',
      proximity: 2,
      pauseOnOpen: true,
      autoClose: 0,
    },
    schema: [
      {
        key: 'text',
        label: 'Line 1 (up to 28 characters)',
        type: 'text',   // renderer handles plain text input
        help: 'Use UPPERCASE letters and spaces.  Keep it short — ' +
          'each line is one row of the screen.',
      },
      {
        key: 'text2',
        label: 'Line 2 (optional)',
        type: 'text',
        help: 'Leave blank for a single-line dialog.  Adds a second ' +
          'row directly below line 1 when filled in.',
      },
      {
        key: 'text3',
        label: 'Line 3 (optional)',
        type: 'text',
        help: 'Leave blank to skip.  Three lines is the max — any ' +
          'more would push the box off the bottom of the screen.',
      },
      {
        key: 'proximity',
        label: 'Talk distance (tiles)',
        type: 'int',
        min: 1, max: 6,
        help: 'How close the player must be (in tile units) before ' +
          'B opens the dialog.',
      },
      {
        key: 'pauseOnOpen',
        label: 'Pause the game while the dialogue is open',
        type: 'bool',
        help: 'When ticked, neither player can move / jump while the ' +
          'text box is showing — classic RPG feel.  Untick for a ' +
          'floating hint that lets the player keep moving around.',
      },
      {
        key: 'autoClose',
        label: 'Auto-close after (frames; 0 = never)',
        type: 'int',
        min: 0, max: 240,
        help: '0 = the text stays until the pupil presses B again.  ' +
          '60 = about 1 second.  240 = about 4 seconds.  B still ' +
          'closes the box early even when this is set.',
      },
    ],
    detailedHelp: [
      'Dialogue renders text one tile per character using your ' +
      'BG tile set.  The Builder converts your string to tile ' +
      'indices using ASCII values — A = 65 = 0x41, Z = 0x5A, ' +
      'space = 0x20, 0-9 at 0x30-0x39.',
      'To make dialog readable, paint letter-shaped art at these ' +
      'indices on the Backgrounds page tile set (one glyph per ' +
      'tile).  You do not have to paint every letter — characters ' +
      'whose tile is blank just show as empty.',
      'Pause while open is on by default: both players freeze in ' +
      'place until the box closes.  Untick it for floating hint ' +
      'text that lets the player keep walking.',
      'Auto-close works with any Pause setting.  Set it to 0 to ' +
      'wait for a B press; set it to any frame count up to 240 ' +
      '(~4 seconds) for a timed pop-up.  B still closes early even ' +
      'when auto-close is on — a generous default if pupils read ' +
      'faster than the timer.',
      'All NPC-tagged sprites share the same dialog text in this ' +
      'MVP; per-NPC text is a future upgrade.',
    ],
    applyToTemplate(template, node, state) {
      const c = (node && node.config) || {};
      // Phase 3.2: 1-3 lines of dialogue.  Pupils fill text/text2/text3;
      // empty lines drop out so a "HELLO" + "" + "" project emits a
      // single row (matching pre-3.2 behaviour byte-for-byte aside
      // from the new BW_DIALOG_ROW_COUNT macro + table indirection).
      const rawLines = [c.text, c.text2, c.text3]
        .map(s => (typeof s === 'string') ? s : '')
        .map(s => s.slice(0, 28));
      // Take the first row always (default 'HELLO') so an
      // accidentally-empty config still has SOMETHING to draw.  Drop
      // any TRAILING empty rows so the box height matches the actual
      // text (a pupil who clears line 2 but leaves line 3 still gets
      // 3 rows; that's their explicit choice).
      const firstRow = rawLines[0] || 'HELLO';
      let trimmed = [firstRow, rawLines[1] || '', rawLines[2] || ''];
      while (trimmed.length > 1 && trimmed[trimmed.length - 1] === '') {
        trimmed.pop();
      }
      const lines = trimmed;
      const rowCount = lines.length;
      const proximity = A.clampInt(c.proximity, 1, 6, 2);
      const autoClose = A.clampInt(c.autoClose, 0, 240, 0);
      const pauseOn = (c.pauseOnOpen === undefined) ? true : !!c.pauseOnOpen;
      const lineDecls = [];
      function strToBytes(s) {
        const bytes = [];
        for (let i = 0; i < s.length; i++) {
          bytes.push('0x' + (s.charCodeAt(i) & 0xFF)
            .toString(16).toUpperCase().padStart(2, '0'));
        }
        bytes.push('0x00');
        return bytes;
      }
      for (let li = 0; li < rowCount; li++) {
        lineDecls.push(
          'static const unsigned char bw_dialogue_text_' + li +
          '[] = { ' + strToBytes(lines[li]).join(', ') + ' };');
      }
      // Indexable table so the vblank loop can pick the right row by
      // index rather than chaining `if (r == 0) … else if (r == 1) …`.
      const tableEntries = [];
      for (let li = 0; li < rowCount; li++) {
        tableEntries.push('  bw_dialogue_text_' + li);
      }
      lineDecls.push(
        'static const unsigned char * const bw_dialogue_text_table[' +
        rowCount + '] = {\n' + tableEntries.join(',\n') + '\n};');

      // Phase 3.3: per-NPC dialogue text.  Walk state.builder.modules.
      // scene.config.instances and emit one bw_dialogue_npc_<i>[]
      // array per NPC instance whose `text` is non-empty.  The
      // bw_dialogue_per_npc[] lookup maps each scene-sprite slot to
      // either a per-NPC array (override) or NULL (use the module-
      // level lines from above).  Empty when no NPC has its own
      // text — the macro BW_DIALOG_PER_NPC is then 0 and the runtime
      // skips the lookup entirely.
      const sceneNode = state && state.builder && state.builder.modules
        && state.builder.modules.scene;
      const sceneInstances = (sceneNode && sceneNode.config &&
        Array.isArray(sceneNode.config.instances))
        ? sceneNode.config.instances : [];
      const npcOverrides = [];   // [{ idx, text }]
      for (let i = 0; i < sceneInstances.length; i++) {
        const inst = sceneInstances[i];
        if (!inst) continue;
        const sp = (state.sprites || [])[inst.spriteIdx];
        if (!sp || sp.role !== 'npc') continue;
        const t = (typeof inst.text === 'string') ? inst.text.trim() : '';
        if (!t) continue;
        npcOverrides.push({ idx: i, text: t.slice(0, 28) });
      }
      const havePerNpc = npcOverrides.length > 0 &&
        sceneInstances.length > 0;
      lineDecls.push('#define BW_DIALOG_PER_NPC ' + (havePerNpc ? 1 : 0));
      if (havePerNpc) {
        // One byte array per overriding NPC.
        for (const ov of npcOverrides) {
          lineDecls.push(
            'static const unsigned char bw_dialogue_npc_' + ov.idx +
            '[] = { ' + strToBytes(ov.text).join(', ') + ' };');
        }
        // Lookup table — one entry per scene-sprite slot.  Non-NPCs
        // and NPCs without an override get a 0 (NULL) entry; the
        // runtime falls back to the module-level lines.
        const lookup = [];
        for (let i = 0; i < sceneInstances.length; i++) {
          if (npcOverrides.some(ov => ov.idx === i)) {
            lookup.push('  bw_dialogue_npc_' + i);
          } else {
            lookup.push('  0');
          }
        }
        lineDecls.push(
          'static const unsigned char * const bw_dialogue_per_npc[' +
          sceneInstances.length + '] = {\n' + lookup.join(',\n') + '\n};');
      }
      template = A.appendToSlot(template, 'declarations', [
        '#define BW_DIALOGUE_ENABLED 1',
        '#define BW_DIALOG_ROW 25',
        '#define BW_DIALOG_COL 2',
        '#define BW_DIALOG_PROXIMITY ' + proximity,
        '#define BW_DIALOG_WIDTH 28',
        '#define BW_DIALOG_ROW_COUNT ' + rowCount,
        '#define BW_DIALOG_AUTOCLOSE ' + autoClose,
        '#define BW_DIALOG_PAUSE ' + (pauseOn ? 1 : 0),
      ].concat(lineDecls).join('\n'));
      // Per-frame: detect the B-edge + NPC proximity, set a
      // pending-command flag (1 = draw, 2 = clear).  The vblank_writes
      // slot later does the actual PPU poke — keeping draw_text() out
      // of per_frame is essential (double-waitvsync = frame stutter,
      // see the regression-guard in round2-dialogue.mjs).
      //
      // Round-2 follow-up additions, driven by the BW_DIALOG_AUTOCLOSE
      // / BW_DIALOG_PAUSE macros emitted above:
      //   * AUTOCLOSE > 0 → bw_dialog_timer counts down every frame
      //     the dialog is open and triggers a close when it hits 0.
      //   * PAUSE == 1   → on open we snapshot walk/climb speeds to
      //     bw_dialog_saved_*; every open frame we zero them + cancel
      //     any in-progress jump; on close we restore from the
      //     snapshot.  Works symmetrically for Player 2 when
      //     PLAYER2_ENABLED is on.
      const perFrame = [
        '        // [builder] dialogue — NPC interaction via B press.',
        '        // Detects the trigger here; the actual PPU text write',
        '        // happens in the vblank_writes slot below so we update',
        '        // the nametable inside the same vblank window as the',
        '        // OAM writes.  No double-waitvsync, no frame skip.',
        '        {',
        '            unsigned char b_edge = (pad & 0x40) && !(bw_dialog_prev_b & 0x40);',
        '            bw_dialog_prev_b = pad;',
        '            if (bw_dialog_open) {',
        '                /* Close conditions: manual B press OR the',
        '                 * auto-close timer just hit zero.  B wins',
        '                 * ties (closes the box immediately even if',
        '                 * the timer would have closed it next frame). */',
        '                unsigned char should_close = b_edge;',
        '#if BW_DIALOG_AUTOCLOSE > 0',
        '                if (bw_dialog_timer > 0) {',
        '                    bw_dialog_timer--;',
        '                    if (bw_dialog_timer == 0) should_close = 1;',
        '                }',
        '#endif',
        '                if (should_close) {',
        '                    bw_dialog_cmd = 2;   /* clear */',
        '                    bw_dialog_open = 0;',
        '#if BW_DIALOG_PAUSE',
        '                    /* Restore the speeds we snapshot on open. */',
        '                    walk_speed = bw_dialog_saved_walk;',
        '                    climb_speed = bw_dialog_saved_climb;',
        '#if PLAYER2_ENABLED',
        '                    walk_speed2 = bw_dialog_saved_walk2;',
        '#endif',
        '#endif',
        '                }',
        '#if BW_DIALOG_PAUSE',
        '                else {',
        '                    /* Still open → keep everyone frozen.  Zeroing',
        '                     * walk_speed stops horizontal motion next',
        '                     * frame; zeroing jumping/jmp_up kills any',
        '                     * in-progress ascent; prev_pad = 0xFF blocks',
        '                     * fresh edge-triggered jumps while the text',
        '                     * is showing. */',
        '                    walk_speed = 0;',
        '                    climb_speed = 0;',
        '                    jumping = 0;',
        '                    jmp_up = 0;',
        '                    prev_pad = 0xFF;',
        '#if PLAYER2_ENABLED',
        '                    walk_speed2 = 0;',
        '                    jumping2 = 0;',
        '                    jmp_up2 = 0;',
        '                    prev_pad2 = 0xFF;',
        '#endif',
        '                }',
        '#endif',
        '            } else if (b_edge) {',
        '                unsigned char px_tile = (px + ((PLAYER_W << 3) >> 1)) >> 3;',
        '                unsigned char py_tile = (py + ((PLAYER_H << 3) >> 1)) >> 3;',
        '                unsigned char j;',
        '                for (j = 0; j < NUM_STATIC_SPRITES; j++) {',
        '                    unsigned char dx, dy;',
        '                    unsigned char nx, ny;',
        '                    if (ss_role[j] != ROLE_NPC) continue;',
        '                    if (ss_y[j] >= 240) continue;',
        '                    nx = (ss_x[j] + ((ss_w[j] << 3) >> 1)) >> 3;',
        '                    ny = (ss_y[j] + ((ss_h[j] << 3) >> 1)) >> 3;',
        '                    dx = (px_tile > nx) ? (px_tile - nx) : (nx - px_tile);',
        '                    dy = (py_tile > ny) ? (py_tile - ny) : (ny - py_tile);',
        '                    if (dx + dy <= BW_DIALOG_PROXIMITY) {',
        '                        bw_dialog_cmd = 1;   /* draw */',
        '                        bw_dialog_open = 1;',
        '#if BW_DIALOG_PER_NPC',
        '                        bw_dialog_npc_idx = j;',
        '#endif',
        '#if BW_DIALOG_AUTOCLOSE > 0',
        '                        bw_dialog_timer = BW_DIALOG_AUTOCLOSE;',
        '#endif',
        '#if BW_DIALOG_PAUSE',
        '                        /* Snapshot the pre-pause speeds so the',
        '                         * close block can restore them exactly. */',
        '                        bw_dialog_saved_walk = walk_speed;',
        '                        bw_dialog_saved_climb = climb_speed;',
        '#if PLAYER2_ENABLED',
        '                        bw_dialog_saved_walk2 = walk_speed2;',
        '#endif',
        '#endif',
        '                        break;',
        '                    }',
        '                }',
        '            }',
        '        }',
      ].join('\n');
      template = A.appendToSlot(template, 'per_frame', perFrame);
      // Vblank writes: consume the pending command inside the main
      // vblank window.  Rendering is briefly paused (scroll is reset
      // by the template immediately after this slot) so VRAM writes
      // are safe.  Using PPU_DATA directly — no waitvsync needed
      // since we're already in vblank.
      const vblank = [
        '        // [builder] dialogue — PPU writes (in vblank).',
        '        //',
        '        // Restoring the row on close used to be trickier than',
        '        // this: earlier versions wrote tile 0x20 (space) which',
        '        // baked a visible stripe into the background, and the',
        '        // attempted fix tried to read the existing nametable out',
        '        // of VRAM via PPU_DATA — which broke in practice because',
        '        // of the buffered-read semantics (first read returns',
        '        // stale data; subsequent reads are one address behind)',
        '        // interacting badly with cc65 optimisations around the',
        '        // required dummy read.',
        '        //',
        '        // Current approach: read back from bg_nametable_0[], the',
        '        // ROM-resident 1024-byte copy of the Backgrounds-page',
        '        // nametable that scene.inc already ships in every Builder',
        '        // build.  No PPU reads, no saved buffer in RAM, no vblank',
        '        // cycle budget pressure, no cc65 quirks.  In a multi-bg',
        '        // game the restore pulls tiles from bg 0 rather than the',
        '        // current room — an acceptable caveat given pupils rarely',
        '        // keep dialogue open while walking through a door (and',
        '        // pauseOnOpen makes it impossible by default).',
        '        if (bw_dialog_cmd != 0) {',
        '            /* Phase 3.2 + 3.3 — multi-line + per-NPC.',
        '             *',
        '             * BW_DIALOG_ROW_COUNT (1-3) is the module-level',
        '             * row count; the for-loop iterates that many',
        '             * rows, draws or restores each.  When per-NPC is',
        '             * active and the triggering NPC has an override,',
        '             * the dialog collapses to a single-row draw using',
        '             * that NPC\'s text — close still restores',
        '             * BW_DIALOG_ROW_COUNT rows so the screen returns',
        '             * to its pre-open state cleanly even if the open',
        '             * was single-row.  Worst case 3 × 28 = 84 PPU',
        '             * writes (~840 cycles), well under vblank budget.',
        '             */',
        '            unsigned char dlg_r;',
        '            unsigned char dlg_j;',
        '            unsigned char dlg_draw_rows = BW_DIALOG_ROW_COUNT;',
        '#if BW_DIALOG_PER_NPC',
        '            const unsigned char *npc_text =',
        '                bw_dialogue_per_npc[bw_dialog_npc_idx];',
        '            if (bw_dialog_cmd == 1 && npc_text != 0) dlg_draw_rows = 1;',
        '#endif',
        '            unsigned char dlg_total =',
        '                (bw_dialog_cmd == 1) ? dlg_draw_rows : BW_DIALOG_ROW_COUNT;',
        '            for (dlg_r = 0; dlg_r < dlg_total; dlg_r++) {',
        '                unsigned int dlg_addr = 0x2000',
        '                    + ((unsigned int)(BW_DIALOG_ROW + dlg_r) * 32)',
        '                    + BW_DIALOG_COL;',
        '                unsigned int dlg_src  =',
        '                    (unsigned int)(BW_DIALOG_ROW + dlg_r) * 32',
        '                    + BW_DIALOG_COL;',
        '                PPU_ADDR = (unsigned char)(dlg_addr >> 8);',
        '                PPU_ADDR = (unsigned char)(dlg_addr & 0xFF);',
        '                if (bw_dialog_cmd == 1) {',
        '                    /* Draw row dlg_r — pick the override line',
        '                     * when this NPC has its own text, else',
        '                     * fall through to the module-level table. */',
        '                    const unsigned char *line;',
        '#if BW_DIALOG_PER_NPC',
        '                    line = (npc_text != 0) ? npc_text',
        '                                           : bw_dialogue_text_table[dlg_r];',
        '#else',
        '                    line = bw_dialogue_text_table[dlg_r];',
        '#endif',
        '                    for (dlg_j = 0; dlg_j < BW_DIALOG_WIDTH; dlg_j++) {',
        '                        unsigned char ch = line[dlg_j];',
        '                        if (ch == 0) break;',
        '                        PPU_DATA = ch;',
        '                    }',
        '                } else {',
        '                    /* Clear row dlg_r — restore every cell from',
        '                     * bg_nametable_0 so the scenery underneath',
        '                     * comes back exactly. */',
        '                    for (dlg_j = 0; dlg_j < BW_DIALOG_WIDTH; dlg_j++) {',
        '                        PPU_DATA = bg_nametable_0[dlg_src + dlg_j];',
        '                    }',
        '                }',
        '            }',
        '            bw_dialog_cmd = 0;',
        '        }',
      ].join('\n');
      return A.appendToSlot(template, 'vblank_writes', vblank);
    },
  };

  modules['behaviour_walls'] = {
    label: 'Walls from the Behaviour map',
    description: 'Tiles you paint Solid ground / Wall / Platform / ' +
      'Ladder on the Behaviour page already block or support the ' +
      'player.  Keep this on and make sure you have painted at least ' +
      'one wall tile so the player does not fall through the floor.',
    defaultConfig: { enabled: true },
    schema: [],
    // No code injection — the behaviour is built into the template.
  };

  // --------------------------------------------------------------------
  // Win condition — detect the player stepping onto a TRIGGER tile
  // on the Behaviour page and freeze them in place.  A proper "You
  // win" screen lands in a later phase; for now the pupil sees the
  // player stop moving, which is a simple and reliable cue that the
  // game has ended.
  // --------------------------------------------------------------------
  modules['win_condition'] = {
    label: 'Win condition',
    description: 'Pick how the player wins.  Two options today: reach ' +
      'a tile of a particular kind, or collect every Pickup sprite on ' +
      'the level.  Either way the player freezes and the screen tints ' +
      'red when the win triggers.',
    defaultConfig: { type: 'reach_tile', behaviourType: 'trigger' },
    schema: [
      {
        key: 'type',
        label: 'How does the player win?',
        type: 'enum',
        options: [
          { value: 'reach_tile',
            label: '🏁 Reach a particular tile' },
          { value: 'all_pickups_collected',
            label: '💰 Collect every Pickup sprite' },
        ],
        help: 'Reach-a-tile is the classic flag at the end of the ' +
          'level.  Collect-every-pickup is the Mario-coin / Pac-man ' +
          'dot feel — needs the Pickups module ticked and at least ' +
          'one Pickup-tagged sprite placed.',
      },
      {
        key: 'behaviourType',
        label: 'Which tile wins? (only used when "Reach a tile" is on)',
        type: 'enum',
        options: [
          { value: 'trigger',      label: '📌 Trigger (recommended)' },
          { value: 'door',         label: '🚪 Door' },
          { value: 'solid_ground', label: '⬛ Solid ground' },
          { value: 'wall',         label: '🧱 Wall' },
          { value: 'platform',     label: '▬ Platform' },
          { value: 'ladder',       label: '🪜 Ladder' },
        ],
        help: 'Most pupils use Trigger — it stands out and nothing ' +
          'else uses it.  Ignored when you pick Collect-every-pickup.',
      },
    ],
    applyToTemplate(template, node, state) {
      const c = (node && node.config) || {};
      const type = c.type || 'reach_tile';
      const typeToken = (c.behaviourType || 'trigger').toUpperCase();
      // Declarations slot — a single flag, named so it can't clash
      // with pupil code if they later eject to the Code page.
      template = A.appendToSlot(template, 'declarations',
        'unsigned char bw_won = 0;     // [builder] win_condition');

      let detectBlock;
      if (type === 'all_pickups_collected') {
        detectBlock = [
          '        // [builder] win_condition — win when every pickup ' +
            'has been collected.',
          '        // Requires the Pickups module (provides ' +
            'bw_pickup_total + bw_pickup_count).',
          '        if (!bw_won && bw_pickup_total > 0 && ' +
            'bw_pickup_count >= bw_pickup_total) {',
          '            bw_won = 1;',
          '            walk_speed = 0;',
          '            climb_speed = 0;',
          '        }',
        ].join('\n');
      } else {
        detectBlock = [
          '        // [builder] win_condition — freeze the players on a ' +
            typeToken + ' tile and tint the screen as a "you win" cue.',
          '        // Either player stepping onto a ' + typeToken +
            ' tile ends the game.',
          '        if (!bw_won) {',
          '            unsigned char bw_tl = behaviour_at(',
          '                (unsigned int)((px + ((PLAYER_W << 3) >> 1)) >> 3),',
          '                (unsigned int)((py + ((PLAYER_H << 3) >> 1)) >> 3));',
          '            if (bw_tl == BEHAVIOUR_' + typeToken + ') {',
          '                bw_won = 1;',
          '                walk_speed = 0;',
          '                climb_speed = 0;',
          '            }',
          '#if PLAYER2_ENABLED',
          '            if (!bw_won) {',
          '                unsigned char bw_tl2 = behaviour_at(',
          '                    (unsigned int)((px2 + ((PLAYER2_W << 3) >> 1)) >> 3),',
          '                    (unsigned int)((py2 + ((PLAYER2_H << 3) >> 1)) >> 3));',
          '                if (bw_tl2 == BEHAVIOUR_' + typeToken + ') {',
          '                    bw_won = 1;',
          '                    walk_speed = 0;',
          '                    walk_speed2 = 0;',
          '                    climb_speed = 0;',
          '                }',
          '            }',
          '#endif',
          '        }',
        ].join('\n');
      }
      const freezeBlock = [
        '        if (bw_won) {',
        '            // Cancel any in-progress jump and block new ones —',
        '            // walk_speed=0 alone does not stop the jump edge',
        '            // detector from firing on a fresh UP press.',
        '            jumping = 0;',
        '            jmp_up = 0;',
        '            prev_pad = 0xFF;',
        '#if PLAYER2_ENABLED',
        '            walk_speed2 = 0;',
        '            jumping2 = 0;',
        '            jmp_up2 = 0;',
        '            prev_pad2 = 0xFF;',
        '#endif',
        '            // Greyscale + red emphasis via PPU_MASK: the scene',
        '            // desaturates and tints pale red so the pupil can',
        '            // see the game has ended.  Needs no extra art; works',
        '            // on every NES project regardless of palette.',
        '            PPU_MASK = 0x1F | 0x20;',
        '        }',
      ].join('\n');
      return A.appendToSlot(template, 'per_frame',
        detectBlock + '\n' + freezeBlock);
    },
  };

  window.BuilderModules = modules;

  // Return a fresh copy of the default builder-state tree.  Used by
  // migrateBuilderState and the "Reset module defaults" action.
  window.BuilderDefaults = function () {
    return {
      version: 1,
      modules: {
        game: {
          enabled: true,
          config: { type: 'platformer' },
        },
        players: {
          enabled: true,
          config: { count: 1 },
          submodules: {
            player1: {
              enabled: true,
              config: Object.assign({}, modules['players.player1'].defaultConfig),
            },
            player2: {
              enabled: false,
              config: Object.assign({}, modules['players.player2'].defaultConfig),
            },
          },
        },
        scene: {
          enabled: true,
          config: { instances: [] },
        },
        pickups: {
          enabled: false,
          config: {},
        },
        damage: {
          enabled: false,
          config: Object.assign({}, modules['damage'].defaultConfig),
        },
        hud: {
          enabled: false,
          config: {},
        },
        doors: {
          enabled: false,
          config: Object.assign({}, modules['doors'].defaultConfig),
        },
        dialogue: {
          enabled: false,
          config: Object.assign({}, modules['dialogue'].defaultConfig),
        },
        behaviour_walls: {
          enabled: true,
          config: { enabled: true },
        },
        win_condition: {
          enabled: true,
          config: Object.assign({}, modules['win_condition'].defaultConfig),
        },
      },
    };
  };
})();
