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
    rd(addr) { return nes.cpu.mem[addr] & 0xFF; },
    rd16(addr) { return (nes.cpu.mem[addr] & 0xFF) | ((nes.cpu.mem[addr + 1] & 0xFF) << 8); },
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
