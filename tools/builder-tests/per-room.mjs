#!/usr/bin/env node
// Per-room scene instances (engine v75).  Entities carry a `bg` (which room they
// belong to); the engine activates only the current room's entities and parks
// every other room's actor off-screen (ss_y=0xFF), so a room only ever shows —
// and collides with — the enemies/pickups placed in it.  Re-entering a room
// respawns its entities at home.
//
// Verified in jsnes (no playtest needed):
//   1. Boot: enemy A (room 0) is on screen, enemy B (room 1) is NOT.
//   2. Control: with both enemies in room 0, BOTH are on screen — proving the
//      filter is by room, not by position.
//   3. Door transition: walking through a door to room 1 flips it — B appears,
//      A is gone.
import * as H from './lib/render-harness.mjs';

globalThis.NES_TARGET_ENGINE = 75;   // per-room + per-door need a modern target

const PORT = 18894;
let failed = false;
const ok  = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };

const A_X = 80, B_X = 160, E_Y = 200, P_X = 40;

// Count active (on-screen) OAM sprites whose x falls in [x0,x1].
function activeIn(h, x0, x1) {
  let n = 0;
  for (let i = 0; i < 64; i++) {
    const s = H.oamSprite(h.nes, i);
    if (s.y < 0xEF && s.x >= x0 && s.x <= x1) n++;
  }
  return n;
}

function baseState(win, withDoor) {
  const rows = 30, cols = 32;
  const mk = () => {
    const beh = Array.from({ length: rows }, () => Array(cols).fill(0));
    for (let c = 0; c < cols; c++) beh[28][c] = 1;   // SOLID_GROUND floor
    return beh;
  };
  const beh0 = mk(), beh1 = mk();
  // DOOR tiles in room 0 at the player's settled centre row (py=208 → row 27).
  if (withDoor) { for (const c of [7, 8, 9, 10]) beh0[27][c] = 4; }
  const s = {
    name: 'perroom', version: 1, universal_bg: 0x0F,
    sprites: [
      { role: 'player', name: 'hero', width: 2, height: 2, cells: H.mkCells(2, 2) },
      { role: 'enemy',  name: 'a',    width: 2, height: 2, cells: H.mkCells(2, 2) },
      { role: 'enemy',  name: 'b',    width: 2, height: 2, cells: H.mkCells(2, 2) },
    ],
    sprite_tiles: H.blankPool(), bg_tiles: H.blankPool(),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x30, 0x10, 0x20] })),
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    backgrounds: [
      { name: 'r0', dimensions: { screens_x: 1, screens_y: 1 },
        nametable: Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ tile: 0, palette: 0 }))),
        behaviour: beh0 },
      { name: 'r1', dimensions: { screens_x: 1, screens_y: 1 },
        nametable: Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ tile: 0, palette: 0 }))),
        behaviour: beh1 },
    ],
    behaviour_types: H.BEHAVIOUR_TYPES, selectedBgIdx: 0, builder: win.BuilderDefaults(),
  };
  return s;
}

// enemy A in room 0 @A_X; enemy B in room `bBg` @B_X.
function mkState(win, bBg, withDoor) {
  const s = baseState(win, withDoor);
  const p1 = s.builder.modules.players.submodules.player1;
  p1.config = Object.assign({}, p1.config, { startX: P_X, startY: E_Y });
  s.builder.modules.scene.enabled = true;
  s.builder.modules.scene.config.instances = [
    { id: 1, spriteIdx: 1, x: A_X, y: E_Y, ai: 'static', speed: 1, bg: 0 },
    { id: 2, spriteIdx: 2, x: B_X, y: E_Y, ai: 'static', speed: 1, bg: bBg },
  ];
  if (withDoor) {
    s.builder.modules.doors.enabled = true;
    // The trigger matches the door table against the player's CENTRE tile
    // (col = (px+8)>>3, row = (py+8)>>3 = 27), so give the walk-through a few
    // adjacent door columns at row 27 to land on.  Spawn back at the left so the
    // player doesn't overlap enemy B's measurement band after the swap.
    s.builder.modules.doors.config.doorList = [7, 8, 9, 10].map((tx) => (
      { bg: 0, tx: tx, ty: 27, spawnX: 40, spawnY: E_Y, targetBgIdx: 1 }
    ));
  }
  return s;
}

