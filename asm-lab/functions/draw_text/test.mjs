// Unit harness for draw_text. Dual-build (C ref vs ASM, -DASM_VARIANT). Reads
// nametable 0 from each build at the three placements and asserts identical +
// == the source string.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, makeReporter } from '../../harness/nes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const msg = [0x11, 0x22, 0x33, 0x44, 0x55];
const places = [[5, 6], [5, 40], [0, 0]];   // (row,col); col=40 exercises the carry

function readAt(rom) {
  const h = boot(path.join(__dirname, '..', '..', 'build', rom));
  if (!h.frameUntil(0x0300, 0xAA)) return null;
  return places.map(([row, col]) =>
    msg.map((_, j) => h.ntTile(0, row * 32 + col + j)));
}

const r = makeReporter('draw_text unit');
const ref = readAt('dt_ref.nes');
const asm = readAt('dt_asm.nes');
if (!ref || !asm) { r.bad('a driver did not finish'); r.done(); }

let ok = true;
places.forEach(([row, col], p) => {
  for (let j = 0; j < msg.length; j++) {
    if (asm[p][j] !== ref[p][j] || ref[p][j] !== msg[j]) {
      ok = false;
      r.bad(`(${row},${col})+${j}: ref=${ref[p][j]} asm=${asm[p][j]} msg=${msg[j]}`);
    }
  }
});
if (ok) r.ok('all 3 placements (incl. col=40 carry): asm == ref == source string in nametable 0');
r.done('draw_text: ASM candidate writes the nametable identically to the C reference.');
