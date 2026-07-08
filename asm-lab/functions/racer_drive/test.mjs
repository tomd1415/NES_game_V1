// Unit harness for racer_drive: boot the ROM, read $0300, assert ASM == C == JS model.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, makeReporter } from '../../harness/nes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Must mirror test.c's arrays exactly.
const pds = [0x01, 0x02, 0x80, 0x08, 0x88, 0x04, 0x04, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03, 0x88, 0x01];
const hds = [  15,    0,    5,    5,    5,    5,    5,    5,    5,    5,    5,    5,    5,    5,    5,    0];
const sps = [   0,    0,    0,  100,  635,  100,    0, -300,  100,    5,   -5, -100,    8,    0, -600,    0];

const ACCEL = 13, FRICTION = 8, BRAKE = 40, MAX = 640, REV = 320;
const s16 = (v) => { v &= 0xFFFF; return v & 0x8000 ? v - 0x10000 : v; };

function model(pad, h, s) {
  if (pad & 0x02) h = (h + 15) & 15;
  if (pad & 0x01) h = (h + 1) & 15;
  if (pad & 0x88) { s = s16(s + ACCEL); if (s > MAX) s = MAX; }
  else if (pad & 0x04) { s = s16(s - BRAKE); if (s < -REV) s = -REV; }
  else {
    if (s > FRICTION) s = s16(s - FRICTION);
    else if (s < -FRICTION) s = s16(s + FRICTION);
    else s = 0;
  }
  return [h, s & 0xFFFF];
}

const r = makeReporter('racer_drive unit');
const h = boot(path.join(__dirname, '..', '..', 'build', 'rdrv.nes'));
if (!h.frameUntil(0x0300, 0xAA)) { r.bad('driver did not finish (marker $0300 != 0xAA)'); r.done(); }
const n = h.rd(0x0301);
r.eq('case count', n, pds.length);
r.eq('mismatch count (ref vs asm)', h.rd(0x0302), 0);

let allGood = true;
for (let i = 0; i < n; i++) {
  const b = 0x0308 + i * 6;
  const rh = h.rd(b), rs = h.rd(b + 1) | (h.rd(b + 2) << 8);
  const ah = h.rd(b + 3), as = h.rd(b + 4) | (h.rd(b + 5) << 8);
  const [mh, ms] = model(pds[i], hds[i], sps[i]);
  if (!(ah === rh && as === rs && rh === mh && rs === ms)) {
    allGood = false;
    r.bad(`case ${i} pad=${pds[i].toString(16)} h=${hds[i]} s=${sps[i]}: `
      + `ref=(${rh},${s16(rs)}) asm=(${ah},${s16(as)}) model=(${mh},${s16(ms)})`);
  }
}
if (allGood) r.ok(`all ${n} cases: asm == ref == model `
  + `(steer L/R/both + wrap, accel from rest/reverse + cap clamp, brake to reverse + -REV clamp, friction decel + snap-to-0)`);

r.done('racer_drive: ASM candidate is behaviourally identical to the C reference.');