const sceneOf = (s) => s.builder.modules.scene.config.instances
  .map((i) => ({ spriteIdx: i.spriteIdx, x: i.x, y: i.y, bg: i.bg }));

const win = H.loadBuilderModules();
const tpl = H.readTemplate();
const { srv } = await H.startServer(PORT);

async function build(s) {
  return H.buildRom(PORT, {
    state: s, playerSpriteIdx: 0, playerStart: { x: P_X, y: E_Y },
    sceneSprites: sceneOf(s), mode: 'browser',
    customMainC: win.BuilderAssembler.assemble(s, tpl),
  });
}

try {
  // 1. A in room 0, B in room 1 — boot in room 0.
  {
    const r = await build(mkState(win, 1, false));
    if (!r.ok) { bad('per-room build failed at stage ' + r.stage + ':\n' + String(r.log || '').slice(-900)); }
    else {
      const h = H.openRom(r.romBytes); h.frames(20);
      const a = activeIn(h, A_X - 8, A_X + 20);
      const b = activeIn(h, B_X - 8, B_X + 20);
      if (a > 0) ok('boot room 0 — enemy A (room 0) is on screen (' + a + ' oam)'); else bad('enemy A missing at boot');
      if (b === 0) ok('boot room 0 — enemy B (room 1) is parked off-screen (0 oam in its band)'); else bad('enemy B (room 1) leaked into room 0 (' + b + ' oam)');
    }
  }

  // 2. Control — both enemies in room 0: both must show (filter is by room, not x).
  {
    const r = await build(mkState(win, 0, false));
    if (!r.ok) { bad('control build failed at stage ' + r.stage); }
    else {
      const h = H.openRom(r.romBytes); h.frames(20);
      const a = activeIn(h, A_X - 8, A_X + 20);
      const b = activeIn(h, B_X - 8, B_X + 20);
      if (a > 0 && b > 0) ok('control — both enemies in room 0 are on screen (a=' + a + ', b=' + b + ')');
      else bad('control — expected both enemies visible, got a=' + a + ', b=' + b);
    }
  }

  // 3. Door transition — walk right through the door to room 1: B appears, A gone.
  {
    const r = await build(mkState(win, 1, true));
    if (!r.ok) { bad('door build failed at stage ' + r.stage + ':\n' + String(r.log || '').slice(-900)); }
    else {
      const h = H.openRom(r.romBytes); h.frames(10);
      const before = { a: activeIn(h, A_X - 8, A_X + 20), b: activeIn(h, B_X - 8, B_X + 20) };
      // Walk right into the door strip (cols 8-9).
      h.hold(H.BTN.RIGHT);
      for (let f = 0; f < 90; f++) h.nes.frame();
      h.release(H.BTN.RIGHT);
      h.frames(10);
      const after = { a: activeIn(h, A_X - 8, A_X + 20), b: activeIn(h, B_X - 8, B_X + 20) };
      if (before.a > 0 && before.b === 0) ok('door: before — room 0 active (A on, B off)');
      else bad('door: unexpected pre-transition state a=' + before.a + ' b=' + before.b);
      if (after.b > 0 && after.a === 0) ok('door: after walking through — room 1 active (B on, A off)');
      else bad('door: transition did not swap the active room (a=' + after.a + ', b=' + after.b + ')');
    }
  }
} finally {
  srv.kill('SIGTERM');
}

if (failed) { console.error('\nPer-room scene instances (engine v75) test FAILED.'); process.exit(1); }
console.log('\nPer-room scene instances (engine v75) test complete.');
