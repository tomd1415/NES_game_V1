// Unit harness for clear_text_row. Dual-build; checks row 5 of nametable 0:
// cols 4..9 cleared to 0x00, the rest still 0xAB, identical across ref/asm.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, makeReporter } from '../../harness/nes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readRow5(rom) {
  const h = boot(path.join(__dirname, '..', '..', 'build', rom));
  if (!h.frameUntil(0x0300, 0xAA)) return null;
  const row = [];
  for (let c = 0; c < 32; c++) row.push(h.ntTile(0, 5 * 32 + c));
  return row;
}

const r = makeReporter('clear_text_row unit');
const ref = readRow5('ctr_ref.nes');
const asm = readRow5('ctr_asm.nes');
if (!ref || !asm) { r.bad('a driver did not finish'); r.done(); }

const want = (c) => (c >= 4 && c < 10) ? 0x00 : 0xAB;   // cleared 4..9, else 0xAB
let ok = true;
for (let c = 0; c < 32; c++) {
  if (asm[c] !== ref[c] || ref[c] !== want(c)) {
    ok = false;
    r.bad(`col ${c}: ref=${ref[c]} asm=${asm[c]} want=${want(c)}`);
  }
}
if (ok) r.ok('cols 4..9 cleared to 0x00, cols 0..3 & 10..31 still 0xAB, ref == asm');
r.done('clear_text_row: ASM candidate clears the nametable identically to the C reference.');
