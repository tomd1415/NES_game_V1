// Gallery preview capture (bug #25): the shared NesEmulator.stepPreviewFrames
// helper must advance a freshly-built ROM to a frame that actually shows the
// game — not the blank first frame. Builds a small painted platformer, runs
// the SAME stepping the browser publish flow uses, and asserts the resulting
// framebuffer is non-blank + deterministic.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = new URL('../..', import.meta.url).pathname;
const WEB = path.join(ROOT, 'tools', 'tile_editor_web');
const PORT = 18864;
function fail(m) { console.error('FAIL:', m); process.exit(1); }
function assert(c, m) { if (!c) fail(m); }

globalThis.window = globalThis;
globalThis.NES_TARGET_ENGINE = 9;
for (const f of ['sprite-render.js', 'builder-assembler.js', 'builder-modules.js', 'builder-validators.js', 'emulator.js']) {
  new Function(fs.readFileSync(path.join(WEB, f), 'utf8'))();
}
assert(window.NesEmulator && typeof window.NesEmulator.stepPreviewFrames === 'function',
  'emulator.js did not expose NesEmulator.stepPreviewFrames');
assert((window.NesEmulator.PREVIEW_FRAMES | 0) > 0, 'PREVIEW_FRAMES should be a positive integer');
const tpl = fs.readFileSync(path.join(WEB, 'builder-templates/platformer.c'), 'utf8');

function tilePixels(fill) { return Array.from({ length: 8 }, (_, y) => Array.from({ length: 8 }, (_, x) => fill(x, y))); }
function mkCells(w, h) { return Array.from({ length: h }, () => Array.from({ length: w }, () => ({ tile: 1, palette: 0, empty: false }))); }
function makeState() {
  const bg_tiles = Array.from({ length: 256 }, () => ({ pixels: tilePixels(() => 0), name: '' }));
  bg_tiles[1] = { name: 'ground', pixels: tilePixels((x, y) => ((x ^ y) & 1) ? 1 : 2) };
  const sprite_tiles = Array.from({ length: 256 }, () => ({ pixels: tilePixels(() => 0), name: '' }));
  sprite_tiles[1] = { name: 'hero', pixels: tilePixels(() => 3) };
  const behaviour = Array.from({ length: 30 }, () => Array(32).fill(0));
  for (let c = 0; c < 32; c++) behaviour[28][c] = 1;
  const nametable = Array.from({ length: 30 }, () => Array.from({ length: 32 }, () => ({ tile: 0, palette: 0 })));
  for (let c = 0; c < 32; c++) { nametable[28][c] = { tile: 1, palette: 0 }; nametable[29][c] = { tile: 1, palette: 0 }; }
  return {
    name: 'preview-probe', version: 1, universal_bg: 0x21,
    sprites: [{ role: 'player', name: 'hero', width: 2, height: 2, cells: mkCells(2, 2) }],
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    sprite_tiles, bg_tiles,
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x0F, 0x10, 0x30] })),
    backgrounds: [{ name: 'bg', dimensions: { screens_x: 1, screens_y: 1 }, nametable, behaviour }],
    behaviour_types: [{ id: 0, name: 'none' }, { id: 1, name: 'solid_ground' }],
    selectedBgIdx: 0, builder: window.BuilderDefaults(),
  };
}

const srv = spawn('python3', [path.join(ROOT, 'tools', 'playground_server.py')],
  { env: { ...process.env, PLAYGROUND_PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
await sleep(1600);
try {
  const s = makeState();
  const out = window.BuilderAssembler.assemble(s, tpl);
  const r = await (await fetch(`http://127.0.0.1:${PORT}/play`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state: s, playerSpriteIdx: 0, playerStart: { x: 60, y: 180 }, sceneSprites: [], mode: 'browser', customMainC: out, targetEngine: 9 }),
  })).json();
  if (!r.ok) { console.error('build failed:', r.stage, (r.log || '').slice(-1500)); process.exit(2); }
  console.log('✓ built a preview ROM via cc65 (' + r.size + ' bytes)');

  const mm = { exports: {} };
  new Function('module', 'exports', fs.readFileSync(path.join(WEB, 'jsnes.min.js'), 'utf8'))(mm, mm.exports);
  const jsnes = mm.exports.NES ? mm.exports : window.jsnes;
  const bb = Buffer.from(r.rom_b64, 'base64');
  let romStr = ''; for (let i = 0; i < bb.length; i++) romStr += String.fromCharCode(bb[i]);

  function captureColours() {
    const fb = new Uint32Array(256 * 240);
    const nes = new jsnes.NES({ onFrame: (buf) => { for (let i = 0; i < buf.length; i++) fb[i] = buf[i]; }, onAudioSample: () => {} });
    nes.loadROM(romStr);
    window.NesEmulator.stepPreviewFrames(nes, window.NesEmulator.PREVIEW_FRAMES);   // the real browser path
    const set = new Set(); for (let i = 0; i < fb.length; i++) set.add(fb[i]);
    return set.size;
  }

  const c1 = captureColours();
  assert(c1 > 1, 'preview frame is blank (only ' + c1 + ' colour) after PREVIEW_FRAMES');
  console.log('✓ preview shows real content (' + c1 + ' distinct colours, > 1)');

  const c2 = captureColours();
  assert(c1 === c2, 'preview capture is non-deterministic (' + c1 + ' vs ' + c2 + ')');
  console.log('✓ capture is deterministic across runs');

  // A near-immediate grab (1 frame) is the blank-preview symptom we avoid.
  const fb0 = new Uint32Array(256 * 240);
  const nes0 = new jsnes.NES({ onFrame: (buf) => { for (let i = 0; i < buf.length; i++) fb0[i] = buf[i]; }, onAudioSample: () => {} });
  nes0.loadROM(romStr); nes0.frame();
  const early = new Set(fb0).size;
  console.log('  (context: 1-frame grab = ' + early + ' colours; PREVIEW_FRAMES = ' + window.NesEmulator.PREVIEW_FRAMES + ' → ' + c1 + ')');
} finally {
  srv.kill('SIGTERM');
  await sleep(300);
}
console.log('\nGallery preview-capture test complete.');
