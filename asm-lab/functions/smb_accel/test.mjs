// Unit harness for smb_accel: boot the ROM, read $0300, assert ASM == C == JS model.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, makeReporter } from '../../harness/nes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const pds = [0x01, 0x41, 0x02, 0x00, 0x01, 0x02, 0x03, 0x02, 0x00, 0x00, 0x41, 0x02, 0x01, 0x00];
const vxs = [0, 0, 0, 100, 400, -600, 0, 200, -30, 0, 600, -384, 384, -100];
const RUN = 640, WALK = 384, ACC = 24;
const s16 = (v) => { v &= 0xFFFF; return v & 0x8000 ? v - 0x10000 : v; };

function model(pad, vx) {
  let plrdir = 0x99;
  const maxs = (pad & 0x40) ? RUN : WALK;
  let target = (pad & 0x01) ? maxs : (pad & 0x02) ? -maxs : 0;
  if (vx < target) {
    const a = vx < 0 ? ACC * 2 : ACC;
    vx = s16(vx + a); if (vx > target) vx = target;
  } else if (vx > target) {
    const a = vx > 0 ? ACC * 2 : ACC;
    vx = s16(vx - a); if (vx < target) vx = target;
  }
  if (target > 0) plrdir = 0x00; else if (target < 0) plrdir = 0x40;
  return [vx & 0xFFFF, plrdir];
}

const r = makeReporter('smb_accel unit');
const h = boot(path.join(__dirname, '..', '..', 'build', 'smba.nes'));
if (!h.frameUntil(0x0300, 0xAA)) { r.bad('driver did not finish (marker $0300 != 0xAA)'); r.done(); }
const n = h.rd(0x0301);
r.eq('case count', n, pds.length);
r.eq('mismatch count (ref vs asm)', h.rd(0x0302), 0);

let allGood = true;
for (let i = 0; i < n; i++) {
  const rv = h.rd(0x0308 + i * 6) | (h.rd(0x0309 + i * 6) << 8);
  const rp = h.rd(0x030A + i * 6);
  const av = h.rd(0x030B + i * 6) | (h.rd(0x030C + i * 6) << 8);
  const ap = h.rd(0x030D + i * 6);
  const [wv, wp] = model(pds[i], vxs[i]);
  if (!(av === rv && ap === rp && rv === wv && rp === wp)) {
    allGood = false;
    r.bad(`case ${i} pad=${pds[i].toString(16)} vx=${vxs[i]}: ref=(${s16(rv)},${rp}) asm=(${s16(av)},${ap}) model=(${s16(wv)},${wp})`);
  }
}
if (allGood) r.ok(`all ${n} cases: asm == ref == model (accel from rest walk/run, decel/friction, skid reversal, overshoot clamp, plrdir)`);

r.done('smb_accel: ASM candidate is behaviourally identical to the C reference.');
