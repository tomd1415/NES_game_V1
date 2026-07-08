#!/usr/bin/env node
// Sprint-7 migration helper (NOT a regression suite — named with a leading
// underscore so run-all.mjs's `.mjs` auto-discovery still picks it up, but it
// is self-asserting and harmless).
//
// Builds the "everything on" Builder project through the real client-side
// assemble → /play path and prints the sha1 of the resulting ROM.  The whole
// point of Sprint 7 is that moving a per-frame loop from a string-emitted
// `appendToSlot` into a `#if`-gated block in platformer.c is BYTE-PRESERVING:
// this ROM's hash must not change across any T7.x migration.  Run it before a
// migration to capture the baseline, and after to prove equivalence.
//
// It also self-checks against a pinned hash (EXPECT) when one is set, so it can
// live in the suite as a standing "the everything-on ROM is still <hash>" guard.

import { createHash } from 'node:crypto';
import * as H from './lib/render-harness.mjs';

// The everything-on ROM hash.  Each verbatim per-frame loop move (Sprint 7
// T7.1–T7.5) must keep this UNCHANGED — the "ROM-equality diff" the Arc D plan
// calls the strongest proof a migration is behaviour-preserving.  Re-pin
// deliberately when codegen legitimately changes; note why.
//   0aed6e95… is the value with the 2-PLAYER ASM player physics shipped by default
//     (engine v50). This fixture is a 2-player platformer, so P1 now runs the ASM
//     plat_update and P2 the ASM p2_plat_update. Both are A/B-proven byte-behaviour-
//     identical to the C (asm-player.mjs runPlatformer + runP2Platformer, matched
//     px/py + px2/py2 over 400 ticks) — the byte change is the ASM P1+P2 physics.
//   54a15150… was the value with single-player player physics shipped (v43) but 2P
//     still on cc65 C. Behaviourally identical to the C — the byte change was the
//     scene-sprite AI (v30) + single-player ASM player (v43).
//   27210a8f… was the pre-v30 value (universal engine + scroll ASM, but the enemy
//     AI still in cc65 C; set PLAYGROUND_NO_ASM=1 to rebuild the pure-C engine).
//   8172e353… was engine v19 (NES_ASM_LEAF always + NES_ASM_SCROLL for scroll).
//   42a45ca8… was the pure-C -Os value; ce62ec47… the no-opt value.
const EXPECT = '0aed6e95684bc3bbd665353759f2a003dad45bf6';

const PORT = 18834;

function mkCells(w, h) {
  return Array.from({ length: h }, () =>
    Array.from({ length: w }, () => ({ tile: 1, palette: 0, empty: false })));
}

function makeEverythingState(win) {
  const sprites = [
    { role: 'player', name: 'hero',  width: 2, height: 2, cells: mkCells(2, 2) },
    { role: 'player', name: 'hero2', width: 2, height: 2, cells: mkCells(2, 2) },
    { role: 'enemy',  name: 'goomba',width: 2, height: 2, cells: mkCells(2, 2) },
    { role: 'npc',    name: 'oldman',width: 2, height: 2, cells: mkCells(2, 2) },
    { role: 'pickup', name: 'coin',  width: 1, height: 1, cells: mkCells(1, 1) },
    { role: 'hud',    name: 'heart', width: 1, height: 1, cells: mkCells(1, 1) },
  ];
  const s = {
    name: 'everything', version: 1, universal_bg: 0x21, sprites,
    sprite_tiles: H.blankPool(), bg_tiles: H.blankPool(),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x0F, 0x10, 0x30] })),
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    backgrounds: [{
      name: 'bg', dimensions: { screens_x: 1, screens_y: 1 },
      nametable: Array.from({ length: 30 }, () =>
        Array.from({ length: 32 }, () => ({ tile: 0, palette: 0 }))),
      behaviour: (() => {
        const m = Array.from({ length: 30 }, () => Array(32).fill(0));
        for (let c = 0; c < 32; c++) m[28][c] = 1;
        m[20][20] = 5; m[18][8] = 4;
        return m;
      })(),
    }],
    behaviour_types: [
      { id: 0, name: 'none' }, { id: 1, name: 'solid_ground' }, { id: 2, name: 'wall' },
      { id: 3, name: 'platform' }, { id: 4, name: 'door' }, { id: 5, name: 'trigger' },
      { id: 6, name: 'ladder' },
    ],
    selectedBgIdx: 0, builder: win.BuilderDefaults(),
  };
  const m = s.builder.modules;
  m.players.config.count = 2;
  m.players.submodules.player1.enabled = true;
  m.players.submodules.player2.enabled = true;
  m.players.submodules.player1.config.maxHp = 3;
  m.players.submodules.player2.config.maxHp = 3;
  m.pickups.enabled = true;
  m.damage.enabled = true;
  m.hud.enabled = true;
  m.doors.enabled = true;
  m.dialogue.enabled = true;
  m.spawn.enabled = true;
  m.spawn.config.spriteIdx = 2;
  Object.assign(m.damage.config, { spawnOnHit: true, spawnSpriteIdx: 2, spawnTtl: 16 });
  m.scene.config.instances = [
    { id: 'e', spriteIdx: 2, x: 96,  y: 120, ai: 'walker', speed: 3 },
    { id: 'n', spriteIdx: 3, x: 140, y: 120, ai: 'static', text: 'HELLO THERE' },
    { id: 'p', spriteIdx: 4, x: 180, y: 120, ai: 'static' },
  ];
  return s;
}

const win = H.loadBuilderModules();
const tpl = H.readTemplate();
const { srv } = await H.startServer(PORT);
let failed = false;
try {
  const s = makeEverythingState(win);
  const r = await H.buildRom(PORT, {
    state: s,
    playerSpriteIdx: 0, playerSpriteIdx2: 1,
    playerStart: { x: 60, y: 120 }, playerStart2: { x: 180, y: 120 },
    sceneSprites: [
      { spriteIdx: 2, x: 96, y: 120 }, { spriteIdx: 3, x: 140, y: 120 },
      { spriteIdx: 4, x: 180, y: 120 },
    ],
    mode: 'browser',
    customMainC: win.BuilderAssembler.assemble(s, tpl),
  });
  if (!r.ok) {
    console.error('FAIL: everything-on build rejected at stage ' + r.stage + ':\n' +
      String(r.log || '').slice(-1500));
    failed = true;
  } else {
    const sha = createHash('sha1').update(r.romBytes).digest('hex');
    console.log('everything-on ROM sha1: ' + sha + '  (' + r.size + ' bytes)');
    if (EXPECT) {
      if (sha === EXPECT) console.log('✓ matches pinned hash (migration byte-preserving)');
      else { console.error('FAIL: ROM hash drifted from pinned ' + EXPECT); failed = true; }
    }
  }
} catch (e) {
  console.error('FAIL: threw ' + (e && e.stack || e));
  failed = true;
} finally {
  await H.stopServer(srv);
}
if (failed) process.exit(1);
console.log('\n_rom-equiv: done.');
