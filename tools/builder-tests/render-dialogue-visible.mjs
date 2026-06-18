#!/usr/bin/env node
// Render regression — dialogue text is actually VISIBLE on screen.
//
// Backfills the bugs B-2 (dialogue garbage) and the dialogue-invisible
// reports: it isn't enough that the project compiles — the box must open on
// a B press and the text must land in the nametable where it can be seen,
// then disappear cleanly on close.
//
// This is the suite that first exercised the render harness, and it caught a
// real engine bug in the process: the non-scroll dialogue path didn't disable
// rendering during its vblank VRAM burst, so the writes were unreliable (only
// part of the text appeared). That guard now lives in the dialogue module.
//
// Two things this leans on the harness for (both hard-won):
//   * jsnes has a 1-frame input latency — a press must be held >=2 frames
//     before release or the engine never sees it (H.tap handles this).
//   * Deterministic positioning without a working playerStart: the player
//     always spawns at the default (60,120) and falls; we park a FLYING NPC
//     at its resting spot (60,208 on a row-28 floor) so proximity is exact.
//
// See docs/plans/current/2026-06-18-arc-a-render-test-harness.md.

import * as H from './lib/render-harness.mjs';

const PORT = 18820;
const HELLO = [0x48, 0x45, 0x4C, 0x4C, 0x4F];   // tile indices = ASCII 'HELLO'
let failed = false;
const ok   = (m) => console.log('✓ ' + m);
const bad  = (m) => { console.error('FAIL: ' + m); failed = true; };

function makeState(win) {
  const s = {
    name: 'dlgvis', version: 1, universal_bg: 0x0F,
    sprites: [
      { role: 'player', name: 'hero', width: 2, height: 2, cells: H.mkCells(2, 2) },
      { role: 'npc', name: 'old', width: 2, height: 2, cells: H.mkCells(2, 2), flying: true },
    ],
    sprite_tiles: H.blankPool(), bg_tiles: H.blankPool(),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x30, 0x10, 0x20] })),
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    backgrounds: [H.flatBackground(1, 1, 28)],
    behaviour_types: H.BEHAVIOUR_TYPES, selectedBgIdx: 0,
    builder: win.BuilderDefaults(),
  };
  s.builder.modules.dialogue.enabled = true;       // default text 'HELLO'
  return s;
}

const win = H.loadBuilderModules();
const tpl = H.readTemplate();
const { srv } = await H.startServer(PORT);
try {
  const s = makeState(win);
  const r = await H.buildRom(PORT, {
    state: s, playerSpriteIdx: 0, playerStart: { x: 60, y: 120 },
    sceneSprites: [{ spriteIdx: 1, x: 60, y: 208 }],
    mode: 'browser', customMainC: win.BuilderAssembler.assemble(s, tpl),
  });
  if (!r.ok) {
    bad('dialogue project did not compile at stage ' + r.stage + ':\n' +
        String(r.log || '').slice(-1500));
  } else {
    const h = H.openRom(r.romBytes);
    h.frames(120);   // player falls from spawn and settles on the floor
    // NOTE: assertions read the nametable + decoded attribute table, NOT the
    // framebuffer. Arc B's full-width banner issues many more mid-vblank
    // $2006 writes than the old text-only path, and jsnes does not faithfully
    // restore the PPU scroll afterwards (correct on real hardware) — so the
    // rendered framebuffer is unreliable for dialogue. The nametable/attrib
    // are exact, and "text in palette 3 + palette 3 = white" proves legibility.
    // After each tap we settle a few frames: the big banner burst takes a
    // frame or two to fully land in jsnes.

    // Pre-condition: the row is empty before any interaction.
    const pre = [2, 3, 4, 5, 6].map((c) => H.ntTile(h.nes, 0, 25, c));
    if (pre.some((t) => t !== 0)) bad('dialogue row not empty before opening: ' + JSON.stringify(pre));
    else ok('dialogue row empty before interaction');

    // Press B near the NPC → the box opens.
    h.tap(H.BTN.B); h.frames(10);
    const open = [2, 3, 4, 5, 6].map((c) => H.ntTile(h.nes, 0, 25, c));
    if (JSON.stringify(open) === JSON.stringify(HELLO)) ok('B press renders "HELLO" to the dialogue row');
    else bad('expected HELLO ' + JSON.stringify(HELLO) + ' in nametable, got ' + JSON.stringify(open));

    // The banner fills the whole width: the left margin (cols 0-1) and the row
    // above the text (row 24) are blank box tiles (0x20), not scenery.
    const margin = [H.ntTile(h.nes, 0, 25, 0), H.ntTile(h.nes, 0, 25, 1), H.ntTile(h.nes, 0, 24, 5)];
    if (margin.every((t) => t === 0x20)) ok('banner fills full width (margins/top row are box tiles)');
    else bad('banner did not fill the full width: ' + JSON.stringify(margin));

    // The text region uses the reserved dialogue palette (3) so its colour is
    // fixed regardless of scenery — the actual readability fix.
    const palOpen = H.bgPalette(h.nes, 0, 25, 2);
    if (palOpen === 3) ok('dialogue text region uses the reserved palette 3 (white text)');
    else bad('text region palette is ' + palOpen + ', expected 3 (box not recoloured)');

    // Press B again → the box closes, the row is restored, and the attribute
    // table round-trips back to the original palette.
    h.tap(H.BTN.B); h.frames(10);
    const closed = [2, 3, 4, 5, 6].map((c) => H.ntTile(h.nes, 0, 25, c));
    if (closed.every((t) => t === 0)) ok('B press again closes the box and restores the row');
    else bad('row not restored after close: ' + JSON.stringify(closed));
    const palClosed = H.bgPalette(h.nes, 0, 25, 2);
    if (palClosed === 0) ok('attribute table restored on close (palette ' + palClosed + ')');
    else bad('attribute table not restored on close (palette ' + palClosed + ', expected 0)');
  }
} catch (e) {
  bad('threw: ' + (e && e.stack || e));
} finally {
  await H.stopServer(srv);
}

if (failed) process.exit(1);
console.log('\nDialogue-visible render smoke-test complete.');
