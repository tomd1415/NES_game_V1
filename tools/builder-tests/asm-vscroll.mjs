#!/usr/bin/env node
// ASM engine generator — Phase 5: vertical / diagonal scroll-in-MOTION A/B.
//
// asm-ab.mjs covers horizontal scroll (both directions) + an in-place jump;
// asm-corpus.mjs covers tall/wide worlds but only AT REST. Neither drives the
// camera *vertically while it streams*. This suite closes that gap: it builds an
// OPEN top-down world (no solids → the player roams freely) two ways — pure C
// (PLAYGROUND_NO_ASM=1) vs the shipped hand-written 6502 — then walks the player
// DOWN (and DOWN+RIGHT) and compares the RENDERED state at MATCHED game-logic
// progress (same world-Y). This exercises the paths the horizontal walks never
// hit: world_to_screen_y, the vertical deadzone in scroll_follow, the ROW
// streamer (scroll_stream / scroll_stream_prepare row path), and — diagonally —
// both column and row streamers firing in the same frames.
//
// Matched-progress (not matched-vblank) is the correct lens: the C engine drops
// frames during a stream burst, so at the same absolute frame it is BEHIND; we
// instead advance each build until it reaches the same py, then compare pixels.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as H from './lib/render-harness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const jsnes = require(path.join(H.ROOT, 'tools', 'tile_editor_web', 'jsnes.min.js'));
const B = jsnes.Controller;

const PORT_C = 18792, PORT_A = 18793;
let failed = false;
const ok = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };

const win = H.loadBuilderModules();
const tpl = H.readTemplate();

// An OPEN top-down world: every behaviour cell is 0 (no solids), so the player
// walks anywhere and the camera follows in both axes. (flatBackground always
// lays a solid floor row, which would block the downward walk — hence inline.)
function openBackground(sx, sy) {
  const cols = 32 * sx, rows = 30 * sy;
  return {
    name: 'bg', dimensions: { screens_x: sx, screens_y: sy },
    nametable: Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => ({ tile: 0, palette: 0 }))),
    behaviour: Array.from({ length: rows }, () => Array(cols).fill(0)),
  };
}

function makeState(sx, sy) {
  const sprites = [
    { role: 'player', name: 'hero', width: 2, height: 2, cells: H.mkCells(2, 2) },
    { role: 'enemy', name: 'goomba', width: 2, height: 2, cells: H.mkCells(2, 2) },
  ];
  const s = {
    name: 'vscroll', version: 1, universal_bg: 0x21, sprites,
    sprite_tiles: H.blankPool(), bg_tiles: H.blankPool(),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x0F, 0x10, 0x30] })),
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    backgrounds: [openBackground(sx, sy)],
    behaviour_types: H.BEHAVIOUR_TYPES, selectedBgIdx: 0, builder: win.BuilderDefaults(),
  };
  s.builder.modules.game.config.type = 'topdown';
  // One STATIC enemy placed lower in the world, so it scrolls into/through view
  // as the camera descends — extra world_to_screen_y coverage for a scene sprite.
  s.builder.modules.scene.config.instances = [
    { id: 'e0', spriteIdx: 1, x: 130, y: 240, ai: 'static' },
  ];
  return s;
}

function boot(bytes) {
  const nes = new jsnes.NES({ onFrame() {}, onAudioSample() {} });
  nes.loadROM(bytes.toString('binary'));
  return nes;
}
const rd16 = (n, a) => (n.cpu.mem[a] & 0xFF) | ((n.cpu.mem[a + 1] & 0xFF) << 8);
// Scratch-RAM mirror written by the injected line each frame.
const CAMX = 0x0700, CAMY = 0x0702, PXA = 0x0704, PYA = 0x0706;
const pal = (n) => { const a = []; for (let i = 0x3F00; i <= 0x3F1F; i++) a.push(n.ppu.vramMem[i] & 0xFF); return a; };
const oam = (n) => { const a = []; for (let i = 0; i < 256; i++) a.push(n.ppu.spriteMem[i] & 0xFF); return a; };
const diff = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++; return d; };
function renderDiff(c, a) {
  let nt = 0;
  for (let k = 0; k < 4; k++) { const cn = c.ppu.nameTable[k], an = a.ppu.nameTable[k]; if (cn && an) for (let t = 0; t < 960; t++) if ((cn.tile[t] & 0xFF) !== (an.tile[t] & 0xFF)) nt++; }
  return { pal: diff(pal(c), pal(a)), oam: diff(oam(c), oam(a)), nt };
}
// Hold DOWN (and optionally RIGHT) until the mirrored world-Y reaches target.
function advanceDown(n, target, right, cap = 800) {
  let f = 0;
  while (rd16(n, PYA) < target && f < cap) {
    n.buttonDown(1, B.BUTTON_DOWN); if (right) n.buttonDown(1, B.BUTTON_RIGHT);
    n.frame();
    n.buttonUp(1, B.BUTTON_DOWN); if (right) n.buttonUp(1, B.BUTTON_RIGHT);
    f++;
  }
  return f;
}

