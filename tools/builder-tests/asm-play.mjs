#!/usr/bin/env node
// T7.6d — asm /play smoke test.
//
// Until now no run-all.mjs suite actually built an asm `/play` ROM — the
// byte-identical test and every chunk suite are C.  So the asm path (raw 6502,
// single-player, no Builder modules) could silently stop compiling and nothing
// would notice.  This posts the shipped asm starter as `customMainAsm` and
// asserts the server assembles + links a real NES ROM, exercising
// build_scene_asminc + the ca65/ld65 asm-only Makefile path end to end.
//
// (Companion to the T7.6c parity guard in run-all.mjs, which checks the asm and
// C scene emitters keep their shared identifiers in sync.)

import fs from 'node:fs';
import path from 'node:path';
import * as H from './lib/render-harness.mjs';

const PORT = 18835;
let failed = false;
const ok  = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };

const STARTER = path.join(H.ROOT, 'steps', 'Step_Playground', 'src', 'main.s.starter');
const asmSrc = fs.readFileSync(STARTER, 'utf8');

// The asm starter references the scene.asminc symbols the server generates from
// `state` (player_tiles, NUM_STATIC_SPRITES, ss_*), so a minimal one-player
// project is enough to feed it.
const s = {
  name: 'asm-smoke', version: 1, universal_bg: 0x0F,
  sprites: [{ role: 'player', name: 'hero', width: 2, height: 2, cells: H.mkCells(2, 2) }],
  sprite_tiles: H.blankPool(), bg_tiles: H.blankPool(),
  sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
  bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x30, 0x10, 0x20] })),
  animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
  backgrounds: [H.flatBackground(1, 1, 28)],
  behaviour_types: H.BEHAVIOUR_TYPES, selectedBgIdx: 0,
};

const { srv } = await H.startServer(PORT);
try {
  // Sanity: the starter must carry the honest-scope banner (T7.6b).
  if (!/raw 6502 path/.test(asmSrc)) bad('asm starter is missing the T7.6b scope banner');
  else ok('asm starter carries the raw-6502 scope banner');

  const r = await H.buildRom(PORT, {
    state: s,
    playerSpriteIdx: 0,
    playerStart: { x: 60, y: 120 },
    mode: 'browser',
    customMainAsm: asmSrc,
  });
  if (!r.ok) {
    bad('asm /play build rejected at stage ' + r.stage + ':\n' + String(r.log || '').slice(-1800));
  } else if (!r.romBytes || r.romBytes.length < 16384) {
    bad('asm /play returned a suspiciously small ROM (' + (r.romBytes && r.romBytes.length) + ' bytes)');
  } else {
    // iNES magic — confirm it's a real NES image.
    const magic = r.romBytes.subarray(0, 4).toString('latin1');
    if (magic !== 'NES\x1a') bad('asm ROM lacks the iNES magic header (got ' + JSON.stringify(magic) + ')');
    else ok('asm /play assembles + links a real NES ROM (' + r.size + ' bytes)');
  }
} catch (e) {
  bad('threw: ' + (e && e.stack || e));
} finally {
  await H.stopServer(srv);
}

if (failed) process.exit(1);
console.log('\nasm-play smoke test complete.');
