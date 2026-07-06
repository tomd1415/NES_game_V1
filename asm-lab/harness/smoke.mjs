// Smoke test: boot build/smoke.nes, run a few frames, verify the internal-RAM
// buffer and the $6000 WRAM round-trip.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, makeReporter } from './nes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const r = makeReporter('asm-lab smoke');
const h = boot(path.join(__dirname, '..', 'build', 'smoke.nes'));
h.frames(4);

r.eq('$0300 (direct write)', h.rd(0x0300), 0x43);
r.eq('$0301 (direct write)', h.rd(0x0301), 0xA5);
r.eq('$0302 (read back from $6000 WRAM global)', h.rd(0x0302), 0x42);
r.done('asm-lab smoke: toolchain + jsnes RAM/WRAM plumbing OK.');
