// Unit harness for world_to_screen_y (screen height 240).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, makeReporter } from '../../harness/nes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cams   = [0, 0, 0, 100, 100, 100, 100, 500, 65535, 300];
const worlds = [0, 239, 240, 339, 340, 355, 99, 756, 0, 44];
const model = (cam, world) => {
  if (world < cam) return 0xFF;
  const off = (world - cam) & 0xFFFF;
  if (off >= 240) return 0xFF;
  return off & 0xFF;
};

const r = makeReporter('world_to_screen_y unit');
const h = boot(path.join(__dirname, '..', '..', 'build', 'w2sy.nes'));
if (!h.frameUntil(0x0300, 0xAA)) { r.bad('driver did not finish'); r.done(); }
const n = h.rd(0x0301);
r.eq('case count', n, cams.length);
r.eq('mismatch count (ref vs asm)', h.rd(0x0302), 0);

let allGood = true;
for (let i = 0; i < n; i++) {
  const ref = h.rd(0x0308 + i * 2), asm = h.rd(0x0309 + i * 2), want = model(cams[i], worlds[i]);
  if (!(asm === ref && ref === want)) {
    allGood = false;
    r.bad(`case ${i} cam=${cams[i]} world=${worlds[i]}: ref=${ref} asm=${asm} model=${want}`);
  }
}
if (allGood) r.ok(`all ${n} cases: asm == ref == model (incl. 239/240 boundary, underflow, max)`);
r.done('world_to_screen_y: ASM candidate is behaviourally identical to the C reference.');
