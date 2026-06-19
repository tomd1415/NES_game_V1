#!/usr/bin/env node
// Render regression — the dialogue box is LEGIBLE on any project (Arc B).
//
// The "real gap" after the font + scroll work: dialogue text rendered in
// whatever BG palette the pupil's scenery happened to use under the box, so on
// many projects it was low-contrast or invisible. Arc B makes the box a
// full-width banner that overwrites the scenery with blank box tiles and points
// its attribute rows at a RESERVED palette (3) the server seeds to white text.
// So the text colour is fixed regardless of the art beneath it.
//
// This drives a deliberately HOSTILE background (scenery whose own palette
// would hide the text) and asserts, scroll-independently, that:
//   * the text region is recoloured to the reserved palette (3),
//   * the reserved palette's text colour is actually white (jsnes imgPalette),
//   * the banner overwrote the scenery (box cells are blank tiles), while
//   * scenery OUTSIDE the banner is untouched, and the whole thing round-trips
//     on close.
// (Assertions read the nametable + decoded attribute table + loaded palette,
// not the framebuffer: jsnes mis-positions the screen after the banner's many
// mid-vblank writes — correct on real hardware. See the harness README.)
//
// See docs/plans/current/2026-06-18-arc-b-readable-dialogue-box.md.

import * as H from './lib/render-harness.mjs';

const PORT = 18824;
const HELLO = [0x48, 0x45, 0x4C, 0x4C, 0x4F];
let failed = false;
const ok  = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };

// A detailed scenery tile (uses colours 1 & 2) tiled across the screen.
const SCENERY = Array.from({ length: 8 }, (_, r) =>
  Array.from({ length: 8 }, (_, c) => ((r ^ c) & 1) ? 1 : 2));

function makeState(win, screensX) {
  const cols = 32 * screensX, rows = 30;
  const bg = H.blankPool();
  bg[1] = { pixels: SCENERY, name: 'scn' };
  const nt = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ tile: 1, palette: 0 })));
  const beh = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, () => r === 28 ? 1 : 0));
  const s = {
    name: 'dlgbox', version: 1, universal_bg: 0x0F,
    sprites: [
      { role: 'player', name: 'hero', width: 2, height: 2, cells: H.mkCells(2, 2) },
      { role: 'npc', name: 'old', width: 2, height: 2, cells: H.mkCells(2, 2), flying: true },
    ],
    sprite_tiles: H.blankPool(), bg_tiles: bg,
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    // Palette 0 is HOSTILE: colour 1 (where text would land) ~ colour 0, so
    // scenery-coloured text would be unreadable. Arc B must override this.
    bg_palettes: [{ slots: [0x0F, 0x01, 0x0F] },
                  { slots: [0x30, 0x10, 0x20] },
                  { slots: [0x30, 0x10, 0x20] },
                  { slots: [0x30, 0x10, 0x20] }],
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    backgrounds: [{ name: 'bg', dimensions: { screens_x: screensX, screens_y: 1 }, nametable: nt, behaviour: beh }],
    behaviour_types: H.BEHAVIOUR_TYPES, selectedBgIdx: 0,
    builder: win.BuilderDefaults(),
  };
  s.builder.modules.dialogue.enabled = true;
  return s;
}

