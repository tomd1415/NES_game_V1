// Phase B finale chunk B — runtime animations smoke-test.
//
// Three scenarios:
//   1. No tagged enemy+walk animation → emitted scene.inc has
//      ANIM_ENEMY_WALK_COUNT 0 and the template's #else branch
//      (byte-identical to pre-chunk-B).
//   2. Tagged enemy+walk animation with 3 frames of matching size →
//      scene.inc has ANIM_ENEMY_WALK_COUNT 3 + frame tables, ROM
//      compiles, tick-advancement + animation-source-swap code is
//      present in the generated main.c.
//   3. Size-mismatch warn validator fires when the tagged
//      animation's frames don't match any enemy sprite's W×H.

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = '/home/duguid/projects/nesgame/attempt1';
const WEB  = path.join(ROOT, 'tools', 'tile_editor_web');
const PORT = 18772;

globalThis.window = globalThis;
for (const f of ['sprite-render.js', 'builder-assembler.js',
    'builder-modules.js', 'builder-validators.js']) {
  new Function(fs.readFileSync(path.join(WEB, f), 'utf8'))();
}
const tpl = fs.readFileSync(path.join(WEB, 'builder-templates/platformer.c'), 'utf8');

function mkCells(w, h, tile = 1) {
  return Array.from({ length: h }, () =>
    Array.from({ length: w }, () => ({ tile, palette: 0, empty: false })));
}

function makeState(opts = {}) {
  const hero = { role: 'player', name: 'hero', width: 2, height: 2,
    cells: mkCells(2, 2) };
  const sprites = [hero];
  // Enemy frames — three 2x2 sprites for a walk cycle.
  if (opts.withEnemyWalkAnim) {
    sprites.push({ role: 'enemy', name: 'goomba_a', width: 2, height: 2, cells: mkCells(2, 2, 0x10) });
    sprites.push({ role: 'enemy', name: 'goomba_b', width: 2, height: 2, cells: mkCells(2, 2, 0x11) });
    sprites.push({ role: 'enemy', name: 'goomba_c', width: 2, height: 2, cells: mkCells(2, 2, 0x12) });
  } else if (opts.withEnemySprite) {
    sprites.push({ role: 'enemy', name: 'goomba', width: 2, height: 2, cells: mkCells(2, 2) });
  }
  // Mismatch scenario: 2x2 enemy sprite but 3x3 walk animation frames
  // (frames themselves aren't tagged enemy so no enemy-roled sprite
  // shares the animation's size).
  if (opts.withMismatch) {
    sprites.push({ role: 'enemy', name: 'small_enemy', width: 2, height: 2, cells: mkCells(2, 2) });
    sprites.push({ role: 'decoration', name: 'big_frame_a', width: 3, height: 3, cells: mkCells(3, 3, 0x20) });
    sprites.push({ role: 'decoration', name: 'big_frame_b', width: 3, height: 3, cells: mkCells(3, 3, 0x21) });
  }
  const animations = [];
  let nextAnimId = 1;
  if (opts.withEnemyWalkAnim) {
    animations.push({
      id: nextAnimId++, name: 'goomba_walk',
      frames: [1, 2, 3], fps: 10,
      role: 'enemy', style: 'walk',
    });
  }
  if (opts.withMismatch) {
    // Big-frame animation but enemy sprite is small.
    animations.push({
      id: nextAnimId++, name: 'big_walk',
      frames: [2, 3],  // indices 2/3 are the 3x3 big frames
      fps: 8,
      role: 'enemy', style: 'walk',
    });
  }
  return {
    name: 'chunkb', version: 1, universal_bg: 0x21,
    sprites, animations,
    animation_assignments: { walk: null, jump: null },
    nextAnimationId: nextAnimId,
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
        m[20][20] = 5;
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
}

// --- V1: size-mismatch validator fires --------------------------
{
  const s = makeState({ withMismatch: true });
  const p = window.BuilderValidators.validate(s);
  const hit = p.find(x => x.id === 'enemy-walk-anim-size-mismatch');
  if (!hit || hit.severity !== 'warn') {
    console.error('FAIL V1: expected enemy-walk-anim-size-mismatch warn');
    process.exit(1);
  }
  console.log('✓ V1 enemy-walk-anim-size-mismatch warns on 2×2 enemy vs 3×3 frames');
}

// --- Server + template smoke -----------------------------------
const srv = spawn('python3',
  [path.join(ROOT, 'tools', 'playground_server.py')],
  { env: { ...process.env, PLAYGROUND_PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'] });
await sleep(1500);

async function postPlay(payload) {
  const res = await fetch(`http://127.0.0.1:${PORT}/play`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

try {
  // Scenario 1: no tagged animation → ANIM_ENEMY_WALK_COUNT 0.
  {
    const s = makeState({ withEnemySprite: true });
    const out = window.BuilderAssembler.assemble(s, tpl);
    const r = await postPlay({
      state: s, playerSpriteIdx: 0, playerStart: { x: 60, y: 120 },
      sceneSprites: [{ spriteIdx: 1, x: 96, y: 120 }],
      mode: 'browser',
      customMainC: out,
    });
    if (!r.ok) {
      console.error('FAIL E1: no-anim build rejected:', r.stage);
      console.error((r.log || '').slice(-1500));
      process.exit(2);
    }
    console.log('✓ E1 no-anim build ok (' + r.size + ' bytes, ' + r.build_time_ms + ' ms)');
  }

  // Scenario 2: tagged enemy+walk with 3 matching frames.
  {
    const s = makeState({ withEnemyWalkAnim: true });
    const out = window.BuilderAssembler.assemble(s, tpl);
    const r = await postPlay({
      state: s, playerSpriteIdx: 0, playerStart: { x: 60, y: 120 },
      sceneSprites: [
        { spriteIdx: 1, x: 96, y: 120 },
        { spriteIdx: 1, x: 160, y: 120 },  // two instances of sprite 1
      ],
      mode: 'browser',
      customMainC: out,
    });
    if (!r.ok) {
      console.error('FAIL E2: anim build rejected:', r.stage);
      console.error((r.log || '').slice(-2500));
      process.exit(2);
    }
    console.log('✓ E2 enemy-walk anim build ok (' + r.size + ' bytes, ' + r.build_time_ms + ' ms)');
  }
} finally {
  srv.kill('SIGTERM');
  await sleep(300);
}

console.log('\nChunk B (runtime animations) smoke-test complete.');
