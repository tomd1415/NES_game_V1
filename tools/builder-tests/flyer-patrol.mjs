#!/usr/bin/env node
// Render regression — engine v10 enemy paths (bug #13 "more enemy paths").
//
// Two new scene AIs, driven in a real ROM:
//   * flyer  — ignores gravity, bobs up and down a fixed range and drifts
//              horizontally toward the player. We watch its OAM Y oscillate.
//   * patrol — walks back and forth a fixed distance and turns ON ITS OWN with
//              no wall present. We place it on open ground (no walls) and watch
//              its OAM X move out and reverse — a plain `walker` there would
//              march straight on and never turn.
//
// Both are gated behind targetEngine >= 10; below that they degrade to a
// walker, so non-flyer/patrol golden ROMs stay byte-identical.

globalThis.NES_TARGET_ENGINE = 10; // v10 enemy paths require targeting engine v10+

import * as H from './lib/render-harness.mjs';

const PORT = 18844;
let failed = false;
const ok  = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };

// 1x1 background: a full-width floor on row 28, NO walls — so the patrol enemy
// has nothing to bounce off and must turn itself.
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

const FLY_X = 180, FLY_Y = 120;   // flyer starts mid-air, room to bob ±20
const PAT_X = 100, PAT_Y = 208;   // patrol on the open floor, far from any wall

const win = H.loadBuilderModules();
const tpl = H.readTemplate();
const { srv } = await H.startServer(PORT);
try {
  const s = {
    name: 'paths', version: 1, universal_bg: 0x0F,
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
  s.engineVersion = 10;
  // instance 0 = flyer (OAM sprite 4), instance 1 = patrol (OAM sprite 8).
  s.builder.modules.scene.enabled = true;
  s.builder.modules.scene.config.instances = [
    { id: 'e0', spriteIdx: 1, x: FLY_X, y: FLY_Y, ai: 'flyer' },
    { id: 'e1', spriteIdx: 1, x: PAT_X, y: PAT_Y, ai: 'patrol' },
  ];

  const r = await H.buildRom(PORT, {
    state: s, playerSpriteIdx: 0, playerStart: { x: 16, y: 120 },
    sceneSprites: [
      { spriteIdx: 1, x: FLY_X, y: FLY_Y },
      { spriteIdx: 1, x: PAT_X, y: PAT_Y },
    ],
    mode: 'browser', customMainC: win.BuilderAssembler.assemble(s, tpl),
  });
  if (!r.ok) {
    bad('flyer/patrol project did not compile at stage ' + r.stage + ':\n' + String(r.log || '').slice(-1500));
  } else {
    const h = H.openRom(r.romBytes);
    h.frames(12);

    // --- flyer: OAM Y must oscillate (bob), never park (y >= 0xEF) ---------
    const flyY = () => H.oamSprite(h.nes, 4).y;
    const flyX = () => H.oamSprite(h.nes, 4).x;
    let fyMin = flyY(), fyMax = fyMin, fx0 = flyX(), parked = false;
    for (let f = 0; f < 120; f++) {
      h.frames(1);
      const y = flyY();
      if (y >= 0xEF) { parked = true; break; }
      if (y < fyMin) fyMin = y;
      if (y > fyMax) fyMax = y;
    }
    // A true flyer HOVERS near its spawn height (FLY_Y=120), bobbing ±20 — it
    // must NOT sink to the floor (gravity overridden). Require a real bob AND a
    // band that stays well above the ground row (< 200).
    if (parked) bad('flyer got parked (y=0xFF) — defeated/culled, AI never ran');
    else if (fyMax - fyMin >= 16 && fyMax < 200 && fyMin > FLY_Y - 40)
      ok('flyer hovers near its start height (Y band ' + fyMin + '..' + fyMax + ', no fall)');
    else if (fyMax >= 200)
      bad('flyer sank toward the floor (Y band ' + fyMin + '..' + fyMax + ') — gravity not overridden');
    else bad('flyer Y barely moved (range ' + fyMin + '..' + fyMax + ') — bob AI not active');

    const fx1 = flyX();
    if (fx1 < fx0) ok('flyer drifts toward the player (x ' + fx0 + ' → ' + fx1 + ')');
    else bad('flyer never drifted toward the player (x stuck at ' + fx0 + ')');

    // --- patrol: OAM X must move out and reverse with NO wall present ------
    const patX = () => H.oamSprite(h.nes, 8).x;
    const px0 = patX();
    let pxMax = px0, pxMin = px0, reversed = false;
    for (let f = 0; f < 160; f++) {
      h.frames(1);
      const x = patX();
      if (x > pxMax) pxMax = x;
      if (x < pxMin) pxMin = x;
      // once it has moved right of start and then comes back below the peak,
      // it has turned around on its own.
      if (!reversed && pxMax > px0 + 8 && x < pxMax - 2) reversed = true;
    }
    if (pxMax - px0 >= 16) ok('patrol paces outward on open ground (x ' + px0 + ' → ' + pxMax + ')');
    else bad('patrol never paced (x ' + px0 + ' → ' + pxMax + ') — AI not active');

    if (reversed) ok('patrol turns itself around with no wall (peak x=' + pxMax + ', came back)');
    else bad('patrol reached ' + pxMax + ' but never turned around on its own');
  }
} catch (e) {
  bad('threw: ' + (e && e.stack || e));
} finally {
  await H.stopServer(srv);
}

if (failed) process.exit(1);
console.log('\nFlyer/patrol (engine v10) render smoke-test complete.');
