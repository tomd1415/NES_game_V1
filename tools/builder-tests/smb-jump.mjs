// Engine v3 — SMB variable-height jump (game style 'smb') codegen + compile.
// The platformer path stays byte-identical (no BW_SMB_JUMP); smb adds the flag
// and must compile via cc65.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = new URL('../..', import.meta.url).pathname;
const WEB = path.join(ROOT, 'tools', 'tile_editor_web');
const PORT = 18783;

globalThis.window = globalThis;
globalThis.NES_TARGET_ENGINE = 3; // smb requires targeting engine v3+
for (const f of ['sprite-render.js', 'builder-assembler.js', 'builder-modules.js', 'builder-validators.js']) {
  new Function(fs.readFileSync(path.join(WEB, f), 'utf8'))();
}
const tpl = fs.readFileSync(path.join(WEB, 'builder-templates/platformer.c'), 'utf8');

function mkCells(w, h) {
  return Array.from({ length: h }, () => Array.from({ length: w }, () => ({ tile: 1, palette: 0, empty: false })));
}
function makeState(gameType) {
  const behaviour = Array.from({ length: 30 }, () => Array(32).fill(0));
  for (let c = 0; c < 32; c++) behaviour[28][c] = 1; // ground
  const s = {
    name: 'smb', version: 1, universal_bg: 0x21,
    sprites: [{ role: 'player', name: 'hero', width: 2, height: 2, cells: mkCells(2, 2) }],
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
  s.builder.modules.game.config.type = gameType;
  return s;
}

// Codegen: smb emits BW_SMB_JUMP; platformer does not.
{
  // Check for the *#define* that ENABLES the feature (the template itself has
  // `#ifdef BW_SMB_JUMP` guard lines, which must NOT count).
  const DEF = /#define BW_SMB_JUMP 1/;
  const smb = window.BuilderAssembler.assemble(makeState('smb'), tpl);
  if (!DEF.test(smb)) { console.error('FAIL: smb did not #define BW_SMB_JUMP'); process.exit(1); }
  const plat = window.BuilderAssembler.assemble(makeState('platformer'), tpl);
  if (DEF.test(plat)) { console.error('FAIL: platformer #defined BW_SMB_JUMP (should be byte-identical)'); process.exit(1); }
  // And pre-v3 target must not enable it even for smb (engine pin).
  globalThis.NES_TARGET_ENGINE = 2;
  const smbV2 = window.BuilderAssembler.assemble(makeState('smb'), tpl);
  if (DEF.test(smbV2)) { console.error('FAIL: engine v2 target #defined BW_SMB_JUMP'); process.exit(1); }
  globalThis.NES_TARGET_ENGINE = 3;
  console.log('✓ smb emits BW_SMB_JUMP; platformer + pre-v3 do not');
}

// cc65 compile of the SMB build.
const srv = spawn('python3', [path.join(ROOT, 'tools', 'playground_server.py')],
  { env: { ...process.env, PLAYGROUND_PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
await sleep(1500);
try {
  const s = makeState('smb');
  const out = window.BuilderAssembler.assemble(s, tpl);
  const r = await (await fetch(`http://127.0.0.1:${PORT}/play`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state: s, playerSpriteIdx: 0, playerStart: { x: 60, y: 120 }, sceneSprites: [], mode: 'browser', customMainC: out, targetEngine: 3 }),
  })).json();
  if (!r.ok) { console.error('FAIL compile: smb build rejected:', r.stage); console.error((r.log || '').slice(-2000)); process.exit(2); }
  console.log('✓ smb (variable-jump) build compiles via cc65 (' + r.size + ' bytes, engine v' + r.engineVersion + ')');
} finally {
  srv.kill('SIGTERM');
  await sleep(300);
}
console.log('\nSMB variable-jump (engine v3) smoke-test complete.');
