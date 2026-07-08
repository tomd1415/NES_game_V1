// Unit harness for run_hstep: boot the ROM, read $0300, assert ASM == C == JS model.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, makeReporter } from '../../harness/nes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Must mirror test.c's arrays exactly.
const cxs = [100, 100, 255, 254, 253, 100, 100, 100, 100, 100];
const pys = [176, 176, 176, 176, 176, 236, 232, 231, 176, 176];
const js  = [  0,   1,   1,   0,   0,   1,   0,   0,   1,   0];
const us  = [  0,   5,   5,   0,   0,   3,   0,   0,   7,   0];
const skc = [255, 255, 255, 255, 255, 255, 255, 255,  21,  20];
const skr = [  0,   0,   0,   0,   0,   0,   0,   0,  23,  23];

const WORLD_H_PX = 240, CAM_MAX = 256, SCREEN_X = 64, AUTOSCR = 2, PLAYER_Y = 176, SPIKE = 7;

function model(camIn, pyIn, jIn, uIn, spikeCol, spikeRow) {
  let cam_x = camIn, py = pyIn, jumping = jIn, jmp_up = uIn, px = 0;
  const respawn = () => { cam_x = 0; px = SCREEN_X; py = PLAYER_Y; jumping = 0; jmp_up = 0; };
  cam_x = (cam_x + AUTOSCR) & 0xFFFF;
  if (cam_x >= CAM_MAX) respawn();
  px = (cam_x + SCREEN_X) & 0xFFFF;
  const rc = ((px + 8) >>> 3) & 0xFF;
  const rr = ((py + 8) >>> 3) & 0xFF;
  if (spikeCol !== 0xFF && rc === spikeCol && rr === spikeRow) respawn();
  if (py >= (WORLD_H_PX - 8)) respawn();
  return [cam_x, px, py, jumping, jmp_up];
}

const r = makeReporter('run_hstep unit');
const h = boot(path.join(__dirname, '..', '..', 'build', 'runh.nes'));
if (!h.frameUntil(0x0300, 0xAA)) { r.bad('driver did not finish (marker $0300 != 0xAA)'); r.done(); }
const n = h.rd(0x0301);
r.eq('case count', n, cxs.length);
r.eq('mismatch count (ref vs asm)', h.rd(0x0302), 0);

const rd16 = (a) => h.rd(a) | (h.rd(a + 1) << 8);
let allGood = true;
for (let i = 0; i < n; i++) {
  const rb = 0x0308 + i * 16, ab = rb + 8;
  const ref = [rd16(rb), rd16(rb + 2), rd16(rb + 4), h.rd(rb + 6), h.rd(rb + 7)];
  const asm = [rd16(ab), rd16(ab + 2), rd16(ab + 4), h.rd(ab + 6), h.rd(ab + 7)];
  const mdl = model(cxs[i], pys[i], js[i], us[i], skc[i], skr[i]);
  const eq = (a, b) => a.every((v, k) => v === b[k]);
  if (!(eq(asm, ref) && eq(ref, mdl))) {
    allGood = false;
    r.bad(`case ${i} cam=${cxs[i]} py=${pys[i]} j=${js[i]} u=${us[i]} spike=(${skc[i]},${skr[i]}): `
      + `ref=[${ref}] asm=[${asm}] model=[${mdl}]`);
  }
}
if (allGood) r.ok(`all ${n} cases: asm == ref == model `
  + `(advance, jump-state preserve, track-end wrap exact/below, fall-off exact/above, spike at/off centre)`);

r.done('run_hstep: ASM candidate is behaviourally identical to the C reference.');
