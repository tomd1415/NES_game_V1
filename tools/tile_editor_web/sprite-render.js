/*
 * Shared sprite + NES-palette rendering helpers.
 *
 * Loaded by both sprites.html and builder.html so a single sprite-to-
 * canvas rendering path is used everywhere the Builder, Play dialog,
 * or animation preview needs to paint a sprite.  Nothing here reads
 * global state directly — everything takes the pupil's `state` as a
 * parameter so the module stays pure + easy to reason about from tests.
 *
 * Exposed as `window.NesRender`:
 *
 *   NesRender.nesRgb(idx)                   -> "rgb(r,g,b)" string
 *   NesRender.spritePaletteFor(state, idx)  -> palette object for sprite palette idx
 *   NesRender.bgPaletteFor(state, idx)      -> same for background palettes
 *   NesRender.pixelRgb(value, palette)      -> rgb string or null (transparent)
 *   NesRender.drawSpriteIntoCtx(ctx, sp, state, destW, destH)
 *     Renders a composite sprite (sp) into a rectangle of the given
 *     destination size on ctx.  Uses sp.cells[r][c] layout, sprite
 *     palettes, and the sprite_tiles pool from state.  Empty cells
 *     are skipped (transparent).
 *
 * sprites.html keeps thin wrappers (`spritePaletteFor`, `pixelRgb`,
 * `drawSpriteIntoCtx`) that delegate here, so its ~30 existing call
 * sites need no changes.
 */
(function (global) {
  'use strict';

  const NES_PALETTE_RGB = [
    [0x62,0x62,0x62],[0x00,0x1F,0xB2],[0x24,0x04,0xC8],[0x52,0x00,0xB2],
    [0x73,0x00,0x76],[0x80,0x00,0x24],[0x73,0x0B,0x00],[0x52,0x28,0x00],
    [0x24,0x44,0x00],[0x00,0x57,0x00],[0x00,0x5C,0x00],[0x00,0x53,0x24],
    [0x00,0x3C,0x76],[0x00,0x00,0x00],[0x00,0x00,0x00],[0x00,0x00,0x00],
    [0xAB,0xAB,0xAB],[0x0D,0x57,0xFF],[0x4B,0x30,0xFF],[0x8A,0x13,0xFF],
    [0xBC,0x08,0xD6],[0xD2,0x12,0x69],[0xC7,0x2E,0x00],[0x9D,0x54,0x00],
    [0x60,0x7B,0x00],[0x20,0x98,0x00],[0x00,0xA3,0x00],[0x00,0x99,0x42],
    [0x00,0x7D,0xB4],[0x00,0x00,0x00],[0x00,0x00,0x00],[0x00,0x00,0x00],
    [0xFF,0xFF,0xFF],[0x53,0xAE,0xFF],[0x90,0x85,0xFF],[0xD3,0x65,0xFF],
    [0xFF,0x57,0xFF],[0xFF,0x5D,0xCF],[0xFF,0x77,0x57],[0xFA,0x9E,0x00],
    [0xBD,0xC7,0x00],[0x7A,0xE7,0x00],[0x43,0xF6,0x11],[0x26,0xEF,0x7E],
    [0x2C,0xD5,0xF6],[0x4E,0x4E,0x4E],[0x00,0x00,0x00],[0x00,0x00,0x00],
    [0xFF,0xFF,0xFF],[0xB6,0xE1,0xFF],[0xCE,0xD1,0xFF],[0xE9,0xC3,0xFF],
    [0xFF,0xBC,0xFF],[0xFF,0xBD,0xF4],[0xFF,0xC6,0xC3],[0xFF,0xD5,0x9A],
    [0xE9,0xE6,0x81],[0xCE,0xF4,0x81],[0xB6,0xFB,0x9A],[0xA9,0xFA,0xC3],
    [0xA9,0xF0,0xF4],[0xB8,0xB8,0xB8],[0x00,0x00,0x00],[0x00,0x00,0x00],
  ];

  function nesRgb(idx) {
    const c = NES_PALETTE_RGB[idx & 0x3F];
    return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
  }

  // slot0 = -1 means "transparent" (sprites).  bg palettes set slot0
  // to state.universal_bg so they render as the nametable colour.
  function spritePaletteFor(state, palIdx) {
    const p = (state && state.sprite_palettes && state.sprite_palettes[palIdx & 3]) ||
      { slots: [0, 0, 0] };
    return { slot0: -1, slot1: p.slots[0], slot2: p.slots[1], slot3: p.slots[2] };
  }

  function bgPaletteFor(state, palIdx) {
    const p = (state && state.bg_palettes && state.bg_palettes[palIdx & 3]) ||
      { slots: [0, 0, 0] };
    const uni = (state && typeof state.universal_bg === 'number')
      ? state.universal_bg : 0x21;
    return { slot0: uni, slot1: p.slots[0], slot2: p.slots[1], slot3: p.slots[2] };
  }

  function pixelRgb(v, pal) {
    if (v === 0) return pal.slot0 < 0 ? null : nesRgb(pal.slot0);
    if (v === 1) return nesRgb(pal.slot1);
    if (v === 2) return nesRgb(pal.slot2);
    if (v === 3) return nesRgb(pal.slot3);
    return null;
  }

  // Paint a composite sprite into a rectangle of size destW×destH
  // starting at (0,0) on ctx.  The caller is responsible for
  // translating the canvas if the sprite should land elsewhere.
  function drawSpriteIntoCtx(ctx, sp, state, destW, destH) {
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, destW, destH);
    if (!sp || !Array.isArray(sp.cells)) return;
    const srcW = sp.width * 8;
    const srcH = sp.height * 8;
    const tiles = (state && state.sprite_tiles) || [];
    for (let cr = 0; cr < sp.height; cr++) {
      for (let cc = 0; cc < sp.width; cc++) {
        const cell = sp.cells[cr][cc];
        if (!cell || cell.empty) continue;
        const tile = tiles[cell.tile];
        if (!tile || !Array.isArray(tile.pixels)) continue;
        const pal = spritePaletteFor(state, cell.palette);
        for (let py = 0; py < 8; py++) {
          for (let px = 0; px < 8; px++) {
            const sx = cell.flipH ? 7 - px : px;
            const sy = cell.flipV ? 7 - py : py;
            const v = tile.pixels[sy][sx];
            const rgb = pixelRgb(v, pal);
            if (!rgb) continue;
            const dx = (cc * 8 + px) / srcW * destW;
            const dy = (cr * 8 + py) / srcH * destH;
            ctx.fillStyle = rgb;
            ctx.fillRect(Math.floor(dx), Math.floor(dy),
                         Math.max(1, Math.ceil(destW / srcW)),
                         Math.max(1, Math.ceil(destH / srcH)));
          }
        }
      }
    }
  }

  global.NesRender = {
    nesRgb,
    spritePaletteFor,
    bgPaletteFor,
    pixelRgb,
    drawSpriteIntoCtx,
    NES_PALETTE_RGB,
  };
})(typeof window !== 'undefined' ? window : globalThis);
