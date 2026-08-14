#!/usr/bin/env node
// Door transitions in a WIDE (2-screen) scrolling room — engine v75+.
//
// WHY THIS EXISTS, and what it is NOT a duplicate of.
// `per-room.mjs` already drives a door and asserts the active room changed, so
// the capability is not new.  But every room in that suite is 1x1, which means
// `px` is an 8-bit screen coordinate and the whole 16-bit world path is unused.
// This suite is the wide case:
//
//   * both rooms are 2 screens wide, so SCROLL_BUILD is on and `px` is a u16
//     WORLD coordinate (platformer.c:158-162);
//   * one door sits past world x=255, which is the case an 8-bit position could
//     not address at all.  The door table matches on
//     `bw_dcx = (unsigned char)((px + 8) >> 3)` — at px=312 that is tile 40,
//     which fits a char only because the world is 2 screens.  Wider worlds are
//     compiled out anyway: platformer.c:1115 gates the multi-bg door path on
//     `BG_WORLD_COLS <= 64`.
//
// It is the missing half of docs/plans/current/2026-08-06-item-14-multiscreen-rooms.md
// Step 1: "room 0's entities present and room 1's absent, AND THE REVERSE AFTER A
// DOOR TRANSITION".  The first half was measured 2026-08-13; the second failed
// three times because nothing could drive a door in a wide build.  This can.
//
// HOW IT OBSERVES THE ENGINE.  `current_bg` is poked into RAM 0x0702 (the same
// trick scene-multiscreen.mjs uses for cam_x), so the room is read directly
// rather than inferred from what is on screen.  That is deliberate:
// `_scene_is_perroom` (playground_server.py) turns per-room activation OFF when
// any entity sits past x=255 or y=255 — it keys on the ENTITY COORDINATES, not on
// the room's width, so a 2-screen room whose entities all sit below 255 does keep
// per-room today.  The layouts #14 exists to fix are the ones that trip it, so for
// those "which entities are visible" cannot identify the room until Step 2 lands.
// Reading current_bg is independent of that and works either side of the change.
//
// THE CONTROLS ARE THE POINT.  A suite that only asserts "the room changed" can
// pass with a comparison that always reports a change.  Two builds are therefore
// driven identically and must NOT transition:
//   control A — the door TILE is removed from the behaviour grid (table intact);
//   control B — the door's targetBgIdx is the room it already lives in.
// And 0x0703 carries a sentinel: if the injection anchor ever stops matching,
// `String.replace` returns the source unchanged and SILENTLY drops the poke —
// current_bg would then read 0 forever, which fails the transition assert but
// would let both controls pass vacuously.  The sentinel is what distinguishes
// "the room did not change" from "nothing was ever measured".
//
// Seen to fail 2026-08-14, all four directions, recorded in the commit message.
import * as H from './lib/render-harness.mjs';

globalThis.NES_TARGET_ENGINE = 75;   // per-door destinations need a modern target

const PORT = 18777;
let failed = false;
const ok  = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };

const COLS = 64, ROWS = 30;          // 2 screens wide, 1 tall
const FLOOR_ROW = 28;                // SOLID_GROUND
const DOOR_ROW  = 27;                // the player's settled centre row (py=208)
const P_X = 40, P_Y = 200;
const NEAR_COLS = [7, 8, 9, 10];         // world x 48..79  — reachable without scrolling
const FAR_COLS  = [40, 41, 42, 43];      // world x 312..343 — PAST the 8-bit boundary
const SENTINEL = 0xA5;

const win = H.loadBuilderModules();
const tpl = H.readTemplate();

function wideRoom(name, doorCols) {
  const nt  = Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => ({ tile: 0, palette: 0 })));
  const beh = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  for (let c = 0; c < COLS; c++) beh[FLOOR_ROW][c] = 1;      // SOLID_GROUND
  for (const c of doorCols) beh[DOOR_ROW][c] = 4;            // BEHAVIOUR_DOOR
  return { name, dimensions: { screens_x: 2, screens_y: 1 }, nametable: nt, behaviour: beh };
}

