// Per-door destinations (engine v2) — codegen + cc65 compile smoke-test.
// Each door tile carries its own spawn + target background. An empty doorList
// must stay byte-identical to v1 (covered by the golden-ROM test); this checks
// the NEW per-door path emits a table and compiles.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = new URL('../..', import.meta.url).pathname;
const WEB  = path.join(ROOT, 'tools', 'tile_editor_web');
const PORT = 18781;

globalThis.window = globalThis;
globalThis.NES_TARGET_ENGINE = 2; // per-door requires targeting engine v2+
for (const f of ['sprite-render.js', 'builder-assembler.js',
    'builder-modules.js', 'builder-validators.js']) {
  new Function(fs.readFileSync(path.join(WEB, f), 'utf8'))();
}
const tpl = fs.readFileSync(path.join(WEB, 'builder-templates/platformer.c'), 'utf8');

function mkCells(w, h) {
  return Array.from({ length: h }, () =>
    Array.from({ length: w }, () => ({ tile: 1, palette: 0, empty: false })));
}
function blankBg(name) {
  const behaviour = Array.from({ length: 30 }, () => Array(32).fill(0));
  for (let c = 0; c < 32; c++) behaviour[28][c] = 1;   // ground
  behaviour[10][10] = 4;                                // door A tile
  behaviour[10][12] = 4;                                // door B tile
  return {
    name, dimensions: { screens_x: 1, screens_y: 1 },
    nametable: Array.from({ length: 30 }, () => Array.from({ length: 32 }, () => ({ tile: 0, palette: 0 }))),
    behaviour,
  };
}
function makeState() {
  const s = {
    name: 'perdoor', version: 1, universal_bg: 0x21,
    sprites: [{ role: 'player', name: 'hero', width: 2, height: 2, cells: mkCells(2, 2) }],
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    sprite_tiles: Array.from({ length: 256 }, () => ({ pixels: Array.from({ length: 8 }, () => Array(8).fill(0)), name: '' })),
    bg_tiles: Array.from({ length: 256 }, () => ({ pixels: Array.from({ length: 8 }, () => Array(8).fill(0)), name: '' })),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x0F, 0x10, 0x30] })),
    backgrounds: [blankBg('room1'), blankBg('room2')],
    behaviour_types: [
      { id: 0, name: 'none' }, { id: 1, name: 'solid_ground' }, { id: 2, name: 'wall' },
      { id: 3, name: 'platform' }, { id: 4, name: 'door' }, { id: 5, name: 'trigger' }, { id: 6, name: 'ladder' },
    ],
    selectedBgIdx: 0,
    builder: window.BuilderDefaults(),
  };
  s.builder.modules.doors.enabled = true;
  s.builder.modules.doors.config.doorList = [
    { bg: 0, tx: 10, ty: 10, spawnX: 48, spawnY: 160, targetBgIdx: -1 }, // same room
    { bg: 0, tx: 12, ty: 10, spawnX: 20, spawnY: 100, targetBgIdx: 1 },  // cross room
  ];
  return s;
}

// Codegen assertions.
{
  const out = window.BuilderAssembler.assemble(makeState(), tpl);
  for (const [label, re] of [
    ['perdoor flag',   /#define BW_DOORS_PERDOOR_ENABLED 1/],
    ['door count',     /#define BW_DOOR_COUNT 2/],
    ['door table',     /bw_door_tbl\[\]\s*=\s*\{/],
    ['same-room 0xFF', /0,\s*10,\s*10,\s*48,\s*160,\s*255/],   // targetBg -1 → 0xFF
    ['cross-room tgt', /0,\s*12,\s*10,\s*20,\s*100,\s*1/],
    ['multibg on',     /#define BW_DOORS_MULTIBG_ENABLED 1/],  // cross-room present
    ['room swap call', /load_background_n\(bw_door_tbl/],
    ['perdoor marker', /per-door destinations/],
  ]) {
    if (!re.test(out)) { console.error('FAIL codegen: missing ' + label + ' (' + re + ')'); process.exit(1); }
  }
  console.log('✓ per-door table + lookup + room-swap emitted');
}

// Pin check: targeting engine v1 must NOT emit per-door even with a doorList
// (the original multi-page site stays on v1).
{
  globalThis.NES_TARGET_ENGINE = 1;
  const out = window.BuilderAssembler.assemble(makeState(), tpl);
  if (/BW_DOORS_PERDOOR_ENABLED/.test(out) || /bw_door_tbl/.test(out)) {
    console.error('FAIL pin: engine v1 target emitted per-door code');
    process.exit(1);
  }
  globalThis.NES_TARGET_ENGINE = 2; // restore for the compile test below
  console.log('✓ engine v1 target does NOT emit per-door (multi-page site pinned)');
}

// cc65 compile end-to-end (the NEW C path must build).
const srv = spawn('python3', [path.join(ROOT, 'tools', 'playground_server.py')],
  { env: { ...process.env, PLAYGROUND_PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
await sleep(1500);
try {
  const s = makeState();
  const out = window.BuilderAssembler.assemble(s, tpl);
  const r = await (await fetch(`http://127.0.0.1:${PORT}/play`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state: s, playerSpriteIdx: 0, playerStart: { x: 60, y: 120 }, sceneSprites: [], mode: 'browser', customMainC: out }),
  })).json();
  if (!r.ok) {
    console.error('FAIL compile: per-door build rejected:', r.stage);
    console.error((r.log || '').slice(-2000));
    process.exit(2);
  }
  console.log('✓ per-door build compiles via cc65 (' + r.size + ' bytes)');
} finally {
  srv.kill('SIGTERM');
  await sleep(300);
}

console.log('\nPer-door destinations (engine v2) smoke-test complete.');
