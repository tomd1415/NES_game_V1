// Unit harness for racer_laps: boot the ROM, read $0300, assert ASM == C == JS model.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, makeReporter } from '../../harness/nes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Must mirror test.c's arrays exactly.
const mk = [5, 5, 6, 6, 7, 7, 7, 1];
const st = [0, 1, 1, 0, 1, 0, 1, 1];
const lp = [0, 0, 0, 0, 0, 0, 2, 0];

const FINISH = 7, CP = 5, CP2 = 6, CP_COUNT = 1, LAPS_WIN = 3;

function model(mid, stage, laps) {
  let finished = 0;
  if (mid === CP && stage === 0) stage = 1;
  else if (mid === CP2 && stage === 1) stage = 2;
  else if (mid === FINISH && stage >= CP_COUNT) {
    stage = 0;
    if (++laps >= LAPS_WIN) finished = 1;
  }
  return [stage, laps, finished];
}

const r = makeReporter('racer_laps unit');
const h = boot(path.join(__dirname, '..', '..', 'build', 'rlap.nes'));
if (!h.frameUntil(0x0300, 0xAA)) { r.bad('driver did not finish (marker $0300 != 0xAA)'); r.done(); }
const n = h.rd(0x0301);
r.eq('case count', n, mk.length);
r.eq('mismatch count (ref vs asm)', h.rd(0x0302), 0);

let allGood = true;
for (let i = 0; i < n; i++) {
  const b = 0x0308 + i * 6;
  const ref = [h.rd(b), h.rd(b + 1), h.rd(b + 2)];
  const asm = [h.rd(b + 3), h.rd(b + 4), h.rd(b + 5)];
  const mdl = model(mk[i], st[i], lp[i]);
  const eq = (a, b2) => a.every((v, k) => v === b2[k]);
  if (!(eq(asm, ref) && eq(ref, mdl))) {
    allGood = false;
    r.bad(`case ${i} marker=${mk[i]} stage=${st[i]} laps=${lp[i]}: ref=[${ref}] asm=[${asm}] model=[${mdl}]`);
  }
}
if (allGood) r.ok(`all ${n} cases: asm == ref == model `
  + `(CP1 arm/re-touch, CP2 in/out of order, FINISH lap-count vs armed<count, reach LAPS_TO_WIN, non-marker)`);

r.done('racer_laps: ASM candidate is behaviourally identical to the C reference.');
