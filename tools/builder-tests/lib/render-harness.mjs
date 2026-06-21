// Render-test harness (Arc A).
//
// Boots a compiled pupil ROM in jsnes (headless, in Node) so suites can assert
// on RENDERED output — nametable tiles, OAM sprites, the RGB framebuffer — not
// just "the C compiled". See docs/plans/current/2026-06-18-arc-a-render-test-harness.md.
//
// This is a LIBRARY (it lives in lib/ so run-all.mjs's non-recursive glob skips
// it as a suite). Suites import it as `./lib/render-harness.mjs`.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..', '..', '..');     // repo root
export const WEB  = path.join(ROOT, 'tools', 'tile_editor_web');
const require = createRequire(import.meta.url);

// --- jsnes (UMD bundle) ----------------------------------------------------
let _jsnes = null;
export function loadJsnes() {
  if (!_jsnes) _jsnes = require(path.join(WEB, 'jsnes.min.js'));   // { NES, Controller }
  return _jsnes;
}
// Re-export the button constants for convenience.
export const BTN = (() => {
  const C = loadJsnes().Controller;
  return {
    A: C.BUTTON_A, B: C.BUTTON_B, SELECT: C.BUTTON_SELECT, START: C.BUTTON_START,
    UP: C.BUTTON_UP, DOWN: C.BUTTON_DOWN, LEFT: C.BUTTON_LEFT, RIGHT: C.BUTTON_RIGHT,
  };
})();

// --- Browser-module sandbox ------------------------------------------------
// Load the Builder JS into the Node global the same way every suite does, so
// callers can use window.BuilderAssembler / window.BuilderDefaults / etc.
export function loadBuilderModules() {
  globalThis.window = globalThis;
  for (const f of ['sprite-render.js', 'builder-assembler.js',
      'builder-modules.js', 'builder-validators.js']) {
    new Function(fs.readFileSync(path.join(WEB, f), 'utf8'))();
  }
  return globalThis.window;
}
export function readTemplate() {
  return fs.readFileSync(path.join(WEB, 'builder-templates', 'platformer.c'), 'utf8');
}

// --- Server lifecycle ------------------------------------------------------
export async function startServer(port) {
  // Point the accounts store (T4.2) at a throwaway temp DB so render/build
  // suites never create or touch the real tools/accounts.db.
  const acctDb = path.join(os.tmpdir(), `pg-harness-accounts-${port}.db`);
  for (const f of [acctDb, acctDb + '-wal', acctDb + '-shm']) { try { fs.unlinkSync(f); } catch {} }
  const srv = spawn('python3', [path.join(ROOT, 'tools', 'playground_server.py')],
    { env: { ...process.env, PLAYGROUND_PORT: String(port), PLAYGROUND_ACCOUNTS_DB: acctDb },
      stdio: ['ignore', 'pipe', 'pipe'] });
  const log = { text: '' };
  srv.stdout.on('data', d => { log.text += d.toString(); });
  srv.stderr.on('data', d => { log.text += d.toString(); });
  await sleep(1500);                 // give it time to bind
  return { srv, log };
}
export async function stopServer(srv) {
  srv.kill('SIGTERM');
  await sleep(300);
}

