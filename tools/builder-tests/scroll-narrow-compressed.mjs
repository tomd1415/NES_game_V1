// Narrow-but-detailed level compression (feedback #10 follow-up). v66 widened
// column-compression from ">8 screens only" to "any multi-screen level that
// packs down", so a detailed 5-8 screen level fits instead of overflowing NROM
// on the raw path. That routes a <256-column level through the compressed
// decoder for the first time (previously only >256-col levels did), so the ASM
// decoder must be proven correct in this NEW regime.
//
// This builds a 6-screen (192-col) repetitive level and asserts:
//   1. it builds on both the C and ASM engines;
//   2. they decode it to BYTE-IDENTICAL nametables while scrolled (the ASM
//      compressed path is correct for a narrow level, not just a wide one);
//   3. the screens show real streamed content.
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

const SX = 6, WCOLS = 32 * SX;                  // 6 screens wide, 1 tall (192 cols)
function makeState() {
  const s = window.StudioStarter.createRunner();
  s.bg_palettes[0].slots = [0x21, 0x1A, 0x16];
  s.bg_tiles[1] = { name: 'floor', pixels: solid(2) };
  s.bg_tiles[3] = { name: 'mark', pixels: solid(3) };
  const bg = s.backgrounds[0];
  bg.dimensions = { screens_x: SX, screens_y: 1 };
  bg.nametable = []; bg.behaviour = [];
  for (let r = 0; r < 30; r++) {
    const nt = [], bh = [];
    for (let c = 0; c < WCOLS; c++) {
      let t = 0;
      if (r >= 28) t = 1;                        // flat floor (repeats -> dedups)
      else if (c % 32 === 0 && r >= 20) t = 3;   // a red marker post per screen
      else if ((c % 32) >= 14 && (c % 32) <= 17 && r === 22) t = 1;  // platform
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
    return await H.buildRom(port, {
      state: s, playerSpriteIdx: 0, playerStart: { x: 24, y: 200 }, sceneSprites: [],
      mode: 'browser', customMainC: window.BuilderAssembler.assemble(s, tpl),
      targetEngine: globalThis.NES_TARGET_ENGINE,
    });
  } finally { await H.stopServer(srv.srv); }
}

function nametableAfter(romBytes, frames) {
  const emu = H.openRom(romBytes);
  emu.frames(frames);
  const vram = emu.nes.ppu.vramMem;
  assert(vram && vram.length >= 0x2800, 'jsnes PPU vramMem not accessible');
  const out = [];
  for (const base of [0x2000, 0x2400]) for (let i = 0; i < 960; i++) out.push(vram[base + i] & 0xFF);
  return out;
}

const romC = await buildWith(18871, { PLAYGROUND_NO_ASM: '1' });
assert(romC.ok, '6-screen level did not build on the C engine: ' + String(romC.log || '').slice(-300));
const romA = await buildWith(18872, {});
assert(romA.ok, '6-screen level did not build on the ASM engine: ' + String(romA.log || '').slice(-300));
console.log('✓ 6-screen (narrow) compressed level builds on both engines');

const ntC = nametableAfter(romC.romBytes, 600);   // scrolled a few screens in
const ntA = nametableAfter(romA.romBytes, 600);
let diff = 0; for (let i = 0; i < ntC.length; i++) if (ntC[i] !== ntA[i]) diff++;
assert(diff === 0, 'C-vs-ASM nametables differ for a NARROW compressed level (' + diff + ' tiles) — the ASM decoder is wrong below 256 cols');
console.log('✓ ASM and C decode the narrow compressed level to byte-identical nametables');

const kinds = new Set(ntC);
assert(kinds.size > 1, 'nametable is uniform (blank/garbage) — nothing streamed');
console.log('✓ the screens show real streamed content (' + kinds.size + ' distinct tiles)');

console.log('\nNarrow-compressed (5-8 screen) scroll regression complete.');
