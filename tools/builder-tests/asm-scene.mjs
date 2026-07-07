#!/usr/bin/env node
// ASM engine generator — Phase 2a: the scene-sprite DRAW loop on hand-written 6502.
//
// draw_scene_sprites (scene_asm.s) replaces the template's plain per-sprite→OAM
// loop: a generic loop over NUM_STATIC_SPRITES reading the ss_* arrays and calling
// world_to_screen_x/y. It is NOT yet shipped to pupils — the server links it only
// when PLAYGROUND_ASM_SCENE=1 (a test toggle) and the project has scene sprites,
// scrolls, and has no tagged scene animation (the ASM only does the plain path).
//
// This dual-builds several scene shapes two ways — pure C (PLAYGROUND_NO_ASM=1) vs
// the scene-draw ASM (PLAYGROUND_ASM_SCENE=1) — and asserts the RENDERED state is
// byte-identical at rest (OAM + palette + nametables). Static sprites don't move,
// so at rest the comparison is phase-independent (the asm-corpus method). Covers
// multi-sprite scenes, mixed sprite sizes (sw/sh), a top-down world, and an
// SS_POS_WIDE=1 case (a sprite past screen 1 → ss_x/ss_y are u16 — the ASM reads
// them at the right width even though it's off-screen at rest and hidden as 0xFF).
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as H from './lib/render-harness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const jsnes = require(path.join(H.ROOT, 'tools', 'tile_editor_web', 'jsnes.min.js'));

const PORT_C = 18796, PORT_A = 18797;
let failed = false;
const ok = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };

const win = H.loadBuilderModules();
const tpl = H.readTemplate();

// Build a project with a specific set of static scene sprites. `insts` is a list
// of {spriteIdx,x,y} (all ai:'static' so nothing moves and there's no AI update —
// only the draw loop differs between the two builds).
function makeState(gameType, sx, sy, insts) {
  const sprites = [
    { role: 'player', name: 'hero', width: 2, height: 2, cells: H.mkCells(2, 2) },
    { role: 'enemy', name: 'goomba', width: 2, height: 2, cells: H.mkCells(2, 2) },
    { role: 'pickup', name: 'coin', width: 1, height: 1, cells: H.mkCells(1, 1) },
  ];
  const s = {
    name: 'scene', version: 1, universal_bg: 0x21, sprites,
    sprite_tiles: H.blankPool(), bg_tiles: H.blankPool(),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x0F, 0x10, 0x30] })),
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    backgrounds: [H.flatBackground(sx, sy, 26)],
    behaviour_types: H.BEHAVIOUR_TYPES, selectedBgIdx: 0, builder: win.BuilderDefaults(),
  };
  s.builder.modules.game.config.type = gameType;
  s.builder.modules.scene.config.instances = insts.map((it, i) => ({
    id: 'e' + i, spriteIdx: it.spriteIdx, x: it.x, y: it.y, ai: 'static',
  }));
  return s;
}

const boot = (bytes) => { const n = new jsnes.NES({ onFrame() {}, onAudioSample() {} }); n.loadROM(bytes.toString('binary')); return n; };
const pal = (n) => { const a = []; for (let i = 0x3F00; i <= 0x3F1F; i++) a.push(n.ppu.vramMem[i] & 0xFF); return a; };
const oam = (n) => { const a = []; for (let i = 0; i < 256; i++) a.push(n.ppu.spriteMem[i] & 0xFF); return a; };
const diff = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++; return d; };
const ntDiff = (c, a) => { let n = 0; for (let k = 0; k < 4; k++) { const cn = c.ppu.nameTable[k], an = a.ppu.nameTable[k]; if (cn && an) for (let t = 0; t < 960; t++) if ((cn.tile[t] & 0xFF) !== (an.tile[t] & 0xFF)) n++; } return n; };

const FIXTURES = [
  { label: 'platformer 2x1, 3 static enemies (multi-sprite draw)', gt: 'platformer', sx: 2, sy: 1,
    insts: [{ spriteIdx: 1, x: 48, y: 120 }, { spriteIdx: 1, x: 96, y: 120 }, { spriteIdx: 1, x: 160, y: 120 }] },
  { label: 'platformer 2x1, mixed sizes (2x2 enemy + 1x1 pickup)', gt: 'platformer', sx: 2, sy: 1,
    insts: [{ spriteIdx: 1, x: 64, y: 120 }, { spriteIdx: 2, x: 120, y: 128 }, { spriteIdx: 2, x: 176, y: 96 }] },
  { label: 'topdown 2x2, 3 static enemies', gt: 'topdown', sx: 2, sy: 2,
    insts: [{ spriteIdx: 1, x: 60, y: 100 }, { spriteIdx: 1, x: 140, y: 150 }, { spriteIdx: 2, x: 100, y: 60 }] },
  { label: 'platformer 3x1, wide sprite past screen 1 (SS_POS_WIDE=1)', gt: 'platformer', sx: 3, sy: 1,
    insts: [{ spriteIdx: 1, x: 80, y: 120 }, { spriteIdx: 1, x: 300, y: 120 }] },
];

