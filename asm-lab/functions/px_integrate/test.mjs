// Unit harness for px_integrate: boot the ROM, read the $0300 buffer, and assert
// the ASM candidate matches the C reference AND an independent JS model for every
// case (pos+sub 16.8 -> 16.8 after one 8.8-velocity step).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, makeReporter } from '../../harness/nes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Same cases as test.c (kept in sync by hand).
const pos0 = [100, 100, 100, 100, 0, 0, 65500, 300, 300, 200, 1000, 50000, 100, 100, 30000];
const sub0 = [0, 200, 0, 0, 0, 255, 0, 128, 128, 100, 50, 200, 255, 1, 200];
const vel  = [256, 100, -256, -1, -1, 1, 600, -600, 640, -640, 384, -1280, -256, -300, 32767];

// Independent JS model: acc = sub + v wrapped to 16-bit SIGNED (matches cc65's
// `signed int acc`), pos += acc>>8 (arithmetic), sub = acc & 0xFF, pos 16-bit.
const model = (pos, sub, v) => {
  let acc = (sub + v) & 0xFFFF;
  if (acc & 0x8000) acc -= 0x10000;          // to signed 16-bit
  const np = (pos + (acc >> 8)) & 0xFFFF;     // >> is arithmetic in JS
  const ns = acc & 0xFF;
  return [np, ns];
};

const r = makeReporter('px_integrate unit');
const h = boot(path.join(__dirname, '..', '..', 'build', 'pxi.nes'));
if (!h.frameUntil(0x0300, 0xAA)) { r.bad('driver did not finish (marker $0300 != 0xAA)'); r.done(); }
const n = h.rd(0x0301);
r.eq('case count', n, pos0.length);
r.eq('mismatch count (ref vs asm)', h.rd(0x0302), 0);

let allGood = true;
for (let i = 0; i < n; i++) {
  const refPos = h.rd(0x0308 + i * 6) | (h.rd(0x0309 + i * 6) << 8);
  const refSub = h.rd(0x030A + i * 6);
  const asmPos = h.rd(0x030B + i * 6) | (h.rd(0x030C + i * 6) << 8);
  const asmSub = h.rd(0x030D + i * 6);
  const [wantPos, wantSub] = model(pos0[i], sub0[i], vel[i]);
  if (!(asmPos === refPos && asmSub === refSub && refPos === wantPos && refSub === wantSub)) {
    allGood = false;
    r.bad(`case ${i} pos=${pos0[i]} sub=${sub0[i]} v=${vel[i]}: `
      + `ref=(${refPos},${refSub}) asm=(${asmPos},${asmSub}) model=(${wantPos},${wantSub})`);
  }
}
if (allGood) r.ok(`all ${n} cases: asm == ref == model (incl. backward fractional, 16-bit wrap, overflowing v)`);

r.done('px_integrate: ASM candidate is behaviourally identical to the C reference.');
