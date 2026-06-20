// BR-04 / BR-05 — spawn-effect sprite references + independent effects (model B).
//
// BR-04: the trigger Spawn effect and the Damage hit effect must point at real
//        sprites; an out-of-range index is blocked in Builder (it used to
//        surface as a late cc65 error).
// BR-05 (model B): the two effects are INDEPENDENT — the trigger drives kind 0
//        (SPAWN0_* / SPAWN_TTL_0) and the hit drives kind 1 (SPAWN1_* /
//        SPAWN_TTL_1), so each keeps its own art + lifetime.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/home/duguid/projects/nesgame/attempt1';
const WEB  = path.join(ROOT, 'tools', 'tile_editor_web');

function fail(msg) { console.error('FAIL:', msg); process.exit(1); }
function assert(cond, msg) { if (!cond) fail(msg); }

globalThis.window = globalThis;
for (const f of ['sprite-render.js', 'builder-assembler.js',
    'builder-modules.js', 'builder-validators.js']) {
  new Function(fs.readFileSync(path.join(WEB, f), 'utf8'))();
}
const V = window.BuilderValidators;

// 3 sprites → valid indices are 0,1,2.
function mkState({ spawn, damage } = {}) {
  return {
    sprites: [{ role: 'player' }, { role: 'enemy' }, { role: 'item' }],
    builder: {
      version: 1,
      modules: {
        spawn: spawn
          ? { enabled: true, config: { spriteIdx: spawn.spriteIdx, ttl: spawn.ttl } }
          : { enabled: false, config: { spriteIdx: 0, ttl: 24 } },
        damage: damage
          ? { enabled: true, config: {
              spawnOnHit: damage.spawnOnHit !== false,
              spawnSpriteIdx: damage.spawnSpriteIdx, spawnTtl: damage.spawnTtl } }
          : { enabled: false, config: { spawnOnHit: false, spawnSpriteIdx: 0, spawnTtl: 16 } },
      },
    },
  };
}
const has = (ps, id) => ps.some(p => p.id === id);
const sev = (ps, id) => (ps.find(p => p.id === id) || {}).severity;

// ---- BR-04: invalid sprite references are blocked ----------------------
let p = V.validate(mkState({ spawn: { spriteIdx: 31, ttl: 24 } }));
assert(has(p, 'spawn-trigger-invalid-sprite') && sev(p, 'spawn-trigger-invalid-sprite') === 'error',
  'out-of-range trigger spawn sprite not blocked');
console.log('✓ BR-04: trigger Spawn effect with missing sprite → blocking error');

p = V.validate(mkState({ spawn: { spriteIdx: 1, ttl: 24 } }));
assert(!has(p, 'spawn-trigger-invalid-sprite'), 'valid trigger sprite wrongly flagged');
console.log('✓ BR-04: trigger Spawn effect with a real sprite → no error');

p = V.validate(mkState({ damage: { spawnOnHit: true, spawnSpriteIdx: 9, spawnTtl: 16 } }));
assert(has(p, 'damage-effect-invalid-sprite') && sev(p, 'damage-effect-invalid-sprite') === 'error',
  'out-of-range damage effect sprite not blocked');
console.log('✓ BR-04: Damage hit effect with missing sprite → blocking error');

p = V.validate(mkState({ damage: { spawnOnHit: false, spawnSpriteIdx: 9, spawnTtl: 16 } }));
assert(!has(p, 'damage-effect-invalid-sprite'), 'damage effect off wrongly flagged');
console.log('✓ BR-04: Damage effect unticked → bad index ignored');

// ---- BR-05 model B: the two effects no longer "conflict" --------------
p = V.validate(mkState({
  spawn: { spriteIdx: 1, ttl: 7 },
  damage: { spawnOnHit: true, spawnSpriteIdx: 2, spawnTtl: 99 },
}));
assert(!has(p, 'spawn-effect-conflict'),
  'obsolete shared-effect conflict warning still fires (effects are independent now)');
console.log('✓ BR-05: different trigger/hit effects produce no conflict warning (independent)');

// ---- BR-05 model B: codegen emits two independent effects -------------
const tpl = fs.readFileSync(path.join(WEB, 'builder-templates/platformer.c'), 'utf8');
const mkCells = (w, h, t = 1) => Array.from({ length: h }, () =>
  Array.from({ length: w }, () => ({ tile: t, palette: 0, empty: false })));

function assembleBoth() {
  const s = {
    name: 'br05b', version: 1, universal_bg: 0x21,
    sprites: [
      { role: 'player', name: 'hero', width: 2, height: 2, cells: mkCells(2, 2) },
      { role: 'item', name: 'spark', width: 1, height: 1, cells: mkCells(1, 1) },
      { role: 'item', name: 'puff', width: 1, height: 1, cells: mkCells(1, 1) },
    ],
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    sprite_tiles: Array.from({ length: 256 }, () => ({
      pixels: Array.from({ length: 8 }, () => Array(8).fill(0)), name: '' })),
    bg_tiles: Array.from({ length: 256 }, () => ({
      pixels: Array.from({ length: 8 }, () => Array(8).fill(0)), name: '' })),
    bg_palettes: [[0x21, 1, 2, 3], [0x21, 4, 5, 6], [0x21, 7, 8, 9], [0x21, 10, 11, 12]],
    sprite_palettes: [[0x21, 1, 2, 3], [0x21, 4, 5, 6], [0x21, 7, 8, 9], [0x21, 10, 11, 12]],
    backgrounds: [{ name: 'bg', cells: mkCells(32, 30, 0), palette_map: [] }],
    selectedBgIdx: 0, behaviourTypes: [], reactionMaps: {},
    builder: window.BuilderDefaults(),
  };
  const m = s.builder.modules;
  m.spawn.enabled = true;
  Object.assign(m.spawn.config, { spriteIdx: 1, ttl: 7 });    // trigger: spark, 7f
  m.damage.enabled = true;
  Object.assign(m.damage.config, { spawnOnHit: true, spawnSpriteIdx: 2, spawnTtl: 99 }); // hit: puff, 99f
  return window.BuilderAssembler.assemble(s, tpl);
}

const c = assembleBoth();
assert(/#define\s+BW_SPAWN0_ENABLED\s+1/.test(c), 'trigger effect did not enable kind 0');
assert(/#define\s+BW_SPAWN1_ENABLED\s+1/.test(c), 'hit effect did not enable kind 1');
assert(/#define\s+SPAWN_TTL_0\s+7/.test(c),  'trigger lifetime (7) not emitted as SPAWN_TTL_0');
assert(/#define\s+SPAWN_TTL_1\s+99/.test(c), 'hit lifetime (99) not emitted as SPAWN_TTL_1');
assert(/bw_spawn\(px,\s*py,\s*0\)/.test(c), 'trigger does not call bw_spawn(..., 0)');
assert(/bw_spawn\(px,\s*py,\s*1\)/.test(c), 'hit does not call bw_spawn(..., 1)');
console.log('✓ BR-05 model B: codegen emits independent kind-0 / kind-1 effects with own TTLs');

console.log('\nBR-04/BR-05 spawn-effect-refs: all checks passed');
