// Unit harness for advance_animation. Asserts asm == ref == an independent JS
// model of the exact C anim state machine (mode-change reset, tick threshold,
// frame wrap, static count==1, anim_base = frame*4).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, makeReporter } from '../../harness/nes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const st = [
  [1, 0, 5, 3, 2, 8], [1, 1, 2, 3, 4, 8], [1, 1, 1, 7, 4, 8], [1, 1, 3, 7, 4, 8],
  [0, 0, 0, 0, 1, 1], [2, 1, 6, 0, 1, 4], [1, 1, 9, 5, 16, 6], [1, 1, 63, 7, 64, 8],
  [3, 3, 20, 1, 30, 2],
];

function model([mode, prev, frame, tick, count, ticks]) {
  if (mode !== prev) { frame = 0; tick = 0; prev = mode; }
  if (count > 1) {
    tick++;
    if (tick >= ticks) { tick = 0; frame++; if (frame >= count) frame = 0; }
  }
  const base = frame * 4;
  return { frame, tick, prev, baseLo: base & 0xFF, baseHi: (base >> 8) & 0xFF };
}

const r = makeReporter('advance_animation unit');
const h = boot(path.join(__dirname, '..', '..', 'build', 'anim.nes'));
if (!h.frameUntil(0x0300, 0xAA)) { r.bad('driver did not finish'); r.done(); }
r.eq('case count', h.rd(0x0301), st.length);
r.eq('mismatch count (ref vs asm)', h.rd(0x0302), 0);

let ok = true;
for (let i = 0; i < st.length; i++) {
  const b = 0x0308 + i * 6;
  const got = { frame: h.rd(b), tick: h.rd(b + 1), prev: h.rd(b + 2), baseLo: h.rd(b + 3), baseHi: h.rd(b + 4) };
  const okByte = h.rd(b + 5);
  const m = model(st[i]);
  if (!(got.frame === m.frame && got.tick === m.tick && got.prev === m.prev
     && got.baseLo === m.baseLo && got.baseHi === m.baseHi && okByte === 1)) {
    ok = false;
    r.bad(`case ${i} seed=[${st[i]}]: ref={f:${got.frame},t:${got.tick},p:${got.prev},base:${got.baseLo|(got.baseHi<<8)}} model={f:${m.frame},t:${m.tick},p:${m.prev},base:${m.baseLo|(m.baseHi<<8)}} ok=${okByte}`);
  }
}
if (ok) r.ok(`all ${st.length} cases: asm == ref == model (mode-change reset, tick threshold, frame wrap, static count==1, anim_base=frame*4)`);
r.done('advance_animation: ASM candidate runs the anim state machine identically to the C reference.');
