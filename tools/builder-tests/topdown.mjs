// Phase 3.1 smoke test — RPG / top-down preset.
//
// The Builder's `game` module now picks between platformer (default)
// and top-down by emitting `#define BW_GAME_STYLE 1` into the
// declarations slot.  The template's `#if BW_GAME_STYLE == 0/1` blocks
// switch the player-vertical pipeline accordingly:
//
//   * Platformer: ladder probe + edge-triggered jump + gravity loop
//     + scene-sprite gravity.  Default; emits nothing extra.
//   * Top-down: 4-way movement with wall collision, no jump, no
//     gravity.  Emits the BW_GAME_STYLE macro.
//
// This suite exercises both paths end-to-end:
//
//   T1. Default (no game.config.type set) → emits no BW_GAME_STYLE
//       macro; assembled C still contains the platformer ladder/jump
//       blocks (as compiled into the template).
//   T2. style=platformer explicitly → same shape as T1.
//   T3. style=topdown → emits `#define BW_GAME_STYLE 1`; the assembled
//       C contains the top-down 4-way movement comment marker but the
//       platformer "Ladder probe" block is now gated behind
//       `#if BW_GAME_STYLE == 0`.
//   T4. /play end-to-end with style=topdown — the ROM compiles + links
//       cleanly with cc65, returning a non-trivial NES image.
//
// Port 18793 keeps us out of the way of the other suites.

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = '/home/duguid/projects/nesgame/attempt1';
const WEB  = path.join(ROOT, 'tools', 'tile_editor_web');
const PORT = 18793;

globalThis.window = globalThis;
for (const f of ['sprite-render.js', 'builder-assembler.js',
    'builder-modules.js', 'builder-validators.js']) {
  new Function(fs.readFileSync(path.join(WEB, f), 'utf8'))();
}
const tpl = fs.readFileSync(
  path.join(WEB, 'builder-templates/platformer.c'), 'utf8');

const mkCells = (w, h, t = 1) => Array.from({ length: h }, () =>
  Array.from({ length: w }, () => ({ tile: t, palette: 0, empty: false })));

function mkState({ style } = {}) {
  const sprites = [
    { role: 'player', name: 'hero', width: 2, height: 2, cells: mkCells(2, 2) },
  ];
  const s = {
    name: 'topdown', version: 1, universal_bg: 0x21, sprites,
    animations: [], animation_assignments: { walk: null, jump: null },
    nextAnimationId: 1,
    sprite_tiles: Array.from({ length: 256 }, () => ({
      pixels: Array.from({ length: 8 }, () => Array(8).fill(0)), name: '',
    })),
    bg_tiles: Array.from({ length: 256 }, () => ({
      pixels: Array.from({ length: 8 }, () => Array(8).fill(0)), name: '',
    })),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x0F, 0x10, 0x30] })),
    backgrounds: [{
      name: 'bg', dimensions: { screens_x: 1, screens_y: 1 },
      nametable: Array.from({ length: 30 }, () =>
        Array.from({ length: 32 }, () => ({ tile: 0, palette: 0 }))),
      behaviour: (() => {
        const m = Array.from({ length: 30 }, () => Array(32).fill(0));
        for (let c = 0; c < 32; c++) m[28][c] = 1;
        return m;
      })(),
    }],
    behaviour_types: [
      { id: 0, name: 'none' }, { id: 1, name: 'solid_ground' },
      { id: 2, name: 'wall' }, { id: 3, name: 'platform' },
      { id: 4, name: 'door' }, { id: 5, name: 'trigger' },
      { id: 6, name: 'ladder' },
    ],
    selectedBgIdx: 0,
    builder: window.BuilderDefaults(),
  };
  if (style) {
    s.builder.modules.game.config.type = style;
  }
  return s;
}

// The template doesn't define BW_GAME_STYLE at all by default — cc65
// evaluates `#if UNDEFINED == 0` as true, so the platformer branch
// compiles when the Builder doesn't override the macro.  These tests
// look for the override — the assembler appends `#define BW_GAME_STYLE 1`
// to the declarations slot only when the pupil picks top-down.

