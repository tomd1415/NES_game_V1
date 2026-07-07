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
    defaultConfig: { type: 'platformer', autoscrollSpeed: 2, racerTopSpeed: 3, racerLaps: 3, racerCheckpoints: 1 },
    schema: [
      {
        key: 'type',
        label: 'Type',
        type: 'enum',
        options: [
          { value: 'platformer', label: '🏃 Platformer (side-on, gravity + jump)' },
          { value: 'smb',        label: '🍄 SMB platformer (run physics + variable jump)' },
          { value: 'topdown',    label: '🧭 Top-down (four-way, no gravity)' },
          { value: 'runner',     label: '🏃‍➡️ Auto-runner (auto-scroll, tap to jump)' },
          { value: 'racer',      label: '🏎 Racer (steer + accelerate, top-down)' },
        ],
      },
      {
        key: 'autoscrollSpeed',
        label: 'Auto-runner scroll speed (1–4)',
        type: 'int',
        min: 1, max: 4,
        help: 'Auto-runner only: how fast the world scrolls past, in pixels per ' +
          'frame.  1 = gentle, 4 = frantic.  Ignored for platformer / top-down.',
      },
      {
        key: 'racerTopSpeed',
        label: 'Racer top speed (1–4)',
        type: 'int',
        min: 1, max: 4,
        help: 'Racer only: how fast the car can go.  1 = gentle, 4 = fast.  ' +
          'Steer with Left/Right, hold A (or Up) to accelerate; the car coasts ' +
          'to a stop.  Ignored for the other game types.',
      },
      {
        key: 'racerLaps',
        label: 'Racer laps to win (1–9)',
        type: 'int',
        min: 1, max: 9,
        help: 'Racer only: how many laps wins the race.  A lap = cross the finish ' +
          'line, drive through a checkpoint, then cross the finish again.  Paint ' +
          'the finish line and a checkpoint on the Behaviour page; with none ' +
          'painted the racer is just free-drive.  Ignored for the other game types.',
      },
      {
        key: 'racerCheckpoints',
        label: 'Racer checkpoints per lap (1–2)',
        type: 'int',
        min: 1, max: 2,
        help: 'Racer only: how many checkpoints the car must pass IN ORDER each ' +
          'lap before the finish counts.  1 = paint the trigger tile as the ' +
          'checkpoint.  2 = also paint the ladder tile as checkpoint 2 (passed ' +
          'after checkpoint 1) — stops corner-cutting on bigger tracks.',
      },
    ],
    // Phase 3.1 / Arc E §2: both styles share one template (`platformer.c`).
    // We emit a `BW_GAME_STYLE` macro the template's preprocessor uses to pick
    // the player physics — gravity+jump+ladder (0, platformer, default), 4-way
    // no-gravity (1, top-down), or auto-runner (2: forced scroll + shared jump).
    // Default value of 0 matches Step_Playground's stock main.c so the
    // byte-identical-baseline test holds when no Builder modules are ticked.
    applyToTemplate(template, node /*, state */) {
      const c = (node && node.config) || {};
      if (c.type === 'topdown') {
        return A.appendToSlot(template, 'declarations', [
          '/* Builder game module — top-down style. */',
          '#define BW_GAME_STYLE 1',
        ].join('\n'));
      }
      if (c.type === 'runner') {
        const spd = A.clampInt(c.autoscrollSpeed, 1, 4, 2);
        return A.appendToSlot(template, 'declarations', [
          '/* Builder game module — auto-runner style. */',
          '#define BW_GAME_STYLE 2',
          '#define AUTOSCROLL_SPEED ' + spd,
        ].join('\n'));
      }
      if (c.type === 'racer') {
        // Map the 1–4 feel knob to an 8.8 max-speed (1.5–3.0 px/frame).
        // Accel/friction keep the engine #ifndef defaults for now.
        const tier = A.clampInt(c.racerTopSpeed, 1, 4, 3);
        const maxSpeed = 256 + tier * 128;   // 1:384  2:512  3:640  4:768
        const laps = A.clampInt(c.racerLaps, 1, 9, 3);
        const cps = A.clampInt(c.racerCheckpoints, 1, 2, 1);
        return A.appendToSlot(template, 'declarations', [
          '/* Builder game module — top-down racer style (Arc E §3). */',
          '#define BW_GAME_STYLE 3',
          '#define RACER_MAX_SPEED ' + maxSpeed,
          '#define RACER_LAPS_TO_WIN ' + laps,
          '#define RACER_CP_COUNT ' + cps,
        ].join('\n'));
      }
      // SMB style (engine v3+): the proven platformer engine (BW_GAME_STYLE 0)
      // plus BW_SMB_JUMP — the signature SMB variable-height jump (A jumps,
      // tap = short hop / hold = full jump, run take-off jumps higher). Gated
      // on the target engine so pre-v3 pages never emit it (byte-identical).
      const targetEngineGame = (typeof window !== 'undefined' && window.NES_TARGET_ENGINE) || 1;
      if (c.type === 'smb' && targetEngineGame >= 3) {
        // Speed preset (1 slow … 5 fast) → SMB horizontal max walk/run + accel
        // in 8.8 fixed-point (256 = 1 px/frame).  Acceleration is deliberately
        // snappier than SMB's authentic 0x18 (players found that too gradual).
        const SPEED = {
          1: [256, 448, 40],    // ~1.0 / 1.75 px/f
          2: [384, 640, 48],    // 1.5 / 2.5 px/f
          3: [512, 832, 56],    // 2.0 / 3.25 px/f
          4: [640, 1024, 64],   // 2.5 / 4.0 px/f
          5: [768, 1280, 80],   // 3.0 / 5.0 px/f
        };
        const sp = SPEED[A.clampInt(c.smbSpeed, 1, 5, 2)] || SPEED[2];
        return A.appendToSlot(template, 'declarations', [
          '/* Builder game module — SMB style (engine v3): platformer + variable jump. */',
          '#define BW_SMB_JUMP 1',
          '#define BW_SMB_WALK_MAX ' + sp[0],
          '#define BW_SMB_RUN_MAX ' + sp[1],
          '#define BW_SMB_ACCEL ' + sp[2],
        ].join('\n'));
      }
      // Platformer (and any style below its engine version): emit nothing
      // (BW_GAME_STYLE defaults to 0 in the template's `#ifndef`).  Keeps the
      // no-modules-ticked path byte-for-byte identical to today.
      return template;
    },
  };

  // --------------------------------------------------------------------
  // Globals (T1.6 — pupil-requested item 22 in
  // docs/feedback/recently-observed-bugs.md).  Game-wide variables that
  // override default physics constants the platformer template hard-codes.
  // Currently only `gravityPx` (scene-sprite fall rate); future iterations
  // (T2.5) will add per-sprite tuning that falls back to these defaults.
  // --------------------------------------------------------------------
  modules['globals'] = {
    label: 'Globals',
    description: 'Variables that affect the whole game — how fast things ' +
      'fall (gravity) and how fast the player launches off the ground ' +
      '(jump speed).  Tick this and slide the values to make the world ' +
      'feel heavier or floatier.  More globals (e.g. walk-speed defaults, ' +
      'screen-edge wrap) get added here over time.',
    defaultConfig: {
      // Defaults match the historic hardcoded constants, so a freshly
      // ticked module with default values produces the same play feel as
      // unticked.  Pupils only see a difference when they slide a value.
      gravityPx: 1,    // matches `ss_y[i]++` (scene-sprite fall, 1 px/frame)
      jumpSpeedPx: 2,  // matches `py -= 2` (player rise, 2 px/frame)
      bobWhenWalking: false,   // R-10: 1px walk bob (off = byte-identical)
    },
    schema: [
      {
        key: 'gravityPx',
        label: 'Gravity (pixels per frame)',
        type: 'int',
        min: 0,
        max: 4,
        step: 1,
        help: '0 = floating (no fall), 1 = default lazy drift, 2 = ' +
          'normal platformer feel, 3-4 = heavy/snappy.  Affects scene ' +
          'sprites (enemies, pickups) — the player\'s vertical motion is ' +
          'controlled by Jump speed (below) and Player 1\'s Jump height.',
      },
      {
        key: 'jumpSpeedPx',
        label: 'Jump speed (pixels per frame, while rising)',
        type: 'int',
        min: 1,
        max: 6,
        step: 1,
        help: 'How many pixels the player rises per frame while a jump ' +
          'is in progress.  Combined with Player 1\'s Jump height (the ' +
          'frame budget), this sets total jump height: jump speed × ' +
          'jump height = pixels lifted.  1 = floaty, 2 = default, 3-4 = ' +
          'snappy, 5-6 = launch.  Player\'s fall rate is currently fixed ' +
          'at 2 px/frame.',
      },
      {
        key: 'bobWhenWalking',
        label: 'Bob up and down when walking',
        type: 'bool',
        help: 'The player hops 1 pixel on alternate walk frames — a little ' +
          'life in the step.  Only while walking on the ground.',
      },
    ],
    // Emit `#define BW_GRAVITY_PX <n>` + `#define BW_JUMP_SPEED_PX <n>`
    // and overrides of BW_APPLY_GRAVITY / BW_APPLY_JUMP_RISE into the
    // declarations slot.  Both platformer.c and Step_Playground/main.c
    // carry default `#ifndef`-gated macros that activate only when
    // this module is *not* ticked, so unticking the module restores
    // the byte-identical baseline.
    applyToTemplate(template, node /*, state */) {
      const c = (node && node.config) || {};
      const g = (typeof c.gravityPx === 'number') ? c.gravityPx : 1;
      const j = (typeof c.jumpSpeedPx === 'number') ? c.jumpSpeedPx : 2;
      const clampedG = Math.max(0, Math.min(4, g | 0));
      const clampedJ = Math.max(1, Math.min(6, j | 0));
      template = A.appendToSlot(template, 'declarations', [
        '/* Builder Globals module — game-wide physics overrides. */',
        `#define BW_GRAVITY_PX ${clampedG}`,
        '#define BW_APPLY_GRAVITY(y) ((y) += BW_GRAVITY_PX)',
        `#define BW_JUMP_SPEED_PX ${clampedJ}`,
        '#define BW_APPLY_JUMP_RISE(y) (y) -= BW_JUMP_SPEED_PX',
      ].join('\n'));
      // R-10: opt-in 1px walk bob.  Absent when off → the template's
      // #ifndef default (0) keeps the no-module ROM byte-identical.
      if (c.bobWhenWalking) {
        template = A.appendToSlot(template, 'declarations',
          '#define BW_BOB_WHEN_WALKING 1   /* R-10 character bob */');
      }
      return template;
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
      attackButton: 'none',   // R-7: A/B plays the Attack animation
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
      {
        key: 'attackButton',
        label: 'Attack button (plays the Attack animation)',
        type: 'enum',
        options: [
          { value: 'none', label: 'None' },
          { value: 'a', label: 'A button' },
          { value: 'b', label: 'B button' },
        ],
        help: 'Bind A or B to a one-shot Attack animation (tag a sprite ' +
          'frame-set as Attack on the Sprites page).  The attack plays once ' +
          'over the walk/jump pose each press.  B is also used by Dialogue — ' +
          'pick A if your game has both.',
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
      // R-7: bind A/B to the one-shot Attack animation.  The engine also gates
      // on ATTACK_FRAME_COUNT > 0, so this is a no-op (button does nothing) if
      // the pupil hasn't tagged an Attack animation — graceful, not an error.
      if (c.attackButton === 'a' || c.attackButton === 'b') {
        template = A.appendToSlot(template, 'declarations',
          '#define BW_ATTACK_BUTTON ' + (c.attackButton === 'a' ? '0x80' : '0x40') +
          '   /* R-7 attack button (A=0x80, B=0x40) */');
      }
      return template;
    },
  };

  // --------------------------------------------------------------------
  // Player 2 — opt-in second character, driven by the second NES
  // controller.  Uses the second sprite tagged Player on the Sprites
  // page (findSpritesByRole[1]).  See docs/plans/archive/2026-04-23-builder-player2.md for the
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
      // Engine v4 gate: the SMB actor AIs (goomba/koopa) only emit when the
      // design targets engine v4+.  Older targets (and the pinned v1 pages)
      // fall the new kinds back to the plain `walker` so the codegen — and the
      // golden ROM — is byte-identical to what shipped before v4.
      const targetEngine = (typeof window !== 'undefined' && window.NES_TARGET_ENGINE) || 1;
      const parts = [
        '        // [builder] scene — per-instance AI for manually-placed sprites.',
      ];
      let emitted = 0;      // walker/chaser/goomba/koopa all need bw_sprite_blocked
      let needSmb = false;  // goomba/koopa need the shared SMB stomp/hurt helper
      // Phase 2b — uniform per-scene-sprite AI tables the ai_update ASM loop reads
      // (NES_ASM_AI). type 0 = handled by C (or none); 1 = walker. state/speed are
      // meaningful only for ASM-handled types. Index i tracks ss_x[i] exactly.
      const aiType = [], aiState = [], aiSpeed = [];
      let asmAiHandled = 0;   // how many instances the ai_update loop owns
      for (let i = 0; i < instances.length; i++) {
        aiType[i] = 0; aiState[i] = 0; aiSpeed[i] = 0;
        const inst = instances[i] || {};
        const sp = sprites[inst.spriteIdx];
        if (!sp) continue;
        let ai = inst.ai || 'static';
        // Pre-v4 targets don't have the actor engine — degrade the SMB
        // enemies to the plain walker so old designs stay byte-identical.
        if ((ai === 'goomba' || ai === 'koopa') && targetEngine < 4) ai = 'walker';
        // Engine v10 flight paths degrade to a plain walker on older targets so
        // a design authored with them still builds (byte-identical) pre-v10.
        if ((ai === 'flyer' || ai === 'patrol') && targetEngine < 10) ai = 'walker';
        // R-4: per-instance speed (px/frame).  1 = today's feel; clamp 1..4.
        // NB bw_sprite_blocked probes 1px ahead, so at speed >= 2 a fast enemy
        // can step its body slightly into a wall before reversing on the next
        // frame — acceptable for Tier 2 (visually it just turns a frame late).
        const speed = A.clampInt(inst.speed, 1, 4, 1);
        if (sp.role === 'enemy' && ai === 'walker') {
          emitted++;
          // Phase 2b — the ai_update ASM loop owns walkers (type 1, dir seed 1).
          aiType[i] = 1; aiState[i] = 1; aiSpeed[i] = speed; asmAiHandled++;
          // The C block below is byte-identical to before, but #ifndef'd out when
          // NES_ASM_AI is set (ai_update() moves this walker instead).
          parts.push('#ifndef NES_ASM_AI');
          parts.push(
            '        // instance ' + i + ' — ' + (sp.name || '?') +
              ' walks side to side, turning at walls and the screen edge');
          parts.push('        {');
          parts.push('            static signed char bw_dir_' + i + ' = 1;');
          parts.push('            if (bw_dir_' + i + ' > 0) {');
          parts.push('                if (bw_sprite_blocked(ss_x[' + i + '], ss_y[' + i + '], ss_w[' + i + '], ss_h[' + i + '], 0)) bw_dir_' + i + ' = -1;');
          parts.push('                else ss_x[' + i + '] += ' + speed + ';');
          parts.push('            } else {');
          parts.push('                if (bw_sprite_blocked(ss_x[' + i + '], ss_y[' + i + '], ss_w[' + i + '], ss_h[' + i + '], 1)) bw_dir_' + i + ' = 1;');
          parts.push('                else ss_x[' + i + '] -= ' + speed + ';');
          parts.push('            }');
          parts.push('        }');
          parts.push('#endif');
        } else if (sp.role === 'enemy' && ai === 'chaser') {
          emitted++;
          parts.push(
            '        // instance ' + i + ' — ' + (sp.name || '?') +
              ' chases the player, stopping at solid tiles');
          // Skip a defeated (parked at y=0xFF) chaser: it seeks the player on
          // BOTH axes, so without this guard a stomped one would crawl its Y
          // back down from 0xFF and reappear on screen.
          parts.push('        if (ss_y[' + i + '] < 0xEF) {');
          parts.push('        if (ss_x[' + i + '] + ' + speed + ' <= px) {');
          parts.push('            if (!bw_sprite_blocked(ss_x[' + i + '], ss_y[' + i + '], ss_w[' + i + '], ss_h[' + i + '], 0)) ss_x[' + i + '] += ' + speed + ';');
          parts.push('        } else if (ss_x[' + i + '] >= px + ' + speed + ') {');
          parts.push('            if (!bw_sprite_blocked(ss_x[' + i + '], ss_y[' + i + '], ss_w[' + i + '], ss_h[' + i + '], 1)) ss_x[' + i + '] -= ' + speed + ';');
          parts.push('        }');
          parts.push('        if (ss_y[' + i + '] + ' + speed + ' <= py) {');
          parts.push('            if (!bw_sprite_blocked(ss_x[' + i + '], ss_y[' + i + '], ss_w[' + i + '], ss_h[' + i + '], 2)) ss_y[' + i + '] += ' + speed + ';');
          parts.push('        } else if (ss_y[' + i + '] >= py + ' + speed + ') {');
          parts.push('            if (!bw_sprite_blocked(ss_x[' + i + '], ss_y[' + i + '], ss_w[' + i + '], ss_h[' + i + '], 3)) ss_y[' + i + '] -= ' + speed + ';');
          parts.push('        }');
          parts.push('        }');
        } else if (sp.role === 'enemy' && ai === 'flyer') {
          // Engine v10 — flyer: a flying enemy for open air / ceilings. It
          // hovers in a ±20px band around the height it was placed at and
          // drifts horizontally toward the player. The scene gravity loop
          // (which runs earlier in the frame) would otherwise pull it to the
          // floor, so we write ss_y ABSOLUTELY from its placed home each frame,
          // overriding gravity — but only while alive (a defeated actor is
          // parked at y=0xFF and must stay there, so guard on ss_y < 0xEF).
          emitted++;
          var flyHome = Math.max(20, Math.min(210, A.clampInt(inst.y, 0, 255, 0)));
          parts.push(
            '        // instance ' + i + ' — ' + (sp.name || '?') +
              ' flies: hovers around its start height and drifts toward the player');
          parts.push('        if (ss_y[' + i + '] < 0xEF) {');
          parts.push('            static signed char bw_fdir_' + i + ' = 1;');
          parts.push('            static signed char bw_foff_' + i + ' = 0;');
          parts.push('            if (bw_fdir_' + i + ' > 0) { bw_foff_' + i + ' += ' + speed + '; if (bw_foff_' + i + ' >= 20) bw_fdir_' + i + ' = -1; }');
          parts.push('            else { bw_foff_' + i + ' -= ' + speed + '; if (bw_foff_' + i + ' <= -20) bw_fdir_' + i + ' = 1; }');
          parts.push('            ss_y[' + i + '] = ' + flyHome + ' + bw_foff_' + i + ';');
          parts.push('            if (ss_x[' + i + '] + ' + speed + ' <= px) ss_x[' + i + '] += ' + speed + ';');
          parts.push('            else if (ss_x[' + i + '] >= px + ' + speed + ') ss_x[' + i + '] -= ' + speed + ';');
          parts.push('        }');
        } else if (sp.role === 'enemy' && ai === 'patrol') {
          // Engine v10 — patrol: walks back and forth a fixed distance and
          // turns on its own (no wall needed), so it works on an open platform
          // where a plain walker would march straight off the edge.
          emitted++;
          parts.push(
            '        // instance ' + i + ' — ' + (sp.name || '?') +
              ' patrols back and forth a set distance, turning on its own');
          parts.push('        {');
          parts.push('            static signed char bw_pdir_' + i + ' = 1;');
          parts.push('            static signed char bw_poff_' + i + ' = 0;');
          parts.push('            if (bw_pdir_' + i + ' > 0) { ss_x[' + i + '] += ' + speed + '; bw_poff_' + i + ' += ' + speed + '; if (bw_poff_' + i + ' >= 40) bw_pdir_' + i + ' = -1; }');
          parts.push('            else { ss_x[' + i + '] -= ' + speed + '; bw_poff_' + i + ' -= ' + speed + '; if (bw_poff_' + i + ' <= -40) bw_pdir_' + i + ' = 1; }');
          parts.push('        }');
        } else if (sp.role === 'enemy' && ai === 'goomba') {
          // Engine v4 — Goomba: walks (and off ledges, no ledge sensing),
          // reverses at walls, STOMP from above defeats + bounces the player,
          // any other touch hurts.  Self-contained (BW_SMB_HURT respects the
          // damage iframes so it composes with the Damage module without
          // double-hitting, in either apply order).
          emitted++; needSmb = true;
          const g = 'bw_gdir_' + i;
          parts.push(
            '        // instance ' + i + ' — ' + (sp.name || '?') +
              ' Goomba: walks + off ledges, stomp to defeat, side-touch hurts');
          parts.push('        {');
          parts.push('            static signed char ' + g + ' = 1;');
          parts.push('            if (ss_y[' + i + '] < 240 && BW_SMB_ONSCREEN(' + i + ')) {');
          parts.push('                if (' + g + ' > 0) {');
          parts.push('                    if (bw_smb_wall(' + i + ', 1)) ' + g + ' = -1;');
          parts.push('                    else ss_x[' + i + '] += ' + speed + ';');
          parts.push('                } else {');
          parts.push('                    if (bw_smb_wall(' + i + ', 0)) ' + g + ' = 1;');
          parts.push('                    else ss_x[' + i + '] -= ' + speed + ';');
          parts.push('                }');
          parts.push('                if (BW_SMB_TOUCH(' + i + ')) {');
          parts.push('                    if (BW_SMB_STOMP(' + i + ')) { ss_y[' + i + '] = 0xFF; BW_SMB_BOUNCE(); }');
          parts.push('                    else BW_SMB_HURT();');
          parts.push('                }');
          parts.push('            }');
          parts.push('        }');
        } else if (sp.role === 'enemy' && ai === 'koopa') {
          // Engine v4 — Koopa Troopa: walk → stomp turns it into a still shell
          // → touching the still shell KICKS it (slides at 3 px/f away from the
          // player); a sliding shell defeats other enemies it overtakes and
          // hurts the player on contact; stomping a sliding shell stops it.
          emitted++; needSmb = true;
          const st = 'bw_kst_' + i, kd = 'bw_kdir_' + i, kj = 'bw_kj_' + i;
          parts.push(
            '        // instance ' + i + ' — ' + (sp.name || '?') +
              ' Koopa: walk / shell / kicked-shell state machine');
          parts.push('        {');
          parts.push('            static unsigned char ' + st + ' = 0;   /* 0 walk, 1 shell, 2 kicked */');
          parts.push('            static signed char ' + kd + ' = 1;');
          parts.push('            unsigned char ' + kj + ';');
          parts.push('            if (ss_y[' + i + '] < 240 && BW_SMB_ONSCREEN(' + i + ')) {');
          parts.push('                if (' + st + ' == 0) {');
          parts.push('                    if (' + kd + ' > 0) {');
          parts.push('                        if (bw_smb_wall(' + i + ', 1)) ' + kd + ' = -1;');
          parts.push('                        else ss_x[' + i + '] += ' + speed + ';');
          parts.push('                    } else {');
          parts.push('                        if (bw_smb_wall(' + i + ', 0)) ' + kd + ' = 1;');
          parts.push('                        else ss_x[' + i + '] -= ' + speed + ';');
          parts.push('                    }');
          parts.push('                } else if (' + st + ' == 2) {');
          parts.push('                    if (' + kd + ' > 0) {');
          parts.push('                        if (bw_smb_wall(' + i + ', 1)) ' + kd + ' = -1;');
          parts.push('                        else ss_x[' + i + '] += 3;');
          parts.push('                    } else {');
          parts.push('                        if (bw_smb_wall(' + i + ', 0)) ' + kd + ' = 1;');
          parts.push('                        else ss_x[' + i + '] -= 3;');
          parts.push('                    }');
          parts.push('                    for (' + kj + ' = 0; ' + kj + ' < NUM_STATIC_SPRITES; ' + kj + '++) {');
          parts.push('                        if (' + kj + ' == ' + i + ') continue;');
          parts.push('                        if (ss_role[' + kj + '] != ROLE_ENEMY) continue;');
          parts.push('                        if (ss_y[' + kj + '] >= 240) continue;');
          parts.push('                        if (!(ss_x[' + i + '] + (ss_w[' + i + '] << 3) <= ss_x[' + kj + '] || ss_x[' + i + '] >= ss_x[' + kj + '] + (ss_w[' + kj + '] << 3) ||');
          parts.push('                              ss_y[' + i + '] + (ss_h[' + i + '] << 3) <= ss_y[' + kj + '] || ss_y[' + i + '] >= ss_y[' + kj + '] + (ss_h[' + kj + '] << 3)))');
          parts.push('                            ss_y[' + kj + '] = 0xFF;');
          parts.push('                    }');
          parts.push('                }');
          parts.push('                if (BW_SMB_TOUCH(' + i + ')) {');
          parts.push('                    if (BW_SMB_STOMP(' + i + ')) {');
          parts.push('                        ' + st + ' = 1; BW_SMB_BOUNCE();   /* walk/kicked -> still shell */');
          parts.push('                    } else if (' + st + ' == 1) {');
          parts.push('                        ' + kd + ' = (px < ss_x[' + i + ']) ? 1 : -1;   /* kick away from player */');
          parts.push('                        ' + st + ' = 2; BW_SMB_GUARD();');
          parts.push('                    } else {');
          parts.push('                        BW_SMB_HURT();   /* walking koopa or sliding shell hurts */');
          parts.push('                    }');
          parts.push('                }');
          parts.push('            }');
          parts.push('        }');
        } else if (ai === 'item' && targetEngine >= 5) {
          // Engine v5 — power-up item.  Touching it applies its effect and the
          // sprite vanishes.  Wrapped in #ifdef BW_SMB_POWERUPS so it is a
          // no-op (the item just sits there) unless the Power-ups module is on,
          // which is what declares smb_pstate / smb_star.
          emitted++; needSmb = true;
          const power = inst.power || 'mushroom';
          parts.push('#ifdef BW_SMB_POWERUPS');
          parts.push('        // instance ' + i + ' — ' + (sp.name || '?') +
            ' power-up item (' + power + ')');
          parts.push('        if (ss_y[' + i + '] < 240 && BW_SMB_TOUCH(' + i + ')) {');
          if (power === 'fireflower') {
            parts.push('            smb_pstate = 2;             /* Fire Flower → fire */');
          } else if (power === 'star') {
            parts.push('            smb_star = BW_STAR_FRAMES;  /* Starman → invincible */');
          } else if (power === 'oneup') {
            parts.push('#if PLAYER_HP_ENABLED');
            parts.push('            player_hp = PLAYER_MAX_HP;  /* 1-Up → full heal (lives arrive with the HUD) */');
            parts.push('#endif');
          } else {
            parts.push('            if (smb_pstate < 1) smb_pstate = 1;  /* Super Mushroom → super */');
          }
          parts.push('            ss_y[' + i + '] = 0xFF;');
          parts.push('        }');
          parts.push('#endif');
        }
        // `static` and non-enemy roles: nothing to emit.  Pickups and
        // decorations just sit where they were placed.
      }
      if (emitted === 0) return template;  // only static instances
      // Shared collision probe for walker/chaser AI.  Emitted once into
      // file scope (only when at least one enemy moves) so both AI kinds
      // turn at SOLID_GROUND / WALL tiles instead of walking through them
      // — fixes "enemies go through stuff" / "don't bounce off block".
      const blockedHelper = [
        '/* [builder] scene — is this scene sprite blocked from stepping 1px',
        ' * in `dir` (0=right 1=left 2=down 3=up) by a SOLID_GROUND / WALL',
        ' * tile or the screen edge?  Probes the whole leading edge across',
        ' * the sprite body so a multi-tile enemy turns at a wall like the',
        ' * player does, mirroring the player walk-collision test. */',
        '#ifdef NES_ASM_AI',
        '/* Phase 2b: hand-written 6502 twin in ai_asm.s (same 5-arg fastcall',
        ' * contract, loops the shipped behaviour_at). extern so callers bind it. */',
        'unsigned char bw_sprite_blocked(unsigned char sx, unsigned char sy,',
        '                                unsigned char sw, unsigned char sh,',
        '                                unsigned char dir);',
        '#else',
        'static unsigned char bw_sprite_blocked(unsigned char sx, unsigned char sy,',
        '                                       unsigned char sw, unsigned char sh,',
        '                                       unsigned char dir) {',
        '    unsigned char wpx = sw << 3;',
        '    unsigned char hpx = sh << 3;',
        '    unsigned char col, row, lo, hi, k, bb;',
        '    if (dir == 0) {            /* moving right */',
        '        if ((unsigned int)sx + wpx >= 255) return 1;',
        '        col = (unsigned char)((sx + wpx) >> 3);',
        '        lo = sy >> 3; hi = (unsigned char)((sy + hpx - 1) >> 3);',
        '        for (k = lo; k <= hi; k++) {',
        '            bb = behaviour_at((unsigned int)col, (unsigned int)k);',
        '            if (bb == BEHAVIOUR_SOLID_GROUND || bb == BEHAVIOUR_WALL) return 1;',
        '        }',
        '    } else if (dir == 1) {     /* moving left */',
        '        if (sx == 0) return 1;',
        '        col = (unsigned char)((sx - 1) >> 3);',
        '        lo = sy >> 3; hi = (unsigned char)((sy + hpx - 1) >> 3);',
        '        for (k = lo; k <= hi; k++) {',
        '            bb = behaviour_at((unsigned int)col, (unsigned int)k);',
        '            if (bb == BEHAVIOUR_SOLID_GROUND || bb == BEHAVIOUR_WALL) return 1;',
        '        }',
        '    } else if (dir == 2) {     /* moving down */',
        '        if ((unsigned int)sy + hpx >= 240) return 1;',
        '        row = (unsigned char)((sy + hpx) >> 3);',
        '        lo = sx >> 3; hi = (unsigned char)((sx + wpx - 1) >> 3);',
        '        for (k = lo; k <= hi; k++) {',
        '            bb = behaviour_at((unsigned int)k, (unsigned int)row);',
        '            if (bb == BEHAVIOUR_SOLID_GROUND || bb == BEHAVIOUR_WALL) return 1;',
        '        }',
        '    } else {                   /* moving up */',
        '        if (sy == 0) return 1;',
        '        row = (unsigned char)((sy - 1) >> 3);',
        '        lo = sx >> 3; hi = (unsigned char)((sx + wpx - 1) >> 3);',
        '        for (k = lo; k <= hi; k++) {',
        '            bb = behaviour_at((unsigned int)k, (unsigned int)row);',
        '            if (bb == BEHAVIOUR_SOLID_GROUND || bb == BEHAVIOUR_WALL) return 1;',
        '        }',
        '    }',
        '    return 0;',
        '}',
        '#endif /* NES_ASM_AI */',
      ].join('\n');
      let withHelper = A.appendToSlot(template, 'declarations', blockedHelper);
      if (needSmb) {
        // [builder] SMB enemies (engine v4) — cheap wall probe.  The Goomba /
        // Koopa AIs turn at a wall using ONE behaviour_at at the leading edge's
        // vertical mid-line, instead of the full-body bw_sprite_blocked (a
        // 5-arg call that loops every body row).  cc65 code is ~5x slower than
        // asm, so on a wide, enemy-packed scrolling level the per-enemy AI is
        // the dominant per-frame cost; this + the on-screen dormancy gate keep
        // the frame inside the vblank budget so the game runs at full speed.
        const wallHelper = [
          '/* [builder] SMB enemies — is the tile just past sprite n\'s leading',
          ' * edge (right if `right`, else left), at its vertical mid-line, solid',
          ' * (or the world edge)?  One lookup — enough to turn an enemy. */',
          'static unsigned char bw_smb_wall(unsigned char n, unsigned char right) {',
          '    unsigned int col;',
          '    unsigned char b;',
          '    if (right) {',
          '        if ((unsigned int)ss_x[n] + (ss_w[n] << 3) >= WORLD_W_PX) return 1;',
          '        col = (unsigned int)((ss_x[n] + (ss_w[n] << 3)) >> 3);',
          '    } else {',
          '        if (ss_x[n] == 0) return 1;',
          '        col = (unsigned int)((ss_x[n] - 1) >> 3);',
          '    }',
          '    b = behaviour_at(col, (unsigned int)((ss_y[n] + (ss_h[n] << 2)) >> 3));',
          '    return (b == BEHAVIOUR_SOLID_GROUND || b == BEHAVIOUR_WALL);',
          '}',
        ].join('\n');
        withHelper = A.appendToSlot(withHelper, 'declarations', wallHelper);
        // [builder] SMB enemies (engine v4) — shared stomp/touch/hurt macros,
        // parameterised by the scene-sprite index so one definition serves
        // every goomba/koopa instance.  Emitted at the TOP of per_frame (not
        // declarations) so the `#if PLAYER_HP_ENABLED` guard is resolved AFTER
        // the template's own PLAYER_HP_ENABLED block regardless of module apply
        // order.  BW_SMB_HURT/GUARD respect the damage module's iframes
        // (falling back to sane constants when Damage is off) so a stomp never
        // also registers as a side-hit, in either apply order.  (Preprocessor
        // directives are file-scoped, so defining them inside the frame loop is
        // valid C and simply takes effect for the rest of the file.)
        const smbHelper = [
          '/* [builder] SMB enemies (engine v4) — stomp / touch / hurt helpers. */',
          '#ifndef DAMAGE_AMOUNT',
          '#define DAMAGE_AMOUNT 1',
          '#endif',
          '#ifndef INVINCIBILITY_FRAMES',
          '#define INVINCIBILITY_FRAMES 60',
          '#endif',
          '/* AABB: is the player overlapping scene sprite _n? */',
          '#define BW_SMB_TOUCH(_n) (!(px + (PLAYER_W << 3) <= ss_x[_n] || \\',
          '                            px >= ss_x[_n] + (ss_w[_n] << 3) || \\',
          '                            py + (PLAYER_H << 3) <= ss_y[_n] || \\',
          '                            py >= ss_y[_n] + (ss_h[_n] << 3)))',
          '/* Stomp: player descending (airborne, ascent spent) with its feet in',
          ' * the top half of sprite _n. */',
          '#define BW_SMB_STOMP(_n) (jumping && jmp_up == 0 && \\',
          '                          (py + (PLAYER_H << 3)) <= ss_y[_n] + (ss_h[_n] << 2))',
          '/* On-screen test — is sprite _n within the visible camera window?  The',
          ' * SMB actor AIs run their (relatively costly) walk + collision only for',
          ' * on-screen enemies, exactly like the original: off-screen actors lie',
          ' * dormant.  This keeps a wide, enemy-packed scrolling level inside the',
          ' * per-frame CPU budget (a full-screen of cc65 AI overruns vblank).',
          ' * cam_x only exists in a scrolling (multi-screen) build; a one-screen',
          ' * game has every sprite on-screen, so the test is a constant 1. */',
          '#ifdef SCROLL_BUILD',
          '#define BW_SMB_ONSCREEN(_n) ((unsigned int)(ss_x[_n] + (ss_w[_n] << 3)) > cam_x && \\',
          '                            (unsigned int)ss_x[_n] < cam_x + 256U)',
          '#else',
          '#define BW_SMB_ONSCREEN(_n) 1',
          '#endif',
          '#if PLAYER_HP_ENABLED',
          '#ifdef BW_SMB_POWERUPS',
          '/* Power-ups (v5): a Starman ignores the hit; a super/fire player is',
          ' * knocked down to small instead of losing HP; only a small player',
          ' * actually loses HP.  (This #ifdef resolves after the power-ups',
          ' * module\'s BW_SMB_POWERUPS define, since the macro lives at the top',
          ' * of per_frame — well below the declarations slot.) */',
          '#define BW_SMB_HURT() do { \\',
          '    if (!smb_star && !player_iframes) { \\',
          '        if (smb_pstate > 0) { smb_pstate = 0; player_iframes = INVINCIBILITY_FRAMES; } \\',
          '        else { \\',
          '            player_hp = (player_hp > DAMAGE_AMOUNT) ? (player_hp - DAMAGE_AMOUNT) : 0; \\',
          '            player_iframes = INVINCIBILITY_FRAMES; \\',
          '            if (player_hp == 0) player_dead = 1; \\',
          '        } \\',
          '    } \\',
          '} while (0)',
          '#else',
          '#define BW_SMB_HURT() do { \\',
          '    if (!player_iframes) { \\',
          '        player_hp = (player_hp > DAMAGE_AMOUNT) ? (player_hp - DAMAGE_AMOUNT) : 0; \\',
          '        player_iframes = INVINCIBILITY_FRAMES; \\',
          '        if (player_hp == 0) player_dead = 1; \\',
          '    } \\',
          '} while (0)',
          '#endif',
          '/* Grant iframes on a stomp/kick so the same frame\'s Damage-module',
          ' * check (any apply order) doesn\'t also count it as a side-hit. */',
          '#define BW_SMB_GUARD() do { player_iframes = INVINCIBILITY_FRAMES; } while (0)',
          '#else',
          '#define BW_SMB_HURT() do {} while (0)',
          '#define BW_SMB_GUARD() do {} while (0)',
          '#endif',
          '/* Rebound off a stomped enemy (defined last so BW_SMB_GUARD exists). */',
          '#define BW_SMB_BOUNCE() do { jumping = 1; jmp_up = 12; BW_SMB_GUARD(); } while (0)',
        ];
        parts.splice(1, 0, ...smbHelper);
      }
      // Phase 2b — when the ai_update ASM loop owns at least one instance (a
      // walker), emit the uniform AI tables (declarations) + the dispatch call
      // (per_frame), both gated behind NES_ASM_AI. Flag off: nothing here is
      // emitted, so the ROM is byte-identical. Index i matches ss_x[i] exactly.
      if (asmAiHandled > 0) {
        const n = instances.length;
        const tbl = [
          '#ifdef NES_ASM_AI',
          '/* [builder] Phase 2b — uniform scene-AI tables for the ai_update ASM',
          ' * loop. type 0 = handled by the C blocks above (or none); 1 = walker.',
          ' * state is the mutable AI byte (walker direction, seeded 1); speed is',
          ' * per-instance px/frame. ai_update() dispatches on type, skipping 0. */',
          'void ai_update(void);',
          'const unsigned char ss_ai_type[' + n + ']  = { ' + aiType.join(', ') + ' };',
          'signed char        ss_ai_state[' + n + '] = { ' + aiState.map((v) => v | 0).join(', ') + ' };',
          'const unsigned char ss_ai_speed[' + n + '] = { ' + aiSpeed.join(', ') + ' };',
          '#endif',
        ].join('\n');
        withHelper = A.appendToSlot(withHelper, 'declarations', tbl);
        parts.unshift(
          '#ifdef NES_ASM_AI',
          '        ai_update();   /* Phase 2b — hand-written 6502 AI dispatch (walkers) */',
          '#endif');
      }
      return A.appendToSlot(withHelper, 'per_frame', parts.join('\n'));
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
      checkpoints: false,   // R-8: respawn instead of game over
      respawnHp: 1,
      spawnOnHit: false,    // R-6: show an effect sprite where the player is hurt
      spawnSpriteIdx: 0,
      spawnTtl: 16,
      stompDefeat: false,   // #15 — jump on an enemy from above to defeat it
      stompBounce: 12,      // hop height after a stomp (jump-rise ticks)
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
      {
        key: 'checkpoints',
        label: 'Checkpoints (respawn instead of game over)',
        type: 'bool',
        help: 'Walk Player 1 onto a Door tile (Behaviour page) to save your ' +
          'spot.  On death you restart there with some HP instead of the game ' +
          'freezing.  (Uses the Door tile — avoid teleport Doors in the same ' +
          'project.)',
      },
      {
        key: 'respawnHp',
        label: 'HP restored on respawn',
        type: 'int',
        min: 1, max: 9,
        help: 'How much health you get back when you respawn at a checkpoint.',
      },
      {
        key: 'spawnOnHit',
        label: 'Show an effect sprite when the player is hit',
        type: 'bool',
        help: 'When Player 1 takes a hit, a sprite pops up where they were ' +
          '(a spark, a puff…).  Choose which sprite below.',
      },
      {
        key: 'spawnSpriteIdx',
        label: 'Effect sprite (which sprite to show)',
        type: 'spriteRef',
        help: 'Pick the sprite to use as the hit effect.',
      },
      {
        key: 'spawnTtl',
        label: 'Effect lasts (frames — 60 = 1 sec)',
        type: 'int',
        min: 1, max: 120,
        help: 'How long the effect sprite stays on screen after each hit.',
      },
      {
        key: 'stompDefeat',
        label: 'Jump on enemies to defeat them (platformer)',
        type: 'bool',
        help: 'When Player 1 lands on an enemy from above (falling, feet near ' +
          'the enemy\'s top) the enemy is defeated and the player bounces off, ' +
          'instead of taking damage.  A side or below touch still hurts.  ' +
          'Platformer style only.',
      },
      {
        key: 'stompBounce',
        label: 'Bounce height after a stomp',
        type: 'int',
        min: 4, max: 30,
        help: 'How high Player 1 hops after defeating an enemy by jumping on ' +
          'it.  Higher = a bigger bounce.  Only used when the option above is on.',
      },
    ],
    applyToTemplate(template, node, state) {
      const c = (node && node.config) || {};
      const amount = A.clampInt(c.amount, 1, 9, 1);
      const iframes = A.clampInt(c.invincibilityFrames, 0, 120, 30);
      const checkpoints = !!c.checkpoints;
      const respawnHp = A.clampInt(c.respawnHp, 1, 9, 1);
      const spawnOnHit = !!c.spawnOnHit;
      const spawnTtl = A.clampInt(c.spawnTtl, 1, 120, 16);
      // #15 — stomp-to-defeat.  Platformer only (it needs the jump/gravity
      // state); the emitted collision code is #ifdef-guarded so a project with
      // this off is byte-identical.
      const gtype = (state && state.builder && state.builder.modules &&
        state.builder.modules.game && state.builder.modules.game.config &&
        state.builder.modules.game.config.type) || 'platformer';
      const stompDefeat = !!c.stompDefeat && gtype === 'platformer';
      const stompBounce = A.clampInt(c.stompBounce, 4, 30, 12);
      const decls = [
        '#define DAMAGE_AMOUNT ' + amount,
        '#define INVINCIBILITY_FRAMES ' + iframes,
      ];
      if (stompDefeat) {
        decls.push(
          '#define BW_STOMP_DEFEAT 1',
          '#ifndef BW_STOMP_MARGIN',
          '#define BW_STOMP_MARGIN 8',
          '#endif',
          '#ifndef BW_STOMP_BOUNCE',
          '#define BW_STOMP_BOUNCE ' + stompBounce,
          '#endif');
      }
      if (spawnOnHit) {
        // BR-05 (model B): this is the hit effect — kind 1, with its OWN art
        // (server emits SPAWN1_*) and lifetime (SPAWN_TTL_1).  Independent of
        // the spawn module's trigger effect (kind 0); either turns the pool on.
        decls.push(
          '#ifndef BW_SPAWN1_ENABLED',
          '#define BW_SPAWN1_ENABLED 1',
          '#endif',
          '#ifndef SPAWN_TTL_1',
          '#define SPAWN_TTL_1 ' + spawnTtl,
          '#endif');
      }
      if (checkpoints) {
        // R-8: respawn state.  cp_x/cp_y default to the player start so a death
        // before touching any checkpoint respawns at the spawn point.
        decls.push(
          '#define BW_CHECKPOINTS 1',
          '#define BW_RESPAWN_HP ' + respawnHp,
          'pxcoord_t cp_x, cp_y;');
      }
      template = A.appendToSlot(template, 'declarations', decls.join('\n'));
      if (checkpoints) {
        template = A.appendToSlot(template, 'init',
          '    cp_x = PLAYER_X; cp_y = PLAYER_Y;');
      }
      const body = [
        '        // [builder] damage — enemies hurt the player(s) on touch.',
        '#if PLAYER_HP_ENABLED',
        '        if (!player_dead && player_iframes == 0) {',
        '            unsigned char dmg_hit = 0;',
        '#ifdef BW_STOMP_DEFEAT',
        '            unsigned char stomp_hit = 0;',
        '#endif',
        '            for (i = 0; i < NUM_STATIC_SPRITES; i++) {',
        '                if (ss_role[i] != ROLE_ENEMY) continue;',
        '                if (ss_y[i] >= 240) continue;',
        '                if (px + (PLAYER_W << 3) <= ss_x[i]) continue;',
        '                if (px >= ss_x[i] + (ss_w[i] << 3)) continue;',
        '                if (py + (PLAYER_H << 3) <= ss_y[i]) continue;',
        '                if (py >= ss_y[i] + (ss_h[i] << 3)) continue;',
        '#ifdef BW_STOMP_DEFEAT',
        '                /* #15 — landing on the enemy from above (not rising, feet',
        '                 * near its top) defeats it instead of hurting the player. */',
        '                if (jmp_up == 0 && py + (PLAYER_H << 3) <= ss_y[i] + BW_STOMP_MARGIN) {',
        '                    ss_y[i] = 0xFF; stomp_hit = 1; continue;',
        '                }',
        '#endif',
        '                dmg_hit = 1; break;',
        '            }',
        '#ifdef BW_STOMP_DEFEAT',
        '            if (stomp_hit) { jumping = 1; jmp_up = BW_STOMP_BOUNCE; }',
        '#endif',
        '            if (dmg_hit) {',
        '                player_hp = (player_hp > DAMAGE_AMOUNT)',
        '                          ? (player_hp - DAMAGE_AMOUNT) : 0;',
        '                player_iframes = INVINCIBILITY_FRAMES;',
        '                if (player_hp == 0) player_dead = 1;',
        '#if BW_SPAWN1_ENABLED',
        '                bw_spawn(px, py, 1);   /* R-6 — hit effect at the player */',
        '#endif',
        '            }',
        '        } else if (player_iframes > 0) {',
        '            player_iframes--;',
        '        }',
        '#if BW_CHECKPOINTS',
        '        /* R-8: save the respawn point while the player\'s centre is on a',
        '         * checkpoint (DOOR) tile. */',
        '        if (behaviour_at((unsigned int)((px + (PLAYER_W << 2)) >> 3),',
        '                         (unsigned int)((py + (PLAYER_H << 2)) >> 3))',
        '                == BEHAVIOUR_DOOR) {',
        '            cp_x = px; cp_y = py;',
        '        }',
        '#endif',
        '        if (player_dead) {',
        '#if BW_CHECKPOINTS',
        '            /* Respawn at the last checkpoint with restored HP instead of',
        '             * a permanent freeze.  player_dead is cleared THIS frame —',
        '             * before the engine game-over tint (after this slot) reads',
        '             * it — so there is no blue flash. */',
        '            px = cp_x; py = cp_y;',
        '            /* BR-08: never restore above the configured maximum (no',
        '             * `min` macro in scope, so spell out the clamp). */',
        '            player_hp = (BW_RESPAWN_HP < PLAYER_MAX_HP)',
        '                      ? BW_RESPAWN_HP : PLAYER_MAX_HP;',
        '            player_dead = 0;',
        '            player_iframes = INVINCIBILITY_FRAMES;',
        '            jumping = 0; jmp_up = 0;',
        '#else',
        '            jumping = 0; jmp_up = 0; prev_pad = 0xFF;',
        '            walk_speed = 0; climb_speed = 0;',
        '#endif',
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
        '        // The game-over death tint (PPU_MASK) is engine-owned now —',
        '        // see the "[engine] Game-over tint" block in platformer.c.',
        '        // This module only sets player_dead / player2_dead above.',
      ].join('\n');
      return A.appendToSlot(template, 'per_frame', body);
    },
  };

  // --------------------------------------------------------------------
  // Power-ups & fireballs (engine v5) — the SMB power-up state machine.
  // Turns on `#define BW_SMB_POWERUPS`, which the engine (platformer.c) gates
  // the whole feature on: a player power state (small -> super -> fire) set by
  // touching Super Mushroom / Fire Flower items, a Starman invincibility timer,
  // 1-Up heals, and — in the fire state — a 2-slot fireball pool thrown with B.
  // Items are placed on the Scene page with AI = item + a power kind; the
  // hurt path (shared with the Goomba/Koopa AIs) demotes a big player to small
  // instead of losing HP.  Needs the SMB game type; emits nothing otherwise, so
  // every non-SMB game (and pre-v5 targets) stays byte-identical.
  // --------------------------------------------------------------------
  modules['powerups'] = {
    label: 'Power-ups & fireballs',
    description: 'The classic SMB power-ups: a Super Mushroom makes the player ' +
      'super, a Fire Flower lets them throw fireballs with B, a Starman gives ' +
      'brief invincibility, and a 1-Up heals.  Getting hit while super/fire ' +
      'knocks you back down to small instead of costing a life.  Place the ' +
      'items on the Scene page (AI = item).  Needs the 🍄 SMB game type.',
    detailedHelp: [
      'A power state — small, super, fire — lives on the player.  Super ' +
      'Mushroom steps small→super; Fire Flower jumps straight to fire.',
      'In the fire state, pressing B throws a fireball (two can be on screen ' +
      'at once).  Fireballs arc, bounce off the ground, and defeat enemies.',
      'A Starman sets an invincibility timer.  A 1-Up refills HP (a full ' +
      'lives system arrives with the HUD in a later engine version).',
      'This is a v5 engine feature: it only builds when your game targets ' +
      'engine v5+ and uses the SMB game type.',
    ],
    defaultConfig: { fireballTile: 9, fireballPal: 2 },
    schema: [
      { key: 'fireballTile', label: 'Fireball sprite tile (0–255)', type: 'int', min: 0, max: 255,
        help: 'Which sprite tile draws the fireball.  Draw a small flame on the Tiles page and put its index here.' },
      { key: 'fireballPal', label: 'Fireball palette (0–3)', type: 'int', min: 0, max: 3,
        help: 'Which sprite palette colours the fireball.' },
    ],
    applyToTemplate(template, node, state) {
      // Power-ups build on the SMB style (physics) and land in engine v5.
      const targetEngine = (typeof window !== 'undefined' && window.NES_TARGET_ENGINE) || 1;
      const gt = state && state.builder && state.builder.modules && state.builder.modules.game &&
                 state.builder.modules.game.config && state.builder.modules.game.config.type;
      if (targetEngine < 5 || gt !== 'smb') return template;   // gated → byte-identical otherwise
      const c = (node && node.config) || {};
      const tile = A.clampInt(c.fireballTile, 0, 255, 9);
      const pal = A.clampInt(c.fireballPal, 0, 3, 2);
      return A.appendToSlot(template, 'declarations', [
        '/* [builder] power-ups (engine v5) — enable the SMB power-up state',
        ' * machine + fireballs; the engine gates the whole feature on this. */',
        '#define BW_SMB_POWERUPS 1',
        '#define BW_FIREBALL_TILE ' + tile,
        '#define BW_FIREBALL_PAL ' + pal,
      ].join('\n'));
    },
  };

  // --------------------------------------------------------------------
  // Blocks (engine v6) — interactive SMB blocks placed at tile positions.
  //   coin     — collected on touch (+1 coin; 100 → a spare life via the HUD).
  //   question — bump from below to step the power state up (small→super→fire,
  //              when Power-ups are on) or +1 coin otherwise, then it goes inert.
  //   brick    — bump from below; breaks (vanishes) only while super, else bonks.
  // A small position→kind table (`bw_block_tbl`) + a `bw_block_used[]` state
  // array, mirroring the per-door table.  Gated on the SMB game type + engine
  // v6, so every other game (and pre-v6 targets) is byte-identical.
  // --------------------------------------------------------------------
  modules['blocks'] = {
    label: 'Blocks (? / brick / coin)',
    description: 'Classic SMB blocks you place on the level: coins to collect, ' +
      '? blocks you bump from below for a power-up, and bricks that break when ' +
      'you\'re super. Add them on the World page. Needs the 🍄 SMB game type.',
    detailedHelp: [
      'A ? block bumped from below powers you up (small → super → fire) if the ' +
      'Power-ups module is on, then turns inert — the iconic SMB move.',
      'A brick bumped from below breaks and vanishes only while you are super; ' +
      'otherwise it just bonks your head.',
      'A coin is collected the moment you touch it and adds to a coin counter.',
      'This is a v6 engine feature: it only builds on engine v6+ with the SMB ' +
      'game type.',
    ],
    // [{ x, y, kind, usedTile, contents }]  kind: coin|question|brick
    //   contents (? blocks only): coin|mushroom|fireflower|star|oneup
    // dispTiles: sprite tiles for a dispensed power-up (mushroom/flower/star/1up)
    defaultConfig: { blockList: [], dispTiles: { mushroom: 10, fireflower: 11, star: 12, oneup: 10 }, dispPal: 2 },
    customRender: true,
    applyToTemplate(template, node, state) {
      const targetEngine = (typeof window !== 'undefined' && window.NES_TARGET_ENGINE) || 1;
      const gt = state && state.builder && state.builder.modules && state.builder.modules.game &&
                 state.builder.modules.game.config && state.builder.modules.game.config.type;
      const cfg = (node && node.config) || {};
      const list = cfg.blockList || [];
      if (targetEngine < 6 || gt !== 'smb' || list.length === 0) return template;  // gated → byte-identical
      const KIND = { coin: 0, question: 1, brick: 2 };
      const CONTENTS = { coin: 0, mushroom: 1, fireflower: 2, star: 3, oneup: 4 };
      const rows = [];
      for (let i = 0; i < list.length; i++) {
        const b = list[i] || {};
        const x = A.clampInt(b.x, 0, 63, 0);
        const y = A.clampInt(b.y, 0, 29, 0);
        const k = KIND[b.kind] != null ? KIND[b.kind] : 1;
        const usedTile = A.clampInt(b.usedTile, 0, 255, 0);  // tile shown once consumed (0 = empty)
        const contents = CONTENTS[b.contents] != null ? CONTENTS[b.contents] : 0;  // ? contents (0 = coin)
        rows.push([x, y, k, usedTile, contents]);
      }
      const dt = cfg.dispTiles || {};
      const decl = [
        '/* [builder] blocks (engine v6) — interactive ?/brick/coin blocks. */',
        '#define BW_SMB_BLOCKS 1',
        '#define BW_BLOCK_COUNT ' + rows.length,
        '/* Sprite tiles for a dispensed power-up (0 mushroom .. 3 1-Up). */',
        '#define BW_DISP_TILE0 ' + A.clampInt(dt.mushroom, 0, 255, 10),
        '#define BW_DISP_TILE1 ' + A.clampInt(dt.fireflower, 0, 255, 11),
        '#define BW_DISP_TILE2 ' + A.clampInt(dt.star, 0, 255, 12),
        '#define BW_DISP_TILE3 ' + A.clampInt(dt.oneup, 0, 255, 10),
        '#define BW_DISP_PAL ' + A.clampInt(cfg.dispPal, 0, 3, 2),
        'const unsigned char bw_block_tbl[] = {   /* x, y, kind 0=coin 1=? 2=brick, usedTile, contents */',
        '    ' + rows.map(r => r.join(', ')).join(',\n    '),
        '};',
        'unsigned char bw_block_used[BW_BLOCK_COUNT];',
        'unsigned int  bw_coins;',
        '/* Pending nametable pokes — a consumed block queues its "used" tile here,',
        ' * flushed to VRAM in the vblank window (rendering off) so the block',
        ' * visibly changes / vanishes.  (A block that scrolls off-screen and back',
        ' * is re-streamed from the const world map, so its art reverts even though',
        ' * bw_block_used keeps it inert — fine for a forward-scrolling level.) */',
        '#define BW_POKE_MAX 4',
        'unsigned char bw_poke_hi[BW_POKE_MAX];',
        'unsigned char bw_poke_lo[BW_POKE_MAX];',
        'unsigned char bw_poke_tile[BW_POKE_MAX];',
        'unsigned char bw_poke_n;',
      ];
      template = A.appendToSlot(template, 'declarations', decl.join('\n'));
      template = A.appendToSlot(template, 'init', [
        '    /* [builder] blocks — reset used flags + coin count on (re)start. */',
        '    bw_coins = 0;',
        '    bw_poke_n = 0;',
        '    { unsigned char bw_bi; for (bw_bi = 0; bw_bi < BW_BLOCK_COUNT; bw_bi++) bw_block_used[bw_bi] = 0; }',
      ].join('\n'));
      const body = [
        '        // [builder] blocks (engine v6) — collect coins on touch; bump',
        '        // ? / brick blocks from below (while rising).  A consumed block',
        '        // queues a nametable poke so its tile changes / vanishes.',
        '        {',
        '            unsigned char bw_bi, bw_bb, bw_bcol, bw_brow, bw_bkind;',
        '            unsigned char bw_hcol = (unsigned char)((px + ((PLAYER_W << 3) >> 1)) >> 3);',
        '            unsigned char bw_hrow = (py >= 1) ? (unsigned char)((py - 1) >> 3) : 0;',
        '            for (bw_bi = 0; bw_bi < BW_BLOCK_COUNT; bw_bi++) {',
        '                if (bw_block_used[bw_bi]) continue;',
        '                bw_bb = bw_bi * 5;',
        '                bw_bcol = bw_block_tbl[bw_bb];',
        '                bw_brow = bw_block_tbl[bw_bb + 1];',
        '                bw_bkind = bw_block_tbl[bw_bb + 2];',
        '                if (bw_bkind == 0) {',
        '                    /* coin — collect on box/cell overlap. */',
        '                    if (px < (((unsigned int)bw_bcol + 1) << 3) &&',
        '                        (unsigned int)px + (PLAYER_W << 3) > ((unsigned int)bw_bcol << 3) &&',
        '                        py < (((unsigned int)bw_brow + 1) << 3) &&',
        '                        (unsigned int)py + (PLAYER_H << 3) > ((unsigned int)bw_brow << 3)) {',
        '                        bw_block_used[bw_bi] = 1; bw_coins++;',
        '                    }',
        '                } else if (jumping && jmp_up > 0 && bw_hrow == bw_brow && bw_hcol == bw_bcol) {',
        '                    /* ? or brick — bumped from below while rising. */',
        '                    if (bw_bkind == 1) {',
        '                        unsigned char bw_cont = bw_block_tbl[bw_bb + 4];   /* what comes out */',
        '                        if (bw_cont == 0) {',
        '                            bw_coins++;   /* ? gives a coin */',
        '                        } else {',
        '#ifdef BW_SMB_POWERUPS',
        '                            /* dispense the chosen power-up: it rises out of the block. */',
        '                            if (!bw_disp_active) {',
        '                                bw_disp_active = 1;',
        '                                bw_disp_kind = bw_cont - 1;   /* 1..4 -> disp 0..3 */',
        '                                bw_disp_x = (pxcoord_t)((unsigned int)bw_bcol << 3);',
        '                                bw_disp_y = (pxcoord_t)((unsigned int)bw_brow << 3);',
        '                                bw_disp_rise = 8; bw_disp_dir = 1;',
        '                            }',
        '#else',
        '                            bw_coins++;   /* no power-ups module -> coin fallback */',
        '#endif',
        '                        }',
        '                        bw_block_used[bw_bi] = 1;',
        '                        jmp_up = 0;   /* bonk */',
        '                    } else {',
        '#ifdef BW_SMB_POWERUPS',
        '                        if (smb_pstate > 0) bw_block_used[bw_bi] = 1;   /* super breaks it */',
        '#endif',
        '                        jmp_up = 0;   /* bonk regardless */',
        '                    }',
        '                }',
        '                /* Just consumed?  Queue a nametable poke of its used tile. */',
        '                if (bw_block_used[bw_bi] && bw_poke_n < BW_POKE_MAX) {',
        '                    unsigned int bw_paddr = ((bw_bcol < 32) ? 0x2000U : 0x2400U) +',
        '                                            (unsigned int)bw_brow * 32 + (bw_bcol & 0x1F);',
        '                    bw_poke_hi[bw_poke_n] = (unsigned char)(bw_paddr >> 8);',
        '                    bw_poke_lo[bw_poke_n] = (unsigned char)(bw_paddr & 0xFF);',
        '                    bw_poke_tile[bw_poke_n] = bw_block_tbl[bw_bb + 3];',
        '                    bw_poke_n++;',
        '                }',
        '            }',
        '        }',
      ];
      template = A.appendToSlot(template, 'per_frame', body.join('\n'));
      const vb = [
        '        /* [builder] blocks — flush queued "used tile" pokes to the',
        '         * nametable (rendering is off in this vblank window). */',
        '        {',
        '            unsigned char bw_pk;',
        '            for (bw_pk = 0; bw_pk < bw_poke_n; bw_pk++) {',
        '                PPU_ADDR = bw_poke_hi[bw_pk];',
        '                PPU_ADDR = bw_poke_lo[bw_pk];',
        '                PPU_DATA = bw_poke_tile[bw_pk];',
        '            }',
        '            bw_poke_n = 0;',
        '        }',
      ];
      return A.appendToSlot(template, 'vblank_writes', vb.join('\n'));
    },
  };

  // --------------------------------------------------------------------
  // SMB HUD (engine v7) — a fixed on-screen read-out: coins, a count-down
  // timer (time-up = death), a score (+200 per coin) and lives, drawn as OAM
  // digit sprites (the server seeds 0-9 into the sprite pool at their ASCII
  // indices).  Gated on the SMB game type + engine v7 → byte-identical
  // otherwise.  Needs Player HP for the time-up death + life spend.
  // --------------------------------------------------------------------
  modules['smbhud'] = {
    label: 'HUD (coins / time / score / lives)',
    description: 'A fixed status read-out across the top: coins, a count-down ' +
      'timer (running out is a death), a score, and lives. Needs the 🍄 SMB ' +
      'game type. Turn on Player HP so the timer / lives can end a life.',
    detailedHelp: [
      'The digits are drawn as sprites at fixed screen positions, so they stay ' +
      'put while the level scrolls underneath.',
      'The timer counts down about every 0.4s; reaching 0 is a death. Each ' +
      'death spends a life. Coins add 200 to the score.',
      'A v7 engine feature — only builds on engine v7+ with the SMB game type.',
    ],
    defaultConfig: { startTime: 400, startLives: 3, hudPal: 0 },
    schema: [],
    applyToTemplate(template, node, state) {
      const targetEngine = (typeof window !== 'undefined' && window.NES_TARGET_ENGINE) || 1;
      const gt = state && state.builder && state.builder.modules && state.builder.modules.game &&
                 state.builder.modules.game.config && state.builder.modules.game.config.type;
      if (targetEngine < 7 || gt !== 'smb') return template;   // gated → byte-identical
      const c = (node && node.config) || {};
      return A.appendToSlot(template, 'declarations', [
        '/* [builder] SMB HUD (engine v7) — coins / time / score / lives. */',
        '#define BW_SMB_HUD 1',
        '#define BW_HUD_START_TIME ' + A.clampInt(c.startTime, 0, 999, 400),
        '#define BW_HUD_START_LIVES ' + A.clampInt(c.startLives, 1, 9, 3),
        '#define BW_HUD_PAL ' + A.clampInt(c.hudPal, 0, 3, 0),
      ].join('\n'));
    },
  };

  // --------------------------------------------------------------------
  // Pipes (engine v8) — hold Down while standing on a pipe cell to warp to a
  // spawn spot (optionally in another room / the underground of a tall level).
  // A position→destination table like the per-door table, Down-triggered.
  // Gated on the SMB game type + engine v8 → byte-identical otherwise.
  // --------------------------------------------------------------------
  modules['pipes'] = {
    label: 'Pipes (enter with Down)',
    description: 'Green-pipe warps: stand on a pipe and hold Down to travel to ' +
      'another spot — the underground of a tall level, or another room. Needs ' +
      'the 🍄 SMB game type. Place pipes on the World page.',
    detailedHelp: [
      'A pipe is a warp with a trigger tile (its top) + a destination spawn.',
      'Make a tall (1×2) level and warp Down into the lower half for a classic ' +
      'underground bonus area, or point a pipe at another background (room).',
      'A v8 engine feature — only builds on engine v8+ with the SMB game type.',
    ],
    defaultConfig: { pipeList: [] },   // [{ x, y, spawnX, spawnY }] — same-room warp
    customRender: true,
    applyToTemplate(template, node, state) {
      const targetEngine = (typeof window !== 'undefined' && window.NES_TARGET_ENGINE) || 1;
      const gt = state && state.builder && state.builder.modules && state.builder.modules.game &&
                 state.builder.modules.game.config && state.builder.modules.game.config.type;
      const list = (node && node.config && node.config.pipeList) || [];
      if (targetEngine < 8 || gt !== 'smb' || list.length === 0) return template;   // gated → byte-identical
      // Same-room warps (Down → spawn spot): covers the underground bonus of a
      // tall level and general teleports.  Cross-room bonus areas use a door.
      const rows = list.map(function (p) {
        p = p || {};
        return [A.clampInt(p.x, 0, 63, 0), A.clampInt(p.y, 0, 29, 0),
                A.clampInt(p.spawnX, 0, 248, 24), A.clampInt(p.spawnY, 16, 224, 120)];
      });
      template = A.appendToSlot(template, 'declarations', [
        '/* [builder] pipes (engine v8) — Down-to-enter same-room warps. */',
        '#define BW_SMB_PIPES 1',
        '#define BW_PIPE_COUNT ' + rows.length,
        'const unsigned char bw_pipe_tbl[] = {   /* x, y (tiles), spawnX, spawnY (px) */',
        '    ' + rows.map(function (r) { return r.join(', '); }).join(',\n    '),
        '};',
      ].join('\n'));
      const body = [
        '        // [builder] pipes (engine v8) — hold Down on a pipe cell to warp.',
        '        if (pad & 0x04) {',
        '            unsigned char bw_pcx = (unsigned char)((px + ((PLAYER_W << 3) >> 1)) >> 3);',
        '            unsigned char bw_pcy = (unsigned char)((py + (PLAYER_H << 3) - 1) >> 3);',
        '            unsigned char bw_pi, bw_pb;',
        '            for (bw_pi = 0; bw_pi < BW_PIPE_COUNT; bw_pi++) {',
        '                bw_pb = bw_pi * 4;',
        '                if (bw_pipe_tbl[bw_pb] == bw_pcx && bw_pipe_tbl[bw_pb + 1] == bw_pcy) {',
        '                    px = bw_pipe_tbl[bw_pb + 2]; py = bw_pipe_tbl[bw_pb + 3]; jumping = 0; jmp_up = 0;',
        '                    break;',
        '                }',
        '            }',
        '        }',
      ];
      return A.appendToSlot(template, 'per_frame', body.join('\n'));
    },
  };

  // --------------------------------------------------------------------
  // Flagpole finish (engine v8) — reaching a column wins the level with a
  // score bonus (SMB's end-of-level pole).  Reuses the Win condition's bw_won
  // (so needs that module on) + the HUD score.  Gated on SMB + engine v8.
  // --------------------------------------------------------------------
  modules['flagpole'] = {
    label: 'Flagpole finish',
    description: 'Reach the flagpole column to finish the level with a score ' +
      'bonus — SMB\'s end-of-level pole. Needs the 🍄 SMB game type and the Win ' +
      'condition module (in Rules) turned on.',
    detailedHelp: [
      'Paint a flagpole at the right of your level and set its column here; ' +
      'crossing it wins (the Win condition owns the celebration + freeze).',
      'A v8 engine feature — only builds on engine v8+ with the SMB game type.',
    ],
    defaultConfig: { x: 60 },
    schema: [
      { key: 'x', label: 'Flagpole column (tile 0–63)', type: 'int', min: 0, max: 63,
        help: 'The tile column the flagpole stands in. Crossing it finishes the level.' },
    ],
    applyToTemplate(template, node, state) {
      const targetEngine = (typeof window !== 'undefined' && window.NES_TARGET_ENGINE) || 1;
      const gt = state && state.builder && state.builder.modules && state.builder.modules.game &&
                 state.builder.modules.game.config && state.builder.modules.game.config.type;
      if (targetEngine < 8 || gt !== 'smb') return template;   // gated → byte-identical
      const x = A.clampInt(node && node.config && node.config.x, 0, 63, 60);
      template = A.appendToSlot(template, 'declarations',
        '/* [builder] flagpole (engine v8). */\n#define BW_SMB_FLAG 1\n#define BW_FLAG_PX ' + (x * 8));
      const body = [
        '        // [builder] flagpole (engine v8) — reach the flag to win + score.',
        '#if BW_WIN_ENABLED',
        '        if (!bw_won && (unsigned int)px + (PLAYER_W << 3) >= BW_FLAG_PX) {',
        '            bw_won = 1;',
        '#ifdef BW_SMB_HUD',
        '            bw_score += 5000;',
        '#endif',
        '        }',
        '#endif',
      ];
      return A.appendToSlot(template, 'per_frame', body.join('\n'));
    },
  };

  // --------------------------------------------------------------------
  // Rendering (engine v9) — SMB-style OAM flicker.  When on, the engine
  // rotates the scene-sprite OAM region one slot per frame, so a scanline with
  // more than the NES's 8 sprites flickers (drops a different sprite each frame)
  // instead of dropping the same one permanently.  Gated on SMB + engine v9.
  // --------------------------------------------------------------------
  modules['smbrender'] = {
    label: 'Sprite flicker (busy screens)',
    description: 'Real NES hardware shows at most 8 sprites per scanline. With ' +
      'this on, a crowded row flickers (like the real SMB) instead of some ' +
      'sprites vanishing. Needs the 🍄 SMB game type.',
    detailedHelp: [
      'The engine rotates which sprites get drawn first each frame, so the ' +
      'ones that overflow a scanline change every frame — you see a flicker ' +
      'rather than a permanent drop-out.',
      'A v9 engine feature — only builds on engine v9+ with the SMB game type.',
    ],
    defaultConfig: {},
    schema: [],
    applyToTemplate(template, node, state) {
      const targetEngine = (typeof window !== 'undefined' && window.NES_TARGET_ENGINE) || 1;
      const gt = state && state.builder && state.builder.modules && state.builder.modules.game &&
                 state.builder.modules.game.config && state.builder.modules.game.config.type;
      if (targetEngine < 9 || gt !== 'smb') return template;   // gated → byte-identical
      return A.appendToSlot(template, 'declarations',
        '/* [builder] rendering (engine v9) — SMB OAM flicker. */\n#define BW_OAM_FLICKER 1');
    },
  };

  // --------------------------------------------------------------------
  // Spawn (R-3) — pop a short-lived effect sprite when the player steps
  // onto a TRIGGER tile (painted on the Behaviour page).  Uses the shared
  // engine spawn pool (platformer.c, #if BW_SPAWN_ENABLED — byte-identical
  // when off) as the trigger effect, kind 0.  BR-05 model B: this effect is
  // independent of the damage module's "spawn on hit" (kind 1) — each has its
  // own art + lifetime.  The art is the chosen sprite, emitted as SPAWN0_TILES
  // by the server.
  // --------------------------------------------------------------------
  modules['spawn'] = {
    label: 'Spawn effect (on trigger tile)',
    description: 'When the player walks onto a TRIGGER tile (paint TRIGGER ' +
      'tiles on the Behaviour page), pop up an effect sprite there for a ' +
      'moment — a spark, a puff of smoke, a star.',
    defaultConfig: { spriteIdx: 0, ttl: 24 },
    schema: [
      {
        key: 'spriteIdx',
        label: 'Effect sprite (which sprite to show)',
        type: 'spriteRef',
        help: 'Pick the sprite to pop up as the effect.',
      },
      {
        key: 'ttl',
        label: 'Effect lasts (frames — 60 = 1 sec)',
        type: 'int',
        min: 1, max: 120,
        help: 'How long the effect sprite stays on screen each time it fires.',
      },
    ],
    applyToTemplate(template, node, state) {
      const c = (node && node.config) || {};
      const ttl = A.clampInt(c.ttl, 1, 120, 24);
      // BR-05 (model B): this is the trigger effect — kind 0, with its OWN art
      // (server emits SPAWN0_*) and lifetime (SPAWN_TTL_0).  Independent of the
      // damage module's hit effect (kind 1).
      template = A.appendToSlot(template, 'declarations', [
        '#ifndef BW_SPAWN0_ENABLED',
        '#define BW_SPAWN0_ENABLED 1',
        '#endif',
        '#ifndef SPAWN_TTL_0',
        '#define SPAWN_TTL_0 ' + ttl,
        '#endif',
        'unsigned char spawn_was_on;   /* R-3 rising-edge latch */',
      ].join('\n'));
      template = A.appendToSlot(template, 'init', '    spawn_was_on = 0;');
      // Fire once when the player's centre first enters a TRIGGER tile (mirrors
      // how the doors module probes behaviour_at == BEHAVIOUR_DOOR).
      template = A.appendToSlot(template, 'per_frame', [
        '        // [builder] spawn (R-3) — drop an effect when the player steps',
        '        // onto a TRIGGER tile (rising edge, so it fires once per entry).',
        '#if BW_SPAWN0_ENABLED',
        '        {',
        '            unsigned char on_trig = (behaviour_at(',
        '                (unsigned int)((px + (PLAYER_W << 2)) >> 3),',
        '                (unsigned int)((py + (PLAYER_H << 2)) >> 3)) == BEHAVIOUR_TRIGGER);',
        '            if (on_trig && !spawn_was_on) bw_spawn(px, py, 0);',
        '            spawn_was_on = on_trig;',
        '        }',
        '#endif',
      ].join('\n'));
      return template;
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
      'Per-door destinations (engine v2): give each door tile its own ' +
      'spawn point and target background by editing the door list ' +
      '(config.doorList). When the list is empty, all doors share the ' +
      'single (spawn, target) below — byte-identical to engine v1.',
    ],
    defaultConfig: {
      spawnX: 24,
      spawnY: 120,
      targetBgIdx: -1,
      // Per-door table (engine v2). Each entry:
      //   { bg, tx, ty, spawnX, spawnY, targetBgIdx }
      // bg/tx/ty identify the door TILE (background index + world tile coords);
      // an empty list keeps the v1 single-global-door behaviour.
      doorList: [],
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
      const bgs = (state && state.backgrounds) || [];

      // ---- Per-door destinations (engine v2) ----------------------------
      // Active only when (a) this page targets engine v2+ and (b) the pupil
      // has configured a door list. The original multi-page site defaults to
      // v1 (window.NES_TARGET_ENGINE unset → 1), so it never emits per-door
      // and stays byte-identical to v1. An empty list also falls through to
      // the v1 single-global-door path (golden-ROM contract preserved).
      const targetEngine = (typeof window !== 'undefined' && window.NES_TARGET_ENGINE) || 1;
      const doorList = Array.isArray(c.doorList) ? c.doorList : [];
      if (targetEngine >= 2 && doorList.length > 0) {
        const maxBg = bgs.length ? bgs.length - 1 : 0;
        const entries = [];
        let anyCrossRoom = false;
        for (const d of doorList) {
          const bg = A.clampInt(d.bg, 0, maxBg, 0);
          const tx = A.clampInt(d.tx, 0, 255, 0);
          const ty = A.clampInt(d.ty, 0, 255, 0);
          const sx = A.clampInt(d.spawnX, 0, 240, 24);
          const sy = A.clampInt(d.spawnY, 16, 200, 120);
          const tRaw = (d.targetBgIdx == null) ? -1 : (d.targetBgIdx | 0);
          const validTarget = tRaw >= 0 && tRaw < bgs.length;
          if (validTarget && tRaw !== bg) anyCrossRoom = true;
          const tgtByte = validTarget ? tRaw : 0xFF; // 0xFF = same room
          entries.push([bg, tx, ty, sx, sy, tgtByte]);
        }
        // Room tracking (current_bg + load_background_n) is needed when doors
        // swap rooms OR when there is more than one background (so a door on a
        // non-zero background matches the room it lives in).
        const needsRoom = anyCrossRoom || bgs.length > 1;
        const decl = [
          '#define BW_DOORS_PERDOOR_ENABLED 1',
          '#define BW_DOOR_COUNT ' + entries.length,
        ];
        if (needsRoom) decl.push('#define BW_DOORS_MULTIBG_ENABLED 1');
        decl.push('const unsigned char bw_door_tbl[] = {');
        decl.push('    ' + entries.map(e => e.join(', ')).join(',\n    '));
        decl.push('};');
        decl.push('#if BW_DOORS_MULTIBG_ENABLED');
        decl.push('#define BW_DOOR_ROOM current_bg');
        decl.push('#else');
        decl.push('#define BW_DOOR_ROOM 0');
        decl.push('#endif');
        template = A.appendToSlot(template, 'declarations', decl.join('\n'));
        if (needsRoom) {
          let startBg = (state && state.selectedBgIdx) | 0;
          if (!(startBg >= 0 && startBg < bgs.length)) startBg = 0;
          template = A.appendToSlot(template, 'init', '    current_bg = ' + startBg + ';');
        }
        const perDoor = [
          '        // [builder] per-door destinations (engine v2).',
          '        {',
          '            unsigned char bw_dcx = (unsigned char)((px + ((PLAYER_W << 3) >> 1)) >> 3);',
          '            unsigned char bw_dcy = (unsigned char)((py + ((PLAYER_H << 3) >> 1)) >> 3);',
          '            if (behaviour_at((unsigned int)bw_dcx, (unsigned int)bw_dcy) == BEHAVIOUR_DOOR) {',
          '                unsigned char bw_di;',
          '                for (bw_di = 0; bw_di < BW_DOOR_COUNT; bw_di++) {',
          '                    unsigned char bw_b = bw_di * 6;',
          '                    if (bw_door_tbl[bw_b] == BW_DOOR_ROOM && bw_door_tbl[bw_b + 1] == bw_dcx && bw_door_tbl[bw_b + 2] == bw_dcy) {',
          '#if BW_DOORS_MULTIBG_ENABLED',
          '                        if (bw_door_tbl[bw_b + 5] != 0xFF && current_bg != bw_door_tbl[bw_b + 5]) load_background_n(bw_door_tbl[bw_b + 5]);',
          '#endif',
          '                        px = bw_door_tbl[bw_b + 3]; py = bw_door_tbl[bw_b + 4];',
          '                        jumping = 0; jmp_up = 0;',
          '                        break;',
          '                    }',
          '                }',
          '            }',
          '#if PLAYER2_ENABLED',
          '            {',
          '                unsigned char bw_d2x = (unsigned char)((px2 + ((PLAYER2_W << 3) >> 1)) >> 3);',
          '                unsigned char bw_d2y = (unsigned char)((py2 + ((PLAYER2_H << 3) >> 1)) >> 3);',
          '                if (behaviour_at((unsigned int)bw_d2x, (unsigned int)bw_d2y) == BEHAVIOUR_DOOR) {',
          '                    unsigned char bw_dj;',
          '                    for (bw_dj = 0; bw_dj < BW_DOOR_COUNT; bw_dj++) {',
          '                        unsigned char bw_b2 = bw_dj * 6;',
          '                        if (bw_door_tbl[bw_b2] == BW_DOOR_ROOM && bw_door_tbl[bw_b2 + 1] == bw_d2x && bw_door_tbl[bw_b2 + 2] == bw_d2y) {',
          '#if BW_DOORS_MULTIBG_ENABLED',
          '                            if (bw_door_tbl[bw_b2 + 5] != 0xFF && current_bg != bw_door_tbl[bw_b2 + 5]) load_background_n(bw_door_tbl[bw_b2 + 5]);',
          '#endif',
          '                            px2 = bw_door_tbl[bw_b2 + 3]; py2 = bw_door_tbl[bw_b2 + 4];',
          '                            jumping2 = 0; jmp_up2 = 0;',
          '                            break;',
          '                        }',
          '                    }',
          '                }',
          '            }',
          '#endif',
          '        }',
        ];
        return A.appendToSlot(template, 'per_frame', perDoor.join('\n'));
      }

      // ---- v1 single global door (unchanged; byte-identical) ------------
      const spawnX = A.clampInt(c.spawnX, 0, 240, 24);
      const spawnY = A.clampInt(c.spawnY, 16, 200, 120);
      const rawTarget = (c.targetBgIdx == null) ? -1 : (c.targetBgIdx | 0);
      // Valid if in range of backgrounds[]; otherwise same-room.
      const multiBg = rawTarget >= 0 && rawTarget < bgs.length;
      if (multiBg) {
        template = A.appendToSlot(template, 'declarations', [
          '#define BW_DOORS_MULTIBG_ENABLED 1',
          '#define BW_DOOR_TARGET_BG ' + rawTarget,
        ].join('\n'));
        // current_bg must reflect the room the game actually boots into
        // (the selected bg), not the engine's hard-coded 0, or a door
        // targeting bg 0 from a non-zero start never fires.
        let startBg = (state && state.selectedBgIdx) | 0;
        if (!(startBg >= 0 && startBg < bgs.length)) startBg = 0;
        template = A.appendToSlot(template, 'init',
          '    current_bg = ' + startBg + ';');
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
      // The auto-runner (BW_GAME_STYLE == 2) advances the camera every frame;
      // the dialogue box's in-vblank PPU writes fight that constant scroll and
      // glitch the screen (pupil-reported).  Disable dialogue entirely in runner
      // builds — emit nothing, so there's no BW_DIALOGUE_ENABLED, no per-frame
      // trigger, and no vblank writes.  A validator warns so the pupil knows.
      const gameType = (((state && state.builder && state.builder.modules &&
        state.builder.modules.game) || {}).config || {}).type;
      if (gameType === 'runner') return template;
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
        // Uppercase at emit: the built-in dialogue font (seeded by the
        // server when dialogue is on) is UPPERCASE, so lowercase input would
        // otherwise hit unpainted tile slots and render as garbage.  This
        // makes "hello" render as "HELLO" instead of nothing.
        s = (s || '').toUpperCase();
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
        '#define BW_DIALOG_PALETTE 3',   /* Arc B: reserved BG sub-palette for the box (white text); server seeds it */
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
        '            /* Arc B — full-width dialogue banner with a reserved palette.',
        '             *',
        '             * The box is a solid full-width band spanning the WHOLE',
        '             * attribute row(s) the text occupies (an attribute byte',
        '             * recolours a 4x4-tile area, so colour can only be chosen at',
        '             * that granularity).  Every cell in the band is overwritten',
        '             * with a glyph or a blank tile (0x20), then those attribute',
        '             * rows are pointed at BW_DIALOG_PALETTE.  Because the band is',
        '             * fully filled, recolouring it never bleeds onto scenery; and',
        '             * because colour 0 of every BG palette is the shared',
        '             * universal_bg, a blank (0x20) cell is the box body in ANY',
        '             * palette, so only the glyph cells actually need the reserved',
        '             * palette (white text).  Tiles AND attribute bytes are',
        '             * restored on close from the ROM-resident bg arrays — never',
        '             * read back from VRAM (see the round2-dialogue guards).',
        '             *',
        '             * Per-NPC: a single-row override still fills/​restores the',
        '             * full BW_DIALOG_ROW_COUNT band so the screen round-trips.',
        '             */',
        '            unsigned char dlg_j;',
        '            unsigned char dlg_ar;',
        '            unsigned char dlg_draw_rows = BW_DIALOG_ROW_COUNT;',
        '            // Declared up here (not after the #if below): cc65 defaults to',
        '            // C89, so no declaration may follow a statement in a block.',
        '            unsigned char dlg_total;',
        '            unsigned int  dlg_twr0;   /* world tile row of the first text line */',
        '            unsigned char dlg_alo;    /* first attribute row the band spans */',
        '            unsigned char dlg_ahi;    /* last attribute row the band spans  */',
        '            unsigned int  dlg_wr;     /* current banner world tile row */',
        '#if BW_DIALOG_PER_NPC',
        '            const unsigned char *npc_text =',
        '                bw_dialogue_per_npc[bw_dialog_npc_idx];',
        '            if (bw_dialog_cmd == 1 && npc_text != 0) dlg_draw_rows = 1;',
        '#endif',
        '            dlg_total =',
        '                (bw_dialog_cmd == 1) ? dlg_draw_rows : BW_DIALOG_ROW_COUNT;',
        '#ifdef SCROLL_BUILD',
        '            /* Camera-relative: the box tracks the frozen camera so it stays',
        '             * on-screen on a scrolling map (pauseOnOpen holds cam_x/cam_y). */',
        '            dlg_twr0 = (cam_y >> 3) + BW_DIALOG_ROW;',
        '#else',
        '            dlg_twr0 = BW_DIALOG_ROW;',
        '#endif',
        '            /* Snap the band to the 4-tile attribute grid so whole attribute',
        '             * bytes can be written (no read-modify-write).  alo..ahi is 1',
        '             * row in the common case, 2 only under a misaligned vertical',
        '             * scroll. */',
        '            dlg_alo = (unsigned char)(dlg_twr0 >> 2);',
        '            dlg_ahi = (unsigned char)((dlg_twr0 + dlg_total - 1) >> 2);',
        '#ifndef SCROLL_BUILD',
        '            /* Disable rendering for the VRAM burst.  On a non-scroll build',
        '             * nothing else holds PPU_MASK at 0, so the burst (a full-width',
        '             * band) that overruns vblank would corrupt the PPU pointer and',
        '             * drop writes.  The SCROLL_BUILD path already clears PPU_MASK',
        '             * around the whole window.  Restored after the writes. */',
        '            PPU_MASK = 0;',
        '#endif',
        '            /* --- Banner tiles: every world row in attr rows alo..ahi, full',
        '             *     width.  Glyphs land in their text cells; everything else',
        '             *     is a blank box cell (0x20). --- */',
        '            for (dlg_wr = (unsigned int)dlg_alo << 2;',
        '                 dlg_wr <= (((unsigned int)dlg_ahi << 2) + 3); dlg_wr++) {',
        '                unsigned char dlg_is_text =',
        '                    (dlg_wr >= dlg_twr0) && (dlg_wr < dlg_twr0 + dlg_total);',
        '                const unsigned char *dlg_line = 0;',
        '                unsigned char dlg_ended = 0;',
        '                unsigned int dlg_vbase;     /* PPU nametable base for this row */',
        '                unsigned int dlg_src_base;  /* index into the bg restore source */',
        '#ifdef SCROLL_BUILD',
        '                unsigned int dlg_wcol0 = (cam_x >> 3);',
        '                if (dlg_wr >= 30) dlg_vbase = 0x2800 + (dlg_wr - 30) * 32;',
        '                else              dlg_vbase = 0x2000 + dlg_wr * 32;',
        '                dlg_src_base = dlg_wr * BG_WORLD_COLS + dlg_wcol0;',
        '#else',
        '                dlg_vbase = 0x2000 + dlg_wr * 32;',
        '                dlg_src_base = dlg_wr * 32;',
        '#endif',
        '                if (bw_dialog_cmd == 1 && dlg_is_text) {',
        '#if BW_DIALOG_PER_NPC',
        '                    dlg_line = (npc_text != 0) ? npc_text',
        '                        : bw_dialogue_text_table[dlg_wr - dlg_twr0];',
        '#else',
        '                    dlg_line = bw_dialogue_text_table[dlg_wr - dlg_twr0];',
        '#endif',
        '                }',
        '#ifndef SCROLL_BUILD',
        '                PPU_ADDR = (unsigned char)(dlg_vbase >> 8);',
        '                PPU_ADDR = (unsigned char)(dlg_vbase & 0xFF);',
        '#endif',
        '                for (dlg_j = 0; dlg_j < 32; dlg_j++) {',
        '                    unsigned char dlg_tile;',
        '                    if (bw_dialog_cmd == 1) {',
        '                        if (dlg_is_text && dlg_j >= BW_DIALOG_COL',
        '                                && dlg_j < (BW_DIALOG_COL + BW_DIALOG_WIDTH)) {',
        '                            if (dlg_ended) {',
        '                                dlg_tile = 0x20;',
        '                            } else {',
        '                                dlg_tile = dlg_line[dlg_j - BW_DIALOG_COL];',
        '                                if (dlg_tile == 0) { dlg_tile = 0x20; dlg_ended = 1; }',
        '                            }',
        '                        } else {',
        '                            dlg_tile = 0x20;   /* box body (renders universal_bg) */',
        '                        }',
        '                    } else {',
        '#ifdef SCROLL_BUILD',
        '                        dlg_tile = bg_world_tiles[dlg_src_base + dlg_j];',
        '#else',
        '                        dlg_tile = bg_nametable_0[dlg_src_base + dlg_j];',
        '#endif',
        '                    }',
        '#ifdef SCROLL_BUILD',
        '                    /* (Re)point PPU_ADDR at the start and at every 32-tile',
        '                     * nametable column boundary (the band can straddle two',
        '                     * side-by-side screens). */',
        '                    if (dlg_j == 0 || ((dlg_wcol0 + dlg_j) & 31) == 0) {',
        '                        unsigned int dlg_wc = dlg_wcol0 + dlg_j;',
        '                        unsigned int dlg_addr = dlg_vbase',
        '                            + ((dlg_wc & 32) ? 0x0400 : 0) + (dlg_wc & 31);',
        '                        PPU_ADDR = (unsigned char)(dlg_addr >> 8);',
        '                        PPU_ADDR = (unsigned char)(dlg_addr & 0xFF);',
        '                    }',
        '#endif',
        '                    PPU_DATA = dlg_tile;',
        '                }',
        '            }',
        '            /* --- Attribute bytes: point the band\'s attribute rows at',
        '             *     BW_DIALOG_PALETTE on open (all four 2-bit quads = the',
        '             *     palette id -> 0x55*id), restore the saved bytes on close.',
        '             *     Whole-byte writes — the band is attribute-grid aligned. --- */',
        '            for (dlg_ar = dlg_alo; dlg_ar <= dlg_ahi; dlg_ar++) {',
        '                unsigned char dlg_ac;',
        '                unsigned int  dlg_war = (unsigned int)dlg_ar << 2;  /* top world row */',
        '#ifdef SCROLL_BUILD',
        '                unsigned int dlg_vb  = (dlg_war >= 30) ? 1 : 0;',
        '                unsigned int dlg_rr  = ((dlg_war >= 30) ? dlg_war - 30 : dlg_war) >> 2;',
        '                unsigned int dlg_ntv = 0x2000 + (dlg_vb ? 0x0800 : 0);',
        '                unsigned int dlg_wtc0 = (cam_x >> 3);',
        '                /* 9 attribute columns cover the 32-tile band even when the',
        '                 * camera is mid-screen (the band straddles a 32-tile NT',
        '                 * boundary); the off-screen extra is harmless. */',
        '                for (dlg_ac = 0; dlg_ac < 9; dlg_ac++) {',
        '                    unsigned int dlg_wc  = dlg_wtc0 + ((unsigned int)dlg_ac << 2);',
        '                    unsigned int dlg_cc  = (dlg_wc & 31) >> 2;',
        '                    unsigned int dlg_aa  = dlg_ntv + ((dlg_wc & 32) ? 0x0400 : 0)',
        '                        + 0x3C0 + dlg_rr * 8 + dlg_cc;',
        '                    unsigned char dlg_av;',
        '                    if (bw_dialog_cmd == 1) {',
        '                        dlg_av = (unsigned char)(0x55 * BW_DIALOG_PALETTE);',
        '                    } else {',
        '                        dlg_av = bg_world_attrs[(dlg_vb * 8 + dlg_rr)',
        '                            * BG_WORLD_ATTR_COLS + (dlg_wc >> 5) * 8 + dlg_cc];',
        '                    }',
        '                    PPU_ADDR = (unsigned char)(dlg_aa >> 8);',
        '                    PPU_ADDR = (unsigned char)(dlg_aa & 0xFF);',
        '                    PPU_DATA = dlg_av;',
        '                }',
        '#else',
        '                for (dlg_ac = 0; dlg_ac < 8; dlg_ac++) {',
        '                    unsigned int dlg_aa = 0x23C0 + (unsigned int)dlg_ar * 8 + dlg_ac;',
        '                    PPU_ADDR = (unsigned char)(dlg_aa >> 8);',
        '                    PPU_ADDR = (unsigned char)(dlg_aa & 0xFF);',
        '                    if (bw_dialog_cmd == 1) {',
        '                        PPU_DATA = (unsigned char)(0x55 * BW_DIALOG_PALETTE);',
        '                    } else {',
        '                        PPU_DATA = bg_nametable_0[960 + (unsigned int)dlg_ar * 8 + dlg_ac];',
        '                    }',
        '                }',
        '#endif',
        '            }',
        '#ifndef SCROLL_BUILD',
        '            /* Re-enable rendering (base mask), still inside vblank.  0x1E is',
        '             * the engine base; a win/death tint reasserts next per-frame. */',
        '            PPU_MASK = 0x1E;',
        '#endif',
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
        '#define BW_WIN_ENABLED 1\n' +
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
        '            // The win tint (PPU_MASK) is engine-owned now — see the',
        '            // "[engine] Game-over tint" block in platformer.c, gated',
        '            // on BW_WIN_ENABLED.  This module only sets bw_won + the',
        '            // freeze above.',
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
        spawn: {
          enabled: false,
          config: Object.assign({}, modules['spawn'].defaultConfig),
        },
        damage: {
          enabled: false,
          config: Object.assign({}, modules['damage'].defaultConfig),
        },
        powerups: {
          enabled: false,
          config: Object.assign({}, modules['powerups'].defaultConfig),
        },
        blocks: {
          enabled: false,
          config: { blockList: [] },
        },
        smbhud: {
          enabled: false,
          config: Object.assign({}, modules['smbhud'].defaultConfig),
        },
        pipes: {
          enabled: false,
          config: { pipeList: [] },
        },
        flagpole: {
          enabled: false,
          config: Object.assign({}, modules['flagpole'].defaultConfig),
        },
        smbrender: {
          enabled: false,
          config: {},
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