const win = H.loadBuilderModules();
const tpl = H.readTemplate();
const { srv } = await H.startServer(PORT);
try {
  // ---- Case 1: non-scroll (1x1), hostile background ----
  {
    const s = makeState(win, 1);
    const r = await H.buildRom(PORT, {
      state: s, playerSpriteIdx: 0, playerStart: { x: 60, y: 120 },
      sceneSprites: [{ spriteIdx: 1, x: 60, y: 208 }],
      mode: 'browser', customMainC: win.BuilderAssembler.assemble(s, tpl),
    });
    if (!r.ok) {
      bad('hostile-bg dialogue did not compile at stage ' + r.stage + ':\n' + String(r.log || '').slice(-1200));
    } else {
      const h = H.openRom(r.romBytes);
      h.frames(120);
      const sceneryPalBefore = H.bgPalette(h.nes, 0, 25, 2);   // hostile palette under the box
      h.tap(H.BTN.B); h.frames(10);

      const row = [2, 3, 4, 5, 6].map((c) => H.ntTile(h.nes, 0, 25, c));
      if (JSON.stringify(row) === JSON.stringify(HELLO)) ok('text renders over hostile scenery');
      else bad('expected HELLO over scenery, got ' + JSON.stringify(row));

      // The banner overwrote the scenery: a box cell that ISN'T a glyph is the
      // blank box tile (0x20), not the scenery tile (1).
      const boxCell = H.ntTile(h.nes, 0, 25, 0);
      if (boxCell === 0x20) ok('banner overwrote the scenery under the box (blank box body)');
      else bad('box body still shows scenery tile ' + boxCell + ' (expected 0x20)');

      // The text region is recoloured to the reserved palette...
      const txtPal = H.bgPalette(h.nes, 0, 25, 2);
      if (txtPal === 3) ok('text region recoloured to reserved palette 3 (was ' + sceneryPalBefore + ')');
      else bad('text region palette ' + txtPal + ', expected 3');

      // ...and that palette's text colour (BG pal 3, colour 1) is actually
      // white — the end-to-end legibility guarantee.
      const img = h.nes.ppu.imgPalette;
      const textRGB = img[3 * 4 + 1] & 0xFFFFFF;     // reserved palette text colour
      const hostileRGB = img[0 * 4 + 1] & 0xFFFFFF;   // what the text WOULD have been
      const ch = (v, s) => (v >> s) & 0xff;
      const isWhite = ch(textRGB, 0) > 0xC0 && ch(textRGB, 8) > 0xC0 && ch(textRGB, 16) > 0xC0;
      if (isWhite) ok('reserved palette text colour is white (0x' + textRGB.toString(16) + ')');
      else bad('reserved palette text colour is not white: 0x' + textRGB.toString(16));
      if (textRGB !== hostileRGB) ok('text colour is independent of the hostile scenery palette');
      else bad('text colour equals the hostile palette — recolour had no effect');

      // Dark-box fix: the box BODY (palette 3 colour 2) is a distinct dark
      // colour, NOT the shared universal_bg (colour 0).  If it matched the
      // backdrop the scenery would appear to vanish rather than read as a box.
      const boxBodyRGB = img[3 * 4 + 2] & 0xFFFFFF;
      const backdropRGB = img[3 * 4 + 0] & 0xFFFFFF;
      const lum = (v) => ch(v, 0) + ch(v, 8) + ch(v, 16);
      if (boxBodyRGB !== backdropRGB) ok('box body is a distinct colour from the backdrop (no blend)');
      else bad('box body colour equals the backdrop — the box would vanish');
      if (lum(boxBodyRGB) < lum(textRGB)) ok('box body is darker than the text (readable contrast)');
      else bad('box body is not darker than the text');

      // Scenery well outside the banner is untouched (still palette 0).
      const farPal = H.bgPalette(h.nes, 0, 10, 10);
      if (farPal === 0) ok('scenery outside the banner is untouched (palette 0)');
      else bad('scenery outside the banner was recoloured to ' + farPal);

      // Close → tiles + attributes round-trip back to the scenery.
      h.tap(H.BTN.B); h.frames(10);
      const back = H.ntTile(h.nes, 0, 25, 2);
      const backPal = H.bgPalette(h.nes, 0, 25, 2);
      if (back === 1 && backPal === 0) ok('box closes: scenery tiles + palette restored');
      else bad('close did not restore scenery (tile ' + back + ', palette ' + backPal + ')');
    }
  }

  // ---- Case 2: scroll build (2x1) — exercises the SCROLL_BUILD banner/attr
  //      code path (camera at 0,0 here; the scrolled-camera maths mirrors the
  //      proven tile loop and is covered by dialogue-scroll.mjs's compile).
  //      NB: on a scroll build the player settles ~32px higher than on a
  //      non-scroll build (a scroll-collision quirk, separate from dialogue),
  //      so the NPC is parked at y=176 to sit adjacent. If the engine's rest
  //      height changes, this box won't open and the test fails loudly. ----
  {
    const s = makeState(win, 2);
    const r = await H.buildRom(PORT, {
      state: s, playerSpriteIdx: 0, playerStart: { x: 60, y: 120 },
      sceneSprites: [{ spriteIdx: 1, x: 60, y: 176 }],
      mode: 'browser', customMainC: win.BuilderAssembler.assemble(s, tpl),
    });
    if (!r.ok) {
      bad('2x1 scroll-build dialogue did not compile at stage ' + r.stage + ':\n' + String(r.log || '').slice(-1200));
    } else {
      const h = H.openRom(r.romBytes);
      h.frames(120);
      h.tap(H.BTN.B); h.frames(10);
      // Camera is at 0 (player at the left edge), so the box lands in NT0.
      const row = [2, 3, 4, 5, 6].map((c) => H.ntTile(h.nes, 0, 25, c));
      const pal = H.bgPalette(h.nes, 0, 25, 2);
      if (JSON.stringify(row) === JSON.stringify(HELLO) && pal === 3) ok('scroll-build banner renders + recolours (HELLO, palette 3)');
      else bad('scroll-build banner wrong: tiles ' + JSON.stringify(row) + ', palette ' + pal);
      // Round-trips on close.
      h.tap(H.BTN.B); h.frames(10);
      const back = H.ntTile(h.nes, 0, 25, 2);
      if (back === 1) ok('scroll-build box closes and restores scenery');
      else bad('scroll-build close did not restore (tile ' + back + ')');
    }
  }
} catch (e) {
  bad('threw: ' + (e && e.stack || e));
} finally {
  await H.stopServer(srv);
}

if (failed) process.exit(1);
console.log('\nReadable dialogue-box render smoke-test complete.');
