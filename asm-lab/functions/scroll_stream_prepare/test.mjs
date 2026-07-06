// Unit harness for scroll_stream_prepare (horizontal path). Asserts asm == ref
// (in-ROM, total mismatches == 0) and that the ref's observable outputs match an
// independent JS model of the exact C boundary/column algebra.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, makeReporter } from '../../harness/nes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const prevs = [0, 0, 248, 256, 8, 0, 0, 256];
const cams  = [4, 8, 256, 248, 0, 0, 64, 512];

// tile fixture identical to test.c
const tiles = new Uint8Array(64 * 30);
for (let k = 0; k < tiles.length; k++) tiles[k] = (k * 7 + 3) & 0xFF;

function model(cam, prev) {
  let pending = 0, addr = 0, newprev = prev, sum = 0;
  if ((cam >> 3) !== (prev >> 3)) {
    let col;
    if (cam > prev) { newprev = prev + 8; col = (newprev + 248) >> 3; }
    else { newprev = prev - 8; col = newprev >> 3; }
    if (col < 64) {
      for (let rr = 0; rr < 30; rr++) sum = (sum + tiles[rr * 64 + col]) & 0xFF;
      addr = ((col & 0x20) ? 0x2400 : 0x2000) + (col & 0x1F);
      pending = 1;
    }
  }
  return { pending, addr, newprev, sum };
}

const r = makeReporter('scroll_stream_prepare unit');
const h = boot(path.join(__dirname, '..', '..', 'build', 'ssp.nes'));
if (!h.frameUntil(0x0300, 0xAA)) { r.bad('driver did not finish'); r.done(); }
r.eq('case count', h.rd(0x0301), cams.length);
r.eq('total mismatches (ref vs asm)', h.rd(0x0302), 0);

let ok = true;
for (let i = 0; i < cams.length; i++) {
  const b = 0x0308 + i * 8;
  const got = { pending: h.rd(b), sum: h.rd(b + 1), addr: h.rd(b + 2) | (h.rd(b + 3) << 8),
                newprev: h.rd(b + 4) | (h.rd(b + 5) << 8) };
  const bufMatch = h.rd(b + 6), okAll = h.rd(b + 7);
  const m = model(cams[i], prevs[i]);
  // col_addr / col_buf are only defined when a column was actually streamed;
  // on a no-cross or out-of-world case the ref leaves them untouched.
  const good = got.pending === m.pending && got.newprev === m.newprev
            && bufMatch === 1 && okAll === 1
            && (!m.pending || (got.addr === m.addr && got.sum === m.sum));
  if (!good) {
    ok = false;
    r.bad(`case ${i} prev=${prevs[i]} cam=${cams[i]}: ref={pend:${got.pending},addr:0x${got.addr.toString(16)},prev:${got.newprev},sum:${got.sum}} model={pend:${m.pending},addr:0x${m.addr.toString(16)},prev:${m.newprev},sum:${m.sum}} bufMatch=${bufMatch} okAll=${okAll}`);
  }
}
if (ok) r.ok(`all ${cams.length} cases: asm == ref == model (no-cross, right/left cross, NT0/NT1 boundary, col-0, out-of-world clamp, +64-stride column copy)`);
r.done('scroll_stream_prepare: ASM candidate stages the column identically to the C reference.');
