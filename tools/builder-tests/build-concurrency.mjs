// Per-request build isolation: concurrent /play builds must NOT corrupt each
// other (they used to share steps/Step_Playground under one lock; now each runs
// in its own temp dir, bounded by BUILD_SEM). Fire many builds of two distinct
// projects at once and assert every response is the correct ROM for its input.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = new URL('../..', import.meta.url).pathname;
const WEB = path.join(ROOT, 'tools', 'tile_editor_web');
const PORT = 18872;
let failed = false;
const ok = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };

globalThis.window = globalThis;
globalThis.NES_TARGET_ENGINE = 9;
for (const f of ['sprite-render.js', 'builder-assembler.js', 'builder-modules.js', 'builder-validators.js']) {
  new Function(fs.readFileSync(path.join(WEB, f), 'utf8'))();
}
const tpl = fs.readFileSync(path.join(WEB, 'builder-templates/platformer.c'), 'utf8');

function mkCells(w, h) { return Array.from({ length: h }, () => Array.from({ length: w }, () => ({ tile: 1, palette: 0, empty: false }))); }
function makeState(type) {
  const behaviour = Array.from({ length: 30 }, () => Array(32).fill(0));
  for (let c = 0; c < 32; c++) behaviour[28][c] = 1;
  const s = {
    name: type, version: 1, universal_bg: 0x21,
    sprites: [{ role: 'player', name: 'hero', width: 2, height: 2, cells: mkCells(2, 2) }],
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    sprite_tiles: Array.from({ length: 256 }, () => ({ pixels: Array.from({ length: 8 }, () => Array(8).fill(0)), name: '' })),
    bg_tiles: Array.from({ length: 256 }, () => ({ pixels: Array.from({ length: 8 }, () => Array(8).fill(0)), name: '' })),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x0F, 0x10, 0x30] })),
    backgrounds: [{ name: 'bg', dimensions: { screens_x: 1, screens_y: 1 }, nametable: Array.from({ length: 30 }, () => Array.from({ length: 32 }, () => ({ tile: 0, palette: 0 }))), behaviour }],
    behaviour_types: [{ id: 0, name: 'none' }, { id: 1, name: 'solid_ground' }, { id: 2, name: 'wall' }, { id: 3, name: 'platform' }, { id: 4, name: 'door' }, { id: 5, name: 'trigger' }, { id: 6, name: 'ladder' }],
    selectedBgIdx: 0, builder: window.BuilderDefaults(),
  };
  s.builder.modules.game.config.type = type;
  return s;
}
// Two projects whose emitted main.c differs (platformer vs top-down BW_GAME_STYLE)
// → different ROM bytes; and one uses customMainC while stock differs.
const A = makeState('platformer');
const B = makeState('topdown');
const outA = window.BuilderAssembler.assemble(A, tpl);
const outB = window.BuilderAssembler.assemble(B, tpl);

async function build(state, out) {
  const r = await (await fetch(`http://127.0.0.1:${PORT}/play`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state, playerSpriteIdx: 0, playerStart: { x: 60, y: 120 }, sceneSprites: [], mode: 'browser', customMainC: out, targetEngine: 9 }),
  })).json();
  if (!r.ok) throw new Error('build failed: ' + r.stage + ' ' + (r.log || '').slice(-200));
  return crypto.createHash('sha1').update(Buffer.from(r.rom_b64, 'base64')).digest('hex');
}

const srv = spawn('python3', [path.join(ROOT, 'tools', 'playground_server.py')],
  { env: { ...process.env, PLAYGROUND_PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
await sleep(1600);
try {
  // Sequential baselines.
  const shaA = await build(A, outA);
  const shaB = await build(B, outB);
  if (shaA !== shaB) ok('the two projects build to distinct ROMs (' + shaA.slice(0, 8) + ' vs ' + shaB.slice(0, 8) + ')');
  else bad('the two projects produced identical ROMs — test not discriminating');

  // 12 concurrent builds alternating A/B: each must equal its own baseline
  // (no cross-contamination from a neighbour's build).
  const jobs = [];
  for (let i = 0; i < 12; i++) jobs.push((i % 2 === 0) ? build(A, outA).then((h) => ['A', h]) : build(B, outB).then((h) => ['B', h]));
  const results = await Promise.all(jobs);
  let mism = 0;
  for (const [which, h] of results) { const want = which === 'A' ? shaA : shaB; if (h !== want) mism++; }
  if (mism === 0) ok('12 concurrent builds each returned the correct ROM for their input (no cross-contamination)');
  else bad(mism + ' concurrent builds returned the WRONG ROM (shared-dir race)');
} catch (e) {
  bad('threw: ' + (e && e.message));
} finally {
  srv.kill('SIGTERM');
  await sleep(300);
}
if (failed) process.exit(1);
console.log('\nBuild-concurrency isolation test complete.');
