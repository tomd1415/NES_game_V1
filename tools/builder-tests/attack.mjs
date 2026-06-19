#!/usr/bin/env node
// R-7 — press a button to play a one-shot attack animation.
//
// The player1 module binds A/B to an "attack" animation; the server emits the
// ATTACK_FRAME_COUNT + attack_tiles tables when one is assigned; the engine
// plays it once (anim_mode 3, top priority) on a button edge. This checks the
// emit AND drives a real ROM: pressing B swaps the player to the attack frames
// and then reverts (one-shot).
//
// See docs/plans/current/2026-06-18-arc-c-tier2-backlog.md (R-7).

import * as H from './lib/render-harness.mjs';

const PORT = 18827;
let failed = false;
const ok  = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };

const cellsT = (t) => Array.from({ length: 2 }, () =>
  Array.from({ length: 2 }, () => ({ tile: t, palette: 0, empty: false })));
const solid = (v) => ({ pixels: Array.from({ length: 8 }, () => Array(8).fill(v)), name: 't' + v });

function makeState(win, attackButton) {
  // sprite-tile pool: distinct patterns at 1/2/3 so idle vs attack frames map
  // to distinct CHR tiles (detectable in OAM).
  const st = H.blankPool();
  st[1] = solid(1); st[2] = solid(2); st[3] = solid(3);
  const s = {
    name: 'atk', version: 1, universal_bg: 0x0F,
    sprites: [
      { role: 'player', name: 'hero', width: 2, height: 2, cells: cellsT(1) },   // idle (Player 1)
      { role: 'other', name: 'atk1', width: 2, height: 2, cells: cellsT(2) },     // attack frame 1
      { role: 'other', name: 'atk2', width: 2, height: 2, cells: cellsT(3) },     // attack frame 2
    ],
    sprite_tiles: st, bg_tiles: H.blankPool(),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x30, 0x10, 0x20] })),
    animations: [{ id: 'atk', frames: [1, 2], fps: 12 }],
    animation_assignments: { walk: null, jump: null, attack: 'atk' },
    nextAnimationId: 2,
    backgrounds: [H.flatBackground(1, 1, 28)],
    behaviour_types: H.BEHAVIOUR_TYPES, selectedBgIdx: 0,
    builder: win.BuilderDefaults(),
  };
  // player1 is a submodule of `players` (modules.players.submodules.player1).
  s.builder.modules.players.submodules.player1.config.attackButton = attackButton;
  return s;
}

const win = H.loadBuilderModules();
const tpl = H.readTemplate();

// --- Emit guards ---
{
  const cB = win.BuilderAssembler.assemble(makeState(win, 'b'), tpl);
  const cA = win.BuilderAssembler.assemble(makeState(win, 'a'), tpl);
  const cOff = win.BuilderAssembler.assemble(makeState(win, 'none'), tpl);
  // NB the template carries a default `#define BW_ATTACK_BUTTON 0`; the MODULE
  // emit is the non-zero (0x..) value, so match on the hex form.
  if (/^#define BW_ATTACK_BUTTON 0x40/m.test(cB)) ok('attackButton B emits BW_ATTACK_BUTTON 0x40');
  else bad('attackButton B did not emit 0x40');
  if (/^#define BW_ATTACK_BUTTON 0x80/m.test(cA)) ok('attackButton A emits BW_ATTACK_BUTTON 0x80');
  else bad('attackButton A did not emit 0x80');
  if (!/^#define BW_ATTACK_BUTTON 0x/m.test(cOff)) ok('attackButton None omits the macro (byte-identical gate)');
  else bad('attackButton None unexpectedly emitted a non-zero BW_ATTACK_BUTTON');
}

// --- Render: pressing B plays the attack once, then reverts ---
const { srv } = await H.startServer(PORT);
try {
  const s = makeState(win, 'b');
  const r = await H.buildRom(PORT, {
    state: s, playerSpriteIdx: 0, playerStart: { x: 60, y: 120 }, sceneSprites: [],
    mode: 'browser', customMainC: win.BuilderAssembler.assemble(s, tpl),
  });
  if (!r.ok) {
    bad('attack project did not compile at stage ' + r.stage + ':\n' + String(r.log || '').slice(-1500));
  } else {
    const h = H.openRom(r.romBytes);
    h.frames(120);                              // settle, idle
    const idleTile = H.oamSprite(h.nes, 0).tile;
    // Press B (attack button). Capture the player's top-left OAM tile per frame.
    h.nes.buttonDown(1, H.BTN.B); h.nes.frame(); h.nes.frame();   // 2 frames (latency)
    h.nes.buttonUp(1, H.BTN.B);
    const tiles = [];
    for (let i = 0; i < 28; i++) { h.nes.frame(); tiles.push(H.oamSprite(h.nes, 0).tile); }

    const attacked = tiles.some((t) => t !== idleTile);
    const reverted = tiles[tiles.length - 1] === idleTile;
    if (attacked) ok('B press swaps the player to the attack frames (idle ' + idleTile + ' → ' + [...new Set(tiles)].join('/') + ')');
    else bad('B press did not change the player frame (stuck on idle ' + idleTile + ')');
    if (reverted) ok('attack is one-shot — reverts to idle after one cycle');
    else bad('player did not revert to idle (last tile ' + tiles[tiles.length - 1] + ', idle ' + idleTile + ')');
  }
} catch (e) {
  bad('threw: ' + (e && e.stack || e));
} finally {
  await H.stopServer(srv);
}

if (failed) process.exit(1);
console.log('\nAttack-animation smoke-test complete.');
