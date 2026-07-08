// Unit harness for racer_axis: boot the ROM, read $0300, assert ASM == C == JS model.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, makeReporter } from '../../harness/nes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Must mirror test.c's arrays + map exactly.
const cxs = [ 64, 184,  64, 184,   1, 239, 184,  64];
const cys = [ 64,  64, 184, 184,  64,  64,  64,   1];
const vxs = [256, 512,   0, 512,-512, 512, 512,   0];
const vys = [256,   0, 512, 512,   0,   0, 768,-512];

const COLS = 32, ROWS = 30, PW = 2, PH = 2, RX_MAX = 240, RY_MAX = 224;
const s16 = (v) => { v &= 0xFFFF; return v & 0x8000 ? v - 0x10000 : v; };

const map = new Uint8Array(COLS * ROWS);
for (let r = 0; r < ROWS; r++) map[r * COLS + 25] = 2;
for (let c = 0; c < COLS; c++) map[25 * COLS + c] = 2;
const bat = (c, r) => (c >= COLS || r >= ROWS) ? 0 : map[r * COLS + c];
const solid = (c, r) => { const b = bat(c, r); return b === 1 || b === 2; };
function boxHit(bx, by, bw, bh) {
  const c0 = (bx >> 3) & 0xFF, c1 = ((bx + bw * 8 - 1) >> 3) & 0xFF;
  const r0 = (by >> 3) & 0xFF, r1 = ((by + bh * 8 - 1) >> 3) & 0xFF;
  const cm = ((bx + bw * 4) >> 3) & 0xFF, rm = ((by + bh * 4) >> 3) & 0xFF;
  return solid(c0, r0) || solid(c1, r0) || solid(c0, r1) || solid(c1, r1) || solid(cm, rm);
}

function model(px, py, vx, vy) {
  let px_sub = 0, py_sub = 0, speed = 600, hitx = 0, hity = 0, keep, keeps, acc, np;
  // X
  keep = px; keeps = px_sub;
  acc = px_sub + vx; np = px + (acc >> 8); px_sub = acc & 0xFF;
  if (np < 0) { np = 0; px_sub = 0; } else if (np > RX_MAX) { np = RX_MAX; px_sub = 0; }
  px = np;
  if (boxHit(px, py, PW, PH)) { px = keep; px_sub = keeps; hitx = 1; }
  // Y
  keep = py; keeps = py_sub;
  acc = py_sub + vy; np = py + (acc >> 8); py_sub = acc & 0xFF;
  if (np < 0) { np = 0; py_sub = 0; } else if (np > RY_MAX) { np = RY_MAX; py_sub = 0; }
  py = np;
  if (boxHit(px, py, PW, PH)) { py = keep; py_sub = keeps; hity = 1; }
  const avx = Math.abs(vx), avy = Math.abs(vy);
  if ((hitx && avx >= avy) || (hity && avy >= avx)) speed >>= 1;
  return [px & 0xFFFF, py & 0xFFFF, px_sub & 0xFF, py_sub & 0xFF, speed & 0xFFFF];
}

const r = makeReporter('racer_axis unit');
const h = boot(path.join(__dirname, '..', '..', 'build', 'raxis.nes'));
if (!h.frameUntil(0x0300, 0xAA)) { r.bad('driver did not finish (marker $0300 != 0xAA)'); r.done(); }
const n = h.rd(0x0301);
r.eq('case count', n, cxs.length);
r.eq('mismatch count (ref vs asm)', h.rd(0x0302), 0);

const rd16 = (a) => h.rd(a) | (h.rd(a + 1) << 8);
let allGood = true;
for (let i = 0; i < n; i++) {
  const rb = 0x0308 + i * 16, ab = rb + 8;
  const ref = [rd16(rb), rd16(rb + 2), h.rd(rb + 4), h.rd(rb + 5), rd16(rb + 6)];
  const asm = [rd16(ab), rd16(ab + 2), h.rd(ab + 4), h.rd(ab + 5), rd16(ab + 6)];
  const mdl = model(cxs[i], cys[i], vxs[i], vys[i]);
  const eq = (a, b) => a.every((v, k) => v === b[k]);
  if (!(eq(asm, ref) && eq(ref, mdl))) {
    allGood = false;
    r.bad(`case ${i} p=(${cxs[i]},${cys[i]}) v=(${vxs[i]},${vys[i]}): `
      + `ref=[${ref[0]},${ref[1]},${ref[2]},${ref[3]},${s16(ref[4])}] `
      + `asm=[${asm[0]},${asm[1]},${asm[2]},${asm[3]},${s16(asm[4])}] `
      + `model=[${mdl[0]},${mdl[1]},${mdl[2]},${mdl[3]},${s16(mdl[4])}]`);
  }
}
if (allGood) r.ok(`all ${n} cases: asm == ref == model `
  + `(free move, X/Y/both blocked slide, world-edge clamp lo/hi, dominant-axis bleed vs shallow-hit no-bleed)`);

r.done('racer_axis: ASM candidate is behaviourally identical to the C reference.');
