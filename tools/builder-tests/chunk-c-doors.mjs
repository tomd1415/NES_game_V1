// Phase B finale chunk C — teleport doors smoke-test.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = '/home/duguid/projects/nesgame/attempt1';
const WEB  = path.join(ROOT, 'tools', 'tile_editor_web');
const PORT = 18773;

globalThis.window = globalThis;
for (const f of ['sprite-render.js', 'builder-assembler.js',
    'builder-modules.js', 'builder-validators.js']) {
  new Function(fs.readFileSync(path.join(WEB, f), 'utf8'))();
}
const tpl = fs.readFileSync(path.join(WEB, 'builder-templates/platformer.c'), 'utf8');

function mkCells(w, h) {
  return Array.from({ length: h }, () =>
    Array.from({ length: w }, () => ({ tile: 1, palette: 0, empty: false })));
}

function makeState({ doors = false, withDoorTile = true, withEnemy = true } = {}) {
  const behaviour = Array.from({ length: 30 }, () => Array(32).fill(0));
  for (let c = 0; c < 32; c++) behaviour[28][c] = 1;       // ground row
  behaviour[20][20] = 5;                                    // trigger
  if (withDoorTile) behaviour[10][10] = 4;                  // door
  const sprites = [{ role: 'player', name: 'hero', width: 2, height: 2, cells: mkCells(2, 2) }];
  if (withEnemy) sprites.push({ role: 'enemy', name: 'goomba', width: 2, height: 2, cells: mkCells(2, 2) });
  const s = {
    name: 'chunkc', version: 1, universal_bg: 0x21,
    sprites, animations: [],
    animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    sprite_tiles: Array.from({ length: 256 }, () => ({
      pixels: Array.from({ length: 8 }, () => Array(8).fill(0)), name: '',
    })),
    bg_tiles: Array.from({ length: 256 }, () => ({
      pixels: Array.from({ length: 8 }, () => Array(8).fill(0)), name: '',
    })),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x0F, 0x10, 0x30] })),
    backgrounds: [{ name: 'bg', dimensions: { screens_x: 1, screens_y: 1 },
      nametable: Array.from({ length: 30 }, () =>
        Array.from({ length: 32 }, () => ({ tile: 0, palette: 0 }))),
      behaviour }],
    behaviour_types: [
      { id: 0, name: 'none' }, { id: 1, name: 'solid_ground' },
      { id: 2, name: 'wall' }, { id: 3, name: 'platform' },
      { id: 4, name: 'door' }, { id: 5, name: 'trigger' },
      { id: 6, name: 'ladder' },
    ],
    selectedBgIdx: 0,
    builder: window.BuilderDefaults(),
  };
  if (doors) s.builder.modules.doors.enabled = true;
  return s;
}

// V1: doors on, no DOOR tile → error
{
  const s = makeState({ doors: true, withDoorTile: false });
  const p = window.BuilderValidators.validate(s);
  const hit = p.find(x => x.id === 'doors-no-door-tiles');
  if (!hit || hit.severity !== 'error') {
    console.error('FAIL V1: expected doors-no-door-tiles error');
    process.exit(1);
  }
  console.log('✓ V1 doors-no-door-tiles fires when no door painted');
}

// V2: doors on + door painted → no error
{
  const s = makeState({ doors: true, withDoorTile: true });
  const p = window.BuilderValidators.validate(s);
  if (p.some(x => x.id === 'doors-no-door-tiles')) {
    console.error('FAIL V2: validator should be silent when DOOR painted');
    process.exit(1);
  }
  console.log('✓ V2 doors validator silent when DOOR painted');
}

// Assembler: emitted output contains teleport code
{
  const s = makeState({ doors: true });
  s.builder.modules.doors.config = { spawnX: 48, spawnY: 160 };
  const out = window.BuilderAssembler.assemble(s, tpl);
  for (const [label, re] of [
    ['doors marker',    /\[builder\] doors/],
    ['spawn X inject',  /px = 48;/],
    ['spawn Y inject',  /py = 160;/],
    ['BEHAVIOUR_DOOR check', /BEHAVIOUR_DOOR/],
    ['P2 door branch',  /px2 = 48;/],   // wrapped in #if PLAYER2_ENABLED
  ]) {
    if (!re.test(out)) {
      console.error('FAIL A' + label + ': missing match for ' + re);
      process.exit(1);
    }
  }
  console.log('✓ A teleport code emitted with correct spawn + P2 gated branch');
}

// /play end-to-end
const srv = spawn('python3',
  [path.join(ROOT, 'tools', 'playground_server.py')],
  { env: { ...process.env, PLAYGROUND_PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'] });
await sleep(1500);
try {
  const s = makeState({ doors: true });
  s.builder.modules.doors.config = { spawnX: 48, spawnY: 160 };
  const out = window.BuilderAssembler.assemble(s, tpl);
  const r = await (await fetch(`http://127.0.0.1:${PORT}/play`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      state: s, playerSpriteIdx: 0, playerStart: { x: 60, y: 120 },
      sceneSprites: [{ spriteIdx: 1, x: 96, y: 120 }],
      mode: 'browser', customMainC: out,
    }),
  })).json();
  if (!r.ok) {
    console.error('FAIL E1: doors build rejected:', r.stage);
    console.error((r.log || '').slice(-2000));
    process.exit(2);
  }
  console.log('✓ E1 doors build compiles via cc65 (' + r.size + ' bytes, ' + r.build_time_ms + ' ms)');
} finally {
  srv.kill('SIGTERM');
  await sleep(300);
}

console.log('\nChunk C (teleport doors) smoke-test complete.');
