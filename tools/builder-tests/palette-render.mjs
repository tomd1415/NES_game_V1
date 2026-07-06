#!/usr/bin/env node
// Palette fidelity — the colours a pupil picks must be the colours the ROM
// loads into the PPU (bug #16 "the palettes … do not match what they should be
// and the ones that are selected are not always represented").
//
// Diagnosis (2026-07-06): at the ROM level the mapping is FAITHFUL — this test
// builds a project whose 4 BG + 4 sprite palettes each hold distinctive NES
// colour indices and asserts the emulator's palette RAM ($3F00-$3F1F) matches
// exactly.  So if a mismatch is ever observed it lives in the EDITOR preview
// (sprite-render.js / the palette-swatch UI), not codegen — this test guards
// the codegen half from regressing.
//
// PPU palette layout: $3F00+n*4 = BG palette n, $3F10+n*4 = sprite palette n.
// Byte 0 of every 4-entry group is the universal background colour; bytes 1-3
// are the three chosen slots.

import * as H from './lib/render-harness.mjs';

const PORT = 18861;
let failed = false;
const ok  = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };

const UBG = 0x0F;
// Distinctive, all-different triples so a swapped/duplicated palette is caught.
const BG = [[0x21, 0x0A, 0x16], [0x11, 0x1A, 0x26], [0x12, 0x2A, 0x36], [0x13, 0x0B, 0x28]];
const SP = [[0x16, 0x27, 0x30], [0x14, 0x24, 0x34], [0x15, 0x25, 0x35], [0x17, 0x28, 0x38]];

const win = H.loadBuilderModules();
const tpl = H.readTemplate();
const { srv } = await H.startServer(PORT);
try {
  const cols = 32, rows = 30;
  const beh = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let c = 0; c < cols; c++) beh[28][c] = 1;
  const bg = {
    name: 'bg', dimensions: { screens_x: 1, screens_y: 1 },
    nametable: Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => ({ tile: 0, palette: 0 }))),
    behaviour: beh,
  };
  const s = {
    name: 'pal', version: 1, universal_bg: UBG,
    sprites: [{ role: 'player', name: 'hero', width: 2, height: 2, cells: H.mkCells(2, 2) }],
    sprite_tiles: H.blankPool(), bg_tiles: H.blankPool(),
    sprite_palettes: SP.map((slots) => ({ slots })),
    bg_palettes: BG.map((slots) => ({ slots })),
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    backgrounds: [bg], behaviour_types: H.BEHAVIOUR_TYPES, selectedBgIdx: 0,
    builder: win.BuilderDefaults(),
  };
  const r = await H.buildRom(PORT, {
    state: s, playerSpriteIdx: 0, playerStart: { x: 16, y: 120 },
    sceneSprites: [], mode: 'browser', customMainC: win.BuilderAssembler.assemble(s, tpl),
  });
  if (!r.ok) {
    bad('palette project did not compile at stage ' + r.stage + ':\n' + String(r.log || '').slice(-1200));
  } else {
    const h = H.openRom(r.romBytes);
    h.frames(8);
    const vram = h.nes.ppu.vramMem;
    const at = (base) => [0, 1, 2, 3].map((i) => vram[base + i]);
    for (let n = 0; n < 4; n++) {
      const got = at(0x3F00 + n * 4), want = [UBG, ...BG[n]];
      if (got.join(',') === want.join(',')) ok('BG palette ' + n + ' loads exactly [' + want.map((v) => '0x' + v.toString(16)).join(', ') + ']');
      else bad('BG palette ' + n + ' mismatch — want ' + JSON.stringify(want) + ' got ' + JSON.stringify(got));
    }
    for (let n = 0; n < 4; n++) {
      const got = at(0x3F10 + n * 4), want = [UBG, ...SP[n]];
      if (got.join(',') === want.join(',')) ok('sprite palette ' + n + ' loads exactly [' + want.map((v) => '0x' + v.toString(16)).join(', ') + ']');
      else bad('sprite palette ' + n + ' mismatch — want ' + JSON.stringify(want) + ' got ' + JSON.stringify(got));
    }
  }
} catch (e) {
  bad('threw: ' + (e && e.stack || e));
} finally {
  await H.stopServer(srv);
}

if (failed) process.exit(1);
console.log('\nPalette-fidelity (bug #16, ROM level) test complete.');
