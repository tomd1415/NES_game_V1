#!/usr/bin/env node
// R-3 / R-6 — runtime spawn pool.
//
// R-6 first consumer: the Damage module's "show an effect when hit" spawns an
// effect sprite from the engine spawn pool where the player is hurt, for a TTL.
// This checks the emit AND a running ROM: an effect sprite (a distinct tile)
// pops into OAM when the player is hit and clears after its TTL.
//
// See docs/plans/current/2026-06-18-arc-c-tier2-backlog.md (R-3/R-6).

import * as H from './lib/render-harness.mjs';

const PORT = 18829;
let failed = false;
const ok  = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };

const cellsT = (t) => Array.from({ length: 2 }, () =>
  Array.from({ length: 2 }, () => ({ tile: t, palette: 0, empty: false })));
const solid = (v) => ({ pixels: Array.from({ length: 8 }, () => Array(8).fill(v)), name: 't' + v });

function makeState(win, spawnOnHit) {
  const st = H.blankPool();
  st[1] = solid(1); st[3] = solid(3);   // player/enemy use tile 1, effect uses tile 3
  const s = {
    name: 'spawn', version: 1, universal_bg: 0x0F,
    sprites: [
      { role: 'player', name: 'hero', width: 2, height: 2, cells: cellsT(1) },
      { role: 'enemy', name: 'baddie', width: 2, height: 2, cells: cellsT(1), flying: true },
      { role: 'other', name: 'spark', width: 2, height: 2, cells: cellsT(3) },   // effect art
    ],
    sprite_tiles: st, bg_tiles: H.blankPool(),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x30, 0x10, 0x20] })),
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    backgrounds: [H.flatBackground(1, 1, 28)],
    behaviour_types: H.BEHAVIOUR_TYPES, selectedBgIdx: 0,
    builder: win.BuilderDefaults(),
  };
  s.builder.modules.players.submodules.player1.config.maxHp = 9;
  s.builder.modules.damage.enabled = true;
  s.builder.modules.damage.config = {
    amount: 1, invincibilityFrames: 20, checkpoints: false, respawnHp: 1,
    spawnOnHit, spawnSpriteIdx: 2, spawnTtl: 16,
  };
  return s;
}

// R-3 fixture: the spawn module + a floor with a column of TRIGGER tiles the
// player walks onto.  No damage/enemy — the trigger alone fires the spawn.
const TRIG_COL = 11;   // x ≈ 88, clearly right of the spawn point
function makeR3State(win) {
  const st = H.blankPool();
  st[1] = solid(1); st[3] = solid(3);
  const cols = 32, rows = 30;
  const beh = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, () => r === 28 ? 1 : 0));
  beh[26][TRIG_COL] = 5; beh[27][TRIG_COL] = 5;   // BEHAVIOUR_TRIGGER = 5
  const nt = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ tile: 0, palette: 0 })));
  const s = {
    name: 'spawn3', version: 1, universal_bg: 0x0F,
    sprites: [
      { role: 'player', name: 'hero', width: 2, height: 2, cells: cellsT(1) },
      { role: 'other', name: 'spark', width: 2, height: 2, cells: cellsT(3) },   // effect art
    ],
    sprite_tiles: st, bg_tiles: H.blankPool(),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x30, 0x10, 0x20] })),
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    backgrounds: [{ name: 'bg', dimensions: { screens_x: 1, screens_y: 1 }, nametable: nt, behaviour: beh }],
    behaviour_types: H.BEHAVIOUR_TYPES, selectedBgIdx: 0,
    builder: win.BuilderDefaults(),
  };
  s.builder.modules.spawn.enabled = true;
  s.builder.modules.spawn.config = { spriteIdx: 1, ttl: 24 };   // sprites[1] = the effect art
  return s;
}

const win = H.loadBuilderModules();
const tpl = H.readTemplate();

