#!/usr/bin/env node
// ASM-vs-C behavioural equivalence (ASM engine generator, Phase 5 — minimal).
//
// The shipped ASM ROM is NOT byte-identical to the pure-C ROM (that's the point),
// so byte-golden can't guard it. Instead this dual-builds the stock Step_Playground
// fixture two ways and asserts they are behaviourally identical at MATCHED
// game-logic progress (the asm-lab settle-to-rest / matched-progress method):
//   * C engine  : make            (no ASM flags)
//   * ASM engine: make NES_ASM_LEAF=1 NES_ASM_SCROLL=1
// then boots both in jsnes, walks the player to the same world-x, and compares
// camera + WRAM + palette + OAM + nametables. Also asserts the ASM build drops no
// MORE frames than C (it should drop fewer — the whole reason for the ASM).
//
// This is the standing regression guard for every ASM function shipped on /play.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const STEP = path.join(ROOT, 'steps', 'Step_Playground');
const require = createRequire(import.meta.url);
const jsnes = require(path.join(ROOT, 'tools', 'tile_editor_web', 'jsnes.min.js'));
const B = jsnes.Controller;

let failed = false;
const ok = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };

function build(flags) {
  execSync('make -s clean', { cwd: STEP, stdio: ['ignore', 'ignore', 'ignore'] });
  execSync('make -s ' + flags, { cwd: STEP, stdio: ['ignore', 'ignore', 'pipe'] });
  return fs.readFileSync(path.join(STEP, 'game.nes'));
}
function boot(bytes) {
  const nes = new jsnes.NES({ onFrame() {}, onAudioSample() {} });
  nes.loadROM(bytes.toString('binary'));
  return nes;
}
const rd16 = (n, a) => (n.cpu.mem[a] & 0xFF) | ((n.cpu.mem[a + 1] & 0xFF) << 8);
const PX = 0x6039, CX = 0x6059;
const pal = (n) => { const a = []; for (let i = 0x3F00; i <= 0x3F1F; i++) a.push(n.ppu.vramMem[i] & 0xFF); return a; };
const oam = (n) => { const a = []; for (let i = 0; i < 256; i++) a.push(n.ppu.spriteMem[i] & 0xFF); return a; };
const diff = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++; return d; };
function advanceToPx(n, target, cap = 400) {
  let f = 0;
  while (rd16(n, PX) < target && f < cap) { n.buttonDown(1, B.BUTTON_RIGHT); n.frame(); n.buttonUp(1, B.BUTTON_RIGHT); f++; }
  return f;
}
function advanceToPxLeft(n, target, cap = 400) {
  let f = 0;
  while (rd16(n, PX) > target && f < cap) { n.buttonDown(1, B.BUTTON_LEFT); n.frame(); n.buttonUp(1, B.BUTTON_LEFT); f++; }
  return f;
}
// Hold RIGHT until px stops rising for 2 frames — the player has pinned against
// the world's right edge (where cam_x clamps at world_width - screen_width).
function walkToRestRight(n, cap = 800) {
  let f = 0, stall = 0, prev = rd16(n, PX);
  while (f < cap && stall < 2) {
    n.buttonDown(1, B.BUTTON_RIGHT); n.frame(); n.buttonUp(1, B.BUTTON_RIGHT);
    const now = rd16(n, PX);
    stall = (now === prev) ? stall + 1 : 0;
    prev = now; f++;
  }
  return f;
}
function renderDiff(c, a) {
  let dnt = 0;
  for (let n = 0; n < 4; n++) { const cn = c.ppu.nameTable[n], an = a.ppu.nameTable[n]; if (cn && an) for (let t = 0; t < 960; t++) if ((cn.tile[t] & 0xFF) !== (an.tile[t] & 0xFF)) dnt++; }
  return { pal: diff(pal(c), pal(a)), oam: diff(oam(c), oam(a)), nt: dnt, cam: rd16(c, CX) === rd16(a, CX) ? 0 : 1 };
}

let romC, romA;
try {
  romC = build('');
  romA = build('NES_ASM_LEAF=1 NES_ASM_SCROLL=1');
  ok('both engines built (C + LEAF/SCROLL ASM)');
} catch (e) {
  bad('build failed: ' + (e.message || e));
} finally {
  try { execSync('git checkout -- game.nes', { cwd: STEP, stdio: 'ignore' }); } catch {}
  try { execSync('make -s clean', { cwd: STEP, stdio: 'ignore' }); } catch {}
}

