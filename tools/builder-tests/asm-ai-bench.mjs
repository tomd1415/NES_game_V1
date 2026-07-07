#!/usr/bin/env node
// ASM engine generator — Phase 2b: a cycle/size BENCHMARK for the ai_update loop.
//
// asm-ai.mjs / asm-ai-wide.mjs prove the ASM AI is byte-for-byte equivalent to
// the C. This quantifies what that ASM buys: on a deliberately heavy scene (many
// walkers, each calling bw_sprite_blocked every frame) the per-frame AI cost is
// the dominant load, so the two builds overrun the vblank budget at different
// rates. We measure that directly with the injected game-loop tick counter:
// over a fixed number of EMULATED frames, the faster build completes more
// game-loop iterations (ticks) before it misses a vblank. ASM must never be
// slower than C — that is the regression guard; the ratio is the reported win.
//
// Also reports a best-effort PRG code-size proxy (the largest fill gap left in
// the 32 KB PRG bank) so a size regression is visible. It is printed, not
// asserted — a full ROM is NROM-fixed at 49168 bytes either way.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as H from './lib/render-harness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const jsnes = require(path.join(H.ROOT, 'tools', 'tile_editor_web', 'jsnes.min.js'));

const PORT_C = 18794, PORT_A = 18795;
const NEN = 28;            // enough walkers that the AI is the frame's dominant cost
const WARM = 80;           // frames to let the scroll/boot settle before sampling
const RUN = 600;           // emulated frames the tick count is measured over
let failed = false;
const ok = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };

const win = H.loadBuilderModules();
new Function(fs.readFileSync(path.join(H.WEB, 'engine-version.js'), 'utf8'))();  // target latest engine
const tpl = H.readTemplate();

// A walled pen packed with walkers, each probing a wall/edge every frame.
function makeState() {
  const cols = 32, rows = 30, floorRow = 26;
  const beh = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let c = 0; c < cols; c++) beh[floorRow][c] = 1;
  for (const wc of [10, 22]) for (let r = floorRow - 1; r >= floorRow - 8; r--) beh[r][wc] = 2;
  const bg = {
    name: 'bg', dimensions: { screens_x: 1, screens_y: 1 },
    nametable: Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ tile: 0, palette: 0 }))),
    behaviour: beh,
  };
  const sprites = [
    { role: 'player', name: 'hero', width: 2, height: 2, cells: H.mkCells(2, 2) },
    { role: 'enemy', name: 'goomba', width: 2, height: 2, cells: H.mkCells(2, 2) },
  ];
  const s = {
    name: 'bench', version: 1, universal_bg: 0x21, sprites,
    sprite_tiles: H.blankPool(), bg_tiles: H.blankPool(),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x0F, 0x10, 0x30] })),
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    backgrounds: [bg], behaviour_types: H.BEHAVIOUR_TYPES, selectedBgIdx: 0, builder: win.BuilderDefaults(),
  };
  s.builder.modules.game.config.type = 'platformer';
  s.builder.modules.scene.config.instances = INSTANCES.map((it) => ({ ...it }));
  return s;
}
const INSTANCES = Array.from({ length: NEN }, (_, i) => (
  { spriteIdx: 1, x: 16 + ((i * 8) % 224), y: 200, ai: 'walker', speed: 2 }));

// Inject just the tick counter (u16 @ 0x0710) at the per-frame OAM loop.
function withTick(mainC) {
  const inj = '{static unsigned int _tk; ++_tk;'
    + '(*(unsigned char*)0x0710)=(unsigned char)(_tk&0xFF);(*(unsigned char*)0x0711)=(unsigned char)(_tk>>8);} ';
  return mainC.replace('while (oam_idx < 256) {', inj + 'while (oam_idx < 256) {');
}

const boot = (b) => { const n = new jsnes.NES({ onFrame() {}, onAudioSample() {} }); n.loadROM(b.toString('binary')); return n; };
const rd16 = (n, a) => (n.cpu.mem[a] & 0xFF) | ((n.cpu.mem[a + 1] & 0xFF) << 8);

// Ticks completed over RUN emulated frames (after WARM warm-up frames).
function ticksOver(romBytes) {
  const n = boot(romBytes);
  for (let f = 0; f < WARM; f++) n.frame();
  const t0 = rd16(n, 0x0710);
  for (let f = 0; f < RUN; f++) n.frame();
  return rd16(n, 0x0710) - t0;
}

// Largest run of one repeated byte in the 32 KB PRG bank — a proxy for the fill
// gap (free code space). Fewer free bytes => more code.
function prgFreeGap(romBytes) {
  const prgBanks = romBytes[4] || 2;
  const prg = romBytes.subarray(16, 16 + prgBanks * 16384);
  let best = 0, run = 1;
  for (let i = 1; i < prg.length; i++) {
    run = prg[i] === prg[i - 1] ? run + 1 : 1;
    if (run > best) best = run;
  }
  return best;
}

const srvC = await H.startServer(PORT_C, { PLAYGROUND_NO_ASM: '1' });
const srvA = await H.startServer(PORT_A, { PLAYGROUND_ASM_AI: '1' });
try {
  const s = makeState();
  const payload = {
    state: s, playerSpriteIdx: 0, playerStart: { x: 120, y: 200 }, mode: 'browser',
    customMainC: withTick(win.BuilderAssembler.assemble(s, tpl)),
    sceneSprites: INSTANCES.map((it) => ({ spriteIdx: it.spriteIdx, x: it.x, y: it.y })),
  };
  const rc = await H.buildRom(PORT_C, payload);
  const ra = await H.buildRom(PORT_A, payload);
  if (!rc.ok) bad(`C build failed (${rc.stage})`);
  else if (!ra.ok) bad(`ASM build failed (${ra.stage}): ` + String(ra.log || '').slice(-400));
  else if (rc.romBytes.equals(ra.romBytes)) bad('ASM ROM == C ROM (NES_ASM_AI did not engage)');
  else {
    const tc = ticksOver(rc.romBytes), ta = ticksOver(ra.romBytes);
    const gapC = prgFreeGap(rc.romBytes), gapA = prgFreeGap(ra.romBytes);
    console.log(`\n  scene: ${NEN} walkers, ${RUN} emulated frames`);
    console.log(`  game-loop ticks:  C = ${tc}   ASM = ${ta}   (${(ta / tc).toFixed(2)}x — higher = faster)`);
    console.log(`  PRG fill gap:     C = ${gapC}B  ASM = ${gapA}B  (Δ ${gapA - gapC >= 0 ? '+' : ''}${gapA - gapC}B free with ASM)\n`);
    if (tc <= 0 || ta <= 0) bad('tick counters did not advance — benchmark did not run');
    else if (tc >= RUN - 10) bad(`scene not heavy enough (C did ${tc}/${RUN} ticks — no frame drops, so speed is unmeasured)`);
    else if (ta < tc) bad(`REGRESSION: ASM (${ta} ticks) is SLOWER than C (${tc} ticks) on the heavy AI scene`);
    else ok(`ai_update ASM speed: ${(ta / tc).toFixed(2)}x the C game-loop rate on ${NEN} walkers `
      + `(C ${tc} vs ASM ${ta} ticks / ${RUN} frames); ASM is never slower`);
  }
} catch (e) {
  bad('threw: ' + (e && e.stack || e));
} finally {
  await H.stopServer(srvC.srv);
  await H.stopServer(srvA.srv);
}

if (failed) process.exit(1);
console.log('asm-ai-bench: the ASM ai_update runs the enemy AI faster than the C, at identical behaviour.');
