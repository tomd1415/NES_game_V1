#!/usr/bin/env node
// ASM engine generator — Phase 2b: bw_sprite_blocked (scene-AI collision probe) on ASM.
//
// The per-enemy collision probe every walker/chaser/flyer/patrol calls each frame
// now has a hand-written 6502 twin (ai_asm.s). It is NOT shipped to pupils — the
// server links it only under PLAYGROUND_ASM_AI (a test toggle); the C helper is
// #ifdef-gated so flag-off is byte-identical.
//
// This builds a walled pen with a WALKER and dual-builds it pure C
// (PLAYGROUND_NO_ASM=1) vs the ASM engine + AI helper (PLAYGROUND_ASM_AI=1), then
// asserts the walker moves IDENTICALLY. The walker turns at BOTH an interior WALL
// (exercises bw_sprite_blocked's behaviour_at leading-edge probe) and the world
// edge (its edge-return paths). A 1x1 world never scrolls, so nothing streams and
// the two builds run in lockstep once the constant boot-phase offset is aligned
// via an injected per-frame tick counter (the asm-enemy method) — then the
// walker's OAM must match byte-for-byte on every frame. Any diff is a real bug in
// the ASM bw_sprite_blocked.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as H from './lib/render-harness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const jsnes = require(path.join(H.ROOT, 'tools', 'tile_editor_web', 'jsnes.min.js'));

const PORT_C = 18798, PORT_A = 18799;
let failed = false;
const ok = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };

const win = H.loadBuilderModules();
const tpl = H.readTemplate();

// A 1x1 world with a floor + solid WALL columns, so a floor-walking enemy turns
// at a real SOLID/WALL tile (the behaviour_at probe path), not just the edge.
function walledBackground(wallCols) {
  const cols = 32, rows = 30, floorRow = 26;
  const beh = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let c = 0; c < cols; c++) beh[floorRow][c] = 1;               // SOLID_GROUND floor
  for (const wc of wallCols) for (let r = floorRow - 1; r >= floorRow - 8; r--) beh[r][wc] = 2; // WALL
  return {
    name: 'bg', dimensions: { screens_x: 1, screens_y: 1 },
    nametable: Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ tile: 0, palette: 0 }))),
    behaviour: beh,
  };
}

function makeState() {
  const sprites = [
    { role: 'player', name: 'hero', width: 2, height: 2, cells: H.mkCells(2, 2) },
    { role: 'enemy', name: 'goomba', width: 2, height: 2, cells: H.mkCells(2, 2) },
  ];
  const s = {
    name: 'ai', version: 1, universal_bg: 0x21, sprites,
    sprite_tiles: H.blankPool(), bg_tiles: H.blankPool(),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x0F, 0x10, 0x30] })),
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    backgrounds: [walledBackground([14, 24])],
    behaviour_types: H.BEHAVIOUR_TYPES, selectedBgIdx: 0, builder: win.BuilderDefaults(),
  };
  s.builder.modules.game.config.type = 'platformer';
  // Two walkers penned between the walls / edges, offset so they turn out of phase.
  s.builder.modules.scene.config.instances = [
    { id: 'w0', spriteIdx: 1, x: 64, y: 200, ai: 'walker', speed: 2 },
    { id: 'w1', spriteIdx: 1, x: 150, y: 200, ai: 'walker', speed: 1 },
  ];
  return s;
}

function withTick(mainC) {
  return mainC.replace('while (oam_idx < 256) {',
    '{static unsigned int _tk; ++_tk; (*(unsigned char*)0x0710)=(unsigned char)(_tk&0xFF);' +
    '(*(unsigned char*)0x0711)=(unsigned char)(_tk>>8);} while (oam_idx < 256) {');
}

