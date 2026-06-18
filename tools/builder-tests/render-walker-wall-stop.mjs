#!/usr/bin/env node
// Render regression — a walker enemy stops at a wall instead of walking
// through it.
//
// Backfills B-1 ("enemies go through stuff" / "don't bounce off block"): the
// walker/chaser AI now calls bw_sprite_blocked() before each step, so a
// multi-tile enemy turns at a SOLID_GROUND / WALL column like the player does.
// We drive a real ROM: a walker starts left of a wall column and we watch its
// on-screen X over time — it must approach the wall, never cross into it, and
// reverse. Pre-fix it would sail straight through.
//
// See docs/plans/current/2026-06-18-arc-a-render-test-harness.md.

import * as H from './lib/render-harness.mjs';

const PORT = 18823;
let failed = false;
const ok  = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };

const WALL_COL = 14;                 // wall column → left edge at x = 112
const WALL_X   = WALL_COL * 8;       // 112
const START_X  = 80;                 // enemy spawn (col 10), 2x2 = 16px wide

// 1x1 background: full-width floor on row 28 + a wall column the walker hits.
function walledBackground() {
  const cols = 32, rows = 30;
  const beh = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let c = 0; c < cols; c++) beh[28][c] = 1;          // SOLID_GROUND floor
  for (let r = 24; r <= 29; r++) beh[r][WALL_COL] = 2;    // WALL column
  return {
    name: 'bg', dimensions: { screens_x: 1, screens_y: 1 },
    nametable: Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => ({ tile: 0, palette: 0 }))),
    behaviour: beh,
  };
}

const win = H.loadBuilderModules();
const tpl = H.readTemplate();
const { srv } = await H.startServer(PORT);
try {
  const s = {
    name: 'walker', version: 1, universal_bg: 0x0F,
    sprites: [
      { role: 'player', name: 'hero', width: 2, height: 2, cells: H.mkCells(2, 2) },
      { role: 'enemy', name: 'baddie', width: 2, height: 2, cells: H.mkCells(2, 2) },
    ],
    sprite_tiles: H.blankPool(), bg_tiles: H.blankPool(),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x30, 0x10, 0x20] })),
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    backgrounds: [walledBackground()],
    behaviour_types: H.BEHAVIOUR_TYPES, selectedBgIdx: 0,
    builder: win.BuilderDefaults(),
  };
  // One manually-placed walker enemy → scene-module per-instance AI.
  s.builder.modules.scene.enabled = true;
  s.builder.modules.scene.config.instances = [
    { id: 'e0', spriteIdx: 1, x: START_X, y: 208, ai: 'walker' },
  ];

  const r = await H.buildRom(PORT, {
    state: s, playerSpriteIdx: 0, playerStart: { x: 16, y: 120 },
    sceneSprites: [{ spriteIdx: 1, x: START_X, y: 208 }],
    mode: 'browser', customMainC: win.BuilderAssembler.assemble(s, tpl),
  });
  if (!r.ok) {
    bad('walker project did not compile at stage ' + r.stage + ':\n' + String(r.log || '').slice(-1500));
  } else {
    const h = H.openRom(r.romBytes);
    h.frames(10);
    // The enemy is the first scene sprite → OAM slot 4 (player 2x2 = 0..3).
    const enemyX = () => H.oamSprite(h.nes, 4).x;
    const x0 = enemyX();
    let maxX = x0, reversedFrom = -1;
    for (let f = 0; f < 90; f++) {
      h.frames(1);
      const x = enemyX();
      if (x > maxX) maxX = x;
      if (reversedFrom < 0 && maxX > x0 && x < maxX) reversedFrom = maxX;
    }

    if (Math.abs(x0 - START_X) <= 4) ok('enemy spawns at the wall-test start (x=' + x0 + ')');
    else bad('enemy did not spawn near x=' + START_X + ' (got ' + x0 + ')');

    if (maxX > x0) ok('walker actually moves toward the wall (x ' + x0 + ' → ' + maxX + ')');
    else bad('walker never moved — AI not active (x stuck at ' + x0 + ')');

    // The enemy is 16px wide; its right edge must never enter the wall column.
    if (maxX + 16 <= WALL_X + 1) ok('walker stops before the wall (max right edge ' + (maxX + 16) + ' <= ' + WALL_X + ')');
    else bad('walker passed into/through the wall — max X ' + maxX + ' (right edge ' + (maxX + 16) + ' >= wall ' + WALL_X + ')');

    if (reversedFrom > 0) ok('walker bounces back off the wall (reversed at x=' + reversedFrom + ')');
    else bad('walker reached the wall but never turned around');
  }
} catch (e) {
  bad('threw: ' + (e && e.stack || e));
} finally {
  await H.stopServer(srv);
}

if (failed) process.exit(1);
console.log('\nWalker-wall-stop render smoke-test complete.');
