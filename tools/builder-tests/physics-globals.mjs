// Globals module — game-wide physics knobs (feedback #22 "change variables like
// gravity" + #6 "change the speed of the jump"). The module emits
// BW_GRAVITY_PX / BW_JUMP_SPEED_PX + overrides of BW_APPLY_GRAVITY /
// BW_APPLY_JUMP_RISE; unticked it restores the byte-identical baseline (#ifndef
// defaults). This proves the knobs actually reach the ROM and change the physics
// a pupil can feel — not just that they compile.
//
// Codegen: off → no defines (byte-identical); on → the defines + macro overrides.
// Behaviour (jsnes, C engine): a bigger Jump speed makes the player rise higher;
// a bigger Gravity makes the player fall back down faster.
import fs from 'node:fs';
import path from 'node:path';
import * as H from './lib/render-harness.mjs';

const WEB = H.WEB;
function fail(m) { console.error('FAIL:', m); process.exit(1); }
function assert(c, m) { if (!c) fail(m); }

globalThis.window = globalThis;
new Function(fs.readFileSync(path.join(WEB, 'engine-version.js'), 'utf8'))();
globalThis.NES_TARGET_ENGINE = globalThis.NES_ENGINE_VERSION;
for (const f of ['sprite-render.js', 'builder-assembler.js', 'builder-modules.js',
    'builder-validators.js', 'default-state.js', 'studio-starter.js']) {
  new Function(fs.readFileSync(path.join(WEB, f), 'utf8'))();
}
const tpl = fs.readFileSync(path.join(WEB, 'builder-templates', 'platformer.c'), 'utf8');
const solid = (v) => Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => v));

// A minimal platformer with a solid floor along the bottom two rows.
function makeState(globalsCfg, jumpHeight) {
  const s = window.StudioStarter.createRunner();
  s.builder.modules.game.config.type = 'platformer';   // basic platformer (BW_GAME_STYLE 0)
  const bg = s.backgrounds[0];
  s.bg_tiles[1] = { name: 'floor', pixels: solid(1) };
  const cols = bg.nametable[0].length;
  for (let c = 0; c < cols; c++) {
    for (const rr of [28, 29]) { bg.nametable[rr][c] = { tile: 1, palette: 0 }; bg.behaviour[rr][c] = 1; }
  }
  const m = s.builder.modules;
  if (globalsCfg) m.globals = { enabled: true, config: globalsCfg };
  else delete m.globals;
  const p1 = m.players.submodules.player1.config;
  p1.jumpHeight = jumpHeight; p1.startX = 120; p1.startY = 180;
  return s;
}

