// Unit harness for scroll_apply_ppu. Asserts asm == ref == an independent JS
// model of the exact C fold (cam_y mod 240 -> scroll_y + band parity, cam_x
// bit 8 -> horizontal nametable bit).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, makeReporter } from '../../harness/nes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cxs = [0, 255, 256, 257, 300, 511, 100, 0, 256, 320, 0, 0, 511, 8, 248, 200];
const cys = [0, 0, 0, 0, 0, 0, 0, 239, 240, 240, 241, 479, 240, 120, 235, 245];

// Independent oracle for the (cam_x,cam_y) -> (ctrl,scroll_x,scroll_y) contract.
function apply(camx, camy) {
  let ctrl = 0x10, cy = camy, band = 0;
  while (cy >= 240) { cy -= 240; band++; }
  if (camx & 0x100) ctrl |= 0x01;
  if (band & 1) ctrl |= 0x02;
  return [ctrl, camx & 0xFF, cy];
}

const r = makeReporter('scroll_apply_ppu unit');
const h = boot(path.join(__dirname, '..', '..', 'build', 'sap.nes'));
if (!h.frameUntil(0x0300, 0xAA)) { r.bad('driver did not finish'); r.done(); }
const n = h.rd(0x0301);
r.eq('case count', n, cxs.length);
r.eq('mismatch count (ref vs asm)', h.rd(0x0302), 0);

let ok = true;
for (let i = 0; i < n; i++) {
  const b = 0x0308 + i * 6;
  const rc = h.rd(b), rx = h.rd(b + 1), ry = h.rd(b + 2);
  const ac = h.rd(b + 3), ax = h.rd(b + 4), ay = h.rd(b + 5);
  const [mc, mx, my] = apply(cxs[i], cys[i]);
  if (!(ac === rc && ax === rx && ay === ry && rc === mc && rx === mx && ry === my)) {
    ok = false;
    r.bad(`case ${i} cam=(${cxs[i]},${cys[i]}): ref=(${rc},${rx},${ry}) asm=(${ac},${ax},${ay}) model=(${mc},${mx},${my})`);
  }
}
if (ok) r.ok(`all ${n} cases: asm == ref == model (ctrl NT bits, 240-band fold, scroll_x/y)`);
r.done('scroll_apply_ppu: ASM candidate computes the PPU scroll registers identically to the C reference.');
