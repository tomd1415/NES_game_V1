// Phase 4.4 — verify the iNES header's 4-screen-VRAM bit lands
// correctly across project shapes.  The playground server patches
// byte 6 bit 3 *only* when the project needs vertical scroll
// (`screens_y > 1` on any background), so:
//
//   1×1           -> byte6 = 0x03  (bit 3 clear)
//   2×1 (h-scroll) -> byte6 = 0x03  (bit 3 clear, V-mirror still right)
//   1×2 (v-scroll) -> byte6 = 0x0b  (bit 3 set, four distinct nametables)
//   2×2           -> byte6 = 0x0b  (bit 3 set)
//
// Keying on screens_y preserves the byte-identical-baseline test
// for the stock 1×1 build — that's the whole reason we don't flip
// the bit unconditionally.
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = '/home/duguid/projects/nesgame/attempt1';
const PORT = 18809;

const mkCells = (w, h, t = 1) => Array.from({ length: h }, () =>
  Array.from({ length: w }, () => ({ tile: t, palette: 0, empty: false })));

function mkState(sx, sy) {
  return {
    name: 'four-screen', version: 1, universal_bg: 0x21,
    sprites: [
      { role: 'player', name: 'hero', width: 2, height: 2, cells: mkCells(2, 2) },
    ],
    animations: [], animation_assignments: { walk: null, jump: null },
    nextAnimationId: 1,
    sprite_tiles: Array.from({ length: 256 }, () => ({
      pixels: Array.from({ length: 8 }, () => Array(8).fill(0)), name: '',
    })),
    bg_tiles: Array.from({ length: 256 }, () => ({
      pixels: Array.from({ length: 8 }, () => Array(8).fill(0)), name: '',
    })),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x0F, 0x10, 0x30] })),
    backgrounds: [{
      name: 'bg', dimensions: { screens_x: sx, screens_y: sy },
      nametable: Array.from({ length: 30 * sy }, () =>
        Array.from({ length: 32 * sx }, () => ({ tile: 0, palette: 0 }))),
      behaviour: (() => {
        const m = Array.from({ length: 30 * sy }, () => Array(32 * sx).fill(0));
        for (let c = 0; c < 32 * sx; c++) m[28][c] = 1;
        return m;
      })(),
    }],
    behaviour_types: [
      { id: 0, name: 'none' }, { id: 1, name: 'solid_ground' },
      { id: 2, name: 'wall' }, { id: 3, name: 'platform' },
      { id: 4, name: 'door' }, { id: 5, name: 'trigger' }, { id: 6, name: 'ladder' },
    ],
    selectedBgIdx: 0,
  };
}

const srv = spawn('python3',
  [path.join(ROOT, 'tools', 'playground_server.py')],
  { env: { ...process.env, PLAYGROUND_PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'] });
await sleep(1500);

function fail(msg) { console.error('FAIL:', msg); process.exit(1); }

async function build(sx, sy) {
  const r = await fetch(`http://127.0.0.1:${PORT}/play`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      state: mkState(sx, sy),
      playerSpriteIdx: 0, playerStart: { x: 60, y: 120 },
      sceneSprites: [], mode: 'browser',
    }),
  });
  const data = await r.json();
  if (!data.ok) {
    fail(`${sx}x${sy} build failed at stage ${data.stage}: ${(data.log||'').slice(-300)}`);
  }
  const rom = Buffer.from(data.rom_b64, 'base64');
  if (rom.length < 16) fail(`${sx}x${sy} ROM is too small (${rom.length} bytes)`);
  if (rom[0] !== 0x4E || rom[1] !== 0x45 || rom[2] !== 0x53 || rom[3] !== 0x1A) {
    fail(`${sx}x${sy} ROM is not iNES`);
  }
  return rom;
}

try {
  // Each combination, asserting the 4-screen bit reflects the
  // need for vertical scroll.
  const cases = [
    { sx: 1, sy: 1, expectFourScreen: false, note: 'no scroll' },
    { sx: 2, sy: 1, expectFourScreen: false, note: 'horizontal-only — V-mirror is correct' },
    { sx: 1, sy: 2, expectFourScreen: true,  note: 'vertical-only — needs 4-screen' },
    { sx: 2, sy: 2, expectFourScreen: true,  note: '4-screen world' },
  ];
  for (const { sx, sy, expectFourScreen, note } of cases) {
    const rom = await build(sx, sy);
    const got = !!(rom[6] & 0x08);
    if (got !== expectFourScreen) {
      fail(`${sx}×${sy} (${note}): expected 4-screen=${expectFourScreen}, got ${got} (byte6=0x${rom[6].toString(16)})`);
    }
    console.log(`✓ ${sx}×${sy} (${note}): byte6=0x${rom[6].toString(16).padStart(2,'0')}, 4-screen=${got}`);
  }

  // Belt-and-braces: 1×1 ROM size matches the header expectations.
  const stock = await build(1, 1);
  if (stock[4] !== 2 || stock[5] !== 1) {
    fail(`1×1 stock has unexpected bank counts: PRG=${stock[4]} CHR=${stock[5]}`);
  }
  console.log(`✓ 1×1 stock has expected PRG=${stock[4]} CHR=${stock[5]} banks`);

} finally {
  srv.kill('SIGTERM');
  await sleep(300);
}
console.log('\nFour-screen header smoke-test complete.');