// Helper: count REAL #define lines (skip comment text that happens to
// contain the same characters).  `^#define` with the `m` flag matches
// only at the start of a line, never in `// …` or `/* … */`.
function countRealDefines(src, name) {
  const re = new RegExp('^#define\\s+' + name + '\\b', 'gm');
  return (src.match(re) || []).length;
}

// T1: default state — no top-down override emitted; default platformer
// path stays intact via undefined-macro semantics.
{
  const out = window.BuilderAssembler.assemble(mkState(), tpl);
  if (countRealDefines(out, 'BW_GAME_STYLE') !== 0) {
    console.error('FAIL T1: default state should NOT contain any BW_GAME_STYLE define');
    process.exit(1);
  }
  if (!/Ladder probe/.test(out)) {
    console.error('FAIL T1b: platformer ladder block missing from default');
    process.exit(1);
  }
  console.log('✓ T1 default state — platformer baseline intact, no override emitted');
}

// T2: explicit platformer — same as default.
{
  const out = window.BuilderAssembler.assemble(mkState({ style: 'platformer' }), tpl);
  if (countRealDefines(out, 'BW_GAME_STYLE') !== 0) {
    console.error('FAIL T2: explicit platformer should NOT emit BW_GAME_STYLE');
    process.exit(1);
  }
  console.log('✓ T2 explicit platformer matches default behaviour');
}

// T3: top-down — override macro emitted, top-down block markers present.
{
  const out = window.BuilderAssembler.assemble(mkState({ style: 'topdown' }), tpl);
  if (countRealDefines(out, 'BW_GAME_STYLE') !== 1) {
    console.error('FAIL T3a: top-down should emit exactly one #define BW_GAME_STYLE 1');
    process.exit(1);
  }
  if (!/^#define BW_GAME_STYLE 1$/m.test(out)) {
    console.error('FAIL T3a-bis: emission should be `#define BW_GAME_STYLE 1`');
    process.exit(1);
  }
  // Comments inside the top-down block are still in the source —
  // the preprocessor keeps the text, only stripping the inactive
  // branch at compile time.  We assert the markers we expect to
  // see in either branch.
  if (!/Top-down vertical movement: 4-way step/.test(out)) {
    console.error('FAIL T3b: top-down vertical-movement block missing');
    process.exit(1);
  }
  if (!/Platformer vertical movement: ladders \+ jump \+ gravity/.test(out)) {
    console.error('FAIL T3c: platformer block (gated) should still be in source');
    process.exit(1);
  }
  console.log('✓ T3 top-down emits BW_GAME_STYLE macro + both blocks present in source');
}

// T4: /play end-to-end with top-down — ROM builds cleanly.
const srv = spawn('python3',
  [path.join(ROOT, 'tools', 'playground_server.py')],
  { env: { ...process.env, PLAYGROUND_PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'] });
await sleep(1500);
try {
  const s = mkState({ style: 'topdown' });
  const customMainC = window.BuilderAssembler.assemble(s, tpl);
  const r = await (await fetch(`http://127.0.0.1:${PORT}/play`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      state: s,
      playerSpriteIdx: 0,
      playerStart: { x: 60, y: 120 },
      sceneSprites: [],
      mode: 'browser',
      customMainC: customMainC,
    }),
  })).json();
  if (!r.ok) {
    console.error('FAIL T4: top-down /play build', r.stage);
    console.error((r.log || '').slice(-1800));
    process.exit(2);
  }
  if (typeof r.size !== 'number' || r.size < 1000) {
    console.error('FAIL T4b: top-down ROM unexpectedly small', r.size);
    process.exit(2);
  }
  console.log('✓ T4 top-down /play build (' + r.size + ' bytes, ' +
    r.build_time_ms + ' ms)');
} finally {
  srv.kill('SIGTERM');
  await sleep(300);
}

console.log('\nTop-down (Phase 3.1) smoke-test complete.');
