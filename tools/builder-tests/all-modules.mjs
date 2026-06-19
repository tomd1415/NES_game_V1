// All-modules compile smoke-test.
//
// The byte-identical invariant only exercises the *zero-module* template,
// and each chunk suite exercises one module group.  Nothing built a project
// with EVERY module enabled at once — so a symbol clash, slot-ordering bug,
// or shared-`i` collision between (say) pickups + damage + dialogue +
// win_condition + scene-AI would only surface as a raw cc65 error in a
// pupil's face.  This suite ticks everything and asserts the ROM builds.
//
// See docs/plans/current/2026-06-18-codegen-rework-implementation.md (Sprint 1)
// and the architecture review §S2.

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = '/home/duguid/projects/nesgame/attempt1';
const WEB  = path.join(ROOT, 'tools', 'tile_editor_web');
const PORT = 18781;

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
function blankPool() {
  return Array.from({ length: 256 }, () => ({
    pixels: Array.from({ length: 8 }, () => Array(8).fill(0)), name: '',
  }));
}

// Every module enabled, every prerequisite present.
//   sprites:  0 player, 1 player2, 2 enemy, 3 npc, 4 pickup, 5 hud
function makeEverythingState() {
  const sprites = [
    { role: 'player', name: 'hero',  width: 2, height: 2, cells: mkCells(2, 2) },
    { role: 'player', name: 'hero2', width: 2, height: 2, cells: mkCells(2, 2) },
    { role: 'enemy',  name: 'goomba',width: 2, height: 2, cells: mkCells(2, 2) },
    { role: 'npc',    name: 'oldman',width: 2, height: 2, cells: mkCells(2, 2) },
    { role: 'pickup', name: 'coin',  width: 1, height: 1, cells: mkCells(1, 1) },
    { role: 'hud',    name: 'heart', width: 1, height: 1, cells: mkCells(1, 1) },
  ];
  const s = {
    name: 'everything',
    version: 1,
    universal_bg: 0x21,
    sprites,
    sprite_tiles: blankPool(),
    bg_tiles: blankPool(),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x0F, 0x10, 0x30] })),
    animations: [],
    animation_assignments: { walk: null, jump: null },
    nextAnimationId: 1,
    backgrounds: [{
      name: 'bg',
      dimensions: { screens_x: 1, screens_y: 1 },
      nametable: Array.from({ length: 30 }, () =>
        Array.from({ length: 32 }, () => ({ tile: 0, palette: 0 }))),
      behaviour: (() => {
        const m = Array.from({ length: 30 }, () => Array(32).fill(0));
        for (let c = 0; c < 32; c++) m[28][c] = 1;   // solid ground
        m[20][20] = 5;   // trigger (win)
        m[18][8]  = 4;   // door
        return m;
      })(),
    }],
    behaviour_types: [
      { id: 0, name: 'none' }, { id: 1, name: 'solid_ground' },
      { id: 2, name: 'wall' }, { id: 3, name: 'platform' },
      { id: 4, name: 'door' }, { id: 5, name: 'trigger' },
      { id: 6, name: 'ladder' },
    ],
    selectedBgIdx: 0,
    builder: window.BuilderDefaults(),
  };

  const m = s.builder.modules;
  // Two players.
  m.players.config.count = 2;
  m.players.submodules.player1.enabled = true;
  m.players.submodules.player2.enabled = true;
  m.players.submodules.player1.config.maxHp = 3;
  m.players.submodules.player2.config.maxHp = 3;
  // Everything optional, on.
  m.pickups.enabled = true;
  m.damage.enabled = true;
  m.hud.enabled = true;
  m.doors.enabled = true;
  m.dialogue.enabled = true;
  // Scene AI: enemy walks, npc + pickup sit (index-aligned with sceneSprites).
  m.scene.config.instances = [
    { id: 'e', spriteIdx: 2, x: 96,  y: 120, ai: 'walker', speed: 3 },   // R-4 speed
    // Per-NPC override text → exercises BW_DIALOG_PER_NPC=1 (the dialogue
    // vblank path that had a cc65 declaration-after-statement bug).
    { id: 'n', spriteIdx: 3, x: 140, y: 120, ai: 'static', text: 'HELLO THERE' },
    { id: 'p', spriteIdx: 4, x: 180, y: 120, ai: 'static' },
  ];
  return s;
}

const srv = spawn('python3',
  [path.join(ROOT, 'tools', 'playground_server.py')],
  { env: { ...process.env, PLAYGROUND_PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'] });
let srvLog = '';
srv.stdout.on('data', d => srvLog += d.toString());
srv.stderr.on('data', d => srvLog += d.toString());
await sleep(1500);

async function postPlay(payload) {
  const res = await fetch(`http://127.0.0.1:${PORT}/play`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

let failed = false;
try {
  const s = makeEverythingState();

  // Sanity: the config must not have validator *errors* (those would block
  // Play in the real UI, so a build failure here would be the wrong signal).
  const problems = window.BuilderValidators.validate(s);
  const errors = problems.filter(p => p.severity === 'error');
  if (errors.length) {
    console.error('FAIL: all-modules state has validator errors (fix the fixture):');
    for (const e of errors) console.error('  - ' + e.id + ': ' + e.message);
    failed = true;
  }

  const r = await postPlay({
    state: s,
    playerSpriteIdx: 0,
    playerSpriteIdx2: 1,
    playerStart:  { x: 60,  y: 120 },
    playerStart2: { x: 180, y: 120 },
    sceneSprites: [
      { spriteIdx: 2, x: 96,  y: 120 },   // enemy   → ss[0]
      { spriteIdx: 3, x: 140, y: 120 },   // npc     → ss[1]
      { spriteIdx: 4, x: 180, y: 120 },   // pickup  → ss[2]
    ],
    mode: 'browser',
    customMainC: window.BuilderAssembler.assemble(s, tpl),
  });

  if (!r.ok) {
    console.error('FAIL: all-modules build rejected at stage ' + r.stage + ':');
    console.error((r.log || '').slice(-2500));
    failed = true;
  } else {
    console.log('✓ all-modules /play build ok (' + r.size + ' bytes, ' +
      r.build_time_ms + ' ms)');
  }
} catch (e) {
  console.error('FAIL: all-modules threw:', e);
  console.error(srvLog.slice(-1500));
  failed = true;
} finally {
  srv.kill('SIGTERM');
  await sleep(300);
}

if (failed) process.exit(1);
console.log('\nAll-modules compile smoke-test complete.');