// --- Emit guards ---
{
  const on = win.BuilderAssembler.assemble(makeState(win, true), tpl);
  const off = win.BuilderAssembler.assemble(makeState(win, false), tpl);
  // Match the emitted define at line start (the template mentions the macro in
  // a comment, which must not count).
  if (/^#define BW_SPAWN_ENABLED 1/m.test(on) && /bw_spawn\(px, py\)/.test(on)) ok('spawn-on-hit emits BW_SPAWN_ENABLED + the bw_spawn call');
  else bad('spawn-on-hit did not emit the spawn wiring');
  if (!/^#define BW_SPAWN_ENABLED 1/m.test(off)) ok('spawn-on-hit off omits BW_SPAWN_ENABLED (byte-identical gate)');
  else bad('spawn off unexpectedly emitted BW_SPAWN_ENABLED');
}

// --- R-3 emit guard: the spawn module emits the TRIGGER edge check ---
{
  const on = win.BuilderAssembler.assemble(makeR3State(win), tpl);
  if (/^#define BW_SPAWN_ENABLED 1/m.test(on) && /== BEHAVIOUR_TRIGGER/.test(on) && /bw_spawn\(px, py\)/.test(on))
    ok('spawn module emits BW_SPAWN_ENABLED + the BEHAVIOUR_TRIGGER edge check');
  else bad('spawn module did not emit the trigger wiring');
}

// --- Render: a hit pops an effect sprite (distinct tile) that expires ---
const { srv } = await H.startServer(PORT);
try {
  const s = makeState(win, true);
  // Mirror the live count of active spawn slots into RAM so we can assert on the
  // pool directly (OAM tile-matching is brittle when sprites overlap).
  let c = win.BuilderAssembler.assemble(s, tpl);
  c = c.replace('unsigned char spk, spr, spc;',
    'unsigned char spk, spr, spc; (*(unsigned char*)0x0704) = spawn_active[0] + spawn_active[1] + spawn_active[2] + spawn_active[3];');
  const r = await H.buildRom(PORT, {
    state: s, playerSpriteIdx: 0, playerStart: { x: 60, y: 120 },
    sceneSprites: [{ spriteIdx: 1, x: 60, y: 208 }],   // enemy overlaps the player → hits
    mode: 'browser', customMainC: c,
  });
  if (!r.ok) { bad('spawn project did not compile at stage ' + r.stage + ':\n' + String(r.log || '').slice(-1500)); }
  else {
    const h = H.openRom(r.romBytes);
    h.frames(80);                                  // settle; player + enemy share tile 1
    // active = live count of occupied spawn-pool slots (mirrored from the engine).
    const active = () => h.nes.cpu.mem[0x704];
    let everSpawned = false, framesActive = 0, peak = 0;
    const trace = [];
    for (let i = 0; i < 90; i++) {
      h.nes.frame();
      const a = active();
      if (a > 0) { everSpawned = true; framesActive++; }
      if (a > peak) peak = a;
      if (i < 48) trace.push(a);
    }
    console.log('   active-slot trace:', trace.join(''));

    if (everSpawned) ok('the spawn pool activates a slot when the player is hit (peak ' + peak + ' active)');
    else bad('spawn pool never activated on hit');
    // TTL-bounded: the pool empties between hits, so it is NOT active every frame.
    if (everSpawned && framesActive < 85) ok('pool is TTL-bounded (active ' + framesActive + '/90 frames, drains between hits)');
    else if (everSpawned) bad('pool never drained (active ' + framesActive + '/90 frames)');
  }

  // --- R-3: stepping onto a TRIGGER tile pops an effect ---
  const s3 = makeR3State(win);
  let c3 = win.BuilderAssembler.assemble(s3, tpl);
  c3 = c3.replace('unsigned char spk, spr, spc;',
    'unsigned char spk, spr, spc; (*(unsigned char*)0x0705) = spawn_active[0] + spawn_active[1] + spawn_active[2] + spawn_active[3];');
  const r3 = await H.buildRom(PORT, {
    state: s3, playerSpriteIdx: 0, playerStart: { x: 16, y: 120 },
    mode: 'browser', customMainC: c3,
  });
  if (!r3.ok) { bad('R-3 trigger project did not compile at stage ' + r3.stage + ':\n' + String(r3.log || '').slice(-1500)); }
  else {
    const h3 = H.openRom(r3.romBytes);
    h3.frames(40);                                 // settle on the floor, left of the trigger
    const active3 = () => h3.nes.cpu.mem[0x705];
    let pre = 0;
    for (let i = 0; i < 12; i++) { h3.nes.frame(); pre += active3(); }
    let fired = false, framesActive3 = 0;
    h3.hold(H.BTN.RIGHT);
    for (let i = 0; i < 220; i++) { h3.nes.frame(); if (active3() > 0) { fired = true; framesActive3++; } }
    h3.release(H.BTN.RIGHT);
    if (pre === 0) ok('R-3: idle on the floor (left of the trigger) spawns nothing');
    else bad('R-3: pool was active before the player reached the trigger (pre ' + pre + ')');
    if (fired) ok('R-3: walking onto a TRIGGER tile pops an effect (pool activates)');
    else bad('R-3: no effect spawned when the player crossed the trigger tile');
    if (fired && framesActive3 < 200) ok('R-3: effect is TTL-bounded (active ' + framesActive3 + '/220 frames after entry)');
    else if (fired) bad('R-3: effect never drained (active ' + framesActive3 + '/220 frames)');
  }
} catch (e) {
  bad('threw: ' + (e && e.stack || e));
} finally {
  await H.stopServer(srv);
}

if (failed) process.exit(1);
console.log('\nSpawn-pool smoke-test complete.');
