// Unit harness for world_to_screen_x: boot the ROM, read the $0300 buffer,
// and assert the ASM candidate matches the C reference AND an independent JS
// model for every input case.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, makeReporter } from '../../harness/nes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Same cases as test.c (kept in sync by hand — small + explicit on purpose).
const cams   = [0, 0, 0, 100, 100, 100, 100, 500, 500, 65535, 300, 40000];
const worlds = [0, 255, 256, 99, 100, 355, 356, 499, 756, 0, 44, 40255];
// Independent JS model of the intended behaviour.
const model = (cam, world) => {
  if (world < cam) return 0xFF;
  const off = (world - cam) & 0xFFFF;
  if (off >= 256) return 0xFF;
  return off & 0xFF;
};

const r = makeReporter('world_to_screen_x unit');
const h = boot(path.join(__dirname, '..', '..', 'build', 'w2sx.nes'));
h.frames(4);

if (h.rd(0x0300) !== 0xAA) { r.bad('driver did not finish (marker $0300 != 0xAA)'); r.done(); }
const n = h.rd(0x0301);
r.eq('case count', n, cams.length);
r.eq('mismatch count (ref vs asm)', h.rd(0x0302), 0);

let allGood = true;
for (let i = 0; i < n; i++) {
  const ref = h.rd(0x0308 + i * 2);
  const asm = h.rd(0x0309 + i * 2);
  const want = model(cams[i], worlds[i]);
  if (!(asm === ref && ref === want)) {
    allGood = false;
    r.bad(`case ${i} cam=${cams[i]} world=${worlds[i]}: ref=${ref} asm=${asm} model=${want}`);
  }
}
if (allGood) r.ok(`all ${n} cases: asm == ref == model (incl. boundary 255/256, underflow, max)`);

r.done('world_to_screen_x: ASM candidate is behaviourally identical to the C reference.');
