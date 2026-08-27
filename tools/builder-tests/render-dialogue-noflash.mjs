#!/usr/bin/env node
// Render regression — opening the dialogue box MUST NOT blank the screen
// (feedback #31, engine v78).
//
// The banner is a full-width band four tile rows tall.  Writing all of it in
// one vblank costs 128-256 $2007 pokes, well past the ~2273-cycle window, so
// the old code switched rendering off (PPU_MASK = 0) for the burst and back on
// afterwards.  That is what pupils reported as "the stage glitches for a split
// second" when an NPC box opens.  v78 prepares one row per frame outside vblank
// and blits it with an unrolled burst, so rendering is never disabled.
//
// The measurement is deliberately blunt and framebuffer-based, because that is
// what the pupil actually sees: sample a band near the TOP of the screen, far
// from the banner (which sits at tile row 25 => y 200), and count how many
// pixels differ from the first pixel of that band.  Scenery fills the screen, so
// a healthy frame has thousands; a force-blanked frame collapses to zero because
// the PPU paints the backdrop colour for every scanline that renders with
// PPU_MASK at 0.
//
// Measured on the pre-fix engine, this is not a marginal signal:
//   settled  {top: 3 colours, topNon: 7680}
//   open     {top: 1 colour,  topNon: 0}      <-- the flash
//   after    {top: 3 colours, topNon: 7680}
// So "no frame during the open or the close drops to a flat band" is a clean
// pass/fail, and putting PPU_MASK = 0 back into the writer fails it.
//
// Companion structural guards (B6i/B6j) live in round2-dialogue.mjs; this file
// is the end-to-end one.  See docs/feedback/recently-observed-bugs.md item 31.

import * as H from './lib/render-harness.mjs';
import { testPort } from './lib/test-port.mjs';

const PORT = testPort(18769);   // the runner assigns this; the literal is only the
                                // standalone fallback. `main`'s copy picks its own
                                // port and cites TEST-SERVERS.md, which this branch
                                // does not have — see tools/builder-tests/README.md.
let failed = false;
const ok  = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };

// Detailed scenery (colours 1 and 2) tiled across the whole screen, so every
// rendered frame is busy and a blanked one is unmistakable.
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
    name: 'dlgflash', version: 1, universal_bg: 0x0F,
    sprites: [
      { role: 'player', name: 'hero', width: 2, height: 2, cells: H.mkCells(2, 2) },
      { role: 'npc', name: 'old', width: 2, height: 2, cells: H.mkCells(2, 2), flying: true },
    ],
    sprite_tiles: H.blankPool(), bg_tiles: bg,
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: [{ slots: [0x30, 0x21, 0x11] },
                  { slots: [0x30, 0x10, 0x20] },
                  { slots: [0x30, 0x10, 0x20] },
                  { slots: [0x30, 0x10, 0x20] }],
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    backgrounds: [{ name: 'bg', dimensions: { screens_x: screensX, screens_y: 1 },
                    nametable: nt, behaviour: beh }],
    behaviour_types: H.BEHAVIOUR_TYPES, selectedBgIdx: 0,
    builder: win.BuilderDefaults(),
  };
  s.builder.modules.dialogue.enabled = true;
  return s;
}

// Non-backdrop pixel count in a band above the banner.  0 == the PPU painted
// the backdrop for those scanlines, i.e. rendering was off.
const litPixels = (f) => H.countNonBg(f, 0, 8, 256, 40, H.pixelAt(f, 0, 8));

// Press B and step frame by frame, recording the band for each frame.  tap()
// can't be used here: it runs four frames internally, so the flash frame would
// be hidden inside it.  jsnes has a one-frame input latency (see the harness),
// hence holding for three frames before the release.
function pressAndSample(h, frames) {
  const lit = [];
  h.hold(H.BTN.B);
  for (let i = 0; i < 3; i++) lit.push(litPixels(h.frame()));
  h.release(H.BTN.B);
  for (let i = 0; i < frames; i++) lit.push(litPixels(h.frame()));
  return lit;
}