// ---- 1) Codegen: off is byte-identical baseline, on emits the knobs ---------
{
  const off = window.BuilderAssembler.assemble(makeState(null, 14), tpl);
  assert(!/BW_JUMP_SPEED_PX|BW_GRAVITY_PX/.test(off),
    'globals OFF still emitted physics #defines — the no-module ROM would not be byte-identical');
  const on = window.BuilderAssembler.assemble(
    makeState({ gravityPx: 4, jumpSpeedPx: 6, bobWhenWalking: false }, 14), tpl);
  assert(/#define BW_GRAVITY_PX 4/.test(on), 'Gravity 4 did not emit #define BW_GRAVITY_PX 4');
  assert(/#define BW_JUMP_SPEED_PX 6/.test(on), 'Jump speed 6 did not emit #define BW_JUMP_SPEED_PX 6');
  assert(/#define BW_APPLY_JUMP_RISE\(y\) \(y\) -= BW_JUMP_SPEED_PX/.test(on), 'globals did not override BW_APPLY_JUMP_RISE');
  assert(/#define BW_APPLY_GRAVITY\(y\) \(\(y\) \+= BW_GRAVITY_PX\)/.test(on), 'globals did not override BW_APPLY_GRAVITY');
  // Gravity drives the PLAYER's fall too now: BW_PLAYER_GRAVITY = gravityPx + 1
  // (gravity 4 -> 5). Default gravity 1 -> 2 keeps the historic fall byte-identical.
  assert(/#define BW_PLAYER_GRAVITY 5/.test(on), 'Gravity 4 did not emit #define BW_PLAYER_GRAVITY 5 (player fall not wired)');
  // Values are clamped to the slider ranges (gravity 0-4, jump 1-6).
  const clamp = window.BuilderAssembler.assemble(
    makeState({ gravityPx: 99, jumpSpeedPx: 99, bobWhenWalking: false }, 14), tpl);
  assert(/#define BW_GRAVITY_PX 4/.test(clamp) && /#define BW_JUMP_SPEED_PX 6/.test(clamp),
    'out-of-range globals were not clamped to the slider maxima (gravity 4, jump 6)');
  console.log('✓ codegen: globals OFF is byte-identical (no defines); ON emits + clamps BW_GRAVITY_PX / BW_JUMP_SPEED_PX');
}

// ---- Behaviour helpers ------------------------------------------------------
// Build on the DEFAULT (ASM) engine — the one pupils ship — so we prove the
// knobs work there, not just in the C fallback (engine v67: the ASM player now
// reads JUMP_BUDGET / JUMP_SPEED / PLAYER_GRAVITY from project.inc).
async function buildRom(globalsCfg, jumpHeight, env = {}) {
  const srv = await H.startServer(18882, env);
  try {
    const s = makeState(globalsCfg, jumpHeight);
    const r = await H.buildRom(18882, {
      state: s, playerSpriteIdx: 0, playerStart: { x: 120, y: 180 }, sceneSprites: [],
      mode: 'browser', customMainC: window.BuilderAssembler.assemble(s, tpl),
      targetEngine: globalThis.NES_TARGET_ENGINE,
    });
    assert(r.ok, 'physics build failed (stage ' + r.stage + '): ' + String(r.log || '').slice(-300));
    return r.romBytes;
  } finally { await H.stopServer(srv.srv); }
}
// Settle on the floor, hold UP, return the peak rise (px above the ground).
function jumpRise(rom) {
  const emu = H.openRom(rom);
  emu.frames(60);
  const groundY = H.oamSprite(emu.nes, 0).y;
  emu.hold(H.BTN.UP);
  let apexY = groundY;
  for (let i = 0; i < 45; i++) { emu.frames(1); const y = H.oamSprite(emu.nes, 0).y; if (y < apexY) apexY = y; }
  emu.release(H.BTN.UP);
  return groundY - apexY;
}
// Launch a big jump, find the apex, then measure how far the player falls over a
// fixed window — bigger Gravity → falls further (the player's OWN fall now).
function fallOverWindow(rom, windowFrames) {
  const emu = H.openRom(rom);
  emu.frames(60);
  emu.hold(H.BTN.UP); emu.frames(24); emu.release(H.BTN.UP);   // long launch
  let apexY = H.oamSprite(emu.nes, 0).y, prev = apexY;
  for (let i = 0; i < 40; i++) { emu.frames(1); const y = H.oamSprite(emu.nes, 0).y; if (y < apexY) apexY = y; if (y > prev + 1) { prev = y; break; } prev = y; }
  const startFall = H.oamSprite(emu.nes, 0).y;   // just past apex, now descending
  emu.frames(windowFrames);
  return H.oamSprite(emu.nes, 0).y - startFall;  // descent over the window
}

// ---- 2) Jump SPEED changes jump height ON THE ASM ENGINE --------------------
const jsSlow = jumpRise(await buildRom({ gravityPx: 1, jumpSpeedPx: 2, bobWhenWalking: false }, 14));
const jsFast = jumpRise(await buildRom({ gravityPx: 1, jumpSpeedPx: 6, bobWhenWalking: false }, 14));
assert(jsSlow > 4, 'the slow jump barely rose (' + jsSlow + 'px) — jump not measured');
assert(jsFast > jsSlow + 20,
  'a bigger Jump speed did not make the player jump higher on the ASM engine (js=2 rose ' + jsSlow + 'px, js=6 rose ' + jsFast + 'px) — the ASM ignores JUMP_SPEED');
console.log('✓ Jump speed works on the ASM engine (js=2 rose ' + jsSlow + 'px, js=6 rose ' + jsFast + 'px)');

// ---- 3) Jump HEIGHT changes jump height ON THE ASM ENGINE -------------------
const jhLow = jumpRise(await buildRom({ gravityPx: 1, jumpSpeedPx: 3, bobWhenWalking: false }, 8));
const jhHigh = jumpRise(await buildRom({ gravityPx: 1, jumpSpeedPx: 3, bobWhenWalking: false }, 24));
assert(jhHigh > jhLow + 20,
  'a bigger Jump height did not make the player jump higher on the ASM engine (jh=8 rose ' + jhLow + 'px, jh=24 rose ' + jhHigh + 'px) — the ASM ignores JUMP_BUDGET');
console.log('✓ Jump height works on the ASM engine (jh=8 rose ' + jhLow + 'px, jh=24 rose ' + jhHigh + 'px)');

// ---- 4) Player GRAVITY changes the PLAYER's fall ON THE ASM ENGINE ----------
// The whole point of this change: Gravity now moves the player, not just enemies.
const gLight = fallOverWindow(await buildRom({ gravityPx: 1, jumpSpeedPx: 4, bobWhenWalking: false }, 24), 8);
const gHeavy = fallOverWindow(await buildRom({ gravityPx: 4, jumpSpeedPx: 4, bobWhenWalking: false }, 24), 8);
assert(gLight > 4, 'the light-gravity fall was not measured (' + gLight + 'px)');
assert(gHeavy > gLight + 8,
  'a bigger Gravity did not make the PLAYER fall faster on the ASM engine (gravity 1 fell ' + gLight + 'px, gravity 4 fell ' + gHeavy + 'px) — player gravity not wired');
console.log('✓ Gravity now moves the PLAYER on the ASM engine (g=1 fell ' + gLight + 'px, g=4 fell ' + gHeavy + 'px over 8 frames)');

// ---- 5) Runner (Geo Dash) gravity: tunable + C == ASM ----------------------
// The single-player runner shares the platformer vertical block, so its C fall
// honours Gravity (BW_PLAYER_GRAVITY) — the ASM run_update must match (v68 fix;
// v67 left it hardcoded, diverging at non-default gravity). Build a runner and
// scan OAM for the falling player (its player sprite isn't OAM 0), asserting the
// per-frame fall rate matches C and rises with Gravity.
function runnerState(grav) {
  const s = window.StudioStarter.createRunner();
  const bg = s.backgrounds[0];
  s.bg_tiles[1] = { name: 'floor', pixels: solid(1) };
  for (let c = 0; c < bg.nametable[0].length; c++) { bg.nametable[29][c] = { tile: 1, palette: 0 }; bg.behaviour[29][c] = 1; }
  s.builder.modules.globals = { enabled: true, config: { gravityPx: grav, jumpSpeedPx: 2, bobWhenWalking: false } };
  const p1 = s.builder.modules.players.submodules.player1.config;
  p1.jumpHeight = 20; p1.startX = 120; p1.startY = 60;
  return s;
}
async function runnerFallRate(grav, env) {
  const srv = await H.startServer(18882, env);
  try {
    const s = runnerState(grav);
    const r = await H.buildRom(18882, {
      state: s, playerSpriteIdx: 0, playerStart: { x: 120, y: 60 }, sceneSprites: [],
      mode: 'browser', customMainC: window.BuilderAssembler.assemble(s, tpl),
      targetEngine: globalThis.NES_TARGET_ENGINE,
    });
    assert(r.ok, 'runner build failed (stage ' + r.stage + '): ' + String(r.log || '').slice(-200));
    const emu = H.openRom(r.romBytes);
    emu.frames(20);
    emu.hold(H.BTN.A); emu.frames(2); emu.release(H.BTN.A);   // tap-jump then fall
    let prev = null, best = 0;
    for (let i = 0; i < 20; i++) {
      emu.frames(1);
      const cur = []; for (let sp = 0; sp < 8; sp++) { const o = H.oamSprite(emu.nes, sp); cur.push(o.y < 240 ? o.y : null); }
      if (prev) for (let sp = 0; sp < 8; sp++) { if (prev[sp] != null && cur[sp] != null) { const d = cur[sp] - prev[sp]; if (d > 0 && d < 20 && d > best) best = d; } }
      prev = cur;
    }
    return best;
  } finally { await H.stopServer(srv.srv); }
}
const rG1a = await runnerFallRate(1, {});
const rG4a = await runnerFallRate(4, {});
const rG4c = await runnerFallRate(4, { PLAYGROUND_NO_ASM: '1' });
assert(rG1a === 2, 'runner default gravity should fall 2 px/frame on the ASM engine (got ' + rG1a + ')');
assert(rG4a > rG1a, 'a bigger Gravity did not speed the runner player\'s fall on the ASM engine (g1=' + rG1a + ', g4=' + rG4a + ')');
assert(rG4a === rG4c, 'runner fall diverges between the ASM and C engines at gravity 4 (ASM=' + rG4a + ', C=' + rG4c + ') — the run_update fall is not wired to PLAYER_GRAVITY');
console.log('✓ Runner (Geo Dash) gravity works + matches C (g=1 falls ' + rG1a + '/frame, g=4 falls ' + rG4a + '/frame, ASM==C)');

console.log('\nPlatformer + runner physics (jump height + jump speed + player gravity) work on the shipped ASM engine.');