// Inject the px/py/cam mirror into the assembled main.c (works for both builds:
// px/py/cam_x/cam_y stay C globals the ASM shares).
function withMirror(mainC) {
  return mainC.replace('while (oam_idx < 256) {',
    '(*(unsigned char*)0x0700)=(unsigned char)(cam_x&0xFF);(*(unsigned char*)0x0701)=(unsigned char)(cam_x>>8);' +
    '(*(unsigned char*)0x0702)=(unsigned char)(cam_y&0xFF);(*(unsigned char*)0x0703)=(unsigned char)(cam_y>>8);' +
    '(*(unsigned char*)0x0704)=(unsigned char)(px&0xFF);(*(unsigned char*)0x0705)=(unsigned char)(px>>8);' +
    '(*(unsigned char*)0x0706)=(unsigned char)(py&0xFF);(*(unsigned char*)0x0707)=(unsigned char)(py>>8);while (oam_idx < 256) {');
}

const CASES = [
  { label: 'vertical (1x3, DOWN only — row streamer + world_to_screen_y)', sx: 1, sy: 3, right: false },
  { label: 'diagonal (2x2, DOWN+RIGHT — both streamers at once)', sx: 2, sy: 2, right: true },
];

const srvC = await H.startServer(PORT_C, { PLAYGROUND_NO_ASM: '1' });
const srvA = await H.startServer(PORT_A);
try {
  for (const cs of CASES) {
    const s = makeState(cs.sx, cs.sy);
    const instances = s.builder.modules.scene.config.instances;
    const payload = {
      state: s, playerSpriteIdx: 0, playerStart: { x: 120, y: 120 }, mode: 'browser',
      customMainC: withMirror(win.BuilderAssembler.assemble(s, tpl)),
      sceneSprites: instances.map((it) => ({ spriteIdx: it.spriteIdx, x: it.x, y: it.y })),
    };
    const rc = await H.buildRom(PORT_C, payload);
    const ra = await H.buildRom(PORT_A, payload);
    if (!rc.ok) { bad(`${cs.label}: C build failed (${rc.stage})`); continue; }
    if (!ra.ok) { bad(`${cs.label}: ASM build failed (${ra.stage}): ` + String(ra.log || '').slice(-400)); continue; }
    if (rc.romBytes.equals(ra.romBytes)) { bad(`${cs.label}: ASM ROM == C ROM (flags did not engage)`); continue; }

    const c = boot(rc.romBytes), a = boot(ra.romBytes);
    // Settle: VRAM stream completes and the scratch mirror is populated (it reads
    // uninitialised RAM until the first main-loop frame writes it).
    for (let i = 0; i < 150; i++) { c.frame(); a.frame(); }
    const startPy = rd16(c, PYA);
    if (startPy !== rd16(a, PYA)) { bad(`${cs.label}: start py differs (C ${startPy} ASM ${rd16(a, PYA)})`); continue; }
    const TARGET = startPy + 160;  // ~20 tiles down: crosses the row-30 nametable seam
                                   // and (diagonally) a full 32px column boundary too

    const fc = advanceDown(c, TARGET, cs.right);
    const fa = advanceDown(a, TARGET, cs.right);
    for (let i = 0; i < 8; i++) { c.frame(); a.frame(); }   // let both fully settle at rest

    if (rd16(c, CAMY) === 0) { bad(`${cs.label}: camera never scrolled vertically (cam_y still 0) — path not exercised`); continue; }
    if (rd16(c, PYA) !== rd16(a, PYA)) { bad(`${cs.label}: py mismatch after walk (C ${rd16(c, PYA)} ASM ${rd16(a, PYA)})`); continue; }

    const r = renderDiff(c, a);
    const extra = cs.right ? ` cam=(${rd16(c, CAMX)},${rd16(c, CAMY)})` : ` cam_y=${rd16(c, CAMY)}`;
    if (r.pal + r.oam + r.nt === 0)
      ok(`${cs.label}: C ≡ ASM at matched py=${rd16(c, PYA)} (C ${fc} vblanks, ASM ${fa};${extra})`);
    else
      bad(`${cs.label}: divergence at py=${rd16(c, PYA)} — palette ${r.pal} OAM ${r.oam} nametable ${r.nt}`);
  }
} catch (e) {
  bad('threw: ' + (e && e.stack || e));
} finally {
  await H.stopServer(srvC.srv);
  await H.stopServer(srvA.srv);
}

if (failed) process.exit(1);
console.log('\nasm-vscroll: ASM matches C for vertical + diagonal scroll at matched progress.');
