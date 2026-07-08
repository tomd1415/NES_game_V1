// Unit harness for plat_vmove (platformer vertical physics): boot the ROM, read
// $0300, assert the ASM candidate matches the C ref AND an independent JS model.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, makeReporter } from '../../harness/nes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const pxs = [200, 200, 24, 200, 200, 80, 200, 200, 200, 40, 80, 200];
const pys = [100, 17, 50, 100, 148, 84, 232, 100, 100, 50, 100, 50];
const ju  = [1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 1];
const jm  = [5, 3, 5, 0, 0, 0, 0, 0, 5, 5, 5, 1];
const ol  = [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0];

const COLS = 32, ROWS = 30, WH = 240, PW = 2, PH = 2;
const map = new Uint8Array(COLS * ROWS);
for (let c = 2; c <= 5; c++) map[6 * COLS + c] = 2;
for (let c = 8; c <= 11; c++) map[12 * COLS + c] = 3;
for (let c = 0; c < COLS; c++) map[20 * COLS + c] = 1;
const bat = (c, r) => (c >= COLS || r >= ROWS) ? 0 : map[r * COLS + c];

function model(px, py, jumping, jmp_up, on_ladder) {
  if (on_ladder) {
    // unchanged
  } else if (jumping && jmp_up > 0) {
    const hr = py >= 2 ? (py - 2) >> 3 : 0;
    const hl = bat(px >> 3, hr), hrr = bat((px + PW * 8 - 1) >> 3, hr);
    if (hl === 1 || hl === 2 || hrr === 1 || hrr === 2) jmp_up = 0;
    else { py = py >= 18 ? py - 2 : 16; jmp_up = (jmp_up - 1) & 0xFF; }
  } else {
    const fr = (py + PH * 8) >> 3;
    const fl = bat(px >> 3, fr), frr = bat((px + PW * 8 - 1) >> 3, fr);
    const solid = (b) => b === 1 || b === 2 || b === 3;
    if (solid(fl) || solid(frr)) { py = ((fr << 3) - PH * 8) & 0xFFFF; jumping = 0; }
    else { if (py < WH - 8) py += 2; jumping = 1; }
  }
  return [py & 0xFFFF, jumping, jmp_up];
}

const r = makeReporter('plat_vmove unit');
const h = boot(path.join(__dirname, '..', '..', 'build', 'pvm.nes'));
if (!h.frameUntil(0x0300, 0xAA)) { r.bad('driver did not finish (marker $0300 != 0xAA)'); r.done(); }
const n = h.rd(0x0301);
r.eq('case count', n, pxs.length);
r.eq('mismatch count (ref vs asm)', h.rd(0x0302), 0);

let allGood = true;
for (let i = 0; i < n; i++) {
  const rpy = h.rd(0x0308 + i * 8) | (h.rd(0x0309 + i * 8) << 8);
  const rju = h.rd(0x030A + i * 8), rjm = h.rd(0x030B + i * 8);
  const apy = h.rd(0x030C + i * 8) | (h.rd(0x030D + i * 8) << 8);
  const aju = h.rd(0x030E + i * 8), ajm = h.rd(0x030F + i * 8);
  const [wpy, wju, wjm] = model(pxs[i], pys[i], ju[i], jm[i], ol[i]);
  if (!(apy === rpy && aju === rju && ajm === rjm && rpy === wpy && rju === wju && rjm === wjm)) {
    allGood = false;
    r.bad(`case ${i} px=${pxs[i]} py=${pys[i]} j=${ju[i]} ju=${jm[i]} ol=${ol[i]}: `
      + `ref=(${rpy},${rju},${rjm}) asm=(${apy},${aju},${ajm}) model=(${wpy},${wju},${wjm})`);
  }
}
if (allGood) r.ok(`all ${n} cases: asm == ref == model (ascent/bonk/py<18, gravity fall/land-floor/land-platform/bottom, ladder, jmp_up=0)`);

r.done('plat_vmove: ASM candidate is behaviourally identical to the C reference.');
