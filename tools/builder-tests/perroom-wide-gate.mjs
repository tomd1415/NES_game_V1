#!/usr/bin/env node
// #14 Step 2 — per-room scene instances must survive a WIDE room, and must
// still stand down for the case that genuinely breaks.
//
// THE CHANGE THIS GUARDS. `_scene_is_perroom` (playground_server.py) used to
// reject any project with an entity past x=255 OR y=255, so per-room activation
// and multi-screen levels were mutually exclusive: paint a level two screens
// wide and every room silently shared one scene. Step 1 measured (2026-08-13)
// that parking DOES survive a wide 16-bit build — the draw guards test the high
// byte before comparing the low one against 0xEF — so the x half of that
// restriction rejected a case that works.
//
// It now rejects on `y > 238` only. Not 239, and this is the whole subtlety:
// parking sets ss_y to 0xFF and every draw guard skips a sprite whose ss_y is
// >= 0xEF, which IS 239. So an entity legitimately placed at y=239 is
// indistinguishable from a parked one and would be silently swallowed — a row of
// entities that simply never appear, with nothing anywhere saying why. 238 is the
// highest row that cannot be confused with the sentinel.
//
// WHAT EACH ASSERTION IS FOR. The interesting failure is not "per-room broke",
// it is "per-room quietly turned itself off (or on) for the wrong projects", so
// each case below pins one side of the gate:
//
//   1  wide/short, entity past x=255   -> per-room ON   (the case Step 2 unlocks)
//   2  control: same geometry, same positions, one room tag changed
//                                      -> per-room OFF  (proves the ROOM TAG does
//                                         the work, not the geometry)
//   3  tall, entity past y=238         -> per-room OFF  (the case that really breaks)
//   4  an entity at exactly y=239      -> per-room OFF  (238 vs 239 — the only
//                                         assertion that can tell them apart)
//
// Case 2 matters most for trusting the rest: it is byte-for-byte the same project
// as case 1 except for one `bg` field, so a pass in 1 cannot be an artefact of the
// geometry, the scroll, or the sprite being off-screen.
//
// Cases 3 and 4 assert a room-1 entity IS drawn at boot. That is the direction
// that catches an over-eager gate: if per-room switched on when it should not,
// that entity would be parked and simply absent.
import * as H from './lib/render-harness.mjs';
import { testPort } from './lib/test-port.mjs';

globalThis.NES_TARGET_ENGINE = 83;   // per-room in wide rooms is a v83 behaviour here
                                     // (`main`'s v79 — 79-82 name different engines
                                     // on this branch; see the port-forward plan)

const PORT = testPort(18778);
let failed = false;
const ok  = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };

const A_TILE = 20, B_TILE = 21, C_TILE = 22;
const cell = (t) => ({ tile: t, palette: 0, empty: false });

const win = H.loadBuilderModules();
const tpl = H.readTemplate();

function mkState(screensX, screensY, rooms) {
  const cols = 32 * screensX, rows = 30 * screensY;
  const mkBg = (name) => ({
    name,
    dimensions: { screens_x: screensX, screens_y: screensY },
    nametable: Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => ({ tile: 1, palette: 0 }))),
    behaviour: Array.from({ length: rows }, () => Array(cols).fill(0)),
  });
  const s = {
    name: 'perroom-gate', version: 1, universal_bg: 0x0F,
    sprites: [
      { role: 'player', name: 'hero', width: 2, height: 2, cells: H.mkCells(2, 2) },
      { role: 'enemy',  name: 'a', width: 1, height: 1, cells: [[cell(A_TILE)]] },
      { role: 'enemy',  name: 'b', width: 1, height: 1, cells: [[cell(B_TILE)]] },
      { role: 'enemy',  name: 'c', width: 1, height: 1, cells: [[cell(C_TILE)]] },
    ],
    sprite_tiles: H.blankPool(), bg_tiles: H.blankPool(),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x21, 0x10, 0x30] })),
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    backgrounds: [mkBg('r0'), mkBg('r1')],
    behaviour_types: [...H.BEHAVIOUR_TYPES],
    selectedBgIdx: 0, builder: win.BuilderDefaults(),
  };
  s.builder.modules.game.config = { type: 'topdown' };   // no gravity; entities stay put
  s.builder.modules.scene.enabled = true;
  s.builder.modules.scene.config.instances = rooms.map((r, i) => (
    { id: i + 1, spriteIdx: r.spriteIdx, x: r.x, y: r.y, ai: 'static', speed: 1, bg: r.bg }
  ));
  return s;
}

const sceneOf = (s) => s.builder.modules.scene.config.instances
  .map((i) => ({ spriteIdx: i.spriteIdx, x: i.x, y: i.y, bg: i.bg }));

// Expose cam_x so a wide case can be driven to where the entity actually is,
// rather than inferring absence from a sprite that is merely off-screen.
const POKE = '(*(unsigned char*)0x0700)=(unsigned char)(cam_x&0xFF);'
           + '(*(unsigned char*)0x0701)=(unsigned char)(cam_x>>8);'
           + '(*(unsigned char*)0x0702)=0xA5;';
