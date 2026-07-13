#!/usr/bin/env node
// Render regression — engine v71 enemy path: the hopper (pupil request #13,
// "more options for enemy paths").
//
// The hopper walks + turns at walls like a walker, and ALSO bounces up and down
// on a fixed rhythm off its start height.  In a real ROM we watch its OAM:
//   * Y oscillates by a real amount (the bounce) and returns to the ground each
//     cycle (its highest Y ~= its start height) — distinguishing it from a flyer,
//     which HOVERS centred on its start height and never settles back down.
//   * X moves (it walks along the floor), and it never parks (y >= 0xEF).
//
// Plus codegen gating: the hopper emits its C block only at target >= v71 and
// degrades to a plain walker below that, so non-hopper golden ROMs stay
// byte-identical.
globalThis.NES_TARGET_ENGINE = 71;

import * as H from './lib/render-harness.mjs';

const PORT = 18847;
let failed = false;
const ok  = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };

// 1x1 background: a full-width floor on row 28, no walls — the hopper walks the
// open floor and bounces; nothing to turn it early.
function openBackground() {
  const cols = 32, rows = 30;
  const beh = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let c = 0; c < cols; c++) beh[28][c] = 1;          // SOLID_GROUND floor
  return {
    name: 'bg', dimensions: { screens_x: 1, screens_y: 1 },
    nametable: Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => ({ tile: 0, palette: 0 }))),
    behaviour: beh,
  };
}

const HOP_X = 100, HOP_Y = 208;   // standing on the row-28 floor (2x2 sprite top)

const win = H.loadBuilderModules();
const tpl = H.readTemplate();

function makeState() {
  return {
    name: 'hop', version: 1, universal_bg: 0x0F,
    sprites: [
      { role: 'player', name: 'hero', width: 2, height: 2, cells: H.mkCells(2, 2) },
      { role: 'enemy', name: 'baddie', width: 2, height: 2, cells: H.mkCells(2, 2) },
    ],
    sprite_tiles: H.blankPool(), bg_tiles: H.blankPool(),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x30, 0x10, 0x20] })),
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    backgrounds: [openBackground()],
    behaviour_types: H.BEHAVIOUR_TYPES, selectedBgIdx: 0,
    builder: win.BuilderDefaults(),
  };
}

// --- codegen gating (no build needed) --------------------------------------
{
  const s = makeState();
  s.builder.modules.scene.enabled = true;
  s.builder.modules.scene.config.instances = [{ id: 'e0', spriteIdx: 1, x: HOP_X, y: HOP_Y, ai: 'hopper' }];

  window.NES_TARGET_ENGINE = 71;
  const c71 = win.BuilderAssembler.assemble(s, tpl);
  if (/ hops:/.test(c71)) ok('v71 target emits the hopper C block'); else bad('v71 target did NOT emit the hopper block');

  window.NES_TARGET_ENGINE = 70;
  const c70 = win.BuilderAssembler.assemble(s, tpl);
  if (!/ hops:/.test(c70)) ok('v70 target degrades the hopper (no hopper block)'); else bad('v70 target still emitted the hopper block (degrade broken)');
  window.NES_TARGET_ENGINE = 71;
}

// --- behavioural (real ROM) -------------------------------------------------
const { srv } = await H.startServer(PORT);
try {
  const s = makeState();
  s.engineVersion = 71;
  s.builder.modules.scene.enabled = true;
  s.builder.modules.scene.config.instances = [{ id: 'e0', spriteIdx: 1, x: HOP_X, y: HOP_Y, ai: 'hopper' }];

  const r = await H.buildRom(PORT, {
    state: s, playerSpriteIdx: 0, playerStart: { x: 16, y: 208 },
    sceneSprites: [{ spriteIdx: 1, x: HOP_X, y: HOP_Y }],
    mode: 'browser', customMainC: win.BuilderAssembler.assemble(s, tpl),
  });
  if (!r.ok) {
    bad('hopper project did not compile at stage ' + r.stage + ':\n' + String(r.log || '').slice(-1500));
  } else {
    const h = H.openRom(r.romBytes);
    h.frames(12);
    const hopY = () => H.oamSprite(h.nes, 4).y;
    const hopX = () => H.oamSprite(h.nes, 4).x;
    let yMin = hopY(), yMax = yMin, x0 = hopX(), parked = false;
    for (let f = 0; f < 160; f++) {
      h.frames(1);
      const y = hopY();
      if (y >= 0xEF) { parked = true; break; }
      if (y < yMin) yMin = y;
      if (y > yMax) yMax = y;
    }
    const x1 = hopX();

    if (parked) bad('hopper parked (y=0xFF) — defeated/culled, AI never ran');
    else if (yMax - yMin >= 16) ok('hopper bounces (Y band ' + yMin + '..' + yMax + ', range ' + (yMax - yMin) + ')');
    else bad('hopper Y barely moved (range ' + yMin + '..' + yMax + ') — bounce not active');

    // Distinguishes a hopper from a flyer: it returns to the ground (its highest
    // Y is ~its start height), rather than hovering centred above it.
    if (!parked && yMax >= HOP_Y - 4) ok('hopper settles back to the ground each cycle (max Y ' + yMax + ' ~= start ' + HOP_Y + ')');
    else if (!parked) bad('hopper never returned to the ground (max Y ' + yMax + ' < start ' + HOP_Y + ') — behaving like a flyer');

    if (Math.abs(x1 - x0) >= 8) ok('hopper walks along the floor (x ' + x0 + ' -> ' + x1 + ')');
    else bad('hopper never moved horizontally (x stuck at ' + x0 + ') — walk not active');
  }
} catch (e) {
  bad('threw: ' + (e && e.stack || e));
} finally {
  await H.stopServer(srv);
}

if (failed) process.exit(1);
console.log('\nHopper (engine v71) render smoke-test complete.');
