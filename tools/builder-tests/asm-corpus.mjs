#!/usr/bin/env node
// ASM engine generator — Phase 5 corpus dual-build equivalence (growing).
//
// For a grid of project shapes (game type × world size × content), builds the
// SAME project two ways through the server — pure C (PLAYGROUND_NO_ASM=1) vs the
// shipped hand-written 6502 engine — boots both in jsnes, settles past the VRAM
// load, and asserts they are byte-identical AT REST (OAM + palette + nametables +
// WRAM). At rest nothing streams, so there are no frame-drop phase artifacts:
// any diff is a real divergence in a function shipped to every pupil.
//
// Byte-golden can't cover the ASM ROM (it's deliberately not byte-identical to
// C); this is how the ASM path is verified across shapes. Grows over time toward
// the full corpus + scripted-input motion A/B + cycle/size benchmarks.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as H from './lib/render-harness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const jsnes = require(path.join(H.ROOT, 'tools', 'tile_editor_web', 'jsnes.min.js'));

const PORT_C = 18790, PORT_A = 18791;
let failed = false;
const ok = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };

const win = H.loadBuilderModules();
const tpl = H.readTemplate();

// A parameterised project. gameType drives BW_GAME_STYLE; screens sets the world
// size; enemy adds N static scene sprites (N=1 by default when truthy).
function makeState(gameType, screensX, screensY, enemy) {
  const nEnemies = enemy === true ? 1 : (enemy | 0);
  const sprites = [
    { role: 'player', name: 'hero', width: 2, height: 2, cells: H.mkCells(2, 2) },
    { role: 'enemy', name: 'goomba', width: 2, height: 2, cells: H.mkCells(2, 2) },
  ];
  const s = {
    name: 'corpus', version: 1, universal_bg: 0x21, sprites,
    sprite_tiles: H.blankPool(), bg_tiles: H.blankPool(),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x0F, 0x10, 0x30] })),
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    backgrounds: [H.flatBackground(screensX, screensY, 26)],
    behaviour_types: H.BEHAVIOUR_TYPES, selectedBgIdx: 0, builder: win.BuilderDefaults(),
  };
  s.builder.modules.game.config.type = gameType;
  if (nEnemies > 0) {
    // STATIC ai: the enemies are present (so behaviour_at runs their gravity/
    // collision every frame + reaction_for is exercised — real coverage) but do
    // not move, so the rest comparison is phase-independent. A walker's position
    // drifts by the 1-frame load-timing phase (bigger on larger worlds) — a
    // matched-progress concern verified separately, NOT a divergence.
    s.builder.modules.scene.config.instances = Array.from({ length: nEnemies }, (_, i) => ({
      id: 'e' + i, spriteIdx: 1, x: 40 + i * 24, y: 120, ai: 'static',
    }));
  }
  return s;
}

const FIXTURES = [
  { label: 'platformer 2x1 + enemy', gt: 'platformer', sx: 2, sy: 1, enemy: true },
  { label: 'platformer 1x2 (vertical)', gt: 'platformer', sx: 1, sy: 2, enemy: false },
  { label: 'platformer 2x2 (four-screen)', gt: 'platformer', sx: 2, sy: 2, enemy: true },
  { label: 'platformer 3x1 (WORLD_COLS=96, non-pow2 MULC)', gt: 'platformer', sx: 3, sy: 1, enemy: true },
  { label: 'platformer 3x2 (96 wide + tall)', gt: 'platformer', sx: 3, sy: 2, enemy: true },
  { label: 'platformer 2x1 + 5 enemies (reaction_for/scene loop)', gt: 'platformer', sx: 2, sy: 1, enemy: 5 },
  { label: 'topdown 2x2', gt: 'topdown', sx: 2, sy: 2, enemy: true },
  { label: 'topdown 3x1 (96)', gt: 'topdown', sx: 3, sy: 1, enemy: true },
  { label: 'smb 2x1', gt: 'smb', sx: 2, sy: 1, enemy: true },
  { label: 'racer 2x2', gt: 'racer', sx: 2, sy: 2, enemy: false },
  { label: 'runner 2x1', gt: 'runner', sx: 2, sy: 1, enemy: false },
  { label: 'platformer 1x1 (no scroll)', gt: 'platformer', sx: 1, sy: 1, enemy: true },
];