// doorCols: where the door TABLE says doors are.  tileCols: where the behaviour
// grid actually paints them (control A makes these differ).
function mkState(doorCols, tileCols, targetBgIdx) {
  const s = {
    name: 'door-wide', version: 1, universal_bg: 0x0F,
    sprites: [{ role: 'player', name: 'hero', width: 2, height: 2, cells: H.mkCells(2, 2) }],
    sprite_tiles: H.blankPool(), bg_tiles: H.blankPool(),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x30, 0x10, 0x20] })),
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    backgrounds: [wideRoom('r0', tileCols), wideRoom('r1', [])],
    behaviour_types: [...H.BEHAVIOUR_TYPES],
    selectedBgIdx: 0, builder: win.BuilderDefaults(),
  };
  const p1 = s.builder.modules.players.submodules.player1;
  p1.config = Object.assign({}, p1.config, { startX: P_X, startY: P_Y });
  s.builder.modules.doors.enabled = true;
  s.builder.modules.doors.config.doorList = doorCols.map((tx) => (
    { bg: 0, tx, ty: DOOR_ROW, spawnX: 24, spawnY: P_Y, targetBgIdx }
  ));
  return s;
}

// Poke the engine state the test needs into zero-page-adjacent RAM.  Anchored on
// a whole statement taken from the template's own bytes.
const POKE =
  '(*(unsigned char*)0x0700)=(unsigned char)(cam_x&0xFF);' +
  '(*(unsigned char*)0x0701)=(unsigned char)(cam_x>>8);' +
  '(*(unsigned char*)0x0702)=current_bg;' +
  '(*(unsigned char*)0x0703)=' + SENTINEL + ';' +
  '(*(unsigned char*)0x0704)=(unsigned char)((unsigned int)px&0xFF);' +
  '(*(unsigned char*)0x0705)=(unsigned char)((unsigned int)px>>8);';
const ANCHOR = 'while (oam_idx < 256) {';

const { srv } = await H.startServer(PORT);

async function drive(label, { doorCols, tileCols, targetBgIdx }) {
  const s = mkState(doorCols, tileCols, targetBgIdx);
  const asm = win.BuilderAssembler.assemble(s, tpl);
  if (!asm.includes(ANCHOR)) {
    bad(label + ': the injection anchor ' + JSON.stringify(ANCHOR) + ' is no longer in the '
      + 'assembled source, so this suite cannot observe the engine. Re-anchor it — do NOT '
      + 'assume the result below means anything.');
    return null;
  }
  const c = asm.replace(ANCHOR, POKE + ANCHOR);
  const r = await H.buildRom(PORT, {
    state: s, playerSpriteIdx: 0, playerStart: { x: P_X, y: P_Y },
    sceneSprites: [], mode: 'browser', customMainC: c,
  });
  if (!r.ok) {
    bad(label + ': ROM did not compile at stage ' + r.stage + ':\n' + String(r.log || '').slice(-1200));
    return null;
  }
  const h = H.openRom(r.romBytes);
  const bg    = () => h.nes.cpu.mem[0x702];
  const seen  = () => h.nes.cpu.mem[0x703];
  const camX  = () => h.nes.cpu.mem[0x700] + 256 * h.nes.cpu.mem[0x701];
  const pxNow = () => h.nes.cpu.mem[0x704] + 256 * h.nes.cpu.mem[0x705];
  h.frames(20);
  const start = bg();
  // Walk right until the room changes, or the budget runs out.  Same budget for
  // the controls, so "did not change" is a measurement and not a short wait.
  h.hold(H.BTN.RIGHT);
  let f = 0;
  for (; f < 900; f++) { h.nes.frame(); if (bg() !== start) break; }
  h.release(H.BTN.RIGHT);
  h.frames(6);
  return { start, end: bg(), frames: f, camX: camX(), px: pxNow(), sentinel: seen() };
}

