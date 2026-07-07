#!/usr/bin/env node
// ASM engine generator — Phase 5: the HOT enemy path (behaviour_at + reaction_for)
// verified UNDER MOTION.
//
// asm-corpus.mjs deliberately uses STATIC enemies so its at-rest comparison is
// phase-independent. But behaviour_at (the collision-map lookup, shipped ASM) and
// reaction_for (shipped ASM) are the per-frame HOT path — they run for every enemy
// every frame and are the real reason the engine went to hand-written 6502. They
// must be exercised while the enemies actually MOVE.
//
// A 1x1 world (32x30 = one screen) never scrolls, so nothing streams after boot
// and neither engine ever misses vblank — both advance exactly one game-tick per
// frame in steady state. BUT the one-screen boot blit finishes a frame sooner on
// the faster ASM build, leaving the two builds permanently offset by a constant
// phase (the documented load-timing artifact). Because that offset is CONSTANT
// (no scroll ⇒ it never grows), we align it ONCE using an injected per-frame tick
// counter, then the walkers are in lockstep and their OAM must match byte-for-byte
// on every subsequent frame. Any divergence after alignment is a real ASM bug.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as H from './lib/render-harness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const jsnes = require(path.join(H.ROOT, 'tools', 'tile_editor_web', 'jsnes.min.js'));

const PORT_C = 18794, PORT_A = 18795;
let failed = false;
const ok = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };

const win = H.loadBuilderModules();
const tpl = H.readTemplate();

function makeState() {
  const sprites = [
    { role: 'player', name: 'hero', width: 2, height: 2, cells: H.mkCells(2, 2) },
    { role: 'enemy', name: 'goomba', width: 2, height: 2, cells: H.mkCells(2, 2) },
  ];
  const s = {
    name: 'enemy', version: 1, universal_bg: 0x21, sprites,
    sprite_tiles: H.blankPool(), bg_tiles: H.blankPool(),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x0F, 0x10, 0x30] })),
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    backgrounds: [H.flatBackground(1, 1, 26)],   // single screen → never scrolls
    behaviour_types: H.BEHAVIOUR_TYPES, selectedBgIdx: 0, builder: win.BuilderDefaults(),
  };
  s.builder.modules.game.config.type = 'platformer';
  // Two WALKERS on the floor, offset so they patrol/turn out of phase — each turn
  // at a world edge is a behaviour_at "blocked" lookup; two of them keep several
  // OAM slots churning every frame.
  s.builder.modules.scene.config.instances = [
    { id: 'w0', spriteIdx: 1, x: 48, y: 200, ai: 'walker' },
    { id: 'w1', spriteIdx: 1, x: 180, y: 200, ai: 'walker' },
  ];
  return s;
}

// Inject a free-running per-frame tick counter (u16 at $0710) into the main loop.
function withTick(mainC) {
  return mainC.replace('while (oam_idx < 256) {',
    '{static unsigned int _tk; ++_tk; (*(unsigned char*)0x0710)=(unsigned char)(_tk&0xFF);' +
    '(*(unsigned char*)0x0711)=(unsigned char)(_tk>>8);} while (oam_idx < 256) {');
}

function boot(bytes) {
  const nes = new jsnes.NES({ onFrame() {}, onAudioSample() {} });
  nes.loadROM(bytes.toString('binary'));
  return nes;
}
const rd16 = (n, a) => (n.cpu.mem[a] & 0xFF) | ((n.cpu.mem[a + 1] & 0xFF) << 8);
const TICK = 0x0710;
const oam = (n) => { const a = []; for (let i = 0; i < 256; i++) a.push(n.ppu.spriteMem[i] & 0xFF); return a; };
const pal = (n) => { const a = []; for (let i = 0x3F00; i <= 0x3F1F; i++) a.push(n.ppu.vramMem[i] & 0xFF); return a; };
const diff = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++; return d; };
function ntDiff(c, a) { let n = 0; for (let k = 0; k < 4; k++) { const cn = c.ppu.nameTable[k], an = a.ppu.nameTable[k]; if (cn && an) for (let t = 0; t < 960; t++) if ((cn.tile[t] & 0xFF) !== (an.tile[t] & 0xFF)) n++; } return n; }

const srvC = await H.startServer(PORT_C, { PLAYGROUND_NO_ASM: '1' });
const srvA = await H.startServer(PORT_A);
try {
  const s = makeState();
  const instances = s.builder.modules.scene.config.instances;
  const payload = {
    state: s, playerSpriteIdx: 0, playerStart: { x: 120, y: 200 }, mode: 'browser',
    customMainC: withTick(win.BuilderAssembler.assemble(s, tpl)),
    sceneSprites: instances.map((it) => ({ spriteIdx: it.spriteIdx, x: it.x, y: it.y })),
  };
  const rc = await H.buildRom(PORT_C, payload);
  const ra = await H.buildRom(PORT_A, payload);
  if (!rc.ok) bad(`C build failed (${rc.stage})`);
  else if (!ra.ok) bad(`ASM build failed (${ra.stage}): ` + String(ra.log || '').slice(-400));
  else if (rc.romBytes.equals(ra.romBytes)) bad('ASM ROM == C ROM (flags did not engage)');
  else {
    const c = boot(rc.romBytes), a = boot(ra.romBytes);
    for (let i = 0; i < 120; i++) { c.frame(); a.frame(); }   // settle past the boot blit

    // Align the constant boot-phase offset: step ONLY the lagging build until both
    // injected tick counters read equal. After this, both tick 1/frame together.
    let tc = rd16(c, TICK), ta = rd16(a, TICK), guard = 0;
    while (tc !== ta && guard < 60) { if (tc < ta) { c.frame(); tc = rd16(c, TICK); } else { a.frame(); ta = rd16(a, TICK); } guard++; }
    if (tc !== ta) { bad(`could not align phase (C tick ${tc}, ASM tick ${ta})`); }
    else {
      // Locked in phase. Run 300 frames comparing OAM every frame; the walkers must
      // stay byte-identical. Verify they actually MOVE (else the test proves nothing).
      const startOam = oam(c).slice(0, 24);
      let oamDiff = 0, worst = -1, sawMotion = false;
      for (let i = 0; i < 300; i++) {
        c.frame(); a.frame();
        if (rd16(c, TICK) !== rd16(a, TICK)) { bad(`phase slipped at frame ${i} (C ${rd16(c, TICK)} ASM ${rd16(a, TICK)})`); break; }
        const d = diff(oam(c), oam(a));
        if (d && worst < 0) worst = i;
        oamDiff += d;
        if (!sawMotion && diff(oam(c).slice(0, 24), startOam)) sawMotion = true;
      }
      const still = diff(pal(c), pal(a)) + ntDiff(c, a);
      if (!sawMotion) bad('walkers never moved — test exercised nothing');
      else if (oamDiff === 0 && still === 0)
        ok('platformer 1x1, 2 walkers: C ≡ ASM every frame over 300 frames of motion (behaviour_at/reaction_for)');
      else
        bad(`divergence — OAM byte-diffs ${oamDiff} (first at frame ${worst}), palette+nt ${still}`);
    }
  }
} catch (e) {
  bad('threw: ' + (e && e.stack || e));
} finally {
  await H.stopServer(srvC.srv);
  await H.stopServer(srvA.srv);
}

if (failed) process.exit(1);
console.log('\nasm-enemy: the shipped behaviour_at/reaction_for match C every frame under enemy motion.');