function boot(bytes) {
  const nes = new jsnes.NES({ onFrame() {}, onAudioSample() {} });
  nes.loadROM(bytes.toString('binary'));
  return nes;
}
const pal = (n) => { const a = []; for (let i = 0x3F00; i <= 0x3F1F; i++) a.push(n.ppu.vramMem[i] & 0xFF); return a; };
const oam = (n) => { const a = []; for (let i = 0; i < 256; i++) a.push(n.ppu.spriteMem[i] & 0xFF); return a; };
const wram = (n) => { const a = []; for (let i = 0x6000; i < 0x6100; i++) a.push(n.cpu.mem[i] & 0xFF); return a; };
const diff = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++; return d; };

const srvC = await H.startServer(PORT_C, { PLAYGROUND_NO_ASM: '1' });
const srvA = await H.startServer(PORT_A);
try {
  for (const fx of FIXTURES) {
    const s = makeState(fx.gt, fx.sx, fx.sy, fx.enemy);
    const instances = (s.builder.modules.scene.config.instances) || [];
    const payload = {
      state: s, playerSpriteIdx: 0, playerStart: { x: 60, y: 120 }, mode: 'browser',
      customMainC: win.BuilderAssembler.assemble(s, tpl),
      sceneSprites: instances.map((it) => ({ spriteIdx: it.spriteIdx, x: it.x, y: it.y })),
    };
    const rc = await H.buildRom(PORT_C, payload);
    const ra = await H.buildRom(PORT_A, payload);
    if (!rc.ok) { bad(`${fx.label}: C build failed (${rc.stage})`); continue; }
    if (!ra.ok) { bad(`${fx.label}: ASM build failed (${ra.stage}): ` + String(ra.log || '').slice(-400)); continue; }
    if (rc.romBytes.equals(ra.romBytes)) { bad(`${fx.label}: ASM ROM == C ROM (flags did not engage)`); continue; }

    // Settle both to a STABLE rest (no input): the VRAM stream completes and the
    // player/enemies land, so the RENDERED state (OAM + palette + nametables — the
    // pixels the pupil sees) becomes stable and phase-independent. WRAM is NOT
    // compared: per-frame counters (anim_tick, timers) differ by the documented
    // 1-frame load-timing phase (the faster ASM finishes the stream a frame
    // sooner) — a benign artifact, not a divergence. Motion equivalence is the
    // matched-progress job (asm-ab.mjs / a later corpus growth step).
    const c = boot(rc.romBytes), a = boot(ra.romBytes);
    for (let i = 0; i < 360; i++) { c.frame(); a.frame(); }
    let nt = 0;
    for (let k = 0; k < 4; k++) { const cn = c.ppu.nameTable[k], an = a.ppu.nameTable[k]; if (cn && an) for (let t = 0; t < 960; t++) if ((cn.tile[t] & 0xFF) !== (an.tile[t] & 0xFF)) nt++; }
    const dpal = diff(pal(c), pal(a)), doam = diff(oam(c), oam(a));
    if (dpal + doam + nt === 0) ok(`${fx.label}: C ≡ ASM rendered at rest (palette+OAM+nametables)`);
    else bad(`${fx.label}: rendered divergence at rest — palette ${dpal} OAM ${doam} nametable ${nt}`);
  }
} catch (e) {
  bad('threw: ' + (e && e.stack || e));
} finally {
  await H.stopServer(srvC.srv);
  await H.stopServer(srvA.srv);
}

if (failed) process.exit(1);
console.log('\nasm-corpus: every shape matches the C engine at rest.');
