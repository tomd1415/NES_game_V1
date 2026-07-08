// Unit harness for plat_ladder: boot the ROM, read $0300, assert ASM == C ref ==
// JS model for py/jumping/jmp_up/on_ladder.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, makeReporter } from '../../harness/nes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const pxs = [80, 80, 80, 80, 80, 80, 200, 80, 80, 80];
const pys = [100, 100, 100, 80, 64, 148, 100, 100, 100, 148];
const pds = [0x00, 0x08, 0x04, 0x08, 0x08, 0x04, 0x08, 0x08, 0x0C, 0x08];
const css = [1, 1, 1, 1, 1, 1, 1, 2, 1, 1];

const COLS = 32, ROWS = 30, WH = 240, PW = 2, PH = 2;
const map = new Uint8Array(COLS * ROWS);
for (let r = 8; r <= 18; r++) map[r * COLS + 10] = 6;
for (let c = 0; c < COLS; c++) map[20 * COLS + c] = 1;
map[7 * COLS + 10] = 2; map[7 * COLS + 11] = 2;
map[9 * COLS + 11] = 2;
const bat = (c, r) => (c >= COLS || r >= ROWS) ? 0 : map[r * COLS + c];

function model(px, py, pad, cs) {
  let jumping = 1, jmp_up = 7, on_ladder = 0;
  const lt = py >> 3, lb = (py + PH * 8 - 1) >> 3, ll = px >> 3, lr = (px + PW * 8 - 1) >> 3;
  for (let rr = lt; rr <= lb; rr++) {
    if (bat(ll, rr) === 6 || bat(lr, rr) === 6) { on_ladder = 1; break; }
  }
  if (on_ladder) {
    if (pad & 0x08) {
      const nt = py >= cs ? py - cs : 0, ur = nt >> 3;
      const ul = bat(px >> 3, ur), urr = bat((px + PW * 8 - 1) >> 3, ur);
      const lad = ul === 6 || urr === 6;
      const sol = ul === 1 || ul === 2 || urr === 1 || urr === 2;
      if (lad || !sol) py = nt;
    }
    if (pad & 0x04) {
      const nf = py + cs + PH * 8, dr = nf >> 3;
      const dl = bat(px >> 3, dr), drr = bat((px + PW * 8 - 1) >> 3, dr);
      const lad = dl === 6 || drr === 6;
      const sol = dl === 1 || dl === 2 || drr === 1 || drr === 2;
      if ((lad || !sol) && py < WH - 8) py += cs;
    }
    jumping = 0; jmp_up = 0;
  }
  return [py & 0xFFFF, jumping, jmp_up, on_ladder];
}

const r = makeReporter('plat_ladder unit');
const h = boot(path.join(__dirname, '..', '..', 'build', 'plad.nes'));
if (!h.frameUntil(0x0300, 0xAA)) { r.bad('driver did not finish (marker $0300 != 0xAA)'); r.done(); }
const n = h.rd(0x0301);
r.eq('case count', n, pxs.length);
r.eq('mismatch count (ref vs asm)', h.rd(0x0302), 0);

let allGood = true;
for (let i = 0; i < n; i++) {
  const rpy = h.rd(0x0308 + i * 10) | (h.rd(0x0309 + i * 10) << 8);
  const rju = h.rd(0x030A + i * 10), rjm = h.rd(0x030B + i * 10), rol = h.rd(0x030C + i * 10);
  const apy = h.rd(0x030D + i * 10) | (h.rd(0x030E + i * 10) << 8);
  const aju = h.rd(0x030F + i * 10), ajm = h.rd(0x0310 + i * 10), aol = h.rd(0x0311 + i * 10);
  const [wpy, wju, wjm, wol] = model(pxs[i], pys[i], pds[i], css[i]);
  if (!(apy === rpy && aju === rju && ajm === rjm && aol === rol
     && rpy === wpy && rju === wju && rjm === wjm && rol === wol)) {
    allGood = false;
    r.bad(`case ${i} px=${pxs[i]} py=${pys[i]} pad=${pds[i].toString(16)} cs=${css[i]}: `
      + `ref=(${rpy},${rju},${rjm},${rol}) asm=(${apy},${aju},${ajm},${aol}) model=(${wpy},${wju},${wjm},${wol})`);
  }
}
if (allGood) r.ok(`all ${n} cases: asm == ref == model (detect, UP/DOWN climb, ladder-wins tie-break, solid-block, not-on-ladder, cs=2)`);

r.done('plat_ladder: ASM candidate is behaviourally identical to the C reference.');
