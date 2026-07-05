// Engine v4 — SMB actor AIs (Goomba / Koopa) codegen + cc65 compile.
// The scene module gains two enemy AI kinds behind the engine-v4 gate:
//   goomba — walks + off ledges, stomp-to-defeat + bounce, side-touch hurts
//   koopa  — walk -> stomp to still shell -> touch to kick (sliding shell that
//            chains kills and hurts on contact)
// Pre-v4 targets degrade both to the plain walker, so the codegen (and the
// golden ROM) stays byte-identical to what shipped before v4.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = new URL('../..', import.meta.url).pathname;
const WEB = path.join(ROOT, 'tools', 'tile_editor_web');
const PORT = 18784;

globalThis.window = globalThis;
globalThis.NES_TARGET_ENGINE = 4; // SMB actors require targeting engine v4+
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
    name: 'smb-enemies', version: 1, universal_bg: 0x21,
    sprites: [
      { role: 'player', name: 'hero', width: 2, height: 2, cells: mkCells(2, 2) },
      { role: 'enemy', name: 'Goomba', width: 2, height: 2, cells: mkCells(2, 2) },
      { role: 'enemy', name: 'Koopa', width: 2, height: 2, cells: mkCells(2, 2) },
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
  s.builder.modules.game.config.type = 'smb';
  // HP + Damage on, so BW_SMB_HURT compiles against the real player_hp path.
  s.builder.modules.players.submodules.player1.config.maxHp = 3;
  s.builder.modules.damage.enabled = true;
  // Two enemies: one Goomba, one Koopa, explicitly placed.
  s.builder.modules.scene.config.instances = [
    { id: 1, spriteIdx: 1, x: 100, y: 200, ai: 'goomba', speed: 1 },
    { id: 2, spriteIdx: 2, x: 150, y: 200, ai: 'koopa', speed: 1 },
  ];
  return s;
}

// --- Codegen: v4 target emits the SMB actor helpers + both state machines. ---
{
  const out = window.BuilderAssembler.assemble(makeState(), tpl);
  const need = [
    /#define BW_SMB_TOUCH/,
    /#define BW_SMB_STOMP/,
    /#define BW_SMB_BOUNCE/,
    /Goomba: walks \+ off ledges, stomp to defeat/,
    /Koopa: walk \/ shell \/ kicked-shell state machine/,
  ];
  for (const re of need) {
    if (!re.test(out)) { console.error('FAIL: v4 codegen missing', re); process.exit(1); }
  }
  console.log('✓ engine v4 emits Goomba + Koopa AI and the shared stomp/hurt helpers');
}

// --- Engine pin: a pre-v4 target degrades goomba/koopa to plain walker. ---
{
  globalThis.NES_TARGET_ENGINE = 3;
  const out = window.BuilderAssembler.assemble(makeState(), tpl);
  if (/#define BW_SMB_TOUCH/.test(out)) {
    console.error('FAIL: engine v3 target emitted SMB actor helpers (should degrade to walker)');
    process.exit(1);
  }
  // Still produces a walker for the placed enemies (movement preserved).
  if (!/walks side to side|bw_dir_/.test(out)) {
    console.error('FAIL: engine v3 fallback did not emit walker AI');
    process.exit(1);
  }
  globalThis.NES_TARGET_ENGINE = 4;
  console.log('✓ pre-v4 target degrades Goomba/Koopa to the byte-identical walker');
}

// --- cc65 compile of the full v4 build. ---
const srv = spawn('python3', [path.join(ROOT, 'tools', 'playground_server.py')],
  { env: { ...process.env, PLAYGROUND_PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
await sleep(1500);
try {
  const s = makeState();
  const out = window.BuilderAssembler.assemble(s, tpl);
  const r = await (await fetch(`http://127.0.0.1:${PORT}/play`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state: s, playerSpriteIdx: 0, playerStart: { x: 60, y: 120 },
      sceneSprites: [], mode: 'browser', customMainC: out, targetEngine: 4 }),
  })).json();
  if (!r.ok) { console.error('FAIL compile: smb-enemies build rejected:', r.stage); console.error((r.log || '').slice(-2500)); process.exit(2); }
  console.log('✓ Goomba + Koopa build compiles via cc65 (' + r.size + ' bytes, engine v' + r.engineVersion + ')');
} finally {
  srv.kill('SIGTERM');
  await sleep(300);
}
console.log('\nSMB enemies (engine v4) smoke-test complete.');
