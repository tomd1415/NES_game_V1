// Unit harness for scroll_follow. Reads the per-case camera results and asserts
// asm == ref == an independent JS model of the EXACT C dead-zone algebra.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, makeReporter } from '../../harness/nes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const icx = [0, 0, 100, 100, 100, 200, 256, 10, 50, 150, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8];
const icy = [0, 0, 100, 100, 100, 200, 240, 10, 50, 150, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8];
const tx  = [50, 200, 150, 250, 200, 1000, 50, 5, 300, 150, 103, 104, 105, 151, 152, 153, 154, 160, 96, 95];
const ty  = [50, 200, 150, 250, 200, 1000, 50, 5, 20, 150, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8];

// Exact C algebra (not the ASM's simplification) as the independent oracle.
function follow(camx, camy, X, Y) {
  { const dzl = camx + 96, dzr = camx + 144, max = 256;   // WORLD_W 512 > 256
    if (X < dzl) { const d = dzl - X; camx = d > camx ? 0 : camx - d; }
    else if (X > dzr) { camx += (X - dzr); if (camx > max) camx = max; } }
  { const dzt = camy + 96, dzb = camy + 144, max = 240;   // WORLD_H 480 > 240
    if (Y < dzt) { const d = dzt - Y; camy = d > camy ? 0 : camy - d; }
    else if (Y > dzb) { camy += (Y - dzb); if (camy > max) camy = max; } }
  return [camx, camy];
}

const r = makeReporter('scroll_follow unit');
const h = boot(path.join(__dirname, '..', '..', 'build', 'sf.nes'));
if (!h.frameUntil(0x0300, 0xAA)) { r.bad('driver did not finish'); r.done(); }
const n = h.rd(0x0301);
r.eq('case count', n, icx.length);
r.eq('mismatch count (ref vs asm)', h.rd(0x0302), 0);

let ok = true;
for (let i = 0; i < n; i++) {
  const b = 0x0308 + i * 8;
  const rx = h.rd16(b), ry = h.rd16(b + 2), ax = h.rd16(b + 4), ay = h.rd16(b + 6);
  const [mx, my] = follow(icx[i], icy[i], tx[i], ty[i]);
  if (!(ax === rx && ay === ry && rx === mx && ry === my)) {
    ok = false;
    r.bad(`case ${i} cam=(${icx[i]},${icy[i]}) tgt=(${tx[i]},${ty[i]}): ref=(${rx},${ry}) asm=(${ax},${ay}) model=(${mx},${my})`);
  }
}
if (ok) r.ok(`all ${n} cases: asm == ref == model (deadzone hold, scroll to 0, scroll to max clamp, both axes)`);
r.done('scroll_follow: ASM candidate tracks the camera identically to the C reference.');