if (romC && romA) {
  if (romC.equals(romA)) bad('ASM ROM is byte-identical to C — the flags did nothing?');
  else ok('ASM ROM differs from C (the hand-written 6502 is in there)');

  const c = boot(romC), a = boot(romA);
  for (let i = 0; i < 240; i++) { c.frame(); a.frame(); }   // settle VRAM stream + fall
  const TARGET = 184;
  const fc = advanceToPx(c, TARGET), fa = advanceToPx(a, TARGET);
  for (let i = 0; i < 8; i++) { c.frame(); a.frame(); }
  ok(`reached px=${TARGET}: C in ${fc} vblanks, ASM in ${fa} (C dropped ${fc - fa} more frames)`);
  if (fa > fc) bad(`ASM dropped MORE frames than C (${fa} > ${fc}) — perf regression`);

  const r = renderDiff(c, a);
  if (r.pal + r.oam + r.nt + r.cam === 0) ok('right-scroll: IDENTICAL at matched progress (cam, palette, OAM, nametables)');
  else bad(`right-scroll divergence at px=${TARGET}: palette=${r.pal} OAM=${r.oam} nametable=${r.nt} cam=${r.cam}`);

  // Now scroll BACK LEFT — exercises scroll_follow's left deadzone, the @col_left
  // left-column stream, and world_to_screen underflow (paths the right-only walk
  // never hits). Compare at a matched px on the way back.
  const LTARGET = 96;
  const lc = advanceToPxLeft(c, LTARGET), la = advanceToPxLeft(a, LTARGET);
  for (let i = 0; i < 8; i++) { c.frame(); a.frame(); }
  const rl = renderDiff(c, a);
  if (rl.pal + rl.oam + rl.nt + rl.cam === 0) ok(`left-scroll: IDENTICAL at matched progress (C ${lc} vblanks, ASM ${la})`);
  else bad(`left-scroll divergence at px=${LTARGET}: palette=${rl.pal} OAM=${rl.oam} nametable=${rl.nt} cam=${rl.cam}`);

  // Jump IN PLACE (no L/R input → no scroll → no streaming → no frame drops), so
  // C and ASM stay in exact lockstep every frame. Compare the player's OAM (first
  // 16 bytes = a 2x2 sprite) across the whole jump arc — verifies world_to_screen_y,
  // gravity and jump-rise, which the horizontal walks never exercise.
  let jumpDiff = 0, jumpFrames = 0;
  for (let i = 0; i < 40; i++) {
    if (i < 3) { c.buttonDown(1, B.BUTTON_UP); a.buttonDown(1, B.BUTTON_UP); }
    c.frame(); a.frame();
    c.buttonUp(1, B.BUTTON_UP); a.buttonUp(1, B.BUTTON_UP);
    jumpDiff += diff(oam(c).slice(0, 16), oam(a).slice(0, 16));
    jumpFrames++;
  }
  if (jumpDiff === 0) ok(`jump arc: player OAM IDENTICAL across ${jumpFrames} frames (world_to_screen_y, gravity, jump-rise)`);
  else bad(`jump arc: player OAM diverged (${jumpDiff} byte-diffs over the jump)`);

  // Walk all the way to the world's RIGHT edge: px pins and cam_x clamps at
  // world_width - screen_width. The horizontal analogue of asm-vscroll's bottom
  // clamp — confirms C and ASM clamp to the identical px/cam_x (the scroll_follow
  // right-deadzone + clamp path) and render byte-identically at the wall.
  walkToRestRight(c); walkToRestRight(a);
  for (let i = 0; i < 8; i++) { c.frame(); a.frame(); }
  const clampOk = rd16(c, PX) === rd16(a, PX) && rd16(c, CX) === rd16(a, CX);
  const re = renderDiff(c, a);
  if (clampOk && re.pal + re.oam + re.nt + re.cam === 0)
    ok(`right-edge clamp: C ≡ ASM pinned at px=${rd16(c, PX)}, cam_x clamped=${rd16(c, CX)}`);
  else
    bad(`right-edge clamp divergence: px C${rd16(c, PX)}/A${rd16(a, PX)} cam_x C${rd16(c, CX)}/A${rd16(a, CX)} ` +
        `render(pal ${re.pal} OAM ${re.oam} nt ${re.nt} cam ${re.cam})`);
}

if (failed) process.exit(1);
console.log('\nasm-ab: ASM engine matches the C engine at matched game-logic progress.');
