#!/usr/bin/env node
// BR-03 render regression — large two-player sprites must NOT overrun the OAM
// shadow buffer at runtime.
//
// The NES has 64 hardware sprites = a 256-byte OAM shadow buffer (oam_buf,
// $0200).  An 8x8-tile Player 1 is 64 sprites and fills the whole buffer by
// itself; with Player 2 also on, the P2 render would write past oam_buf[255]
// into the reserved $0300+ region (the latent-corruption bug BR-03 describes).
//
// The Builder validator (player-oam-budget.mjs) BLOCKS this config, but the
// engine guard is the last line of defence for imported / hand-crafted states
// that bypass the validator — which is exactly the path this render test
// exercises: it builds the over-budget ROM directly through /play (the server
// doesn't run the client-side validators) and runs it.
//
// We probe the engine's `oam_idx` (the OAM write cursor) right after every
// sprite has been emitted for the frame.  With the guard working, Player 1
// fills the buffer to exactly 256 and Player 2's writes are skipped, so
// oam_idx == 256 and never exceeds it.  Without the guard, two 8x8 players
// would drive oam_idx to 512 (256 bytes past the buffer).
//
// See docs/plans/current/2026-06-20-bug-report-fix-plan.md (BR-03) and
// docs/plans/current/2026-06-18-arc-a-render-test-harness.md.

import * as H from './lib/render-harness.mjs';

const PORT = 18831;
let failed = false;
const ok  = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };

const win = H.loadBuilderModules();
const tpl = H.readTemplate();
const { srv } = await H.startServer(PORT);
try {
  // Two 8x8 Player sprites (the report's exact repro) + Player 2 enabled.
  const s = {
    name: 'oam-overflow', version: 1, universal_bg: 0x0F,
    sprites: [
      { role: 'player', name: 'hero', width: 8, height: 8, cells: H.mkCells(8, 8) },
      { role: 'player', name: 'twin', width: 8, height: 8, cells: H.mkCells(8, 8) },
    ],
    sprite_tiles: H.blankPool(), bg_tiles: H.blankPool(),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x30, 0x10, 0x20] })),
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    backgrounds: [H.flatBackground(1, 1, 28)],
    behaviour_types: H.BEHAVIOUR_TYPES, selectedBgIdx: 0,
    builder: win.BuilderDefaults(),
  };
  s.builder.modules.players.config.count = 2;
  s.builder.modules.players.submodules.player1.enabled = true;
  s.builder.modules.players.submodules.player2.enabled = true;

  // Probe oam_idx right after all sprites are filled (just before the engine
  // parks the unused OAM slots off-screen).  $0710..$0712 are scratch RAM
  // (the spawn suite uses $0704/$0705 the same way).
  let c = win.BuilderAssembler.assemble(s, tpl);
  const ANCHOR = 'while (oam_idx < 256) {';
  if (!c.includes(ANCHOR)) { bad('probe anchor not found in template'); }
  c = c.replace(ANCHOR,
    '(*(unsigned char*)0x0710) = (oam_idx > 256u) ? 1 : 0;' +
    '(*(unsigned char*)0x0711) = (unsigned char)(oam_idx & 0xFF);' +
    '(*(unsigned char*)0x0712) = (unsigned char)(oam_idx >> 8);' + ANCHOR);

  const r = await H.buildRom(PORT, {
    state: s,
    playerSpriteIdx: 0,  playerStart:  { x: 40,  y: 120 },
    playerSpriteIdx2: 1, playerStart2: { x: 140, y: 120 },
    mode: 'browser',
    customMainC: c,
  });
  if (!r.ok) {
    bad('over-budget two-player ROM did not compile at stage ' + r.stage + ':\n' +
      String(r.log || '').slice(-1500));
  } else {
    ok('two-8x8-player ROM builds (' + r.size + ' bytes)');
    const h = H.openRom(r.romBytes);
    h.frames(12);   // let a few frames render so the OAM fill runs

    const overflow = h.nes.cpu.mem[0x710];
    const oamIdx = h.nes.cpu.mem[0x711] + 256 * h.nes.cpu.mem[0x712];

    if (overflow === 0) ok('engine never drove oam_idx past 256 (no OOB OAM write)');
    else bad('OAM overflow flag set — oam_idx exceeded 256 (got ' + oamIdx + ')');

    // Player 1 (8x8 = 64 sprites) fills the buffer exactly; the guard then
    // skips Player 2.  Without the guard this would be 512.
    if (oamIdx === 256) {
      ok('Player 1 filled OAM to exactly 256 and the Player 2 guard skipped the rest');
    } else if (oamIdx < 256) {
      bad('oam_idx (' + oamIdx + ') < 256 — Player 1 did not fill as expected (test setup drift?)');
    } else {
      bad('oam_idx (' + oamIdx + ') > 256 — Player 2 wrote past the OAM shadow buffer');
    }
  }
} catch (e) {
  bad('threw: ' + (e && e.stack || e));
} finally {
  await H.stopServer(srv);
}

if (failed) process.exit(1);
console.log('\nBR-03 player-OAM-overflow render test complete.');
