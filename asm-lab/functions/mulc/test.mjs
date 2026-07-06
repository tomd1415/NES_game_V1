// Harness for the MULC macro test. Asserts the ASM shift-add-by-constant equals
// v*K for K in {32,64,96,128} (the world widths behaviour_at / streamers bake).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, makeReporter } from '../../harness/nes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const Ks = [32, 64, 96, 128];

const r = makeReporter('MULC macro unit');
const h = boot(path.join(__dirname, '..', '..', 'build', 'mulc.nes'));
if (!h.frameUntil(0x0300, 0xAA)) { r.bad('driver did not finish'); r.done(); }
r.eq('mismatch count (asm vs C)', h.rd(0x0302), 0);

// Spot-check the stored (v, K, product) tuples against a JS model.
let ok = true;
const n = h.rd(0x0301);
for (let idx = 0; idx < Math.min(n, 30); idx++) {
  const b = 0x0308 + idx * 4;
  const v = h.rd(b), k = h.rd(b + 1), got = h.rd(b + 2) | (h.rd(b + 3) << 8);
  const want = (v * Ks[k]) & 0xFFFF;
  if (got !== want) { ok = false; r.bad(`v=${v} K=${Ks[k]}: got ${got} want ${want}`); }
}
if (ok) r.ok('MULC == v*K across widths 32/64/96/128 (spot-checked vs JS model)');
r.done('MULC: shift-add-by-constant multiply matches for every world width.');
