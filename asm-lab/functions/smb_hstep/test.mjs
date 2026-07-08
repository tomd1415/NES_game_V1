import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, makeReporter } from '../../harness/nes.mjs';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const pxs = [100, 100, 100, 100, 0, 239, 144, 81, 100, 100];
const vxs = [256, -256, 100, -100, -256, 512, 256, -256, 10, -10];
const sbs = [0, 0, 200, 50, 0, 0, 0, 0, 5, 5];
const COLS = 32, ROWS = 30, WW = 256, PW = 2, PH = 2, RB = WW - PW * 8;
const map = new Uint8Array(COLS * ROWS);
for (let r = 0; r < ROWS; r++) { map[r * COLS + 10] = 2; map[r * COLS + 20] = 2; }
const bat = (c, r) => (c >= COLS || r >= ROWS) ? 0 : map[r * COLS + c];
const s16 = (v) => { v &= 0xFFFF; return v & 0x8000 ? v - 0x10000 : v; };

function model(px, py, vx, sub) {
  let acc = s16(sub + vx);
  let np = (px + (acc >> 8)) | 0;
  sub = acc & 0xFF;
  if (np < 0) { np = 0; vx = 0; sub = 0; }
  else if (np > RB) { np = RB; vx = 0; sub = 0; }
  if (np !== px) {
    const edge = (np > px) ? ((np + PW * 8 - 1) >> 3) : (np >> 3);
    const t = py >> 3, b = (py + PH * 8 - 1) >> 3;
    let blk = false;
    for (let rr = t; rr <= b; rr++) { const bb = bat(edge, rr); if (bb === 1 || bb === 2) { blk = true; break; } }
    if (blk) { vx = 0; sub = 0; } else px = np;
  }
  return [px & 0xFFFF, vx & 0xFFFF, sub];
}

const r = makeReporter('smb_hstep unit');
const h = boot(path.join(__dirname, '..', '..', 'build', 'smbh.nes'));
if (!h.frameUntil(0x0300, 0xAA)) { r.bad('driver did not finish'); r.done(); }
const n = h.rd(0x0301);
r.eq('case count', n, pxs.length);
r.eq('mismatch count (ref vs asm)', h.rd(0x0302), 0);
let ok = true;
for (let i = 0; i < n; i++) {
  const rpx = h.rd(0x0308 + i * 10) | (h.rd(0x0309 + i * 10) << 8);
  const rvx = h.rd(0x030A + i * 10) | (h.rd(0x030B + i * 10) << 8);
  const rsb = h.rd(0x030C + i * 10);
  const apx = h.rd(0x030D + i * 10) | (h.rd(0x030E + i * 10) << 8);
  const avx = h.rd(0x030F + i * 10) | (h.rd(0x0310 + i * 10) << 8);
  const asb = h.rd(0x0311 + i * 10);
  const [wpx, wvx, wsb] = model(pxs[i], 100, vxs[i], sbs[i]);
  if (!(apx === rpx && avx === rvx && asb === rsb && rpx === wpx && rvx === wvx && rsb === wsb)) {
    ok = false;
    r.bad(`case ${i} px=${pxs[i]} vx=${vxs[i]} sub=${sbs[i]}: ref=(${rpx},${s16(rvx)},${rsb}) asm=(${apx},${s16(avx)},${asb}) model=(${wpx},${s16(wvx)},${wsb})`);
  }
}
if (ok) r.ok(`all ${n} cases: asm == ref == model (integrate fwd/back, sub carry, left/right edge clamp, wall collision both ways, no-advance)`);
r.done('smb_hstep: ASM candidate is behaviourally identical to the C reference.');
