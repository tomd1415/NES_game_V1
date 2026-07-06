#!/usr/bin/env node
// ASM engine generator — cycle/size benchmark + regression guard.
//
// Quantifies the win the hand-written 6502 buys, on the stock fixture, two ways:
//   * SIZE  — the CODE segment (from ld65 -m), C vs ASM. The ASM replaces cc65
//     output with tighter 6502, so it should be SMALLER.
//   * SPEED — dropped frames over a standardised RIGHT-scroll. The pure-C engine
//     overruns the NTSC vblank budget on each column-stream burst and drops a
//     frame; the ASM engine holds 60fps. Fewer drops = faster.
// Asserts ASM ≤ C on both (a standing guard against a perf/size regression) and
// prints the numbers (the report `rewrites/` never produced).
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

// Build a config, relink with a map, return { rom, codeBytes }.
function buildAndMeasure(flags) {
  execSync('make -s clean', { cwd: STEP, stdio: 'ignore' });
  execSync('make -s ' + flags, { cwd: STEP, stdio: ['ignore', 'ignore', 'pipe'] });
  const objs = fs.readdirSync(path.join(STEP, 'build')).filter(f => f.endsWith('.o')).map(f => 'build/' + f);
  const map = path.join(STEP, 'build', 'bench.map');
  execSync(`ld65 -C cfg/nes.cfg -m ${map} -o build/bench.nes ${objs.join(' ')} /usr/share/cc65/lib/nes.lib`,
    { cwd: STEP, stdio: 'ignore' });
  const line = fs.readFileSync(map, 'utf8').split('\n').find(l => /^CODE\s/.test(l));
  const codeBytes = parseInt(line.trim().split(/\s+/)[3], 16);
  const rom = fs.readFileSync(path.join(STEP, 'game.nes'));
  return { rom, codeBytes };
}
function boot(bytes) { const n = new jsnes.NES({ onFrame() {}, onAudioSample() {} }); n.loadROM(bytes.toString('binary')); return n; }
const rd16 = (n, a) => (n.cpu.mem[a] & 0xFF) | ((n.cpu.mem[a + 1] & 0xFF) << 8);
const PX = 0x6039;
function vblanksToPx(n, target, cap = 500) {
  let f = 0; while (rd16(n, PX) < target && f < cap) { n.buttonDown(1, B.BUTTON_RIGHT); n.frame(); n.buttonUp(1, B.BUTTON_RIGHT); f++; } return f;
}

let C, A;
try {
  C = buildAndMeasure('');
  A = buildAndMeasure('NES_ASM_LEAF=1 NES_ASM_SCROLL=1');
} catch (e) {
  bad('build/link failed: ' + (e.message || e));
} finally {
  try { execSync('git checkout -- game.nes', { cwd: STEP, stdio: 'ignore' }); } catch {}
  try { execSync('make -s clean', { cwd: STEP, stdio: 'ignore' }); } catch {}
}

if (C && A) {
  // --- SIZE ---
  const dSize = C.codeBytes - A.codeBytes;
  console.log(`CODE segment: C=${C.codeBytes}B  ASM=${A.codeBytes}B  (ASM ${dSize >= 0 ? '-' : '+'}${Math.abs(dSize)}B)`);
  if (A.codeBytes <= C.codeBytes) ok(`ASM engine is no larger than C (${dSize}B smaller)`);
  else bad(`ASM engine CODE grew vs C by ${-dSize}B`);

  // --- SPEED (dropped frames over a standardised scroll to px=184) ---
  const c = boot(C.rom), a = boot(A.rom);
  for (let i = 0; i < 240; i++) { c.frame(); a.frame(); }
  const TARGET = 184;
  const fc = vblanksToPx(c, TARGET), fa = vblanksToPx(a, TARGET);
  console.log(`scroll to px=${TARGET}: C=${fc} vblanks  ASM=${fa}  (C dropped ${fc - fa} more frames)`);
  if (fa <= fc) ok(`ASM holds pace (drops ${fc - fa} fewer frames than C over the scroll)`);
  else bad(`ASM dropped MORE frames than C (${fa} > ${fc})`);
}

if (failed) process.exit(1);
console.log('\nasm-benchmark: ASM engine is smaller and faster than the C engine.');
