#!/usr/bin/env node
// Top-down enemy behaviour (bug #26 — top-down parity + coverage). The scene
// AI is shared with the platformer, but top-down has NO gravity, so it is the
// clean place to prove:
//   * a CHASER seeks the player on BOTH axes (in the platformer, gravity would
//     mask the vertical seek),
//   * a v10 PATROL paces horizontally while its Y stays put (nothing pulls it
//     down), confirming the new path works outside the platformer too.
import * as H from './lib/render-harness.mjs';

globalThis.NES_TARGET_ENGINE = 10;   // patrol needs engine v10+

const PORT = 18867;
let failed = false;
const ok  = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };

const PLAYER = { x: 200, y: 200 };
const CHASE0 = { x: 40, y: 40 };     // instance 0 (OAM sprite 4)
const PAT0   = { x: 120, y: 100 };   // instance 1 (OAM sprite 8)

const win = H.loadBuilderModules();
const tpl = H.readTemplate();
const { srv } = await H.startServer(PORT);
try {
  const rows = 30, cols = 32;
  const beh = Array.from({ length: rows }, () => Array(cols).fill(0));
  const s = {
    name: 'td-enemies', version: 1, universal_bg: 0x0F,
    sprites: [
      { role: 'player', name: 'hero',  width: 2, height: 2, cells: H.mkCells(2, 2) },
      { role: 'enemy',  name: 'baddie', width: 2, height: 2, cells: H.mkCells(2, 2) },
    ],
    sprite_tiles: H.blankPool(), bg_tiles: H.blankPool(),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x30, 0x10, 0x20] })),
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    backgrounds: [{
      name: 'bg', dimensions: { screens_x: 1, screens_y: 1 },
      nametable: Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ tile: 0, palette: 0 }))),
      behaviour: beh,
    }],
    behaviour_types: H.BEHAVIOUR_TYPES, selectedBgIdx: 0,
    builder: win.BuilderDefaults(),
  };
  s.engineVersion = 10;
  s.builder.modules.game.config.type = 'topdown';
  const p1 = s.builder.modules.players.submodules.player1;
  p1.config = Object.assign({}, p1.config, { startX: PLAYER.x, startY: PLAYER.y });
  s.builder.modules.scene.enabled = true;
  s.builder.modules.scene.config.instances = [
    { id: 'c0', spriteIdx: 1, x: CHASE0.x, y: CHASE0.y, ai: 'chaser', speed: 1 },
    { id: 'p0', spriteIdx: 1, x: PAT0.x,   y: PAT0.y,   ai: 'patrol', speed: 1 },
  ];

  const r = await H.buildRom(PORT, {
    state: s, playerSpriteIdx: 0, playerStart: PLAYER,
    sceneSprites: [
      { spriteIdx: 1, x: CHASE0.x, y: CHASE0.y },
      { spriteIdx: 1, x: PAT0.x,   y: PAT0.y },
    ],
    mode: 'browser', customMainC: win.BuilderAssembler.assemble(s, tpl),
  });
  if (!r.ok) {
    bad('top-down enemies build failed at stage ' + r.stage + ':\n' + String(r.log || '').slice(-1200));
  } else {
    const h = H.openRom(r.romBytes);
    h.frames(12);
    const cx0 = H.oamSprite(h.nes, 4).x, cy0 = H.oamSprite(h.nes, 4).y;
    const patY0 = H.oamSprite(h.nes, 8).y;
    let patXMin = H.oamSprite(h.nes, 8).x, patXMax = patXMin, patYDrift = 0;
    for (let f = 0; f < 90; f++) {
      h.frames(1);
      const pxi = H.oamSprite(h.nes, 8).x, pyi = H.oamSprite(h.nes, 8).y;
      if (pxi < patXMin) patXMin = pxi;
      if (pxi > patXMax) patXMax = pxi;
      patYDrift = Math.max(patYDrift, Math.abs(pyi - patY0));
    }
    const cx1 = H.oamSprite(h.nes, 4).x, cy1 = H.oamSprite(h.nes, 4).y;

    // Chaser seeks the player down-and-right on BOTH axes.
    if (cx1 > cx0 + 8) ok('chaser seeks the player horizontally (x ' + cx0 + ' → ' + cx1 + ')');
    else bad('chaser did not move toward the player in x (x ' + cx0 + ' → ' + cx1 + ')');
    if (cy1 > cy0 + 8) ok('chaser seeks the player vertically with no gravity (y ' + cy0 + ' → ' + cy1 + ')');
    else bad('chaser did not seek the player in y (y ' + cy0 + ' → ' + cy1 + ')');

    // Patrol paces in x; its Y must stay put (top-down has no gravity).
    if (patXMax - patXMin >= 16) ok('patrol paces in top-down (x span ' + patXMin + '..' + patXMax + ')');
    else bad('patrol did not pace (x span ' + patXMin + '..' + patXMax + ')');
    if (patYDrift <= 2) ok('patrol holds its Y in top-down (drift ' + patYDrift + 'px)');
    else bad('patrol Y drifted ' + patYDrift + 'px in top-down — should be gravity-free');
  }
} catch (e) {
  bad('threw: ' + (e && e.stack || e));
} finally {
  await H.stopServer(srv);
}

if (failed) process.exit(1);
console.log('\nTop-down enemy behaviour (chaser + v10 patrol) test complete.');
