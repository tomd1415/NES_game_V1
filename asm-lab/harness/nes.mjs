// Minimal jsnes boot for the asm-lab. Loads a built .nes, runs frames, and
// exposes CPU RAM reads (nes.cpu.mem) so a test driver can hand results back
// through internal RAM ($0300+) or WRAM ($6000+).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const ROOT = path.resolve(__dirname, '..', '..');
const jsnes = require(path.join(ROOT, 'tools', 'tile_editor_web', 'jsnes.min.js'));

// Boot a ROM file. Returns { nes, frames(n), rd(addr), rd16(addr) }.
export function boot(romPath) {
  const bytes = fs.readFileSync(romPath);
  const nes = new jsnes.NES({ onFrame() {}, onAudioSample() {} });
  nes.loadROM(bytes.toString('binary'));
  const api = {
    nes,
    frames(n) { for (let i = 0; i < n; i++) nes.frame(); return api; },
    // Step frames until mem[addr] === val (the driver's "done" marker), up to
    // maxFrames. Robust to per-driver setup cost (e.g. crt0 clearing a big BSS
    // before main runs). Returns true if the marker appeared.
    frameUntil(addr, val, maxFrames = 120) {
      for (let i = 0; i < maxFrames; i++) {
        nes.frame();
        if ((nes.cpu.mem[addr] & 0xFF) === (val & 0xFF)) return true;
      }
      return false;
    },
    rd(addr) { return nes.cpu.mem[addr] & 0xFF; },
    rd16(addr) { return (nes.cpu.mem[addr] & 0xFF) | ((nes.cpu.mem[addr + 1] & 0xFF) << 8); },
    // PPU/VRAM byte (e.g. palette $3F00-$3F1F, nametables $2000-$2FFF). For
    // functions whose observable effect is PPU state, not CPU RAM.
    rdPPU(addr) { return nes.ppu.vramMem[addr] & 0xFF; },
    // OAM shadow byte (sprite table, $0200 -> $4014 DMA target).
    rdOAM(i) { return nes.ppu.spriteMem[i] & 0xFF; },
  };
  return api;
}

// Tiny assertion helpers shared by lab tests.
export function makeReporter(title) {
  let failed = false;
  return {
    ok: (m) => console.log('✓ ' + m),
    bad: (m) => { console.error('FAIL: ' + m); failed = true; },
    eq(label, got, want) {
      if (got === want) console.log('✓ ' + label + ' = ' + fmt(want));
      else { console.error('FAIL: ' + label + ' — want ' + fmt(want) + ' got ' + fmt(got)); failed = true; }
    },
    done(tail) {
      if (failed) { console.error('\n' + title + ': FAILED'); process.exit(1); }
      console.log('\n' + (tail || title + ' complete.'));
    },
  };
}
function fmt(v) { return typeof v === 'number' ? ('0x' + (v & 0xFF).toString(16).toUpperCase().padStart(2, '0') + ' (' + v + ')') : String(v); }
