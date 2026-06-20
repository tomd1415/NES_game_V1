/*
 * Builder validators — chunk 1.
 *
 * Each validator is a tiny pure function `(state) -> null | problem`.
 * `problem` shape:
 *   { id, severity: 'error'|'warn', message, fix, jumpTo }
 *
 * `jumpTo` is one of the editor page filenames (`sprites.html`,
 * `index.html`, `behaviour.html`, `code.html`, `builder.html`) —
 * the UI renders a button that opens that page.  `null` means no
 * navigation helper (e.g. the fix is already on the Builder page).
 *
 * Problems with severity === 'error' disable the Play button.
 * 'warn' is informational and leaves Play enabled.
 *
 * Authoring a new validator is dropping another function into the
 * `VALIDATORS` array and, if the problem wants a cross-page fix
 * button, reusing one of the `jumpTo` values above.
 */
(function () {
  'use strict';

  // Helpers shared across validators.  Kept local (not exported) to
  // avoid cluttering window.BuilderValidators.
  function sprites(state) { return (state && state.sprites) || []; }
  function builder(state) {
    return (state && state.builder) || { modules: {} };
  }
  // Active background's behaviour-map slot.  Returns a 2D array of
  // behaviour-type ids, or [] if the pupil's project pre-dates the
  // behaviour page.  Used by validators that check whether a given
  // tile type has been painted.
  function activeBehaviourMap(state) {
    const bgs = (state && state.backgrounds) || [];
    const idx = (state && state.selectedBgIdx) | 0;
    const bg = bgs[idx] || bgs[0];
    if (!bg || !Array.isArray(bg.behaviour)) return [];
    return bg.behaviour;
  }
  // Look up the behaviour-type id for a named type (e.g. 'trigger',
  // 'solid_ground').  Falls back to a sensible default if the project
  // doesn't list the type — shouldn't happen on v2 projects, but
  // keeps the validator defensive for imported older saves.
  function behaviourIdByName(state, name) {
    const list = (state && state.behaviour_types) || [];
    const hit = list.find(t => t && t.name === name);
    if (hit) return hit.id | 0;
    // Defaults from behaviour.html defaultBehaviourTypes().
    const fallback = {
      none: 0, solid_ground: 1, wall: 2, platform: 3,
      door: 4, trigger: 5, ladder: 6,
    };
    return fallback[name] !== undefined ? fallback[name] : -1;
  }
  function countTilesByBehaviourName(state, name) {
    const id = behaviourIdByName(state, name);
    if (id < 0) return 0;
    const map = activeBehaviourMap(state);
    let n = 0;
    for (const row of map) for (const v of row) if ((v | 0) === id) n++;
    return n;
  }
  function moduleNode(state, dottedId) {
    const parts = dottedId.split('.');
    let node = builder(state).modules;
    for (let i = 0; i < parts.length; i++) {
      if (!node) return null;
      if (i === 0) {
        node = node[parts[i]];
      } else {
        if (!node.submodules) return null;
        node = node.submodules[parts[i]];
      }
    }
    return node || null;
  }
  function moduleEnabled(state, dottedId) {
    const n = moduleNode(state, dottedId);
    return !!(n && n.enabled);
  }
  function countSpritesByRole(state, role) {
    return sprites(state).filter(function (s) { return s && s.role === role; }).length;
  }

  // --------------------------------------------------------------------
  // Validators — chunk 1 ships two.  More land as modules do.
  // --------------------------------------------------------------------
  const VALIDATORS = [
    // V1: Player 1 is enabled but no sprite has role=player.
    function noPlayerRole(state) {
      if (!moduleEnabled(state, 'players.player1')) return null;
      if (countSpritesByRole(state, 'player') > 0) return null;
      return {
        id: 'no-player-role',
        severity: 'error',
        message: 'Player 1 is turned on, but no sprite has the ' +
          'Player role yet.',
        fix: 'Open the Sprites page and tag one of your sprites as ' +
          'Player (the role dropdown next to its name).',
        jumpTo: 'sprites.html',
      };
    },

    // V2: Player's walk animation is assigned to nothing.  Warn only —
    // the game still runs with the static player layout.  The plan
    // mentioned this as a MVP rule; downgrading to 'warn' because the
    // build compiles without it.
    function noWalkAnimation(state) {
      if (!moduleEnabled(state, 'players.player1')) return null;
      const walk = state && state.animation_assignments &&
        state.animation_assignments.walk;
      if (walk != null) return null;
      return {
        id: 'no-walk-animation',
        severity: 'warn',
        message: 'No walk animation is assigned.',
        fix: 'Open the Sprites page → Animations panel and assign one ' +
          'of your animations to "walk" (optional — the game still ' +
          'runs, the player just uses the static layout).',
        jumpTo: 'sprites.html',
      };
    },

    // V4: behaviour_walls is on but the active background has no
    // wall / solid_ground tiles painted.  Warn — the player will
    // fall off the bottom of the screen with nothing to stand on.
    function noWallTiles(state) {
      if (!moduleEnabled(state, 'behaviour_walls')) return null;
      const walls  = countTilesByBehaviourName(state, 'wall');
      const ground = countTilesByBehaviourName(state, 'solid_ground');
      const plat   = countTilesByBehaviourName(state, 'platform');
      if (walls + ground + plat > 0) return null;
      return {
        id: 'no-wall-tiles',
        severity: 'warn',
        message: 'No walls, platforms or solid-ground tiles are painted yet.',
        fix: 'Open the Behaviour page and paint at least a row of ' +
          'Solid ground or Platform tiles.  Without them the player ' +
          'falls through the floor.',
        jumpTo: 'behaviour.html',
      };
    },

    // V5: win_condition on (reach_tile), but the pupil hasn't
    // painted any tiles of the chosen kind.  Error — no way to win.
    function winConditionNoTiles(state) {
      if (!moduleEnabled(state, 'win_condition')) return null;
      const node = moduleNode(state, 'win_condition');
      const cfg = (node && node.config) || {};
      if ((cfg.type || 'reach_tile') !== 'reach_tile') return null;
      const name = cfg.behaviourType || 'trigger';
      if (countTilesByBehaviourName(state, name) > 0) return null;
      return {
        id: 'win-no-tiles',
        severity: 'error',
        message: 'Win condition is on (' + name + ' tiles) but you ' +
          'have not painted any ' + name + ' tiles yet.',
        fix: 'Open the Behaviour page, pick ' + name + ' from the ' +
          'type list, and paint at least one tile where the player ' +
          'should end up to win.  (Or switch the win condition off.)',
        jumpTo: 'behaviour.html',
      };
    },

    // V7: win_condition == all_pickups_collected but pickups module
    // isn't enabled.  The emitted code references bw_pickup_total /
    // bw_pickup_count which don't exist without pickups — a cc65
    // error on build.  Error severity: blocks Play.
    function allPickupsWinNeedsPickups(state) {
      if (!moduleEnabled(state, 'win_condition')) return null;
      const node = moduleNode(state, 'win_condition');
      const cfg = (node && node.config) || {};
      if ((cfg.type || 'reach_tile') !== 'all_pickups_collected') return null;
      if (moduleEnabled(state, 'pickups')) return null;
      return {
        id: 'all-pickups-needs-pickups',
        severity: 'error',
        message: 'Win condition is "collect every Pickup" but the ' +
          'Pickups module is switched off.',
        fix: 'Turn on the Pickups module (and tag at least one sprite ' +
          'with the Pickup role on the Sprites page).',
        jumpTo: null,
      };
    },

    // V7b: scene instance points at a sprite that no longer exists
    // (pupil deleted it on the Sprites page).  Error — build would
    // reference a sprite index out of range.
    function invalidInstanceSprite(state) {
      if (!moduleEnabled(state, 'scene')) return null;
      const node = moduleNode(state, 'scene');
      const instances = (node && node.config && node.config.instances) || [];
      const all = sprites(state);
      for (const inst of instances) {
        if (!all[inst.spriteIdx]) {
          return {
            id: 'scene-invalid-sprite',
            severity: 'error',
            message: 'A Scene instance points at a sprite that no longer exists.',
            fix: 'Open the Scene list below and delete rows whose ' +
              'sprite dropdown is blank — or recreate the sprite on ' +
              'the Sprites page.',
            jumpTo: null,
          };
        }
      }
      return null;
    },

    // V7c: instance placed off-screen.  Warn — the sprite simply will
    // not be visible, which is mostly harmless but almost never
    // intended.
    function instanceOffScreen(state) {
      if (!moduleEnabled(state, 'scene')) return null;
      const node = moduleNode(state, 'scene');
      const instances = (node && node.config && node.config.instances) || [];
      for (const inst of instances) {
        if (inst.x < 0 || inst.x > 240 || inst.y < 16 || inst.y > 216) {
          return {
            id: 'scene-off-screen',
            severity: 'warn',
            message: 'One of your Scene instances is placed off the ' +
              'visible screen.',
            fix: 'Check the x / y numbers on each Scene row — keep ' +
              'x between 0 and 240, and y between 16 and 216, to ' +
              'stay on screen.',
            jumpTo: null,
          };
        }
      }
      return null;
    },

    // V15: Player 2 on + damage on but P2 maxHp == 0.  Same shape
    // as V10 (hp-zero-with-damage) but for P2.  Warn only — the
    // game still plays, P2 just can't be hurt; pupils might
    // intentionally make P2 immortal.
    function p2HpZeroWithDamage(state) {
      if (!moduleEnabled(state, 'damage')) return null;
      if (!moduleEnabled(state, 'players.player2')) return null;
      const p2 = moduleNode(state, 'players.player2');
      const maxHp = (p2 && p2.config && p2.config.maxHp) | 0;
      if (maxHp > 0) return null;
      return {
        id: 'p2-hp-zero-with-damage',
        severity: 'warn',
        message: 'Damage is on and Player 2 is on, but P2\'s Max HP ' +
          'is 0 — P2 is invincible.',
        fix: 'Raise Player 2 → Max HP if you want P2 to take damage ' +
          'too, or leave it at 0 for an "assist mode" co-op feel.',
        jumpTo: null,
      };
    },

    // V10: Damage module on but player has 0 maxHp → emitted macro
    // `PLAYER_HP_ENABLED` never flips on and the emitted damage code
    // does nothing.  Error so the pupil fixes one or the other.
    function hpZeroWithDamage(state) {
      if (!moduleEnabled(state, 'damage')) return null;
      const p1 = moduleNode(state, 'players.player1');
      const p1Hp = (p1 && p1.config && p1.config.maxHp) | 0;
      if (p1Hp > 0) return null;            // P1 mortal — nothing to flag here
      // P1 is invincible. Only an error if P2 can't take damage either.
      const p2On = moduleEnabled(state, 'players.player2');
      const p2 = p2On ? moduleNode(state, 'players.player2') : null;
      const p2Hp = (p2 && p2.config && p2.config.maxHp) | 0;
      const p2Mortal = p2On && p2Hp > 0;
      if (p2Mortal) {
        // Assist mode: P1 invincible, P2 takes damage. Valid — warn only.
        return {
          id: 'hp-zero-with-damage',
          severity: 'warn',
          message: 'Damage is on and Player 1’s Max HP is 0 — Player 1 is invincible (only Player 2 can be hurt).',
          fix: 'Raise Player 1 → Max HP if you want P1 to take damage too, or leave it at 0 for an "assist mode" co-op feel.',
          jumpTo: null,
        };
      }
      // Neither player can take damage: the whole Damage module is a no-op.
      return {
        id: 'hp-zero-with-damage',
        severity: 'error',
        message: 'Damage is on but no player can take damage — enemies will never hurt anyone.',
        fix: 'Raise Player 1 → Max HP above 0 (or Player 2’s if P2 is on), or turn Damage off.',
        jumpTo: null,
      };
    },

    // V11: Damage on but no Enemy-tagged sprite exists.  Warn —
    // game builds but nothing ever hits the player.
    function damageNoEnemies(state) {
      if (!moduleEnabled(state, 'damage')) return null;
      if (countSpritesByRole(state, 'enemy') > 0) return null;
      return {
        id: 'damage-no-enemies',
        severity: 'warn',
        message: 'Damage is on, but no sprite is tagged Enemy.',
        fix: 'Tag a sprite as Enemy on the Sprites page so there\'s ' +
          'something to take damage from.',
        jumpTo: 'sprites.html',
      };
    },

    // V16: dialogue module ticked but no sprite tagged NPC.  Error —
    // without an NPC on screen there's nobody for the player to
    // walk up to, so the trigger can never fire.
    function dialogueNoNpc(state) {
      if (!moduleEnabled(state, 'dialogue')) return null;
      if (countSpritesByRole(state, 'npc') > 0) return null;
      return {
        id: 'dialogue-no-npc',
        severity: 'error',
        message: 'Dialogue is on but no sprite is tagged NPC.',
        fix: 'Open the Sprites page and set a sprite\'s role to NPC — ' +
          'that\'s who the player talks to.',
        jumpTo: 'sprites.html',
      };
    },

    // V17: dialogue on but the text is empty → no point.  Warn only.
    function dialogueEmptyText(state) {
      if (!moduleEnabled(state, 'dialogue')) return null;
      const d = moduleNode(state, 'dialogue');
      const text = (d && d.config && d.config.text) || '';
      if (text.trim().length > 0) return null;
      return {
        id: 'dialogue-empty-text',
        severity: 'warn',
        message: 'Dialogue is on but the text is blank — the NPC ' +
          'will show an empty box.',
        fix: 'Type something in the "What the NPC says" field on the ' +
          'Dialogue module.',
        jumpTo: null,
      };
    },

    // V17b (web-feedback F1b / F23, bug 31): dialogue uses characters the
    // built-in font doesn't include.  As of 2026-06-18 the server auto-seeds
    // an UPPERCASE font into blank bg tiles whenever dialogue is on, and the
    // assembler uppercases text at emit — so ordinary words "just work" with
    // no painting.  What still renders as garbage is a character *outside*
    // that font set (unusual punctuation, accented letters, …).  Warn (not
    // error) so the pupil can still Play but knows which characters won't show.
    function dialogueUnsupportedChars(state) {
      if (!moduleEnabled(state, 'dialogue')) return null;
      // Mirror the keys of tools/playground_server.py `_DIALOGUE_FONT`.
      const SUPPORTED = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,!?'-:";
      const d = moduleNode(state, 'dialogue');
      const cfg = (d && d.config) || {};
      const texts = [cfg.text, cfg.text2, cfg.text3];
      // Per-NPC override text lives on NPC-role scene instances as `text`.
      const sceneNode = moduleNode(state, 'scene');
      const insts = (sceneNode && sceneNode.config &&
        Array.isArray(sceneNode.config.instances))
        ? sceneNode.config.instances : [];
      const sprites = state.sprites || [];
      for (const inst of insts) {
        if (!inst) continue;
        const sp = sprites[inst.spriteIdx];
        if (sp && sp.role === 'npc' && typeof inst.text === 'string') {
          texts.push(inst.text);
        }
      }
      const bad = new Set();
      for (const t of texts) {
        if (!t) continue;
        for (const ch of String(t).toUpperCase()) {
          if (SUPPORTED.indexOf(ch) < 0) bad.add(ch);
        }
      }
      if (bad.size === 0) return null;
      const list = Array.from(bad).map(c => '"' + c + '"').join(' ');
      return {
        id: 'dialogue-unsupported-chars',
        severity: 'warn',
        message: 'Dialogue uses character(s) the built-in font does not ' +
          'include (' + list + ') — those will show as blank or garbage tiles.',
        fix: 'Stick to letters, numbers, spaces and . , ! ? \' - : — or paint ' +
          'your own tile for that character at its ASCII slot on the ' +
          'Backgrounds page.',
        jumpTo: null,
      };
    },

    // V18: doors with targetBgIdx set beyond the painted
    // backgrounds → room swap would reference a nonexistent
    // bg_nametable_<n>[].  Error because the build will actually
    // fail at emission if this sneaks through; catch it early
    // with a clear message.
    function doorsTargetBgOutOfRange(state) {
      if (!moduleEnabled(state, 'doors')) return null;
      const d = moduleNode(state, 'doors');
      const target = (d && d.config && d.config.targetBgIdx);
      if (target == null || target < 0) return null;  // same-room
      const bgs = (state && state.backgrounds) || [];
      if ((target | 0) < bgs.length) return null;
      return {
        id: 'doors-target-invalid-bg',
        severity: 'error',
        message: 'Doors → Target background is ' + target + ' but ' +
          'you only have ' + bgs.length + ' background' +
          (bgs.length === 1 ? '' : 's') + '.',
        fix: 'Open the Backgrounds page and add more backgrounds, ' +
          'or drop the Target number down to a valid index (or -1 ' +
          'for a same-room teleport).',
        jumpTo: 'index.html',
      };
    },

    // V14: doors ticked but no DOOR behaviour tile painted on the
    // active background → teleport will never trigger.  Error so
    // the pupil fixes one or the other.
    function doorsNoDoorTiles(state) {
      if (!moduleEnabled(state, 'doors')) return null;
      if (countTilesByBehaviourName(state, 'door') > 0) return null;
      return {
        id: 'doors-no-door-tiles',
        severity: 'error',
        message: 'Doors is on but no tile is painted Door on this ' +
          'background — the teleport will never trigger.',
        fix: 'Open the Behaviour page, pick Door from the type list, ' +
          'and paint at least one tile.',
        jumpTo: 'behaviour.html',
      };
    },

    // V13: a tagged enemy+walk animation exists but no enemy-roled
    // sprite has its matching W×H.  Warn — the animation simply
    // won't play (template's size check filters mismatches) but the
    // pupil probably meant it to.  Checks frames[0]'s dimensions
    // against every role=enemy sprite; match any = OK.
    function enemyWalkAnimSizeMismatch(state) {
      const anims = (state && state.animations) || [];
      const sprites = (state && state.sprites) || [];
      const anim = anims.find(a => a && a.role === 'enemy' && a.style === 'walk');
      if (!anim || !Array.isArray(anim.frames) || anim.frames.length === 0) return null;
      const first = sprites[anim.frames[0] | 0];
      if (!first) return null;
      const w = first.width | 0;
      const h = first.height | 0;
      const match = sprites.some(sp =>
        sp && sp.role === 'enemy' &&
        (sp.width | 0) === w && (sp.height | 0) === h);
      if (match) return null;
      return {
        id: 'enemy-walk-anim-size-mismatch',
        severity: 'warn',
        message: 'An Enemy + Walk animation exists (' + w + '×' + h +
          ') but no sprite tagged Enemy shares that size — the ' +
          'animation will not play on any of your enemies.',
        fix: 'Either resize an Enemy sprite to ' + w + '×' + h + ' or ' +
          'change the animation\'s frames on the Sprites page so its ' +
          'sprites match your enemy size.',
        jumpTo: 'sprites.html',
      };
    },

    // V12: HUD on but no HUD-tagged sprite.  Warn — HUD silently
    // won\'t render.  Upgraded to error would block a valid state
    // where the pupil has ticked HUD but isn\'t ready yet; warn is
    // nicer to work-in-progress projects.
    function hudNoSprite(state) {
      if (!moduleEnabled(state, 'hud')) return null;
      if (countSpritesByRole(state, 'hud') > 0) return null;
      return {
        id: 'hud-no-sprite',
        severity: 'warn',
        message: 'HUD is on, but no sprite is tagged HUD.',
        fix: 'Tag a small sprite (a heart, a coin icon…) as HUD on ' +
          'the Sprites page so the hearts have something to draw.',
        jumpTo: 'sprites.html',
      };
    },

    // V9: Player 2 is enabled but fewer than 2 sprites are tagged
    // Player on the Sprites page.  Error — the server would fall back
    // to single-player, but the pupil's intent was 2-player so we
    // block instead of silently ignoring.
    function player2NeedsSecondSprite(state) {
      if (!moduleEnabled(state, 'players.player2')) return null;
      if (countSpritesByRole(state, 'player') >= 2) return null;
      return {
        id: 'player2-needs-second-sprite',
        severity: 'error',
        message: 'Player 2 is on, but fewer than 2 sprites are tagged Player.',
        fix: 'Open the Sprites page and set a second sprite\'s role to ' +
          'Player.  The first tagged sprite drives Player 1, the second ' +
          'drives Player 2.',
        jumpTo: 'sprites.html',
      };
    },

    // V8: all_pickups_collected win, pickups module on, but no sprite
    // is actually tagged ROLE_PICKUP.  Error — the game can never end.
    function allPickupsWinNoSprites(state) {
      if (!moduleEnabled(state, 'win_condition')) return null;
      const node = moduleNode(state, 'win_condition');
      const cfg = (node && node.config) || {};
      if ((cfg.type || 'reach_tile') !== 'all_pickups_collected') return null;
      if (!moduleEnabled(state, 'pickups')) return null;
      if (countSpritesByRole(state, 'pickup') > 0) return null;
      return {
        id: 'all-pickups-no-sprites',
        severity: 'error',
        message: '"Collect every Pickup" is on but no sprite is ' +
          'tagged Pickup.',
        fix: 'Open the Sprites page and set at least one sprite\'s ' +
          'role to Pickup.  Without a pickup on the level the game ' +
          'can never end.',
        jumpTo: 'sprites.html',
      };
    },

    // V11 (BR-03): the players alone must not exceed the NES's 64 hardware
    // sprites.  Each 8x8-tile cell of a Player sprite is one hardware sprite
    // (4 OAM bytes); Player 1 renders first, then Player 2.  An 8x8 P1 fills
    // the whole 256-byte OAM shadow buffer by itself, so any P2 on top would
    // overrun it.  Blocking — this is the unsafe-memory case.
    function playerOamOverflow(state) {
      const players = sprites(state).filter(function (s) {
        return s && s.role === 'player';
      });
      if (!players.length) return null;
      const cells = function (s) {
        return Math.max(1, (s.width | 0)) * Math.max(1, (s.height | 0));
      };
      let total = cells(players[0]);
      const p2On = moduleEnabled(state, 'players.player2') && players.length >= 2;
      if (p2On) total += cells(players[1]);
      if (total <= 64) return null;
      return {
        id: 'player-oam-overflow',
        severity: 'error',
        message: 'Player 1' + (p2On ? ' + Player 2' : '') + ' need ' + total +
          ' hardware sprites, but the NES only has 64.',
        fix: p2On
          ? 'Make the two Player sprites smaller on the Sprites page so ' +
            'their tile cells add up to 64 or fewer (for example two 5x6 ' +
            'players, or one 8x8 and one tiny P2).'
          : 'Make the Player sprite smaller on the Sprites page — at most ' +
            '64 tile cells (e.g. 8x8).',
        jumpTo: 'sprites.html',
      };
    },

    // V12 (BR-03): everything drawn each frame — players, placed Scene
    // instances and HUD hearts — shares the same 64 hardware sprites.  When
    // the total clearly exceeds 64 the engine safely drops the overflow
    // (scene/HUD/spawn writes are bounds-guarded), so this is a warning, not
    // an error: some sprites simply won't appear.
    function frameOamBudgetTight(state) {
      const all = sprites(state);
      const players = all.filter(function (s) { return s && s.role === 'player'; });
      if (!players.length) return null;
      const cells = function (s) {
        return s ? Math.max(1, (s.width | 0)) * Math.max(1, (s.height | 0)) : 0;
      };
      let total = cells(players[0]);
      if (moduleEnabled(state, 'players.player2') && players.length >= 2) {
        total += cells(players[1]);
      }
      // Placed scene instances each cost their sprite's cell count.
      if (moduleEnabled(state, 'scene')) {
        const node = moduleNode(state, 'scene');
        const instances = (node && node.config && node.config.instances) || [];
        for (const inst of instances) total += cells(all[inst.spriteIdx]);
      }
      // HUD draws one heart sprite per point of Player 1 max HP.
      if (moduleEnabled(state, 'hud')) {
        const p1 = moduleNode(state, 'players.player1');
        const maxHp = (p1 && p1.config && (p1.config.maxHp | 0)) || 0;
        const hudSprite = all.find(function (s) { return s && s.role === 'hud'; });
        total += maxHp * (hudSprite ? cells(hudSprite) : 1);
      }
      if (total <= 64) return null;
      return {
        id: 'frame-oam-budget-tight',
        severity: 'warn',
        message: 'Your players, scene sprites and HUD hearts add up to about ' +
          total + ' hardware sprites, over the NES limit of 64.',
        fix: 'The game will still run, but some sprites won\'t be drawn each ' +
          'frame.  Reduce sprite sizes, place fewer Scene instances, or lower ' +
          'Player 1\'s max HP to stay within 64.',
        jumpTo: null,
      };
    },

    // V13 (BR-04): the trigger-tile Spawn effect must point at a real sprite.
    // The picker is now a dropdown, but imported / hand-edited / deleted-sprite
    // projects can still hold an out-of-range index, which used to surface as a
    // late cc65 error (missing SPAWN_* tables).  Blocking — catch it in Builder.
    function spawnTriggerInvalidSprite(state) {
      if (!moduleEnabled(state, 'spawn')) return null;
      const cfg = (moduleNode(state, 'spawn') || {}).config || {};
      const idx = cfg.spriteIdx;
      if (Number.isInteger(idx) && idx >= 0 && idx < sprites(state).length) return null;
      return {
        id: 'spawn-trigger-invalid-sprite',
        severity: 'error',
        message: 'The Spawn effect points at sprite #' + idx +
          ', which does not exist.',
        fix: 'Choose an existing sprite in the Spawn effect\'s dropdown, or ' +
          'draw the sprite on the Sprites page first.',
        jumpTo: null,
      };
    },

    // V14 (BR-04): same check for the Damage module's "show an effect sprite
    // when hit".  Only when that option is ticked.
    function damageEffectInvalidSprite(state) {
      if (!moduleEnabled(state, 'damage')) return null;
      const cfg = (moduleNode(state, 'damage') || {}).config || {};
      if (!cfg.spawnOnHit) return null;
      const idx = cfg.spawnSpriteIdx;
      if (Number.isInteger(idx) && idx >= 0 && idx < sprites(state).length) return null;
      return {
        id: 'damage-effect-invalid-sprite',
        severity: 'error',
        message: 'The "show an effect sprite when hit" option points at sprite #' +
          idx + ', which does not exist.',
        fix: 'Choose an existing sprite in the Damage module\'s effect dropdown, ' +
          'or draw the sprite on the Sprites page first.',
        jumpTo: null,
      };
    },

    // (BR-05 model B: the trigger and hit effects are now genuinely independent
    // — each has its own art + lifetime in the engine — so the old
    // "shared-effect conflict" warning was removed.  Nothing to validate here.)

    // V16 (BR-08): checkpoint respawn HP must not exceed Player 1's max HP.
    // The generated code now clamps it, so this is a warning that the value
    // will be capped (and catches imported / stale states).
    function respawnHpOverMax(state) {
      if (!moduleEnabled(state, 'damage')) return null;
      const dm = (moduleNode(state, 'damage') || {}).config || {};
      if (!dm.checkpoints) return null;
      const respawn = dm.respawnHp | 0;
      const p1 = (moduleNode(state, 'players.player1') || {}).config || {};
      const maxHp = p1.maxHp | 0;
      if (maxHp <= 0 || respawn <= maxHp) return null;
      return {
        id: 'respawn-hp-over-max',
        severity: 'warn',
        message: 'Respawn HP (' + respawn + ') is higher than Player 1\'s max ' +
          'HP (' + maxHp + '), so it will be capped at ' + maxHp + ' on respawn.',
        fix: 'Lower "HP restored on respawn" to ' + maxHp + ' or less, or raise ' +
          'Player 1\'s max HP.',
        jumpTo: null,
      };
    },
  ];

  function validate(state) {
    const problems = [];
    for (const fn of VALIDATORS) {
      try {
        const p = fn(state);
        if (p) problems.push(p);
      } catch (e) {
        if (typeof console !== 'undefined') {
          console.error('[builder] validator threw:', e);
        }
      }
    }
    return problems;
  }

  function hasErrors(problems) {
    return problems.some(function (p) { return p.severity === 'error'; });
  }

  window.BuilderValidators = { validate, hasErrors };
})();
