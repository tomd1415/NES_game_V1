// Unit harness for box_on_edge (racer_box_on_edge): boot the ROM, read $0300,
// and assert the ASM candidate matches the C reference AND an independent JS
// model that rebuilds the same map + box logic.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, makeReporter } from '../../harness/nes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const bxs = [32, 40, 33, 152, 100, 80, 24, 32, 256, 40, 100, 0, 248, 44];
const bys = [0, 0, 0, 152, 100, 80, 0, 0, 160, 40, 0, 0, 152, 44];
const bws = [1, 1, 2, 1, 1, 1, 3, 1, 1, 1, 1, 1, 2, 3];
const bhs = [1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 3];

// Same map the driver builds.
const COLS = 32, ROWS = 30;
const map = new Uint8Array(COLS * ROWS);
for (let r = 0; r < ROWS; r++) map[r * COLS + 5] = 2;      // WALL column
map[10 * COLS + 10] = 1; map[10 * COLS + 11] = 1;          // 2x2 block
map[11 * COLS + 10] = 1; map[11 * COLS + 11] = 1;
for (let c = 0; c < COLS; c++) map[20 * COLS + c] = 1;     // floor row 20

const bat = (c, r) => (c >= COLS || r >= ROWS) ? 0 : map[r * COLS + c];
const solid = (c, r) => { const b = bat(c, r); return b === 1 || b === 2; };
const model = (bx, by, bw, bh) => {
  const c0 = (bx >> 3) & 0xFF, c1 = ((bx + bw * 8 - 1) >> 3) & 0xFF;
  const r0 = (by >> 3) & 0xFF, r1 = ((by + bh * 8 - 1) >> 3) & 0xFF;
  const cm = ((bx + bw * 4) >> 3) & 0xFF, rm = ((by + bh * 4) >> 3) & 0xFF;
  return (solid(c0, r0) || solid(c1, r0) || solid(c0, r1) || solid(c1, r1) || solid(cm, rm)) ? 1 : 0;
};

const r = makeReporter('box_on_edge unit');
const h = boot(path.join(__dirname, '..', '..', 'build', 'boe.nes'));
if (!h.frameUntil(0x0300, 0xAA)) { r.bad('driver did not finish (marker $0300 != 0xAA)'); r.done(); }
const n = h.rd(0x0301);
r.eq('case count', n, bxs.length);
r.eq('mismatch count (ref vs asm)', h.rd(0x0302), 0);

let allGood = true;
for (let i = 0; i < n; i++) {
  const ref = h.rd(0x0308 + i * 2);
  const asm = h.rd(0x0309 + i * 2);
  const want = model(bxs[i], bys[i], bws[i], bhs[i]);
  if (!(asm === ref && ref === want)) {
    allGood = false;
    r.bad(`case ${i} box=(${bxs[i]},${bys[i]},${bws[i]},${bhs[i]}): ref=${ref} asm=${asm} model=${want}`);
  }
}
if (allGood) r.ok(`all ${n} cases: asm == ref == model (corners, centre, straddle, floor, bx>=256 out-of-map)`);

r.done('box_on_edge: ASM candidate is behaviourally identical to the C reference.');
