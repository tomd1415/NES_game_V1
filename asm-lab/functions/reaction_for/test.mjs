// Unit harness for reaction_for.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, makeReporter } from '../../harness/nes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sprites = [0, 1, 0, 1, 2, 0, 1, 2, 0, 1];
const behs    = [0, 7, 7, 0, 0, 8, 8, 8, 3, 5];
const react = (i) => (i * 11 + 5) & 0xFF;              // same fill as test.c
const model = (s, b) => {
  if (b >= 8) return 0;                                // behaviour checked first
  if (s >= 2) return 0;
  return react(((s << 3) | b) & 0xFF);
};

const r = makeReporter('reaction_for unit');
const h = boot(path.join(__dirname, '..', '..', 'build', 'rf.nes'));
if (!h.frameUntil(0x0300, 0xAA)) { r.bad('driver did not finish'); r.done(); }

const n = h.rd(0x0301);
r.eq('case count', n, sprites.length);
r.eq('mismatch count (ref vs asm)', h.rd(0x0302), 0);

let allGood = true;
for (let i = 0; i < n; i++) {
  const ref = h.rd(0x0308 + i * 2), asm = h.rd(0x0309 + i * 2), want = model(sprites[i], behs[i]);
  if (!(asm === ref && ref === want)) {
    allGood = false;
    r.bad(`case ${i} sprite=${sprites[i]} beh=${behs[i]}: ref=${ref} asm=${asm} model=${want}`);
  }
}
if (allGood) r.ok(`all ${n} cases: asm == ref == model (valid, sprite-OOB, beh-OOB, both-OOB)`);
r.done('reaction_for: ASM candidate is behaviourally identical to the C reference.');
