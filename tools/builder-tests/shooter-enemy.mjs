#!/usr/bin/env node
// Render regression — engine v72 enemy path: the shooter (turret) (pupil request
// #13, "more options for enemy paths").
//
// A stationary turret enemy that periodically fires a projectile toward the
// player.  Driven in a real ROM we check:
//   * a projectile actually spawns and is DRAWN (an extra on-screen sprite),
//   * it TRAVELS toward the player (its OAM X moves from the turret toward P1),
//   * a shot that reaches the player HURTS it — with the player parked in the
//     line of fire and 1 HP, the death tint fires (the screen changes wholesale).
//
// Plus codegen gating: the shooter emits its machinery only at target >= v72 and
// degrades to a plain walker below, so non-shooter golden ROMs stay
// byte-identical.
globalThis.NES_TARGET_ENGINE = 72;

import * as H from './lib/render-harness.mjs';

const PORT = 18852;
let failed = false;
const ok  = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };

const win = H.loadBuilderModules();
const tpl = H.readTemplate();

function baseState() {
  const beh = Array.from({ length: 30 }, () => Array(32).fill(0));
  for (let c = 0; c < 32; c++) beh[28][c] = 1;            // SOLID_GROUND floor
  return {
    name: 'sh', version: 1, universal_bg: 0x30,
    sprites: [
      { role: 'player', name: 'hero', width: 2, height: 2, cells: H.mkCells(2, 2) },
      { role: 'enemy', name: 'turret', width: 2, height: 2, cells: H.mkCells(2, 2) },
    ],
    sprite_tiles: H.blankPool(), bg_tiles: H.blankPool(),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x21, 0x10, 0x30] })),
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    backgrounds: [{ name: 'bg', dimensions: { screens_x: 1, screens_y: 1 },
      nametable: Array.from({ length: 30 }, () =>
        Array.from({ length: 32 }, () => ({ tile: 0, palette: 0 }))), behaviour: beh }],
    behaviour_types: H.BEHAVIOUR_TYPES, selectedBgIdx: 0, builder: win.BuilderDefaults(),
  };
}

// --- codegen gating (no build) ---------------------------------------------
{
  const s = baseState();
  s.builder.modules.scene.enabled = true;
  s.builder.modules.scene.config.instances = [{ id: 'e0', spriteIdx: 1, x: 200, y: 200, ai: 'shooter' }];

  window.NES_TARGET_ENGINE = 72;
  const c72 = win.BuilderAssembler.assemble(s, tpl);
  if (/bw_shoot\(/.test(c72) && /v72 shooter — draw/.test(c72)) ok('v72 target emits the shooter pool + draw');
  else bad('v72 target did NOT emit the shooter machinery');

  window.NES_TARGET_ENGINE = 71;
  const c71 = win.BuilderAssembler.assemble(s, tpl);
  if (!/bw_shoot\(/.test(c71)) ok('v71 target degrades the shooter (no shot pool)');
  else bad('v71 target still emitted the shooter pool (degrade broken)');
  window.NES_TARGET_ENGINE = 72;
}

// --- behavioural (real ROM) -------------------------------------------------
const { srv } = await H.startServer(PORT);
try {
  const s = baseState();
  s.engineVersion = 72;
  s.builder.modules.scene.enabled = true;
  // A shot only hurts when HP is on, which requires Max HP > 0 AND the Damage
  // module enabled (Damage owns the HP constants + the i-frame decrement).  1 HP
  // = one-hit kill, so the death tint fires reliably within the run.
  if (s.builder.modules.players?.submodules?.player1)
    s.builder.modules.players.submodules.player1.config.maxHp = 1;
  if (s.builder.modules.damage) s.builder.modules.damage.enabled = true;
  // Turret at x=200; player parked at x=40 in its line of fire, same floor.
  s.builder.modules.scene.config.instances = [{ id: 'e0', spriteIdx: 1, x: 200, y: 200, ai: 'shooter' }];

  const r = await H.buildRom(PORT, {
    state: s, playerSpriteIdx: 0, playerStart: { x: 40, y: 200 },
    sceneSprites: [{ spriteIdx: 1, x: 200, y: 200 }],
    mode: 'browser', customMainC: win.BuilderAssembler.assemble(s, tpl),
  });
  if (!r.ok) {
    bad('shooter project did not compile at stage ' + r.stage + ':\n' + String(r.log || '').slice(-1500));
  } else {
    const h = H.openRom(r.romBytes);
    h.frames(20);
    const baseline = h.lastFrame().slice();   // colourful, player alive

    // The shot draws after player(0-3) + turret(4-7): watch slot 8.
    let sawShot = false, shotXfirst = -1, shotXlast = -1, tintFired = false;
    for (let f = 0; f < 300; f++) {
      const fb = h.frames(1);
      const sp = H.oamSprite(h.nes, 8);
      if (sp.y < 239) {
        sawShot = true;
        if (shotXfirst < 0) shotXfirst = sp.x;
        shotXlast = sp.x;
      }
      if (f > 40 && H.frameDiffFraction(baseline, fb) > 0.3) tintFired = true;
    }

    if (sawShot) ok('turret fires a drawn projectile (OAM slot 8 became active)');
    else bad('no projectile ever appeared — the turret never fired / never drew');

    if (sawShot && shotXfirst - shotXlast >= 12)
      ok('the shot travels toward the player (x ' + shotXfirst + ' -> ' + shotXlast + ')');
    else if (sawShot)
      bad('the shot did not move toward the player (x ' + shotXfirst + ' -> ' + shotXlast + ')');

    if (tintFired) ok('a shot that reached the player hurt it — death tint fired (1 HP → dead)');
    else bad('the player was never hurt by a shot (death tint never fired)');
  }
} catch (e) {
  bad('threw: ' + (e && e.stack || e));
} finally {
  await H.stopServer(srv);
}

if (failed) process.exit(1);
console.log('\nShooter/turret (engine v72) render smoke-test complete.');
