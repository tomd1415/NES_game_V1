// Batch-A smoke test — the shared play-pipeline.js helper.
//
// Covers:
//   P1. buildPlayRequest on a *completely* empty state (no sprites at
//       all, no Builder tree).  The pipeline must inject a stub player
//       so the ROM still builds.
//   P2. buildPlayRequest on a legacy state (no state.builder) — should
//       migrate to BuilderDefaults() silently.
//   P3. buildPlayRequest honours opts.customMainC / customMainAsm and
//       skips the BuilderAssembler when supplied.
//   P4. End-to-end /play build of the empty-state ROM — the server must
//       accept the fortified payload and compile + link a valid .nes.
//   P5. Byte-identical payload regardless of which "page" loaded the
//       state (proves items 1/10 — same settings from any page).
//
// Port 18792 keeps us out of the way of the other suites.

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = '/home/duguid/projects/nesgame/attempt1';
const WEB  = path.join(ROOT, 'tools', 'tile_editor_web');
const PORT = 18792;

// Load the browser JS into a Node sandbox using the same pattern as
// the other suites.  Every file sets things on `window`; we point
// `window` at globalThis so the modules see each other.
globalThis.window = globalThis;
for (const f of ['sprite-render.js', 'builder-assembler.js',
    'builder-modules.js', 'builder-validators.js',
    'play-pipeline.js']) {
  new Function(fs.readFileSync(path.join(WEB, f), 'utf8'))();
}
const tpl = fs.readFileSync(
  path.join(WEB, 'builder-templates/platformer.c'), 'utf8');

// Helpers shared with the other suites.
const mkCells = (w, h, t = 1) => Array.from({ length: h }, () =>
  Array.from({ length: w }, () => ({ tile: t, palette: 0, empty: false })));

function blankState() {
  return {
    name: 'shared-play', version: 1, universal_bg: 0x21,
    sprites: [],
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
      behaviour: Array.from({ length: 30 }, () => Array(32).fill(0)),
    }],
    behaviour_types: [
      { id: 0, name: 'none' }, { id: 1, name: 'solid_ground' },
      { id: 2, name: 'wall' }, { id: 3, name: 'platform' },
    ],
    selectedBgIdx: 0,
    // `builder` deliberately omitted so we exercise the migration path.
  };
}

// -------------------------------------------------------------------
// P1. Empty state still produces a valid payload.
// -------------------------------------------------------------------
{
  const payload = window.PlayPipeline.buildPlayRequest(blankState(), tpl, {});
  if (payload.playerSpriteIdx !== 0) {
    console.error('FAIL P1a: expected stub player at idx 0, got',
      payload.playerSpriteIdx);
    process.exit(1);
  }
  if (!Array.isArray(payload.state.sprites) ||
      payload.state.sprites.length < 1) {
    console.error('FAIL P1b: expected pipeline to inject a stub sprite');
    process.exit(1);
  }
  if (payload.state.sprites[0].role !== 'player') {
    console.error('FAIL P1c: stub sprite should have role=player');
    process.exit(1);
  }
  if (payload.sceneSprites.length !== 0) {
    console.error('FAIL P1d: empty project should produce empty sceneSprites');
    process.exit(1);
  }
  if (typeof payload.customMainC !== 'string' ||
      payload.customMainC.length < 100) {
    console.error('FAIL P1e: customMainC should be a non-trivial string');
    process.exit(1);
  }
  console.log('✓ P1 empty state → fortified payload with stub player');
}

// -------------------------------------------------------------------
// P2. Legacy state (no state.builder) → Builder tree is backfilled.
// -------------------------------------------------------------------
{
  const s = blankState();
  if (s.builder) {
    console.error('FAIL P2 precondition: blankState should not have a builder tree');
    process.exit(1);
  }
  const payload = window.PlayPipeline.buildPlayRequest(s, tpl, {});
  if (!payload.state.builder || payload.state.builder.version !== 1) {
    console.error('FAIL P2: pipeline should add builder tree to legacy state');
    process.exit(1);
  }
  // Original state must be untouched (fortifyState clones).
  if (s.builder !== undefined) {
    console.error('FAIL P2b: pipeline mutated the caller state');
    process.exit(1);
  }
  console.log('✓ P2 legacy state migrated non-destructively');
}

// -------------------------------------------------------------------
// P3. opts.customMainC bypasses BuilderAssembler.
// -------------------------------------------------------------------
{
  const marker = '/* shared-play P3 sentinel */\nvoid main(void) { while(1); }';
  const payload = window.PlayPipeline.buildPlayRequest(blankState(), tpl, {
    customMainC: marker,
  });
  if (payload.customMainC !== marker) {
    console.error('FAIL P3a: expected raw customMainC to flow through unchanged');
    process.exit(1);
  }
  // Asm variant.
  const asmMarker = '.segment "CODE"\nrts';
  const p2 = window.PlayPipeline.buildPlayRequest(blankState(), null, {
    customMainAsm: asmMarker,
  });
  if (p2.customMainAsm !== asmMarker || p2.customMainC !== undefined) {
    console.error('FAIL P3b: expected customMainAsm path to skip customMainC');
    process.exit(1);
  }
  console.log('✓ P3 customMainC / customMainAsm bypass the assembler');
}

// -------------------------------------------------------------------
// P5. Same state → same payload regardless of "page" shape.
// (Runs before P4 because P4 needs a live server.)
// -------------------------------------------------------------------
{
  const base = blankState();
  // Clone so each "page" has its own object reference.
  const fromBackgrounds = JSON.parse(JSON.stringify(base));
  const fromSprites     = JSON.parse(JSON.stringify(base));
  const fromBuilder     = JSON.parse(JSON.stringify(base));
  const a = window.PlayPipeline.buildPlayRequest(fromBackgrounds, tpl, {});
  const b = window.PlayPipeline.buildPlayRequest(fromSprites,     tpl, {});
  const c = window.PlayPipeline.buildPlayRequest(fromBuilder,     tpl, {});
  const ser = o => JSON.stringify(o);
  if (ser(a) !== ser(b) || ser(b) !== ser(c)) {
    console.error('FAIL P5: same state should produce identical payload');
    process.exit(1);
  }
  console.log('✓ P5 payload identical across simulated page sources');
}

// -------------------------------------------------------------------
// P4. End-to-end /play of the empty-state payload.
// -------------------------------------------------------------------
const srv = spawn('python3',
  [path.join(ROOT, 'tools', 'playground_server.py')],
  { env: { ...process.env, PLAYGROUND_PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'] });
await sleep(1500);
try {
  const payload = window.PlayPipeline.buildPlayRequest(blankState(), tpl, {});
  const r = await (await fetch(`http://127.0.0.1:${PORT}/play`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })).json();
  if (!r.ok) {
    console.error('FAIL P4: empty-state /play build failed at', r.stage);
    console.error((r.log || '').slice(-1800));
    process.exit(2);
  }
  if (typeof r.size !== 'number' || r.size < 1000) {
    console.error('FAIL P4b: /play returned no / tiny ROM (size =', r.size, ')');
    process.exit(2);
  }
  console.log('✓ P4 empty-state /play build (' + r.size + ' bytes, ' +
    r.build_time_ms + ' ms)');
} finally {
  srv.kill('SIGTERM');
  await sleep(300);
}

console.log('\nShared play-pipeline smoke-test complete.');