// POST /play. Returns the raw server JSON plus `romBytes` (a Buffer) when ok.
export async function buildRom(port, payload) {
  const res = await fetch(`http://127.0.0.1:${port}/play`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const r = await res.json();
  if (r.ok && r.rom_b64) r.romBytes = Buffer.from(r.rom_b64, 'base64');
  return r;
}

// --- Emulator wrapper ------------------------------------------------------
// Buffer/Uint8Array → binary (latin1) string for jsnes.loadROM (it does
// data.indexOf("NES"), which needs a string, not a typed array).
function toBinaryString(bytes) {
  return Buffer.isBuffer(bytes) ? bytes.toString('binary')
                                : Buffer.from(bytes).toString('binary');
}

export function openRom(romBytes) {
  const jsnes = loadJsnes();
  let lastFrame = null;
  const nes = new jsnes.NES({
    onFrame: (buf) => { lastFrame = buf; },   // Array(61440) of 0x00BBGGRR
    onAudioSample: () => {},
  });
  nes.loadROM(toBinaryString(romBytes));
  return {
    nes,
    frame()       { nes.frame(); return lastFrame; },
    frames(n)     { for (let i = 0; i < n; i++) nes.frame(); return lastFrame; },
    hold(btn)     { nes.buttonDown(1, btn); },
    release(btn)  { nes.buttonUp(1, btn); },
    // Edge press for edge-triggered inputs (e.g. the dialogue B).
    //
    // IMPORTANT — jsnes has a one-frame input latency: the frame()
    // immediately after buttonDown() still reads pad==0; the button only
    // appears in the engine's controller read on the SECOND frame. So a
    // single-frame press never registers. Hold ≥2 frames, THEN release.
    // (Verified empirically: buttonDown→frame1 pad=0x00, frame2 pad=0x40.)
    tap(btn)      { nes.buttonDown(1, btn); nes.frame(); nes.frame();
                    nes.buttonUp(1, btn);   nes.frame(); nes.frame(); },
    // Hold a button for n frames (n>=2 to clear the latency), then release.
    pressFor(btn, n) { nes.buttonDown(1, btn); for (let i = 0; i < n; i++) nes.frame();
                       nes.buttonUp(1, btn); nes.frame(); },
    lastFrame()   { return lastFrame; },
  };
}

// --- Readers ---------------------------------------------------------------

// Nametable tile index at (row,col) of nametable n (0..3).
export function ntTile(nes, n, row, col) {
  const nt = nes.ppu.nameTable && nes.ppu.nameTable[n];
  return nt && nt.tile ? nt.tile[row * 32 + col] : undefined;
}

// Decoded BG sub-palette (0..3) selected for the tile at (row,col) of nametable
// n.  jsnes decodes attribute writes into nameTable[n].attrib[] as palette<<2;
// this returns the palette id.  Reliable + scroll-independent (unlike the
// framebuffer, which jsnes mis-positions after the engine's mid-vblank writes).
export function bgPalette(nes, n, row, col) {
  const nt = nes.ppu.nameTable && nes.ppu.nameTable[n];
  return nt && nt.attrib ? (nt.attrib[row * 32 + col] >> 2) : undefined;
}

// OAM sprite i (0..63): { y, tile, attr, x }.  Off-screen sprites clamp to 0xFF.
export function oamSprite(nes, i) {
  const m = nes.ppu.spriteMem, b = i * 4;
  return { y: m[b], tile: m[b + 1], attr: m[b + 2], x: m[b + 3] };
}
// First on-screen sprite whose tile index is in [lo,hi].  Null if none.
export function findSpriteByTile(nes, lo, hi) {
  for (let i = 0; i < 64; i++) {
    const s = oamSprite(nes, i);
    if (s.y < 0xEF && s.tile >= lo && s.tile <= hi) return { i, ...s };
  }
  return null;
}

// Framebuffer (the Array passed to onFrame): pixel (x,y) as 0x00BBGGRR.
export function pixelAt(frame, x, y) { return frame[y * 256 + x] & 0x00FFFFFF; }

// Count pixels in [x0,x1)×[y0,y1) whose colour != bg.
export function countNonBg(frame, x0, y0, x1, y1, bg) {
  const want = bg & 0x00FFFFFF;
  let n = 0;
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++)
      if ((frame[y * 256 + x] & 0x00FFFFFF) !== want) n++;
  return n;
}
// Most common colour in a region + its fraction of the region (for flood tests).
export function dominantColor(frame, x0, y0, x1, y1) {
  const hist = new Map();
  let total = 0;
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const c = frame[y * 256 + x] & 0x00FFFFFF;
      hist.set(c, (hist.get(c) || 0) + 1); total++;
    }
  let color = 0, max = 0;
  for (const [c, n] of hist) if (n > max) { max = n; color = c; }
  return { color, fraction: total ? max / total : 0, distinct: hist.size };
}
export function distinctColors(frame, x0, y0, x1, y1) {
  return dominantColor(frame, x0, y0, x1, y1).distinct;
}
// Fraction of pixels whose RGB channel spread exceeds `minSpread` — i.e. how
// COLOURFUL the frame is.  The PPU greyscale bit (the B-4 tint bug) collapses
// every colour onto the grey ramp (R==G==B), which crashes this metric, while
// a legit colour-emphasis tint leaves it untouched.
export function saturatedFraction(frame, minSpread = 40) {
  let n = 0;
  for (let i = 0; i < frame.length; i++) {
    const v = frame[i], r = v & 0xff, g = (v >> 8) & 0xff, b = (v >> 16) & 0xff;
    if (Math.max(r, g, b) - Math.min(r, g, b) > minSpread) n++;
  }
  return frame.length ? n / frame.length : 0;
}
// Fraction of pixels that differ between two frames (e.g. before/after a tint).
export function frameDiffFraction(a, b) {
  let n = 0;
  for (let i = 0; i < b.length; i++) if ((a[i] & 0xFFFFFF) !== (b[i] & 0xFFFFFF)) n++;
  return b.length ? n / b.length : 0;
}

