// Unit harness for racer_vel: boot the ROM, read $0300, assert ASM == C == JS model.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, makeReporter } from '../../harness/nes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Must mirror test.c's arrays exactly.
const sps = [  0, 640, 640, 640, 640, 640, -320, 100, 100, -100,   5, 636, 636, 320];
const hds = [  0,   0,   4,   8,  12,   2,    0,   1,   3,    0,   0,   5,  11,   7];

const COS16 = [127, 117, 90, 49, 0, -49, -90, -117, -127, -117, -90, -49, 0, 49, 90, 117];
const s16 = (v) => { v &= 0xFFFF; return v & 0x8000 ? v - 0x10000 : v; };
const asr = (v, n) => v >> n;   // JS >> on a Number is arithmetic (floor) — matches C

function model(speed, h) {
  const a = asr(speed, 2);
  const vx = asr(a * COS16[h], 5);
  const vy = asr(a * COS16[(h + 12) & 15], 5);
  return [vx & 0xFFFF, vy & 0xFFFF];
}

const r = makeReporter('racer_vel unit');
const hnd = boot(path.join(__dirname, '..', '..', 'build', 'rvel.nes'));
if (!hnd.frameUntil(0x0300, 0xAA)) { r.bad('driver did not finish (marker $0300 != 0xAA)'); r.done(); }
const n = hnd.rd(0x0301);
r.eq('case count', n, sps.length);
r.eq('mismatch count (ref vs asm)', hnd.rd(0x0302), 0);

const rd16 = (a) => hnd.rd(a) | (hnd.rd(a + 1) << 8);
let allGood = true;
for (let i = 0; i < n; i++) {
  const b = 0x0308 + i * 8;
  const rvx = rd16(b), rvy = rd16(b + 2), avx = rd16(b + 4), avy = rd16(b + 6);
  const [mvx, mvy] = model(sps[i], hds[i]);
  if (!(avx === rvx && avy === rvy && rvx === mvx && rvy === mvy)) {
    allGood = false;
    r.bad(`case ${i} speed=${sps[i]} h=${hds[i]}: ref=(${s16(rvx)},${s16(rvy)}) `
      + `asm=(${s16(avx)},${s16(avy)}) model=(${s16(mvx)},${s16(mvy)})`);
  }
}
if (allGood) r.ok(`all ${n} cases: asm == ref == model `
  + `(cardinals + diagonals x fwd/rev/rest, incl. negative-product floor cases)`);

r.done('racer_vel: ASM candidate is behaviourally identical to the C reference.');