const srvC = await H.startServer(PORT_C, { PLAYGROUND_NO_ASM: '1' });
const srvA = await H.startServer(PORT_A, { PLAYGROUND_ASM_SCENE: '1' });
try {
  for (const fx of FIXTURES) {
    const s = makeState(fx.gt, fx.sx, fx.sy, fx.insts);
    const instances = s.builder.modules.scene.config.instances;
    const payload = {
      state: s, playerSpriteIdx: 0, playerStart: { x: 60, y: 120 }, mode: 'browser',
      customMainC: win.BuilderAssembler.assemble(s, tpl),
      sceneSprites: instances.map((it) => ({ spriteIdx: it.spriteIdx, x: it.x, y: it.y })),
    };
    const rc = await H.buildRom(PORT_C, payload);
    const ra = await H.buildRom(PORT_A, payload);
    if (!rc.ok) { bad(`${fx.label}: C build failed (${rc.stage})`); continue; }
    if (!ra.ok) { bad(`${fx.label}: ASM build failed (${ra.stage}): ` + String(ra.log || '').slice(-500)); continue; }
    if (rc.romBytes.equals(ra.romBytes)) { bad(`${fx.label}: ASM ROM == C ROM (NES_ASM_SCENE did not engage)`); continue; }

    const c = boot(rc.romBytes), a = boot(ra.romBytes);
    for (let i = 0; i < 360; i++) { c.frame(); a.frame(); }
    const dpal = diff(pal(c), pal(a)), doam = diff(oam(c), oam(a)), dnt = ntDiff(c, a);
    if (dpal + doam + dnt === 0) ok(`${fx.label}: C ≡ ASM rendered at rest (palette+OAM+nametables)`);
    else bad(`${fx.label}: rendered divergence — palette ${dpal} OAM ${doam} nametable ${dnt}`);
  }

  // Wide sprite VISIBLE: scroll right until the x=300 sprite is on-screen, so the
  // u16 position path (u16 ss_x read + base_x+c*8 + world_to_screen on a real
  // 16-bit value) renders an actual screen position, not just the off-screen
  // 0xFF the rest case produces. Matched px (no matched-vblank), OAM must match.
  {
    const s = makeState('platformer', 3, 1, [{ spriteIdx: 1, x: 300, y: 120 }]);
    const inst = s.builder.modules.scene.config.instances;
    const mainC = win.BuilderAssembler.assemble(s, tpl).replace('while (oam_idx < 256) {',
      '(*(unsigned char*)0x0700)=(unsigned char)(px&0xFF);(*(unsigned char*)0x0701)=(unsigned char)(px>>8);while (oam_idx < 256) {');
    const payload = { state: s, playerSpriteIdx: 0, playerStart: { x: 60, y: 120 }, mode: 'browser',
      customMainC: mainC, sceneSprites: inst.map((it) => ({ spriteIdx: it.spriteIdx, x: it.x, y: it.y })) };
    const rc = await H.buildRom(PORT_C, payload), ra = await H.buildRom(PORT_A, payload);
    if (!rc.ok || !ra.ok) { bad(`wide-visible: build failed (C ${rc.stage || 'ok'} / ASM ${ra.stage || 'ok'})`); }
    else {
      const c = boot(rc.romBytes), a = boot(ra.romBytes);
      const PX = 0x0700, rd16 = (n, x) => (n.cpu.mem[x] & 0xFF) | ((n.cpu.mem[x + 1] & 0xFF) << 8);
      const B = jsnes.Controller;
      for (let i = 0; i < 150; i++) { c.frame(); a.frame(); }
      const adv = (n, t) => { let f = 0; while (rd16(n, PX) < t && f < 600) { n.buttonDown(1, B.BUTTON_RIGHT); n.frame(); n.buttonUp(1, B.BUTTON_RIGHT); f++; } return f; };
      adv(c, 240); adv(a, 240);
      for (let i = 0; i < 8; i++) { c.frame(); a.frame(); }
      // A scene sprite is visible when some OAM slot past the player (>=16) has a
      // real on-screen Y (< 0xEF). Confirms we're actually rendering it, not 0xFF.
      const visible = oam(c).some((v, i) => i >= 16 && i % 4 === 0 && v < 0xEF);
      const doam = diff(oam(c), oam(a));
      if (!visible) bad('wide-visible: the x=300 sprite never came on-screen — check unproven');
      else if (doam === 0) ok('wide sprite VISIBLE (scrolled to px=240): C ≡ ASM OAM (u16 position path renders)');
      else bad(`wide-visible: OAM diverged (${doam})`);
    }
  }
} catch (e) {
  bad('threw: ' + (e && e.stack || e));
} finally {
  await H.stopServer(srvC.srv);
  await H.stopServer(srvA.srv);
}

if (failed) process.exit(1);
console.log('\nasm-scene: the scene-draw ASM loop matches the C draw loop across shapes.');