const boot = (b) => { const n = new jsnes.NES({ onFrame() {}, onAudioSample() {} }); n.loadROM(b.toString('binary')); return n; };
const rd16 = (n, a) => (n.cpu.mem[a] & 0xFF) | ((n.cpu.mem[a + 1] & 0xFF) << 8);
const TICK = 0x0710;
const oam = (n) => { const a = []; for (let i = 0; i < 256; i++) a.push(n.ppu.spriteMem[i] & 0xFF); return a; };
const pal = (n) => { const a = []; for (let i = 0x3F00; i <= 0x3F1F; i++) a.push(n.ppu.vramMem[i] & 0xFF); return a; };
const diff = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++; return d; };

const srvC = await H.startServer(PORT_C, { PLAYGROUND_NO_ASM: '1' });
const srvA = await H.startServer(PORT_A, { PLAYGROUND_ASM_AI: '1' });
try {
  const s = makeState();
  const instances = s.builder.modules.scene.config.instances;
  const payload = {
    state: s, playerSpriteIdx: 0, playerStart: { x: 110, y: 200 }, mode: 'browser',
    customMainC: withTick(win.BuilderAssembler.assemble(s, tpl)),
    sceneSprites: instances.map((it) => ({ spriteIdx: it.spriteIdx, x: it.x, y: it.y })),
  };
  const rc = await H.buildRom(PORT_C, payload);
  const ra = await H.buildRom(PORT_A, payload);
  if (!rc.ok) bad(`C build failed (${rc.stage})`);
  else if (!ra.ok) bad(`ASM build failed (${ra.stage}): ` + String(ra.log || '').slice(-500));
  else if (rc.romBytes.equals(ra.romBytes)) bad('ASM ROM == C ROM (NES_ASM_AI did not engage)');
  else {
    const c = boot(rc.romBytes), a = boot(ra.romBytes);
    for (let i = 0; i < 120; i++) { c.frame(); a.frame(); }
    // Align the constant boot-phase offset via the tick counters.
    let tc = rd16(c, TICK), ta = rd16(a, TICK), guard = 0;
    while (tc !== ta && guard < 60) { if (tc < ta) { c.frame(); tc = rd16(c, TICK); } else { a.frame(); ta = rd16(a, TICK); } guard++; }
    if (tc !== ta) bad(`could not align phase (C ${tc}, ASM ${ta})`);
    else {
      // Walker w0 is drawn right after the 2x2 player (OAM slots 0..15); its
      // top-left sub-sprite X sits at OAM byte 19. Track its peak so we can prove
      // it actually reversed (a turn = a blocked probe returned 1).
      const startOam = oam(c).slice(0, 24);
      let oamDiff = 0, worst = -1, sawMotion = false, turned = false;
      let maxX = -1;
      for (let i = 0; i < 400; i++) {
        c.frame(); a.frame();
        if (rd16(c, TICK) !== rd16(a, TICK)) { bad(`phase slipped at frame ${i}`); break; }
        oamDiff += diff(oam(c), oam(a));
        if (oamDiff && worst < 0) worst = i;
        const o = oam(c);
        if (!sawMotion && diff(o.slice(0, 24), startOam)) sawMotion = true;
        const wx = o[19];
        if (wx > maxX) maxX = wx;
        else if (wx < maxX - 6) turned = true;   // dropped well below its peak -> reversed
      }
      const still = diff(pal(c), pal(a));
      if (!sawMotion) bad('walkers never moved — test exercised nothing');
      else if (!turned) bad('walker never turned — the blocked-probe path was not exercised');
      else if (oamDiff === 0 && still === 0)
        ok('ai_update (walker) + bw_sprite_blocked: C ≡ ASM every frame over 400 frames of motion (incl. wall/edge turns)');
      else bad(`divergence — OAM byte-diffs ${oamDiff} (first at frame ${worst}), palette ${still}`);
    }
  }
} catch (e) {
  bad('threw: ' + (e && e.stack || e));
} finally {
  await H.stopServer(srvC.srv);
  await H.stopServer(srvA.srv);
}

if (failed) process.exit(1);
console.log('\nasm-ai: the ASM bw_sprite_blocked matches the C collision probe under enemy motion.');
