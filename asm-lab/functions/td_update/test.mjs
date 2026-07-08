// Unit harness for td_update (top-down player update): boot the ROM, read $0300,
// assert the ASM candidate matches the C reference AND an independent JS model of
// the whole 4-way move+collision for px/py/plrdir.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, makeReporter } from '../../harness/nes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const pads = [0x01, 0x01, 0x02, 0x02, 0x08, 0x04, 0x04, 0x08, 0x05, 0x01, 0x02, 0x08, 0x04, 0x01, 0x03, 0x0F];
const pxs  = [16, 48, 48, 72, 16, 16, 16, 16, 16, 240, 0, 16, 16, 16, 16, 32];
const pys  = [16, 16, 16, 16, 64, 64, 32, 88, 32, 16, 16, 0, 224, 16, 16, 32];
const wss  = [2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 2, 2, 1, 3, 2, 1];

const COLS = 32, ROWS = 30, WW = 256, WH = 240, PW = 2, PH = 2;
const map = new Uint8Array(COLS * ROWS);
for (let r = 0; r < ROWS; r++) map[r * COLS + 8] = 2;
for (let c = 0; c < COLS; c++) map[10 * COLS + c] = 2;
const solid = (c, r) => { const b = (c >= COLS || r >= ROWS) ? 0 : map[r * COLS + c]; return b === 1 || b === 2; };

function model(pad, px, py, ws) {
  let plrdir = 0x99;
  if (pad & 0x01) {
    if (px < (WW - PW * 8)) {
      const ac = (px + PW * 8 + ws - 1) >> 3, t = py >> 3, b = (py + PH * 8 - 1) >> 3;
      let blk = false;
      for (let rr = t; rr <= b; rr++) if (solid(ac, rr)) { blk = true; break; }
      if (!blk) px += ws;
    }
    plrdir = 0x00;
  }
  if (pad & 0x02) {
    if (px >= ws) {
      const ac = (px - ws) >> 3, t = py >> 3, b = (py + PH * 8 - 1) >> 3;
      let blk = false;
      for (let rr = t; rr <= b; rr++) if (solid(ac, rr)) { blk = true; break; }
      if (!blk) px -= ws;
    }
    plrdir = 0x40;
  }
  if (pad & 0x08) {
    if (py >= ws) {
      const ar = (py - ws) >> 3, lc = px >> 3, rc = (px + PW * 8 - 1) >> 3;
      if (!(solid(lc, ar) || solid(rc, ar))) py -= ws;
    }
  }
  if (pad & 0x04) {
    if (py + PH * 8 + ws <= WH) {
      const ar = (py + PH * 8 + ws - 1) >> 3, lc = px >> 3, rc = (px + PW * 8 - 1) >> 3;
      if (!(solid(lc, ar) || solid(rc, ar))) py += ws;
    }
  }
  return [px & 0xFFFF, py & 0xFFFF, plrdir];
}

const r = makeReporter('td_update unit');
const h = boot(path.join(__dirname, '..', '..', 'build', 'tdu.nes'));
if (!h.frameUntil(0x0300, 0xAA)) { r.bad('driver did not finish (marker $0300 != 0xAA)'); r.done(); }
const n = h.rd(0x0301);
r.eq('case count', n, pads.length);
r.eq('mismatch count (ref vs asm, incl. jumping/jmp_up/on_ladder resets)', h.rd(0x0302), 0);

let allGood = true;
for (let i = 0; i < n; i++) {
  const rpx = h.rd(0x0308 + i * 10) | (h.rd(0x0309 + i * 10) << 8);
  const rpy = h.rd(0x030A + i * 10) | (h.rd(0x030B + i * 10) << 8);
  const rpd = h.rd(0x030C + i * 10);
  const apx = h.rd(0x030D + i * 10) | (h.rd(0x030E + i * 10) << 8);
  const apy = h.rd(0x030F + i * 10) | (h.rd(0x0310 + i * 10) << 8);
  const apd = h.rd(0x0311 + i * 10);
  const [wpx, wpy, wpd] = model(pads[i], pxs[i], pys[i], wss[i]);
  if (!(apx === rpx && apy === rpy && apd === rpd && rpx === wpx && rpy === wpy && rpd === wpd)) {
    allGood = false;
    r.bad(`case ${i} pad=${pads[i].toString(16)} px=${pxs[i]} py=${pys[i]} ws=${wss[i]}: `
      + `ref=(${rpx},${rpy},${rpd}) asm=(${apx},${apy},${apd}) model=(${wpx},${wpy},${wpd})`);
  }
}
if (allGood) r.ok(`all ${n} cases: asm == ref == model (4-way open/blocked, both bounds, ws 1-3, combined, resets)`);

r.done('td_update: ASM candidate is behaviourally identical to the C reference.');