// --- CHR reader (iNES ROM bytes) -------------------------------------------
// Decode an 8x8 CHR tile straight from the ROM — scroll/PPU-independent, so
// it reliably answers "was this glyph seeded into the pattern table?".
// patternTable: 0 = $0000, 1 = $1000.  Returns 8 rows of 8 pixel values (0-3).
export function chrTile(romBytes, patternTable, tileIndex) {
  const prg = romBytes[4] * 16384;                       // iNES PRG size
  const base = 16 + prg + patternTable * 0x1000 + tileIndex * 16;
  const grid = [];
  for (let y = 0; y < 8; y++) {
    const lo = romBytes[base + y], hi = romBytes[base + y + 8];
    const row = [];
    for (let x = 0; x < 8; x++)
      row.push((((hi >> (7 - x)) & 1) << 1) | ((lo >> (7 - x)) & 1));
    grid.push(row);
  }
  return grid;
}
export function chrTileBlank(romBytes, patternTable, tileIndex) {
  return chrTile(romBytes, patternTable, tileIndex).every(r => r.every(p => p === 0));
}
// Render a CHR tile as 8 strings of ".123" for readable assertions/diagnostics.
export function chrTileArt(romBytes, patternTable, tileIndex) {
  return chrTile(romBytes, patternTable, tileIndex)
    .map(r => r.map(p => '.123'[p]).join(''));
}

// --- Fixture helpers -------------------------------------------------------
export const mkCells = (w, h) => Array.from({ length: h }, () =>
  Array.from({ length: w }, () => ({ tile: 1, palette: 0, empty: false })));
export const blankPool = () => Array.from({ length: 256 }, () => ({
  pixels: Array.from({ length: 8 }, () => Array(8).fill(0)), name: '' }));

// A blank w×h-screen background with a full-width SOLID_GROUND floor on `floorRow`.
export function flatBackground(screensX, screensY, floorRow) {
  const cols = 32 * screensX, rows = 30 * screensY;
  const m = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let c = 0; c < cols; c++) m[floorRow][c] = 1;        // SOLID_GROUND
  return {
    name: 'bg', dimensions: { screens_x: screensX, screens_y: screensY },
    nametable: Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => ({ tile: 0, palette: 0 }))),
    behaviour: m,
  };
}
export const BEHAVIOUR_TYPES = [
  { id: 0, name: 'none' }, { id: 1, name: 'solid_ground' }, { id: 2, name: 'wall' },
  { id: 3, name: 'platform' }, { id: 4, name: 'door' }, { id: 5, name: 'trigger' },
  { id: 6, name: 'ladder' },
];
