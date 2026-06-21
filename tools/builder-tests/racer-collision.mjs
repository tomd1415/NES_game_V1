#!/usr/bin/env node
// Arc E §3 (E3-2) — top-down racer track-edge collision.
//
// BW_GAME_STYLE == 3 with a barrier painted on the Behaviour page (WALL, id 2 —
// the same "solid" vocabulary the platformer/top-down use).  The racer resolves
// each axis on its own, so driving into an edge:
//   1. never penetrates it (the car is pushed back out),
//   2. bleeds speed (a forgiving "you clipped the wall" feel),
//   3. still slides along it on the free axis (diagonal into a wall → the car
//      keeps moving along the wall instead of sticking).
import * as H from './lib/render-harness.mjs';

const PORT = 18840;
let failed = false;
const ok  = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };

const WALL_COL = 30;                 // vertical barrier column (WALL, id 2)
const WALL_X   = WALL_COL * 8;       // 240px — left edge of the wall
const CAR_W    = 16;                 // PLAYER_W (2) * 8
const MAX_PX   = WALL_X - CAR_W;     // 224 — furthest the car's left edge can sit

const win = H.loadBuilderModules();
const tpl = H.readTemplate();

// 2×2 open world with a full-height WALL column the car will drive into.
function makeState() {
  const cols = 64, rows = 60;
  const nt = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ tile: 1, palette: 0 })));
  const beh = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => 0));
  for (let r = 0; r < rows; r++) beh[r][WALL_COL] = 2;   // BEHAVIOUR_WALL
  const s = {
    name: 'racer-wall', version: 1, universal_bg: 0x0F,
    sprites: [{ role: 'player', name: 'car', width: 2, height: 2, cells: H.mkCells(2, 2) }],
    sprite_tiles: H.blankPool(), bg_tiles: H.blankPool(),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x21, 0x10, 0x30] })),
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    backgrounds: [{ name: 'bg', dimensions: { screens_x: 2, screens_y: 2 }, nametable: nt, behaviour: beh }],
    behaviour_types: [...H.BEHAVIOUR_TYPES],
    selectedBgIdx: 0, builder: win.BuilderDefaults(),
  };
  s.builder.modules.game.config = { type: 'racer', racerTopSpeed: 4 };
  return s;
}

const { srv } = await H.startServer(PORT);
try {
  const s = makeState();
  const asm = win.BuilderAssembler.assemble(s, tpl);
  // The collision helper must be present in a racer build.
  if (/racer_on_edge/.test(asm)) ok('racer build emits the track-edge collision helper');
  else bad('racer build is missing racer_on_edge()');

  let c = asm.replace('while (oam_idx < 256) {',
    '(*(unsigned char*)0x0700)=(unsigned char)(px&0xFF);(*(unsigned char*)0x0701)=(unsigned char)(px>>8);' +
    '(*(unsigned char*)0x0702)=(unsigned char)(py&0xFF);(*(unsigned char*)0x0703)=(unsigned char)(py>>8);' +
    '(*(unsigned char*)0x0704)=racer_heading;' +
    '(*(unsigned char*)0x0705)=(unsigned char)(racer_speed&0xFF);(*(unsigned char*)0x0706)=(unsigned char)(racer_speed>>8);' +
    'while (oam_idx < 256) {');
  const r = await H.buildRom(PORT, {
    state: s, playerSpriteIdx: 0, playerStart: { x: 120, y: 200 }, mode: 'browser', customMainC: c });
  if (!r.ok) { bad('racer-wall ROM did not compile at stage ' + r.stage + ':\n' + String(r.log || '').slice(-1800)); }
  else {
    const h = H.openRom(r.romBytes);
    const mem = h.nes.cpu.mem;
    const pxv  = () => mem[0x700] + 256 * mem[0x701];
    const pyv  = () => mem[0x702] + 256 * mem[0x703];
    const head = () => mem[0x704];
    const spd  = () => mem[0x705] + 256 * mem[0x706];

    // Turn to an exact heading.  jsnes has a 1-frame input latency, so one
    // hold→frame→release→frame cycle lands exactly one D-pad step in the engine;
    // we re-read and turn the short way each iteration until we hit the target.
    const steerTo = (target) => {
      for (let g = 0; g < 80 && head() !== target; g++) {
        const dir = ((target - head() + 16) % 16) <= 8 ? H.BTN.RIGHT : H.BTN.LEFT;
        h.hold(dir); h.frames(1); h.release(dir); h.frames(1);
      }
    };

    h.frames(200);
    const startPx = pxv();
    if (startPx <= MAX_PX) ok('car starts on the open side of the wall (px=' + startPx + ')');
    else bad('car did not start clear of the wall (px=' + startPx + ')');

    // 1. Head-on: accelerate (heading 0 = +x) straight into the wall, long
    //    enough to reach and pin against it.
    h.hold(H.BTN.A);
    for (let i = 0; i < 170; i++) h.frames(1);
    const pAtWall = pxv();
    if (pAtWall <= MAX_PX && pAtWall >= MAX_PX - 12)
      ok('car pins against the wall, never through it (px=' + pAtWall + ', max ' + MAX_PX + ')');
    else bad('car penetrated or stopped short (px=' + pAtWall + ', expected ' + (MAX_PX - 12) + '..' + MAX_PX + ')');

    // 2. Speed bleed: a head-on hit (the dominant axis is blocked) halves speed
    //    every frame, so it stays far below the tier-4 max of 768.
    h.frames(12);
    const sAtWall = spd();
    if (sAtWall < 120) ok('head-on into the wall bleeds speed (speed=' + sAtWall + ' ≪ 768 max)');
    else bad('speed did not bleed at the wall (speed=' + sAtWall + ')');
    h.release(H.BTN.A);
    h.frames(8);                     // friction → speed back to 0 before steering

    // 3. Slide: heading 3 has vx>0 (into the wall) but vy dominant (down), so X
    //    stays blocked while the car slides DOWN at speed (no bleed on a graze).
    steerTo(3);
    const hd = head();
    const pyBefore = pyv();
    h.hold(H.BTN.A);
    for (let i = 0; i < 50; i++) h.frames(1);
    const pxSlide = pxv(), pyAfter = pyv();
    h.release(H.BTN.A);
    if (hd !== 3) bad('steerTo(3) failed (heading=' + hd + ')');
    else if (pxSlide <= MAX_PX && (pyAfter - pyBefore) >= 16)
      ok('car slides along the wall at speed (X blocked px=' + pxSlide + ', Y ' + pyBefore + '→' + pyAfter + ')');
    else bad('car did not slide (heading=' + hd + ', px=' + pxSlide + ', Δpy=' + (pyAfter - pyBefore) + ')');
  }
} catch (e) {
  bad('threw: ' + (e && e.stack || e));
} finally {
  await H.stopServer(srv);
}

if (failed) process.exit(1);
console.log('\nRacer collision (E3-2) test complete.');
