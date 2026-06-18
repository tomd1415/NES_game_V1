#!/usr/bin/env node
// Render regression — the dialogue font is auto-seeded into the CHR.
//
// Backfills B-2 (dialogue garbage): when a project turns dialogue on but the
// pupil hasn't drawn letters, the server seeds a built-in uppercase font into
// the blank background tiles at ASCII tile indices. If that seeding regresses,
// dialogue draws blank/garbage tiles. We read the glyphs straight out of the
// compiled ROM's CHR (scroll- and PPU-independent) and check they match the
// engine's font, so this is a precise guard on the seeding path.
//
// Pairs with render-dialogue-visible.mjs (which proves the seeded glyphs
// actually reach the screen). See the Arc A plan.

import * as H from './lib/render-harness.mjs';

const PORT = 18822;
let failed = false;
const ok  = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };

// Expected shapes (from _DIALOGUE_FONT in playground_server.py). Pixel value
// is 1 for a stroke; we compare the boolean stroke mask so a palette/value
// tweak doesn't make this brittle.
const EXPECT = {
  0x48: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'], // H
  0x4F: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'], // O
  0x45: ['#####', '#....', '#....', '###..', '#....', '#....', '#####'], // E
};
// Glyphs are 7 rows tall in an 8-row tile (row 8 is blank padding); compare
// the 5-wide stroke mask over the 7 content rows.
const maskOf = (grid) => grid.slice(0, 7).map(r => r.map(p => (p ? '#' : '.')).join('').slice(0, 5));
const wantMask = (rows) => rows.slice(0, 7).map(r => r.padEnd(5, '.').slice(0, 5));

const win = H.loadBuilderModules();
const tpl = H.readTemplate();
const { srv } = await H.startServer(PORT);
try {
  const s = {
    name: 'fontseed', version: 1, universal_bg: 0x0F,
    sprites: [{ role: 'player', name: 'hero', width: 2, height: 2, cells: H.mkCells(2, 2) }],
    sprite_tiles: H.blankPool(), bg_tiles: H.blankPool(),   // blank → server must seed
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x30, 0x10, 0x20] })),
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    backgrounds: [H.flatBackground(1, 1, 28)],
    behaviour_types: H.BEHAVIOUR_TYPES, selectedBgIdx: 0,
    builder: win.BuilderDefaults(),
  };
  s.builder.modules.dialogue.enabled = true;

  const r = await H.buildRom(PORT, {
    state: s, playerSpriteIdx: 0, playerStart: { x: 60, y: 120 }, sceneSprites: [],
    mode: 'browser', customMainC: win.BuilderAssembler.assemble(s, tpl),
  });
  if (!r.ok) {
    bad('font-seed project did not compile at stage ' + r.stage + ':\n' + String(r.log || '').slice(-1500));
  } else {
    // The dialogue font lives in the BG pattern table ($1000 — PPU_CTRL bit 4).
    // A blank-bg project with dialogue OFF would leave these tiles empty.
    for (const [idxStr, rows] of Object.entries(EXPECT)) {
      const idx = Number(idxStr);
      const ch = String.fromCharCode(idx);
      if (H.chrTileBlank(r.romBytes, 1, idx)) { bad("glyph '" + ch + "' (0x" + idx.toString(16) + ") is BLANK in CHR — font not seeded"); continue; }
      const got = maskOf(H.chrTile(r.romBytes, 1, idx));
      const want = wantMask(rows);
      if (JSON.stringify(got) === JSON.stringify(want)) ok("glyph '" + ch + "' seeded and matches the font");
      else bad("glyph '" + ch + "' shape mismatch:\n  got  " + JSON.stringify(got) + "\n  want " + JSON.stringify(want));
    }

    // Control: a space (0x20) must stay blank, and an un-lettered tile too.
    if (H.chrTileBlank(r.romBytes, 1, 0x20)) ok("space (0x20) stays blank as expected");
    else bad('space glyph (0x20) unexpectedly has pixels');
  }
} catch (e) {
  bad('threw: ' + (e && e.stack || e));
} finally {
  await H.stopServer(srv);
}

if (failed) process.exit(1);
console.log('\nDialogue font-glyph render smoke-test complete.');