const win = H.loadBuilderModules();
const tpl = H.readTemplate();
const { srv } = await H.startServer(PORT);
try {
  const s = makeState(win, 1);
  const r = await H.buildRom(PORT, {
    state: s, playerSpriteIdx: 0, playerStart: { x: 60, y: 120 },
    sceneSprites: [{ spriteIdx: 1, x: 60, y: 208 }],
    mode: 'browser', customMainC: win.BuilderAssembler.assemble(s, tpl),
  });
  if (!r.ok) {
    bad('dialogue ROM did not compile at stage ' + r.stage + ':\n' +
        String(r.log || '').slice(-1200));
  } else {
    const h = H.openRom(r.romBytes);
    h.frames(120);                        // player falls from spawn and settles

    const settled = litPixels(h.lastFrame());
    if (settled > 1000) ok('scenery renders before the box opens (' + settled + ' lit px)');
    else bad('test set-up is wrong — the screen is already near-blank (' + settled + ' lit px)');

    // ---- Opening the box ----
    const opening = pressAndSample(h, 14);
    const dimmest = Math.min(...opening);
    if (dimmest > settled / 2) {
      ok('no blanked frame while the box opens (dimmest ' + dimmest + '/' + settled + ' lit px)');
    } else {
      bad('the screen blanked while the box opened — #31 regressed. Per-frame lit ' +
          'pixels: ' + JSON.stringify(opening));
    }

    // The box really is open — otherwise "no flash" is trivially true.
    const row = [2, 3, 4, 5, 6].map((c) => H.ntTile(h.nes, 0, 25, c));
    if (JSON.stringify(row) === JSON.stringify([0x48, 0x45, 0x4C, 0x4C, 0x4F])) {
      ok('the box finished drawing (HELLO on the dialogue row)');
    } else {
      bad('box did not finish drawing within the sampled frames: ' + JSON.stringify(row));
    }
    if (H.bgPalette(h.nes, 0, 25, 2) === 3) ok('band recoloured to the reserved palette');
    else bad('band palette is ' + H.bgPalette(h.nes, 0, 25, 2) + ', expected 3');

    // ---- Closing it again ----
    const closing = pressAndSample(h, 14);
    const dimmestClose = Math.min(...closing);
    if (dimmestClose > settled / 2) {
      ok('no blanked frame while the box closes (dimmest ' + dimmestClose + ' lit px)');
    } else {
      bad('the screen blanked while the box closed — #31 regressed. Per-frame lit ' +
          'pixels: ' + JSON.stringify(closing));
    }
    const back = H.ntTile(h.nes, 0, 25, 2);
    const backPal = H.bgPalette(h.nes, 0, 25, 2);
    if (back === 1 && backPal === 0) ok('close restored the scenery tiles + palette');
    else bad('close did not restore scenery (tile ' + back + ', palette ' + backPal + ')');

    // ---- Mashing B must not strand a half-drawn band ----
    // The banner takes a few frames now, so a press landing mid-job is ignored
    // rather than queued on top of it.  Hammer B, let it settle, and require the
    // screen to be in one of the two legal states — fully open or fully closed —
    // never a band of box tiles with no text.
    for (let k = 0; k < 6; k++) { h.hold(H.BTN.B); h.frames(2); h.release(H.BTN.B); h.frames(1); }
    h.frames(40);
    const t = H.ntTile(h.nes, 0, 25, 2);
    const p = H.bgPalette(h.nes, 0, 25, 2);
    if ((t === 1 && p === 0) || (t === 0x48 && p === 3)) {
      ok('mashing B leaves the box fully open or fully closed (tile ' + t + ', palette ' + p + ')');
    } else {
      bad('mashing B stranded the banner half-drawn (tile ' + t + ', palette ' + p + ')');
    }
  }
} catch (e) {
  bad('threw: ' + (e && e.stack || e));
} finally {
  await H.stopServer(srv);
}

if (failed) process.exit(1);
console.log('\nDialogue open/close no-flash render test complete.');
