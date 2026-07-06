// Unit harness for write_palettes. Observable effect is PPU palette RAM
// ($3F00-$3F1F), so we build the driver twice (C ref vs ASM candidate, selected
// by -DASM_VARIANT), boot each, and assert the two produce identical palette RAM
// AND that the non-mirrored entries carry the source bytes. (The $3F10/$14/$18/
// $1C sprite-backdrop mirrors of $3F00/$04/$08/$0C mean a 32-byte sequential
// write leaves those low entries holding the later mirrored write — both
// implementations do the same thing, so comparing them is the real proof.)
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, makeReporter } from '../../harness/nes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = (i) => (i * 2 + 1) & 0x3F;         // same fill as test.c

function paletteOf(rom) {
  const h = boot(path.join(__dirname, '..', '..', 'build', rom));
  if (!h.frameUntil(0x0300, 0xAA)) return null;
  const p = [];
  for (let i = 0; i < 32; i++) p.push(h.rdPPU(0x3F00 + i));
  return p;
}

const r = makeReporter('write_palettes unit');
const ref = paletteOf('wp_ref.nes');
const asm = paletteOf('wp_asm.nes');
if (!ref || !asm) { r.bad('a driver did not finish'); r.done(); }

let same = true;
for (let i = 0; i < 32; i++) if (ref[i] !== asm[i]) { same = false; r.bad(`palette[$3F${(i).toString(16).padStart(2, '0')}]: ref=${ref[i]} asm=${asm[i]}`); }
if (same) r.ok('all 32 palette-RAM entries identical between the C ref and the ASM candidate');

// Sanity: the non-mirrored entries ($3F01-03,05-07,...,$3F1D-1F) hold the source
// bytes in both. Index i is mirrored-away only when (i & 3)==0 and i>=0x10.
let srcOk = true;
for (let i = 1; i < 32; i++) {
  if ((i & 3) === 0) continue;                 // $3F00/04/08/0C backdrops: skip
  if (asm[i] !== src(i)) { srcOk = false; r.bad(`entry ${i}: asm=${asm[i]} src=${src(i)}`); }
}
if (srcOk) r.ok('non-mirrored entries carry the source palette bytes');

r.done('write_palettes: ASM candidate loads the PPU palette identically to the C reference.');
