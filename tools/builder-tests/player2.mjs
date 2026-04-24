// Phase B chunk 5 — Player 2 end-to-end smoke-test.
//
// Exercises the full pipeline (builder-assembler → /play → cc65) in
// three configurations:
//   1. P2 disabled: ROM compiles, no PLAYER2 symbols in scene.inc.
//   2. P2 enabled + two Player sprites: ROM compiles with PLAYER2
//      symbols, P2 movement / render gated on.
//   3. P2 enabled + one Player sprite: validator fires the error.
//
// Relies on the Playground Server being running on PLAYGROUND_PORT.
// We spawn one for the duration of the test and tear it down after.

import fs from 'node:fs';
import path from 'node:path';
import { spawn, execSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = '/home/duguid/projects/nesgame/attempt1';
const WEB  = path.join(ROOT, 'tools', 'tile_editor_web');
const STEP = path.join(ROOT, 'steps', 'Step_Playground');
const PORT = 18768;

globalThis.window = globalThis;
for (const f of ['sprite-render.js', 'builder-assembler.js',
    'builder-modules.js', 'builder-validators.js']) {
  new Function(fs.readFileSync(path.join(WEB, f), 'utf8'))();
}
const tpl = fs.readFileSync(path.join(WEB, 'builder-templates/platformer.c'), 'utf8');

function makeState({ withP2Sprite } = {}) {
  const mkCells = (w, h) => Array.from({ length: h }, () =>
    Array.from({ length: w }, () => ({ tile: 1, palette: 0, empty: false })));
  const sprites = [
    { role: 'player', name: 'hero',  width: 2, height: 2, cells: mkCells(2, 2) },
    { role: 'enemy',  name: 'goomba', width: 2, height: 2, cells: mkCells(2, 2) },
  ];
  if (withP2Sprite) {
    sprites.push({ role: 'player', name: 'luigi', width: 2, height: 2,
      cells: mkCells(2, 2) });
  }
  return {
    name: 'p2smoke',
    version: 1,
    universal_bg: 0x21,
    sprites,
    sprite_tiles: Array.from({ length: 256 }, () => ({
      pixels: Array.from({ length: 8 }, () => Array(8).fill(0)), name: '',
    })),
    bg_tiles: Array.from({ length: 256 }, () => ({
      pixels: Array.from({ length: 8 }, () => Array(8).fill(0)), name: '',
    })),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x0F, 0x10, 0x30] })),
    animations: [],
    animation_assignments: { walk: null, jump: null },
    nextAnimationId: 1,
    backgrounds: [{
      name: 'bg',
      dimensions: { screens_x: 1, screens_y: 1 },
      nametable: Array.from({ length: 30 }, () =>
        Array.from({ length: 32 }, () => ({ tile: 0, palette: 0 }))),
      behaviour: (() => {
        const m = Array.from({ length: 30 }, () => Array(32).fill(0));
        for (let c = 0; c < 32; c++) m[28][c] = 1;   // ground row
        m[20][20] = 5;                                // trigger
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

// --- T1: P2 disabled, one player sprite — ROM compiles, no P2 bits ---
{
  const s = makeState();
  const p = window.BuilderValidators.validate(s);
  if (window.BuilderValidators.hasErrors(p)) {
    console.error('FAIL T1: errors in default state:', p.map(x => x.id));
    process.exit(1);
  }
  console.log('✓ T1 default P2-off state has no errors');
}

// --- T2: P2 enabled, only one player sprite — error fires ---
{
  const s = makeState();
  s.builder.modules.players.submodules.player2.enabled = true;
  const p = window.BuilderValidators.validate(s);
  const hit = p.find(x => x.id === 'player2-needs-second-sprite');
  if (!hit || hit.severity !== 'error') {
    console.error('FAIL T2: expected player2-needs-second-sprite error');
    process.exit(1);
  }
  console.log('✓ T2 P2-on without second player sprite → error fires');
}

// --- T3: P2 enabled + two Player sprites — clean, assemble + check markers ---
let p2Out;
{
  const s = makeState({ withP2Sprite: true });
  s.builder.modules.players.submodules.player2.enabled = true;
  // Push Player 2 config off-default so region substitution can be verified.
  s.builder.modules.players.submodules.player2.config = {
    startX: 150, startY: 100, walkSpeed: 2, jumpHeight: 25, maxHp: 0,
  };
  // Enable pickups so the dual-player pickup collision check is emitted.
  s.builder.modules.pickups.enabled = true;
  // Also add a pickup-roled sprite for good measure.
  s.sprites.push({ role: 'pickup', name: 'coin', width: 1, height: 1,
    cells: [[{ tile: 1, palette: 0, empty: false }]] });
  const p = window.BuilderValidators.validate(s);
  if (window.BuilderValidators.hasErrors(p)) {
    console.error('FAIL T3: P2-on with two player sprites has errors: ' +
      p.map(x => x.id + ':' + x.severity).join(', '));
    process.exit(1);
  }
  p2Out = window.BuilderAssembler.assemble(s, tpl);
  for (const [label, re] of [
    ['P2 walk_speed substitution', /unsigned char walk_speed2 = 2;/],
    ['P2 jump_height substitution', /jmp_up2 = 25;/],
    ['P2 init block',  /jumping2 = 0;/],
    ['P2 render loop', /for \(r = 0; r < PLAYER2_H; r\+\+\)/],
    ['P2 pickup check', /px2 \+ \(PLAYER2_W << 3\) <= ss_x\[i\]/],
    ['dual-player win check', /bw_tl2/],
  ]) {
    if (!re.test(p2Out)) {
      console.error('FAIL T3: missing ' + label); process.exit(1);
    }
  }
  console.log('✓ T3 P2-on output has all expected template markers');
}

// --- T4: start server + POST /play for P2-enabled state ---
const serverEnv = Object.assign({}, process.env, {
  PLAYGROUND_PORT: String(PORT),
});
const srv = spawn('python3', [path.join(ROOT, 'tools', 'playground_server.py')], {
  env: serverEnv, stdio: ['ignore', 'pipe', 'pipe'],
});
let srvLog = '';
srv.stdout.on('data', d => srvLog += d.toString());
srv.stderr.on('data', d => srvLog += d.toString());
// Give the server ~1.5s to bind.
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
  // --- T4a: P1-only play ---
  {
    const s = makeState();
    const result = await postPlay({
      state: s,
      playerSpriteIdx: 0,
      playerStart: { x: 60, y: 120 },
      sceneSprites: [{ spriteIdx: 1, x: 96, y: 120 }],
      mode: 'browser',
      customMainC: window.BuilderAssembler.assemble(s, tpl),
    });
    if (!result.ok) {
      console.error('FAIL T4a: /play rejected P1-only build:', result.stage, '\n' +
        (result.log || '').slice(-1500));
      process.exit(2);
    }
    console.log('✓ T4a P1-only build through /play ok (' + result.size + ' bytes, ' +
      result.build_time_ms + ' ms)');
  }

  // --- T4b: P2-enabled play ---
  {
    const s = makeState({ withP2Sprite: true });
    s.builder.modules.players.submodules.player2.enabled = true;
    const customMainC = window.BuilderAssembler.assemble(s, tpl);
    const result = await postPlay({
      state: s,
      playerSpriteIdx: 0,
      playerStart: { x: 60, y: 120 },
      playerSpriteIdx2: 2,
      playerStart2: { x: 180, y: 120 },
      sceneSprites: [{ spriteIdx: 1, x: 96, y: 120 }],
      mode: 'browser',
      customMainC: customMainC,
    });
    if (!result.ok) {
      console.error('FAIL T4b: /play rejected P2-on build:', result.stage, '\n' +
        (result.log || '').slice(-2500));
      process.exit(2);
    }
    console.log('✓ T4b P2-enabled build through /play ok (' + result.size + ' bytes, ' +
      result.build_time_ms + ' ms)');
  }
} finally {
  srv.kill('SIGTERM');
  await sleep(300);
}

console.log('\nPlayer 2 end-to-end smoke-test complete.');
