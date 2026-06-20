// BR-08 — checkpoint respawn HP must never exceed Player 1's max HP.
//   * Generated C clamps player_hp on respawn (no more 9 HP when max is 1).
//   * A Builder validator warns when the configured respawn HP is over max.
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
const tpl = fs.readFileSync(path.join(WEB, 'builder-templates/platformer.c'), 'utf8');

const mkCells = (w, h, t = 1) => Array.from({ length: h }, () =>
  Array.from({ length: w }, () => ({ tile: t, palette: 0, empty: false })));

function mkState(maxHp, respawnHp) {
  const s = {
    name: 'br08', version: 1, universal_bg: 0x21,
    sprites: [{ role: 'player', name: 'hero', width: 2, height: 2, cells: mkCells(2, 2) }],
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
  m.players.submodules.player1.enabled = true;
  m.players.submodules.player1.config.maxHp = maxHp;
  m.damage.enabled = true;
  Object.assign(m.damage.config, { checkpoints: true, respawnHp });
  return s;
}

// 1) Generated C clamps the respawn assignment to PLAYER_MAX_HP.
const c = window.BuilderAssembler.assemble(mkState(1, 9), tpl);
assert(/player_hp\s*=\s*\(BW_RESPAWN_HP\s*<\s*PLAYER_MAX_HP\)/.test(c),
  'respawn does not clamp player_hp to PLAYER_MAX_HP');
assert(!/player_hp\s*=\s*BW_RESPAWN_HP\s*;/.test(c),
  'generated C still assigns the un-clamped BW_RESPAWN_HP');
console.log('✓ generated C clamps respawn HP to PLAYER_MAX_HP');

// 2) Validator warns when respawn HP exceeds max HP.
let p = window.BuilderValidators.validate(mkState(1, 9));
const warn = p.find(x => x.id === 'respawn-hp-over-max');
assert(warn && warn.severity === 'warn', 'over-max respawn HP did not warn');
console.log('✓ validator warns when respawn HP (9) exceeds max HP (1)');

// 3) No warning when respawn HP is within max.
p = window.BuilderValidators.validate(mkState(5, 3));
assert(!p.some(x => x.id === 'respawn-hp-over-max'),
  'in-range respawn HP wrongly warned');
console.log('✓ no warning when respawn HP (3) is within max HP (5)');

console.log('\nBR-08 respawn-hp: all checks passed');