const ANCHOR = 'while (oam_idx < 256) {';

const { srv } = await H.startServer(PORT);

async function build(label, s, { wide }) {
  const asm = win.BuilderAssembler.assemble(s, tpl);
  let c = asm;
  if (wide) {
    if (!asm.includes(ANCHOR)) {
      bad(label + ': the cam_x injection anchor is gone from the assembled source — '
        + 'this case cannot be driven and its result would be meaningless. Re-anchor it.');
      return null;
    }
    c = asm.replace(ANCHOR, POKE + ANCHOR);
  }
  const r = await H.buildRom(PORT, {
    state: s, playerSpriteIdx: 0, playerStart: { x: 24, y: 120 },
    sceneSprites: sceneOf(s), mode: 'browser', customMainC: c,
  });
  if (!r.ok) {
    bad(label + ': ROM did not compile at stage ' + r.stage + ':\n' + String(r.log || '').slice(-1200));
    return null;
  }
  return H.openRom(r.romBytes);
}

try {
  // ---- 1 + 2. Wide/short. Identical projects; only entity B's room tag differs.
  for (const { label, bBg, expectDrawn } of [
    { label: 'wide/short, B in room 1', bBg: 1, expectDrawn: false },
    { label: 'control — same project, B in room 0', bBg: 0, expectDrawn: true },
  ]) {
    const s = mkState(2, 1, [
      { spriteIdx: 1, x: 100, y: 120, bg: 0 },
      { spriteIdx: 2, x: 400, y: 120, bg: bBg },
    ]);
    const h = await build(label, s, { wide: true });
    if (!h) continue;
    const camX = () => h.nes.cpu.mem[0x700] + 256 * h.nes.cpu.mem[0x701];
    h.frames(20);
    if (h.nes.cpu.mem[0x702] !== 0xA5) {
      bad(label + ': the cam_x poke never ran (0x0702 = 0x' + h.nes.cpu.mem[0x702].toString(16)
        + '), so "did the camera reach the entity" is unanswerable and the verdict below is not evidence.');
      continue;
    }
    // Drive right until B's world x is on screen, so "not drawn" cannot mean
    // "off the right edge".
    h.hold(H.BTN.RIGHT);
    for (let f = 0; f < 900 && camX() < 200; f++) h.nes.frame();
    h.release(H.BTN.RIGHT);
    h.frames(10);
    const reached = camX();
    const b = H.findSpriteByTile(h.nes, B_TILE, B_TILE);
    const drawn = !!b;
    if (reached < 200) {
      bad(label + ': the camera only reached cam_x=' + reached + ', so B at x=400 was never '
        + 'brought on screen — this case proves nothing either way.');
    } else if (drawn === expectDrawn) {
      ok(label + ': B is ' + (drawn ? 'drawn' : 'parked') + ' with the camera at cam_x=' + reached
        + ' (per-room ' + (expectDrawn ? 'OFF — one room' : 'ON — wide room keeps per-room') + ')');
    } else {
      bad(label + ': expected B ' + (expectDrawn ? 'drawn' : 'parked') + ' at cam_x=' + reached
        + ' but it was ' + (drawn ? 'drawn at x=' + b.x : 'absent')
        + (expectDrawn
            ? ' — per-room switched ON for a single-room project, or the sprite is missing for an unrelated reason.'
            : ' — a wide room is still falling back to the shared scene; _scene_is_perroom rejected it.'));
    }
  }

  // ---- 3 + 4. Cases that must keep per-room OFF. Both assert the room-1 entity
  //             IS drawn at boot: if the gate were too eager it would be parked.
  for (const { label, sx, sy, trip, why } of [
    { label: 'tall room, entity past y=238', sx: 1, sy: 2, trip: { spriteIdx: 3, x: 200, y: 400, bg: 0 },
      why: 'parking is unreliable below the fold, so per-room must stand down' },
    { label: 'an entity at exactly y=239', sx: 1, sy: 1, trip: { spriteIdx: 3, x: 200, y: 239, bg: 0 },
      why: '239 IS 0xEF — admitting it would silently swallow that entity' },
  ]) {
    const s = mkState(sx, sy, [
      { spriteIdx: 1, x: 100, y: 100, bg: 0 },
      { spriteIdx: 2, x: 150, y: 100, bg: 1 },
      trip,
    ]);
    const h = await build(label, s, { wide: false });
    if (!h) continue;
    h.frames(30);
    const b = H.findSpriteByTile(h.nes, B_TILE, B_TILE);
    if (b) ok(label + ': the room-1 entity is still drawn (per-room correctly OFF — ' + why + ')');
    else bad(label + ': the room-1 entity at (150,100) is NOT drawn, so per-room switched ON for a '
      + 'project it must reject — ' + why + '. This is the threshold being one too high.');
  }
} catch (e) {
  bad('threw: ' + (e && e.stack || e));
} finally {
  await H.stopServer(srv);
}

if (failed) { console.error('\nPer-room wide-room gate (#14 Step 2) test FAILED.'); process.exit(1); }
console.log('\nPer-room wide-room gate (#14 Step 2) test complete.');
