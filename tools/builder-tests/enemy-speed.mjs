#!/usr/bin/env node
// R-4 — per-instance enemy speed.
//
// The scene module's walker/chaser AI used a hard-coded `+= 1`; it now takes a
// per-instance `speed` (px/frame, clamped 1..4). This checks both the emitted C
// (the parametrised steps + threshold) AND the running ROM (a speed-3 walker
// actually advances 3px/frame).
//
// See docs/plans/current/2026-06-18-arc-c-tier2-backlog.md (R-4).

import * as H from './lib/render-harness.mjs';

const PORT = 18826;
let failed = false;
const ok  = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };

const win = H.loadBuilderModules();
const tpl = H.readTemplate();

function sceneState(ai, speed) {
  const s = {
    name: 'spd', version: 1, universal_bg: 0x0F,
    sprites: [
      { role: 'player', name: 'hero', width: 2, height: 2, cells: H.mkCells(2, 2) },
      { role: 'enemy', name: 'baddie', width: 2, height: 2, cells: H.mkCells(2, 2) },
    ],
    sprite_tiles: H.blankPool(), bg_tiles: H.blankPool(),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x30, 0x10, 0x20] })),
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    backgrounds: [H.flatBackground(1, 1, 28)],
    behaviour_types: H.BEHAVIOUR_TYPES, selectedBgIdx: 0,
    builder: win.BuilderDefaults(),
  };
  s.builder.modules.scene.enabled = true;
  s.builder.modules.scene.config.instances = [{ id: 'e0', spriteIdx: 1, x: 40, y: 208, ai, speed }];
  return s;
}

// --- Emit guards (no server) ---
{
  const walker = win.BuilderAssembler.assemble(sceneState('walker', 3), tpl);
  if (/ss_x\[0\] \+= 3;/.test(walker) && /ss_x\[0\] -= 3;/.test(walker)) ok('walker speed 3 emits ±3 steps');
  else bad('walker speed 3 did not emit ss_x[0] += 3 / -= 3');
  if (!/ss_x\[0\] \+= 1;/.test(walker)) ok('walker speed 3 does not emit the old += 1');
  else bad('walker speed 3 still emits the hard-coded += 1');

  const chaser = win.BuilderAssembler.assemble(sceneState('chaser', 2), tpl);
  if (/ss_x\[0\] \+ 2 <= px/.test(chaser) && /px \+ 2\)/.test(chaser)) ok('chaser speed 2 uses the speed-2 threshold (no oscillation)');
  else bad('chaser speed 2 did not parametrise the px threshold');

  // Default (no speed field) falls back to 1 = today's feel.
  const dflt = win.BuilderAssembler.assemble(sceneState('walker', undefined), tpl);
  if (/ss_x\[0\] \+= 1;/.test(dflt)) ok('missing speed falls back to 1 (unchanged feel)');
  else bad('missing speed did not fall back to 1');
}

// --- Render: a speed-3 walker advances 3px/frame ---
const { srv } = await H.startServer(PORT);
try {
  const s = sceneState('walker', 3);
  const r = await H.buildRom(PORT, {
    state: s, playerSpriteIdx: 0, playerStart: { x: 200, y: 120 },
    sceneSprites: [{ spriteIdx: 1, x: 40, y: 208 }],
    mode: 'browser', customMainC: win.BuilderAssembler.assemble(s, tpl),
  });
  if (!r.ok) {
    bad('speed-3 walker did not compile at stage ' + r.stage + ':\n' + String(r.log || '').slice(-1200));
  } else {
    const h = H.openRom(r.romBytes);
    h.frames(20);                          // settle the enemy on the floor
    const xs = [];
    for (let i = 0; i < 8; i++) { h.nes.frame(); xs.push(H.oamSprite(h.nes, 4).x); }
    // Per-frame deltas while moving right (before any wall/edge reversal).
    const deltas = xs.slice(1).map((x, i) => x - xs[i]).filter((d) => d > 0);
    const allThree = deltas.length >= 3 && deltas.every((d) => d === 3);
    if (allThree) ok('speed-3 walker advances exactly 3px/frame (' + xs.join(',') + ')');
    else bad('speed-3 walker did not advance 3px/frame: deltas ' + JSON.stringify(deltas) + ' xs ' + JSON.stringify(xs));
  }
} catch (e) {
  bad('threw: ' + (e && e.stack || e));
} finally {
  await H.stopServer(srv);
}

if (failed) process.exit(1);
console.log('\nEnemy-speed smoke-test complete.');
