// Unit harness for behaviour_at (WORLD_COLS=32, WORLD_ROWS=30).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, makeReporter } from '../../harness/nes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COLS = 32, ROWS = 30;
const cols = [0, 31, 0, 5, 32, 0, 31, 100, 5, 16, 31, 300];
const rows = [0, 29, 29, 10, 0, 30, 0, 5, 300, 15, 29, 0];
// Independent model, incl. the exact map fill pattern from test.c.
const cell = (k) => (k * 7 + 3) & 0xFF;
const model = (col, row) => {
  if (col >= COLS || row >= ROWS) return 0;
  return cell(row * COLS + col);
};

const r = makeReporter('behaviour_at unit');
const h = boot(path.join(__dirname, '..', '..', 'build', 'bat.nes'));
if (!h.frameUntil(0x0300, 0xAA)) { r.bad('driver did not finish (no 0xAA at $0300)'); r.done(); }
const n = h.rd(0x0301);
r.eq('case count', n, cols.length);
r.eq('mismatch count (ref vs asm)', h.rd(0x0302), 0);

let allGood = true;
for (let i = 0; i < n; i++) {
  const ref = h.rd(0x0308 + i * 2), asm = h.rd(0x0309 + i * 2), want = model(cols[i], rows[i]);
  if (!(asm === ref && ref === want)) {
    allGood = false;
    r.bad(`case ${i} col=${cols[i]} row=${rows[i]}: ref=${ref} asm=${asm} model=${want}`);
  }
}
if (allGood) r.ok(`all ${n} cases: asm == ref == model (corners, on/off-bounds each axis, far-OOB)`);
r.done('behaviour_at: ASM candidate is behaviourally identical to the C reference.');
