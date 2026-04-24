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
    description: 'What kind of game is this?  Pick a platformer for ' +
      'side-on jump-and-run, or top-down for a Pokémon / Zelda feel.',
    defaultConfig: { type: 'platformer' },
    schema: [
      {
        key: 'type',
        label: 'Type',
        type: 'enum',
        options: [
          { value: 'platformer', label: '🏃 Platformer (side-on, gravity + jump)' },
          { value: 'topdown',    label: '🧭 Top-down (four-way, no gravity)',
            disabled: true, disabledReason: 'Coming in Phase B' },
        ],
      },
    ],
    // No template mutation — selecting the game type happens up-stream,
    // by the Builder page choosing which template file to feed the
    // assembler in the first place.
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
        label: 'Max HP (0 = no HP system yet)',
        type: 'int',
        min: 0,
        max: 0,
        help: 'HP / damage arrives in Phase B.',
        readOnly: true,
      },
    ],
    applyToTemplate(template, node, state) {
      const c = (node && node.config) || {};
      const walkSpeed  = A.clampInt(c.walkSpeed, 1, 8, 1);
      const jumpHeight = A.clampInt(c.jumpHeight, 1, 60, 20);
      const startX     = A.clampInt(c.startX, 0, 240, 60);
      const startY     = A.clampInt(c.startY, 16, 200, 120);
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
        label: 'Max HP (0 = no HP system yet)',
        type: 'int',
        min: 0, max: 0,
        help: 'HP / damage lands in a later chunk.',
        readOnly: true,
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

  // Helper — are there any manually-placed scene instances?  Used by
  // walker / chaser to decide whether to stay out of the way.
  function sceneHasInstances(state) {
    const s = state && state.builder && state.builder.modules &&
      state.builder.modules.scene;
    return !!(s && s.enabled !== false && s.config &&
      Array.isArray(s.config.instances) && s.config.instances.length > 0);
  }

  // --------------------------------------------------------------------
  // Enemies — container module.  Chunk 2 ships a single submodule
  // (walker), more land in Phase B (chaser, shooter, …).
  // --------------------------------------------------------------------
  modules['enemies'] = {
    label: 'Enemies (legacy)',
    // Hidden from the UI since chunk-4 scene-editor work — the Scene
    // module now lets pupils pick per-instance AI (Walker / Chaser /
    // Static) for each placed sprite, which is strictly more
    // expressive than the global Walker-or-Chaser switch this module
    // used to provide.  The module definition is kept in place so
    // existing saves with enemies.walker.enabled still emit code
    // when the Scene list is empty (auto-place case).  Hide once,
    // stop confusing new pupils; legacy projects keep working.
    hidden: true,
    description: 'Legacy auto-AI for every Enemy sprite.  The Scene ' +
      'module has taken over for per-instance control.',
    defaultConfig: {},
    schema: [],
  };

  modules['enemies.walker'] = {
    parent: 'enemies',
    label: 'Walkers',
    description: 'Every Enemy-tagged sprite walks side to side, ' +
      'bouncing off the edges of the screen.  Uses the same pattern ' +
      'as the ready-made “enemy-walker” snippet on the Code page.',
    defaultConfig: {
      speed: 1,
      damagesPlayer: false,   // Phase B wires HP — the flag is stored
                              // now so the module's config shape stays
                              // stable across phases.
    },
    schema: [
      {
        key: 'speed',
        label: 'Walk speed (px/frame)',
        type: 'int',
        min: 1,
        max: 4,
        help: '1 = slow, 4 = very fast.',
      },
      {
        key: 'damagesPlayer',
        label: 'Hurts the player on touch (Phase B)',
        type: 'bool',
        readOnly: true,
        help: 'Checked off for now — HP and damage ship in Phase B.',
      },
    ],
    applyToTemplate(template, node, state) {
      // If the Scene module has manually-placed instances, the
      // per-instance AI emitted there takes over entirely — this
      // role-wide loop would fight it for ss_x control.
      if (sceneHasInstances(state)) return template;
      const c = (node && node.config) || {};
      const speed = A.clampInt(c.speed, 1, 8, 1);
      // Emit a block that reuses the existing enemy-walker snippet
      // pattern: one static direction array per enemy slot, then step
      // each enemy by `speed` pixels per frame and flip when they hit
      // the screen edge.  Matches snippets/enemy-walker.c almost
      // verbatim so the generated code reads familiar to anyone who
      // peeks at the preview.
      const body = [
        '        // [builder] enemies.walker — paces every ROLE_ENEMY sprite left/right.',
        '        {',
        '            static signed char bw_enemy_dir[16] = {',
        '                1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1',
        '            };',
        '            unsigned char bw_ew;',
        '            for (i = 0; i < NUM_STATIC_SPRITES && i < 16; i++) {',
        '                if (ss_role[i] != ROLE_ENEMY) continue;',
        '                bw_ew = ss_w[i] << 3;',
        '                if (bw_enemy_dir[i] > 0) {',
        '                    if (ss_x[i] + bw_ew + ' + speed + ' < 255) ss_x[i] += ' + speed + ';',
        '                    else bw_enemy_dir[i] = -1;',
        '                } else {',
        '                    if (ss_x[i] > ' + speed + ') ss_x[i] -= ' + speed + ';',
        '                    else bw_enemy_dir[i] = 1;',
        '                }',
        '            }',
        '        }',
      ].join('\n');
      return A.appendToSlot(template, 'per_frame', body);
    },
  };

  modules['enemies.chaser'] = {
    parent: 'enemies',
    label: 'Chasers',
    description: 'Every Enemy-tagged sprite steps one pixel per frame ' +
      'towards the player.  Slow-but-scary — the player has to keep ' +
      'moving to stay ahead.  Mirrors the ready-made "enemy-chaser" ' +
      'snippet on the Code page.  Tick this OR Walkers, not both.',
    defaultConfig: {
      speed: 1,
    },
    schema: [
      {
        key: 'speed',
        label: 'Chase speed (px/frame)',
        type: 'int',
        min: 1,
        max: 3,
        help: '1 = sluggish chase, 3 = quick.  Over 3 tends to overshoot.',
      },
    ],
    applyToTemplate(template, node, state) {
      // Same reasoning as walker: if Scene has instances, the
      // per-instance AI owns every enemy's ss_x/ss_y.
      if (sceneHasInstances(state)) return template;
      const c = (node && node.config) || {};
      const speed = A.clampInt(c.speed, 1, 4, 1);
      const body = [
        '        // [builder] enemies.chaser — nudges every ROLE_ENEMY ' +
          'sprite toward the player.',
        '        for (i = 0; i < NUM_STATIC_SPRITES; i++) {',
        '            if (ss_role[i] != ROLE_ENEMY) continue;',
        '            if (ss_x[i] + ' + speed + ' <= px) ss_x[i] += ' + speed + ';',
        '            else if (ss_x[i] >= px + ' + speed + ') ss_x[i] -= ' + speed + ';',
        '            if (ss_y[i] + ' + speed + ' <= py) ss_y[i] += ' + speed + ';',
        '            else if (ss_y[i] >= py + ' + speed + ') ss_y[i] -= ' + speed + ';',
        '        }',
      ].join('\n');
      return A.appendToSlot(template, 'per_frame', body);
    },
  };

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
        enemies: {
          enabled: true,
          config: {},
          submodules: {
            walker: {
              enabled: true,
              config: Object.assign({}, modules['enemies.walker'].defaultConfig),
            },
            chaser: {
              enabled: false,
              config: Object.assign({}, modules['enemies.chaser'].defaultConfig),
            },
          },
        },
        pickups: {
          enabled: false,
          config: {},
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
