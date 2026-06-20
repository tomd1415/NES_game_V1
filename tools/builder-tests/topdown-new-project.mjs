// BR-01 — new Top-down projects must assemble as Top-down, not Platformer.
//
// The earlier topdown.mjs suite builds a Builder state by hand and sets
// game.config.type directly, so it could never catch BR-01: the real
// new-project path never set that field.  This suite drives the ACTUAL
// seeding path — migrateBuilderFields() extracted verbatim from index.html
// and sprites.html — which is what both pages now call when creating a
// project, and asserts:
//
//   1) migrateBuilderFields({template:'topdown'}) seeds game.config.type
//      = 'topdown' (and 'platformer' / default otherwise), on BOTH pages.
//   2) A state seeded that way assembles to C containing an anchored
//      `#define BW_GAME_STYLE 1`; a platformer-seeded state does not.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/home/duguid/projects/nesgame/attempt1';
const WEB  = path.join(ROOT, 'tools', 'tile_editor_web');

function fail(msg) { console.error('FAIL:', msg); process.exit(1); }
function assert(cond, msg) { if (!cond) fail(msg); }

// Pull a top-level `function name(...) { ... }` out of a source file by
// brace-counting from its declaration.
function extractFunction(src, name) {
  const start = src.indexOf('function ' + name);
  if (start < 0) fail('could not find function ' + name);
  let i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(start, i);
}

// --- 1) migrateBuilderFields seeding, per page ---------------------------
for (const page of ['index.html', 'sprites.html']) {
  const html = fs.readFileSync(path.join(WEB, page), 'utf8');
  const fnSrc = extractFunction(html, 'migrateBuilderFields');
  // Expose the extracted function and call it on minimal states.
  const migrate = new Function(fnSrc + '\nreturn migrateBuilderFields;')();

  const td = { template: 'topdown' };   migrate(td);
  assert(td.builder?.modules?.game?.config?.type === 'topdown',
    `${page}: Top-down project did not seed game.config.type = 'topdown' ` +
    `(got '${td.builder?.modules?.game?.config?.type}')`);

  const pf = { template: 'platformer' }; migrate(pf);
  assert(pf.builder.modules.game.config.type === 'platformer',
    `${page}: Platformer project did not seed game.config.type = 'platformer'`);

  const def = {}; migrate(def);
  assert(def.builder.modules.game.config.type === 'platformer',
    `${page}: default (no template) did not fall back to 'platformer'`);

  console.log(`✓ ${page}: migrateBuilderFields seeds the canonical game type from template`);
}

// --- 2) End-to-end: a Top-down-seeded state assembles with BW_GAME_STYLE 1
globalThis.window = globalThis;
for (const f of ['sprite-render.js', 'builder-assembler.js',
    'builder-modules.js', 'builder-validators.js']) {
  new Function(fs.readFileSync(path.join(WEB, f), 'utf8'))();
}
const tpl = fs.readFileSync(path.join(WEB, 'builder-templates/platformer.c'), 'utf8');
const migrate = new Function(
  extractFunction(fs.readFileSync(path.join(WEB, 'index.html'), 'utf8'),
    'migrateBuilderFields') + '\nreturn migrateBuilderFields;')();

const mkCells = (w, h, t = 1) => Array.from({ length: h }, () =>
  Array.from({ length: w }, () => ({ tile: t, palette: 0, empty: false })));

function baseState(template) {
  const s = {
    name: 'br01', version: 1, universal_bg: 0x21, template,
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
  };
  migrate(s);   // the real seeding path
  return s;
}

const STYLE_RE = /^\s*#define\s+BW_GAME_STYLE\s+1\s*$/m;

const tdC = window.BuilderAssembler.assemble(baseState('topdown'), tpl);
assert(STYLE_RE.test(tdC),
  'Top-down state (seeded via migrateBuilderFields) did not assemble ' +
  'an anchored `#define BW_GAME_STYLE 1`');
console.log('✓ Top-down new-project state assembles with #define BW_GAME_STYLE 1');

const pfC = window.BuilderAssembler.assemble(baseState('platformer'), tpl);
assert(!STYLE_RE.test(pfC),
  'Platformer state wrongly emitted `#define BW_GAME_STYLE 1`');
console.log('✓ Platformer new-project state does NOT define BW_GAME_STYLE 1');

console.log('\nBR-01 topdown-new-project: all checks passed');
