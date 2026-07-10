// Wide (>8-screen) level compression regression (feedback #10). A raw
// bg_world_tiles array is ~1KB/screen and overflows NROM past ~8 screens; the
// engine column-deduplicates wide 1-tall worlds (SCROLL_COMPRESSED, v64/v65) so
// they fit. This builds a 12-screen level and asserts:
//   1. it BUILDS + fits ROM (a raw 12-wide overflows, so a successful build IS
//      the compression working);
//   2. the shipped ASM engine and the C engine decode it to BYTE-IDENTICAL
//      nametables at a far scroll position (the dedup is correct);
//   3. the far screens show real content (floor + markers), not garbage.
import fs from 'node:fs';
import path from 'node:path';
import * as H from './lib/render-harness.mjs';

const WEB = H.WEB;
function fail(m) { console.error('FAIL:', m); process.exit(1); }
function assert(c, m) { if (!c) fail(m); }

globalThis.window = globalThis;
new Function(fs.readFileSync(path.join(WEB, 'engine-version.js'), 'utf8'))();
globalThis.NES_TARGET_ENGINE = globalThis.NES_ENGINE_VERSION;
for (const f of ['sprite-render.js', 'builder-assembler.js', 'builder-modules.js',
    'builder-validators.js', 'default-state.js', 'studio-starter.js']) {
  new Function(fs.readFileSync(path.join(WEB, f), 'utf8'))();
}
const tpl = fs.readFileSync(path.join(WEB, 'builder-templates', 'platformer.c'), 'utf8');
const solid = (v) => Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => v));

const SX = 12, WCOLS = 32 * SX;                 // 12 screens wide, 1 tall
function makeState() {
  const s = window.StudioStarter.createRunner();
  s.bg_palettes[0].slots = [0x21, 0x1A, 0x16];  // sky, green(floor), red(marker)
  s.bg_tiles[1] = { name: 'floor', pixels: solid(2) };
  s.bg_tiles[3] = { name: 'mark', pixels: solid(3) };
  const bg = s.backgrounds[0];
  bg.dimensions = { screens_x: SX, screens_y: 1 };
  bg.nametable = []; bg.behaviour = [];
  for (let r = 0; r < 30; r++) {
    const nt = [], bh = [];
    for (let c = 0; c < WCOLS; c++) {
      let t = 0;
      if (r >= 28) t = 1;                        // flat floor (repeats -> dedups well)
      else if (c % 32 === 0 && r >= 20) t = 3;   // a red marker post at each screen start
      else if ((c % 32) >= 14 && (c % 32) <= 17 && r === 22) t = 1;  // a small platform
      nt.push({ tile: t, palette: 0 }); bh.push(r >= 28 ? 1 : 0);
    }
    bg.nametable.push(nt); bg.behaviour.push(bh);
  }
  s.builder.modules.game.config.autoscrollSpeed = 4;
  s.builder.modules.players.submodules.player1.config.startX = 24;
  s.builder.modules.players.submodules.player1.config.startY = 200;
  return s;
}

async function buildWith(port, env) {
  const srv = await H.startServer(port, env);
  try {
    const s = makeState();
    const r = await H.buildRom(port, {
      state: s, playerSpriteIdx: 0, playerStart: { x: 24, y: 200 }, sceneSprites: [],
      mode: 'browser', customMainC: window.BuilderAssembler.assemble(s, tpl),
      targetEngine: globalThis.NES_TARGET_ENGINE,
    });
    return r;
  } finally { await H.stopServer(srv.srv); }
}

// Dump the visible nametables (NT0+NT1 tile bytes) after scrolling into the far
// screens, read straight from jsnes' PPU VRAM.
function nametableAfter(romBytes, frames) {
  const emu = H.openRom(romBytes);
  emu.frames(frames);
  const vram = emu.nes.ppu.vramMem;
  assert(vram && vram.length >= 0x2800, 'jsnes PPU vramMem not accessible');
  const out = [];
  for (const base of [0x2000, 0x2400]) for (let i = 0; i < 960; i++) out.push(vram[base + i] & 0xFF);
  return out;
}

const romC = await buildWith(18867, { PLAYGROUND_NO_ASM: '1' });   // pure-C engine
assert(romC.ok, '12-screen world did not build on the C engine (compression should fit ROM): ' + String(romC.log || '').slice(-300));
const romA = await buildWith(18868, {});                            // shipped ASM engine
assert(romA.ok, '12-screen world did not build on the ASM engine: ' + String(romA.log || '').slice(-300));
console.log('✓ 12-screen world builds + fits ROM on both engines (raw would overflow -> compression works)');

const ntC = nametableAfter(romC.romBytes, 900);   // ~screen 9-10 (well past 8)
const ntA = nametableAfter(romA.romBytes, 900);
let diff = 0; for (let i = 0; i < ntC.length; i++) if (ntC[i] !== ntA[i]) diff++;
assert(diff === 0, 'C-vs-ASM nametables differ at a far scroll position (' + diff + ' tiles) — the ASM dedup decode is wrong');
console.log('✓ ASM and C engines decode the compressed level to byte-identical nametables past screen 8');

const kinds = new Set(ntC);
assert(kinds.size > 1, 'far-screen nametable is uniform (blank/garbage) — nothing streamed');
console.log('✓ the far screens show real streamed content (' + kinds.size + ' distinct tiles)');

console.log('\nWide-compressed (>8-screen) scroll regression complete.');
