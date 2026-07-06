// Pickup collection — behavioural. The Pickups module AABB-collides the player
// against every ROLE_PICKUP scene sprite; a collected pickup flies off-screen
// (ss_y = 0xFF) and bw_pickup_count ticks up (builder-modules.js ~887). A
// static pickup means zero drift, so this is fully deterministic: place a
// pickup in the player's path, walk into it, and assert its OAM cell parks
// off-screen. The player is OAM sprites 0-3, the pickup scene sprite is 4-7.
import * as H from './lib/render-harness.mjs';

const PORT = 18869;
let failed = false;
const ok  = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };

const PICKUP_CELL = 4;
const pickupY = (nes) => H.oamSprite(nes, PICKUP_CELL).y;
const present = (nes) => pickupY(nes) < 0xEF;

function makeState(win, { pickupsOn = true } = {}) {
  const rows = 30, cols = 32, FLOOR = 25;
  const beh = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let c = 0; c < cols; c++) beh[FLOOR][c] = 1;
  const s = {
    name: 'pickup', version: 1, universal_bg: 0x0F,
    sprites: [
      { role: 'player', name: 'hero', width: 2, height: 2, cells: H.mkCells(2, 2) },
      { role: 'pickup', name: 'gem',  width: 2, height: 2, cells: H.mkCells(2, 2) },
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
  s.builder.modules.game.config.type = 'platformer';
  if (s.builder.modules.pickups) s.builder.modules.pickups.enabled = pickupsOn;
  s.builder.modules.scene.config.instances = [{ id: 1, spriteIdx: 1, x: 96, y: 184, ai: 'none' }];
  const p1 = s.builder.modules.players.submodules.player1;
  p1.config = Object.assign({}, p1.config, { startX: 32, startY: 176 });
  return s;
}

const win = H.loadBuilderModules();
const tpl = H.readTemplate();

async function run(port, pickupsOn) {
  const s = makeState(win, { pickupsOn });
  const r = await H.buildRom(port, {
    state: s, playerSpriteIdx: 0, playerStart: { x: 32, y: 176 },
    sceneSprites: [{ spriteIdx: 1, x: 96, y: 184, ai: 'none' }],
    mode: 'browser', customMainC: win.BuilderAssembler.assemble(s, tpl),
  });
  if (!r.ok) { bad('build (pickups=' + pickupsOn + ') failed at stage ' + r.stage); return null; }
  const h = H.openRom(r.romBytes);
  h.frames(30);
  const start = present(h.nes);
  h.hold(H.BTN.RIGHT);
  let collected = false;
  for (let i = 0; i < 120 && !collected; i++) { h.nes.frame(); if (!present(h.nes)) collected = true; }
  h.release(H.BTN.RIGHT);
  return { start, collected };
}

const { srv } = await H.startServer(PORT);
try {
  const on = await run(PORT, true);
  if (on) {
    if (on.start) ok('the pickup is on screen before the player reaches it'); else bad('pickup missing at start');
    if (on.collected) ok('walking into the pickup collects it — its sprite parks off-screen'); else bad('pickup was not collected on contact');
  }
  // Control: with the Pickups module OFF, the sprite is just decoration — it
  // must NOT vanish when the player walks through it.
  const off = await run(PORT, false);
  if (off) {
    if (!off.collected) ok('with the Pickups module off, the sprite is not collected (stays put)');
    else bad('sprite vanished even with the Pickups module off — collision leaked');
  }
} catch (e) {
  bad('threw: ' + (e && e.stack || e));
} finally {
  await H.stopServer(srv);
}

if (failed) process.exit(1);
console.log('\nPickup-collect behavioural test complete.');
