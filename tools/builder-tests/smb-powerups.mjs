// Engine v5 — SMB power-ups + fireballs codegen + cc65 compile.
//   power-up state machine (small/super/fire) + Starman timer
//   items: Super Mushroom / Fire Flower / Starman / 1-Up (scene AI = item)
//   fireballs: 2-slot pool thrown with B in the fire state
// Gated on BW_SMB_POWERUPS (smb game style + engine v5); pre-v5 / non-smb emits
// nothing, so the golden ROM stays byte-identical.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = new URL('../..', import.meta.url).pathname;
const WEB = path.join(ROOT, 'tools', 'tile_editor_web');
const PORT = 18786;

globalThis.window = globalThis;
globalThis.NES_TARGET_ENGINE = 5;
for (const f of ['sprite-render.js', 'builder-assembler.js', 'builder-modules.js', 'builder-validators.js']) {
  new Function(fs.readFileSync(path.join(WEB, f), 'utf8'))();
}
const tpl = fs.readFileSync(path.join(WEB, 'builder-templates/platformer.c'), 'utf8');

function mkCells(w, h) {
  return Array.from({ length: h }, () => Array.from({ length: w }, () => ({ tile: 1, palette: 0, empty: false })));
}
function makeState() {
  const behaviour = Array.from({ length: 30 }, () => Array(32).fill(0));
  for (let c = 0; c < 32; c++) behaviour[28][c] = 1; // ground row
  const s = {
    name: 'smb-powerups', version: 1, universal_bg: 0x21,
    sprites: [
      { role: 'player', name: 'hero', width: 2, height: 2, cells: mkCells(2, 2) },
      { role: 'enemy', name: 'Goomba', width: 2, height: 2, cells: mkCells(2, 2) },
      { role: 'pickup', name: 'Mushroom', width: 2, height: 2, cells: mkCells(2, 2) },
      { role: 'pickup', name: 'Flower', width: 2, height: 2, cells: mkCells(2, 2) },
    ],
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    sprite_tiles: Array.from({ length: 256 }, () => ({ pixels: Array.from({ length: 8 }, () => Array(8).fill(0)), name: '' })),
    bg_tiles: Array.from({ length: 256 }, () => ({ pixels: Array.from({ length: 8 }, () => Array(8).fill(0)), name: '' })),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x0F, 0x10, 0x30] })),
    backgrounds: [{ name: 'bg', dimensions: { screens_x: 1, screens_y: 1 },
      nametable: Array.from({ length: 30 }, () => Array.from({ length: 32 }, () => ({ tile: 0, palette: 0 }))), behaviour }],
    behaviour_types: [
      { id: 0, name: 'none' }, { id: 1, name: 'solid_ground' }, { id: 2, name: 'wall' },
      { id: 3, name: 'platform' }, { id: 4, name: 'door' }, { id: 5, name: 'trigger' }, { id: 6, name: 'ladder' },
    ],
    selectedBgIdx: 0, builder: window.BuilderDefaults(),
  };
  const m = s.builder.modules;
  m.game.config.type = 'smb';
  m.players.submodules.player1.config.maxHp = 3;
  m.damage.enabled = true;
  m.powerups.enabled = true;
  m.scene.config.instances = [
    { id: 1, spriteIdx: 1, x: 96, y: 200, ai: 'goomba', speed: 1 },
    { id: 2, spriteIdx: 2, x: 130, y: 200, ai: 'item', power: 'mushroom' },
    { id: 3, spriteIdx: 3, x: 160, y: 200, ai: 'item', power: 'fireflower' },
    { id: 4, spriteIdx: 2, x: 190, y: 200, ai: 'item', power: 'star' },
    { id: 5, spriteIdx: 2, x: 210, y: 200, ai: 'item', power: 'oneup' },
  ];
  return s;
}

// --- Codegen: v5 emits the power-up flag, all four items, and the fireball path.
{
  const out = window.BuilderAssembler.assemble(makeState(), tpl);
  const need = [
    /#define BW_SMB_POWERUPS 1/,
    /#define BW_FIREBALL_TILE 9/,
    /if \(smb_pstate < 1\) smb_pstate = 1;/,   // mushroom
    /smb_pstate = 2;/,                          // fire flower
    /smb_star = BW_STAR_FRAMES;/,               // starman
    /player_hp = PLAYER_MAX_HP;.*1-Up/,         // 1-up heal
    /if \(!smb_star && !player_iframes\)/,       // power-up-aware hurt
  ];
  for (const re of need) {
    if (!re.test(out)) { console.error('FAIL: v5 codegen missing', re); process.exit(1); }
  }
  console.log('✓ engine v5 emits power-ups flag + all four items + fireball hurt path');
}

// --- Engine pin: pre-v5 target emits nothing power-up related. ---
{
  globalThis.NES_TARGET_ENGINE = 4;
  const out = window.BuilderAssembler.assemble(makeState(), tpl);
  if (/#define BW_SMB_POWERUPS/.test(out)) {
    console.error('FAIL: engine v4 target emitted BW_SMB_POWERUPS (should be gated to v5+)');
    process.exit(1);
  }
  globalThis.NES_TARGET_ENGINE = 5;
  console.log('✓ pre-v5 target emits no power-up code (golden-ROM safe)');
}

// --- Non-smb game type: power-ups module emits nothing even on v5. ---
{
  const s = makeState();
  s.builder.modules.game.config.type = 'platformer';
  const out = window.BuilderAssembler.assemble(s, tpl);
  if (/#define BW_SMB_POWERUPS/.test(out)) {
    console.error('FAIL: platformer game type emitted BW_SMB_POWERUPS (needs smb)');
    process.exit(1);
  }
  console.log('✓ power-ups need the SMB game type (platformer emits nothing)');
}

// --- cc65 compile of the full v5 build. ---
const srv = spawn('python3', [path.join(ROOT, 'tools', 'playground_server.py')],
  { env: { ...process.env, PLAYGROUND_PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
await sleep(1500);
try {
  const s = makeState();
  const out = window.BuilderAssembler.assemble(s, tpl);
  const r = await (await fetch(`http://127.0.0.1:${PORT}/play`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state: s, playerSpriteIdx: 0, playerStart: { x: 60, y: 120 },
      sceneSprites: [], mode: 'browser', customMainC: out, targetEngine: 5 }),
  })).json();
  if (!r.ok) { console.error('FAIL compile: smb-powerups build rejected:', r.stage); console.error((r.log || '').slice(-2800)); process.exit(2); }
  console.log('✓ power-ups + fireballs build compiles via cc65 (' + r.size + ' bytes, engine v' + r.engineVersion + ')');
} finally {
  srv.kill('SIGTERM');
  await sleep(300);
}
console.log('\nSMB power-ups (engine v5) smoke-test complete.');
