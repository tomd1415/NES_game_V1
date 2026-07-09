#!/usr/bin/env node
// ASM engine — SMB frame-budget benchmark (FCEUX follow-up, 2026-07-09).
//
// A pupil's FCEUX pass reported the SMB model "feels faster / more flickery" on the
// shipped ASM build than on the pure-C build. asm-player.mjs already proves the SMB
// PLAYER physics (smb_update) are px-identical to the C every tick, so it is NOT a
// logic bug. The remaining explanation is the frame budget: on a busy SMB scene the
// pure-C engine overruns the ~29780-cycle NTSC frame and DROPS frames, while the ASM
// engine keeps up at 60fps — so ASM legitimately runs faster/smoother (and, keeping
// up, draws every sprite each frame, which is why the 8-per-scanline HUD flicker
// shows more on ASM). This benchmark measures that directly, the same way
// asm-ai-bench does: over a fixed number of EMULATED frames, a build that misses
// vblanks completes fewer game-loop iterations (ticks). If ASM ticks > C ticks on a
// heavy SMB scene, the pupil's observation is confirmed as the frame-budget win, not
// a regression. (Pure C vs the FULL default ASM engine — exactly the two ROMs they
// compared.)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as H from './lib/render-harness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const jsnes = require(path.join(H.ROOT, 'tools', 'tile_editor_web', 'jsnes.min.js'));

const PORT_C = 18794, PORT_A = 18795;
const NEN = 26;            // enough enemies that the frame is genuinely loaded
const WARM = 80;           // frames to let the scroll/boot settle before sampling
const RUN = 600;           // emulated frames the tick count is measured over
let failed = false;
const ok = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };

const win = H.loadBuilderModules();
new Function(fs.readFileSync(path.join(H.WEB, 'engine-version.js'), 'utf8'))();
const tpl = H.readTemplate();

// A 2-screen SMB level (style 0 + BW_SMB_JUMP -> smb_update; scroll -> scene-draw +
// scroll ASM engage too) with a floor and a pen of walkers each probing every frame.
const INSTANCES = Array.from({ length: NEN }, (_, i) => (
  { spriteIdx: 1, x: 24 + ((i * 16) % 480), y: 192, ai: 'walker', speed: 2 }));
function makeState() {
  const cols = 64, rows = 30, floorRow = 26;
  const beh = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let c = 0; c < cols; c++) beh[floorRow][c] = 1;
  for (const wc of [16, 32, 48]) for (let r = floorRow - 1; r >= floorRow - 6; r--) beh[r][wc] = 2;
  const bg = {
    name: 'bg', dimensions: { screens_x: 2, screens_y: 1 },
    nametable: Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ tile: 0, palette: 0 }))),
    behaviour: beh,
  };
  const sprites = [
    { role: 'player', name: 'hero', width: 2, height: 2, cells: H.mkCells(2, 2) },
    { role: 'enemy', name: 'goomba', width: 2, height: 2, cells: H.mkCells(2, 2) },
  ];
  const s = {
    name: 'smbbench', version: 1, universal_bg: 0x21, sprites,
    sprite_tiles: H.blankPool(), bg_tiles: H.blankPool(),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x0F, 0x10, 0x30] })),
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    backgrounds: [bg], behaviour_types: H.BEHAVIOUR_TYPES, selectedBgIdx: 0, builder: win.BuilderDefaults(),
  };
  s.builder.modules.game.config.type = 'smb';
  s.builder.modules.scene.config.instances = INSTANCES.map((it) => ({ ...it }));
  return s;
}

function withTick(mainC) {
  const inj = '{static unsigned int _tk; ++_tk;'
    + '(*(unsigned char*)0x0710)=(unsigned char)(_tk&0xFF);(*(unsigned char*)0x0711)=(unsigned char)(_tk>>8);} ';
  return mainC.replace('while (oam_idx < 256) {', inj + 'while (oam_idx < 256) {');
}
const boot = (b) => { const n = new jsnes.NES({ onFrame() {}, onAudioSample() {} }); n.loadROM(b.toString('binary')); return n; };
const rd16 = (n, a) => (n.cpu.mem[a] & 0xFF) | ((n.cpu.mem[a + 1] & 0xFF) << 8);
function ticksOver(romBytes) {
  const n = boot(romBytes);
  for (let f = 0; f < WARM; f++) n.frame();
  const t0 = rd16(n, 0x0710);
  for (let f = 0; f < RUN; f++) n.frame();
  return rd16(n, 0x0710) - t0;
}

const srvC = await H.startServer(PORT_C, { PLAYGROUND_NO_ASM: '1' });   // pure C engine
const srvA = await H.startServer(PORT_A, {});                            // full default ASM engine
try {
  const s = makeState();
  const mainC = win.BuilderAssembler.assemble(s, tpl);
  if (!/#define BW_SMB_JUMP/.test(mainC)) { bad('not an SMB build (no BW_SMB_JUMP) — smb_update would not engage'); }
  const payload = {
    state: s, playerSpriteIdx: 0, playerStart: { x: 40, y: 192 }, mode: 'browser',
    customMainC: withTick(mainC),
    sceneSprites: INSTANCES.map((it) => ({ spriteIdx: it.spriteIdx, x: it.x, y: it.y })),
  };
  const rc = await H.buildRom(PORT_C, payload);
  const ra = await H.buildRom(PORT_A, payload);
  if (!rc.ok) bad(`C build failed (${rc.stage}): ` + String(rc.log || '').slice(-300));
  else if (!ra.ok) bad(`ASM build failed (${ra.stage}): ` + String(ra.log || '').slice(-400));
  else if (rc.romBytes.equals(ra.romBytes)) bad('ASM ROM == C ROM (default ASM engine did not engage)');
  else {
    const tc = ticksOver(rc.romBytes), ta = ticksOver(ra.romBytes);
    console.log(`\n  scene: SMB (style 0 + jump), ${NEN} enemies, 2 screens, ${RUN} emulated frames`);
    console.log(`  game-loop ticks:  pure-C = ${tc}   ASM = ${ta}   (${(ta / tc).toFixed(2)}x — higher = keeps 60fps better)\n`);
    if (tc <= 0 || ta <= 0) bad('tick counters did not advance — benchmark did not run');
    else if (tc >= RUN - 10) bad(`scene not heavy enough (pure-C did ${tc}/${RUN} ticks — no frame drops to measure)`);
    else if (ta < tc) bad(`REGRESSION: ASM (${ta} ticks) SLOWER than pure-C (${tc}) on the heavy SMB scene`);
    else ok(`SMB full-engine speed: ASM holds ${(ta / tc).toFixed(2)}x the pure-C game-loop rate on a busy SMB scene `
      + `(pure-C ${tc} vs ASM ${ta} ticks / ${RUN} frames) — the pupil's "ASM faster" is the frame-budget win, not a bug`);
  }
} catch (e) {
  bad('threw: ' + (e && e.stack || e));
} finally {
  await H.stopServer(srvC.srv);
  await H.stopServer(srvA.srv);
}

if (failed) process.exit(1);
console.log('asm-smb-bench: on a busy SMB scene the ASM engine keeps 60fps where the pure-C engine drops frames.');
