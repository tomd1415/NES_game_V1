#!/usr/bin/env node
// R-8 — checkpoints: respawn instead of game over.
//
// With the Damage module's "Checkpoints" option on, walking the player's centre
// onto a Door tile saves a respawn point; on death the player restarts there
// with restored HP instead of the permanent freeze. This checks the emit AND
// drives a real ROM: the player walks onto a door, dies to an enemy, and
// respawns at the door (not the spawn, not frozen at the enemy).
//
// See docs/plans/current/2026-06-18-arc-c-tier2-backlog.md (R-8).

import * as H from './lib/render-harness.mjs';

const PORT = 18828;
let failed = false;
const ok  = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };

const DOOR_COL = 14;          // checkpoint tile column → x ≈ 112
const DOOR_X = DOOR_COL * 8;  // 112
const ENEMY_X = 168;          // beyond the door

function makeState(win, checkpoints) {
  const cols = 32, rows = 30;
  const beh = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, () => r === 28 ? 1 : 0));
  beh[26][DOOR_COL] = 4; beh[27][DOOR_COL] = 4;   // DOOR tiles = checkpoint
  const nt = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ tile: 0, palette: 0 })));
  const s = {
    name: 'cp', version: 1, universal_bg: 0x0F,
    sprites: [
      { role: 'player', name: 'hero', width: 2, height: 2, cells: H.mkCells(2, 2) },
      { role: 'enemy', name: 'baddie', width: 2, height: 2, cells: H.mkCells(2, 2), flying: true },
    ],
    sprite_tiles: H.blankPool(), bg_tiles: H.blankPool(),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x30, 0x10, 0x20] })),
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    backgrounds: [{ name: 'bg', dimensions: { screens_x: 1, screens_y: 1 }, nametable: nt, behaviour: beh }],
    behaviour_types: H.BEHAVIOUR_TYPES, selectedBgIdx: 0,
    builder: win.BuilderDefaults(),
  };
  s.builder.modules.players.submodules.player1.config.maxHp = 3;
  s.builder.modules.damage.enabled = true;
  s.builder.modules.damage.config = { amount: 9, invincibilityFrames: 30, checkpoints, respawnHp: 2 };
  return s;
}

const win = H.loadBuilderModules();
const tpl = H.readTemplate();

// --- Emit guards ---
{
  const on = win.BuilderAssembler.assemble(makeState(win, true), tpl);
  const off = win.BuilderAssembler.assemble(makeState(win, false), tpl);
  if (/^#define BW_CHECKPOINTS 1/m.test(on) && /^#define BW_RESPAWN_HP 2/m.test(on)) ok('checkpoints on emits BW_CHECKPOINTS + BW_RESPAWN_HP');
  else bad('checkpoints on did not emit the macros');
  if (!/^#define BW_CHECKPOINTS/m.test(off)) ok('checkpoints off omits the macro');
  else bad('checkpoints off unexpectedly emitted BW_CHECKPOINTS');
  // The respawn text is always present but wrapped in #if BW_CHECKPOINTS, so the
  // gate is the macro (checked above), not the text's presence.
  if (/#if BW_CHECKPOINTS[\s\S]*px = cp_x; py = cp_y;[\s\S]*#else/.test(on)) ok('respawn code is gated behind #if BW_CHECKPOINTS (else = freeze)');
  else bad('respawn code not wrapped in the checkpoint #if/#else');
}

// --- Render: walk onto the door, die, respawn at the door ---
const { srv } = await H.startServer(PORT);
try {
  const s = makeState(win, true);
  // Inject player_dead so we can see it never sticks at 1 (respawns).
  let c = win.BuilderAssembler.assemble(s, tpl);
  c = c.replace('if (player_dead) {', '(*(unsigned char*)0x0702) = player_dead; if (player_dead) {');
  const r = await H.buildRom(PORT, {
    state: s, playerSpriteIdx: 0, playerStart: { x: 16, y: 120 },
    sceneSprites: [{ spriteIdx: 1, x: ENEMY_X, y: 208 }],
    mode: 'browser', customMainC: c,
  });
  if (!r.ok) { bad('checkpoint project did not compile at stage ' + r.stage + ':\n' + String(r.log || '').slice(-1400)); }
  else {
    const h = H.openRom(r.romBytes);
    h.frames(60);                                  // settle on the floor (left of the door)
    const xs = [];
    let everDead = false, deadStuck = 0;
    h.hold(H.BTN.RIGHT);
    for (let i = 0; i < 260; i++) {
      h.nes.frame();
      xs.push(H.oamSprite(h.nes, 0).x);
      const dead = h.nes.cpu.mem[0x702];
      if (dead) { everDead = true; deadStuck++; } else deadStuck = 0;
    }
    h.release(H.BTN.RIGHT);
    const maxX = Math.max(...xs);
    const tailMin = Math.min(...xs.slice(120));    // min x after it's had time to die/respawn

    // The player walks past the door toward the enemy (it dies on overlap at the
    // enemy's left edge, ~ENEMY_X - player width).
    if (maxX > DOOR_X) ok('player walks past the door into the enemy (maxX ' + maxX + ')');
    else bad('player never reached past the door (maxX ' + maxX + ')');
    if (everDead) ok('player does die (reaches the enemy with HP 0)');
    else bad('player never died — scenario invalid');
    // Respawn point is the DOOR (~112), NOT the spawn (~16): after dying, x never
    // collapses back to the spawn.
    if (tailMin >= DOOR_X - 8) ok('respawns at the checkpoint door (tail min x ' + tailMin + ', not spawn ~16)');
    else bad('player went back past the checkpoint (tail min x ' + tailMin + ', door ~' + DOOR_X + ')');
    // Never permanently frozen: player_dead doesn't stay 1 for long.
    if (deadStuck < 5) ok('not a permanent freeze — player_dead clears (respawns)');
    else bad('player_dead stuck set for ' + deadStuck + ' frames (looks frozen)');
  }
} catch (e) {
  bad('threw: ' + (e && e.stack || e));
} finally {
  await H.stopServer(srv);
}

if (failed) process.exit(1);
console.log('\nCheckpoint smoke-test complete.');