try {
  // 0. The sentinel — proves the injection ran at all.  Every reading below is
  //    meaningless without it, so it is checked first and once.
  const near = await drive('near door', { doorCols: NEAR_COLS, tileCols: NEAR_COLS, targetBgIdx: 1 });
  if (near) {
    if (near.sentinel === SENTINEL) ok('the state poke ran (sentinel 0x' + SENTINEL.toString(16) + ' present) — readings below are real');
    else bad('the state poke never ran (0x0703 = 0x' + near.sentinel.toString(16) + '): the anchor matched but the code did not execute. Every other assertion in this suite is vacuous.');

    // 1. A door in a wide room fires at all.
    if (near.start === 0 && near.end === 1)
      ok('wide room: walking onto a door transitions room 0 → 1 (after ' + near.frames + ' frames, px=' + near.px + ')');
    else
      bad('wide room: no transition — current_bg ' + near.start + ' → ' + near.end + ' after ' + near.frames + ' frames (px=' + near.px + ', cam_x=' + near.camX + ')');
  }

  // 2. A door PAST world x=255 — the case an 8-bit player position cannot address.
  const far = await drive('far door', { doorCols: FAR_COLS, tileCols: FAR_COLS, targetBgIdx: 1 });
  if (far) {
    if (far.start === 0 && far.end === 1) {
      // The frame count IS the evidence the player walked there. A far door that
      // fires as fast as the near one (~26 frames) would mean the table matched
      // something other than the tile the player is standing on — so a "pass"
      // that arrives too quickly is reported as a failure, not a pass.
      if (near && far.frames <= near.frames)
        bad('the far door fired in ' + far.frames + ' frames, no slower than the near door ('
          + near.frames + '): the player cannot have walked to world x ' + (FAR_COLS[0] * 8)
          + ', so the match is spurious.');
      else
        ok('wide room: a door past world x=255 fires (tile col ' + FAR_COLS[0] + ' = world x '
          + (FAR_COLS[0] * 8) + ', reached after ' + far.frames + ' frames, vs ' + (near ? near.frames : '?')
          + ' for the near door) — 16-bit world position reaches the door table');
    } else {
      bad('wide room: the door past x=255 never fired — current_bg ' + far.start + ' → ' + far.end
        + ' after ' + far.frames + ' frames (px=' + far.px + ', cam_x=' + far.camX + '). '
        + 'If px stalled below ' + (FAR_COLS[0] * 8) + ' the player never got there; if px passed it '
        + 'and the room still did not change, the door table lookup is 8-bit somewhere.');
    }
  }

  // 3. Control A — the door TILE is gone from the behaviour grid, table intact.
  //    Nothing should fire.  This is what stops assertion 1 passing on a
  //    comparison that reports a change no matter what.
  const noTile = await drive('control A', { doorCols: NEAR_COLS, tileCols: [], targetBgIdx: 1 });
  if (noTile) {
    if (noTile.end === noTile.start)
      ok('control A — with no DOOR tile painted, the room does NOT change (stayed ' + noTile.end + ' over ' + noTile.frames + ' frames)');
    else
      bad('control A — the room changed (' + noTile.start + ' → ' + noTile.end + ') with no door tile painted: the transition is not caused by the door.');
  }

  // 4. Control B — the door leads to the room it is already in.
  const sameRoom = await drive('control B', { doorCols: NEAR_COLS, tileCols: NEAR_COLS, targetBgIdx: 0 });
  if (sameRoom) {
    if (sameRoom.end === 0)
      ok('control B — a door targeting its own room leaves current_bg at 0 (over ' + sameRoom.frames + ' frames)');
    else
      bad('control B — a door targeting its own room moved current_bg to ' + sameRoom.end + '.');
  }
} catch (e) {
  bad('threw: ' + (e && e.stack || e));
} finally {
  await H.stopServer(srv);
}

if (failed) { console.error('\nWide-room door transition test FAILED.'); process.exit(1); }
console.log('\nWide-room door transition test complete.');
