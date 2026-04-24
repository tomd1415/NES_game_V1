// Phase B+ Round 1 smoke-test — P2 HP + P2 animation + enemy/pickup idle.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = '/home/duguid/projects/nesgame/attempt1';
const WEB  = path.join(ROOT, 'tools', 'tile_editor_web');
const PORT = 18774;

globalThis.window = globalThis;
for (const f of ['sprite-render.js', 'builder-assembler.js',
    'builder-modules.js', 'builder-validators.js']) {
  new Function(fs.readFileSync(path.join(WEB, f), 'utf8'))();
}
const tpl = fs.readFileSync(path.join(WEB, 'builder-templates/platformer.c'), 'utf8');
const mkCells = (w, h, t = 1) => Array.from({ length: h }, () =>
  Array.from({ length: w }, () => ({ tile: t, palette: 0, empty: false })));

function mkState(opts = {}) {
  const sprites = [
    { role: 'player', name: 'hero',  width: 2, height: 2, cells: mkCells(2, 2) },
    { role: 'enemy',  name: 'goomba', width: 2, height: 2, cells: mkCells(2, 2) },
  ];
  if (opts.withP2) sprites.push(
    { role: 'player', name: 'luigi', width: 2, height: 2, cells: mkCells(2, 2) });
  if (opts.withPickup) sprites.push(
    { role: 'pickup', name: 'coin', width: 1, height: 1, cells: mkCells(1, 1) });
  // Animation frame sprites
  const animFrames = {};
  if (opts.withEnemyIdle) {
    sprites.push({ role: 'decoration', name: 'gf_a', width: 2, height: 2, cells: mkCells(2, 2, 0x30) });
    sprites.push({ role: 'decoration', name: 'gf_b', width: 2, height: 2, cells: mkCells(2, 2, 0x31) });
    animFrames.enemyIdle = [sprites.length - 2, sprites.length - 1];
  }
  if (opts.withPickupIdle) {
    sprites.push({ role: 'decoration', name: 'cf_a', width: 1, height: 1, cells: mkCells(1, 1, 0x40) });
    sprites.push({ role: 'decoration', name: 'cf_b', width: 1, height: 1, cells: mkCells(1, 1, 0x41) });
    animFrames.pickupIdle = [sprites.length - 2, sprites.length - 1];
  }
  if (opts.withP2Walk) {
    sprites.push({ role: 'decoration', name: 'lf_a', width: 2, height: 2, cells: mkCells(2, 2, 0x50) });
    sprites.push({ role: 'decoration', name: 'lf_b', width: 2, height: 2, cells: mkCells(2, 2, 0x51) });
    animFrames.p2Walk = [sprites.length - 2, sprites.length - 1];
  }
  const animations = [];
  let aid = 1;
  if (animFrames.enemyIdle) {
    animations.push({ id: aid++, name: 'goomba_idle', frames: animFrames.enemyIdle, fps: 6, role: 'enemy', style: 'idle' });
  }
  if (animFrames.pickupIdle) {
    animations.push({ id: aid++, name: 'coin_bob', frames: animFrames.pickupIdle, fps: 4, role: 'pickup', style: 'idle' });
  }
  if (animFrames.p2Walk) {
    animations.push({ id: aid++, name: 'luigi_walk', frames: animFrames.p2Walk, fps: 8, role: 'player2', style: 'walk' });
  }
  const s = {
    name: 'r1', version: 1, universal_bg: 0x21, sprites, animations,
    animation_assignments: { walk: null, jump: null }, nextAnimationId: aid,
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
  return s;
}

// Assembler emission checks
{
  const s = mkState({ withP2: true });
  s.builder.modules.players.submodules.player2.enabled = true;
  s.builder.modules.players.submodules.player2.config.maxHp = 3;
  s.builder.modules.damage.enabled = true;
  s.builder.modules.players.submodules.player1.config.maxHp = 3;
  const out = window.BuilderAssembler.assemble(s, tpl);
  if (!/^#define PLAYER2_HP_ENABLED 1/m.test(out)) {
    console.error('FAIL: expected PLAYER2_HP_ENABLED emission'); process.exit(1);
  }
  if (!/^#define PLAYER2_MAX_HP 3/m.test(out)) {
    console.error('FAIL: expected PLAYER2_MAX_HP 3 emission'); process.exit(1);
  }
  if (!/dmg2_hit/.test(out)) {
    console.error('FAIL: expected P2 collision loop'); process.exit(1);
  }
  console.log('✓ P2 HP + damage macros + collision loop emit');
}

// /play end-to-end for each new animation pair + P2 HP
const srv = spawn('python3',
  [path.join(ROOT, 'tools', 'playground_server.py')],
  { env: { ...process.env, PLAYGROUND_PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'] });
await sleep(1500);
async function postPlay(payload) {
  const res = await fetch(`http://127.0.0.1:${PORT}/play`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}
try {
  // enemy+idle end-to-end
  {
    const s = mkState({ withEnemyIdle: true });
    const r = await postPlay({
      state: s, playerSpriteIdx: 0, playerStart: { x: 60, y: 120 },
      sceneSprites: [{ spriteIdx: 1, x: 96, y: 120 }],
      mode: 'browser', customMainC: window.BuilderAssembler.assemble(s, tpl),
    });
    if (!r.ok) { console.error('FAIL E1 enemy+idle:', r.stage, (r.log||'').slice(-1500)); process.exit(2); }
    console.log('✓ E1 enemy+idle build (' + r.size + ' bytes, ' + r.build_time_ms + ' ms)');
  }
  // pickup+idle end-to-end
  {
    const s = mkState({ withPickup: true, withPickupIdle: true });
    const r = await postPlay({
      state: s, playerSpriteIdx: 0, playerStart: { x: 60, y: 120 },
      sceneSprites: [{ spriteIdx: 2, x: 96, y: 120 }],  // pickup sprite idx
      mode: 'browser', customMainC: window.BuilderAssembler.assemble(s, tpl),
    });
    if (!r.ok) { console.error('FAIL E2 pickup+idle:', r.stage, (r.log||'').slice(-1500)); process.exit(2); }
    console.log('✓ E2 pickup+idle build (' + r.size + ' bytes, ' + r.build_time_ms + ' ms)');
  }
  // player2+walk end-to-end (plus P2 enabled)
  {
    const s = mkState({ withP2: true, withP2Walk: true });
    s.builder.modules.players.submodules.player2.enabled = true;
    const r = await postPlay({
      state: s, playerSpriteIdx: 0, playerStart: { x: 60, y: 120 },
      playerSpriteIdx2: 2, playerStart2: { x: 180, y: 120 },
      sceneSprites: [{ spriteIdx: 1, x: 96, y: 120 }],
      mode: 'browser', customMainC: window.BuilderAssembler.assemble(s, tpl),
    });
    if (!r.ok) { console.error('FAIL E3 p2+walk:', r.stage, (r.log||'').slice(-1500)); process.exit(2); }
    console.log('✓ E3 player2+walk build (' + r.size + ' bytes, ' + r.build_time_ms + ' ms)');
  }
  // Everything on together — P2 HP + P2 walk anim + enemy+idle + pickup+idle + damage + HUD
  {
    const s = mkState({ withP2: true, withP2Walk: true, withEnemyIdle: true,
      withPickup: true, withPickupIdle: true });
    s.builder.modules.players.submodules.player2.enabled = true;
    s.builder.modules.players.submodules.player2.config.maxHp = 3;
    s.builder.modules.players.submodules.player1.config.maxHp = 3;
    s.builder.modules.damage.enabled = true;
    s.builder.modules.pickups.enabled = true;
    s.sprites.push({ role: 'hud', name: 'heart', width: 1, height: 1, cells: mkCells(1,1,0x60) });
    s.builder.modules.hud.enabled = true;
    const r = await postPlay({
      state: s, playerSpriteIdx: 0, playerStart: { x: 60, y: 120 },
      playerSpriteIdx2: 2, playerStart2: { x: 180, y: 120 },
      sceneSprites: [{ spriteIdx: 1, x: 96, y: 120 }],
      mode: 'browser', customMainC: window.BuilderAssembler.assemble(s, tpl),
    });
    if (!r.ok) { console.error('FAIL E4 everything:', r.stage, (r.log||'').slice(-2000)); process.exit(2); }
    console.log('✓ E4 everything-on build (' + r.size + ' bytes, ' + r.build_time_ms + ' ms)');
  }
} finally {
  srv.kill('SIGTERM');
  await sleep(300);
}
console.log('\nRound 1 smoke-test complete.');
