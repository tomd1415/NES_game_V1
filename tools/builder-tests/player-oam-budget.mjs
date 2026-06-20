// BR-03 — Builder validators for the player / frame OAM budget.
//
// The NES has 64 hardware sprites (a 256-byte OAM shadow buffer).  Each
// 8x8-tile cell of a Player sprite is one hardware sprite.  Player 1 + 2
// alone must fit in 64 (blocking — overrunning the buffer is unsafe RAM
// access); the full per-frame budget (players + scene + HUD) over 64 is a
// warning (the engine safely drops the overflow).
//
// This drives the real builder-validators.js headless.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/home/duguid/projects/nesgame/attempt1';
const WEB  = path.join(ROOT, 'tools', 'tile_editor_web');

function fail(msg) { console.error('FAIL:', msg); process.exit(1); }
function assert(cond, msg) { if (!cond) fail(msg); }

globalThis.window = globalThis;
new Function(fs.readFileSync(path.join(WEB, 'builder-validators.js'), 'utf8'))();
const V = window.BuilderValidators;

const sprite = (role, w, h) => ({ role, width: w, height: h, name: role });

function mkState({ p1, p2, p2on, scene, hud, p1MaxHp } = {}) {
  const sprites = [];
  if (p1) sprites.push(sprite('player', p1[0], p1[1]));
  if (p2) sprites.push(sprite('player', p2[0], p2[1]));
  if (scene) sprites.push(sprite('enemy', scene.w, scene.h)); // spriteIdx of this
  const sceneIdx = sprites.length - 1;
  if (hud) sprites.push(sprite('hud', 1, 1));
  return {
    sprites,
    builder: {
      version: 1,
      modules: {
        game: { enabled: true, config: { type: 'platformer' } },
        players: {
          enabled: true, config: { count: p2on ? 2 : 1 },
          submodules: {
            player1: { enabled: true, config: { maxHp: p1MaxHp || 0 } },
            player2: { enabled: !!p2on, config: {} },
          },
        },
        scene: scene
          ? { enabled: true, config: { instances: Array.from({ length: scene.count },
              () => ({ spriteIdx: sceneIdx, x: 50, y: 50 })) } }
          : { enabled: false, config: { instances: [] } },
        hud: { enabled: !!hud, config: {} },
      },
    },
  };
}

const hasId = (problems, id) => problems.some(p => p.id === id);
const idSeverity = (problems, id) => (problems.find(p => p.id === id) || {}).severity;

// 1) Two 8x8 players, P2 on → 128 cells → blocking overflow error.
let p = V.validate(mkState({ p1: [8, 8], p2: [8, 8], p2on: true }));
assert(hasId(p, 'player-oam-overflow'), 'two 8x8 players did not trip player-oam-overflow');
assert(idSeverity(p, 'player-oam-overflow') === 'error', 'player-oam-overflow must be an error');
console.log('✓ two 8x8 players (P2 on) → blocking player-oam-overflow error');

// 2) Two 5x6 players (30+30=60) → within 64, no overflow.
p = V.validate(mkState({ p1: [5, 6], p2: [5, 6], p2on: true }));
assert(!hasId(p, 'player-oam-overflow'), 'two 5x6 players (60 cells) wrongly flagged overflow');
console.log('✓ two 5x6 players (60 cells) → no overflow');

// 3) Single 8x8 player, P2 off → exactly 64, safe, no error.
p = V.validate(mkState({ p1: [8, 8], p2on: false }));
assert(!hasId(p, 'player-oam-overflow'), 'single 8x8 player (64 cells) wrongly flagged overflow');
console.log('✓ single 8x8 player (64 cells, P2 off) → no overflow');

// 4) Large P2 enabled but only ONE player sprite tagged → P2 not counted
//    (player2NeedsSecondSprite covers that case instead).
p = V.validate(mkState({ p1: [8, 8], p2on: true }));
assert(!hasId(p, 'player-oam-overflow'),
  'overflow should not count P2 when no second player sprite exists');
console.log('✓ P2 on but only one player sprite → overflow not counted (handled elsewhere)');

// 5) Full-frame budget: 8x8 P1 (64) + a scene enemy instance → warning.
p = V.validate(mkState({ p1: [8, 8], scene: { w: 2, h: 2, count: 1 } }));
assert(hasId(p, 'frame-oam-budget-tight'), 'over-budget frame did not warn');
assert(idSeverity(p, 'frame-oam-budget-tight') === 'warn', 'frame budget must be a warning');
console.log('✓ 8x8 P1 + scene instance over 64 → frame-oam-budget-tight warning');

// 6) Modest project (2x2 P1, one 2x2 enemy = 8) → no budget warning.
p = V.validate(mkState({ p1: [2, 2], scene: { w: 2, h: 2, count: 1 } }));
assert(!hasId(p, 'frame-oam-budget-tight'), 'small project wrongly warned on frame budget');
console.log('✓ small project well under 64 → no frame-budget warning');

console.log('\nBR-03 player-oam-budget: all checks passed');
