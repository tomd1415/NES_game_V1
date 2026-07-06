// Engine v8 — pipes (Down-to-enter warps) + flagpole finish: codegen + cc65
// compile. Gated on the SMB game type + engine v8; pre-v8 / non-smb emits
// nothing (golden-ROM safe).
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = new URL('../..', import.meta.url).pathname;
const WEB = path.join(ROOT, 'tools', 'tile_editor_web');
const PORT = 18791;

globalThis.window = globalThis;
globalThis.NES_TARGET_ENGINE = 8;
for (const f of ['sprite-render.js', 'builder-assembler.js', 'builder-modules.js', 'builder-validators.js']) {
  new Function(fs.readFileSync(path.join(WEB, f), 'utf8'))();
}
const tpl = fs.readFileSync(path.join(WEB, 'builder-templates/platformer.c'), 'utf8');

function mkCells(w, h) {
  return Array.from({ length: h }, () => Array.from({ length: w }, () => ({ tile: 1, palette: 0, empty: false })));
}
function makeState() {
  const behaviour = Array.from({ length: 30 }, () => Array(32).fill(0));
  for (let c = 0; c < 32; c++) behaviour[28][c] = 1;
  const s = {
    name: 'smb-level', version: 1, universal_bg: 0x21,
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
  const m = s.builder.modules;
  m.game.config.type = 'smb';
  m.pipes.enabled = true;
  m.pipes.config.pipeList = [{ x: 10, y: 26, spawnX: 24, spawnY: 40 }];
  m.flagpole.enabled = true;
  m.flagpole.config.x = 28;
  // win_condition is on by default (BuilderDefaults) → BW_WIN_ENABLED for the flag.
  return s;
}

{
  const out = window.BuilderAssembler.assemble(makeState(), tpl);
  for (const re of [/#define BW_SMB_PIPES 1/, /bw_pipe_tbl\[\]/, /hold Down on a pipe cell/,
    /#define BW_SMB_FLAG 1/, /#define BW_FLAG_PX 224/, /bw_won = 1;/]) {
    if (!re.test(out)) { console.error('FAIL: v8 codegen missing', re); process.exit(1); }
  }
  globalThis.NES_TARGET_ENGINE = 7;
  if (/#define BW_SMB_PIPES/.test(window.BuilderAssembler.assemble(makeState(), tpl))) {
    console.error('FAIL: engine v7 target emitted BW_SMB_PIPES'); process.exit(1);
  }
  globalThis.NES_TARGET_ENGINE = 8;
  console.log('✓ engine v8 emits pipes (Down-warp) + flagpole finish; pre-v8 does not');
}

const srv = spawn('python3', [path.join(ROOT, 'tools', 'playground_server.py')],
  { env: { ...process.env, PLAYGROUND_PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
await sleep(1500);
try {
  const s = makeState();
  const out = window.BuilderAssembler.assemble(s, tpl);
  const r = await (await fetch(`http://127.0.0.1:${PORT}/play`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state: s, playerSpriteIdx: 0, playerStart: { x: 60, y: 120 },
      sceneSprites: [], mode: 'browser', customMainC: out, targetEngine: 8 }),
  })).json();
  if (!r.ok) { console.error('FAIL compile: smb-level rejected:', r.stage); console.error((r.log || '').slice(-2500)); process.exit(2); }
  console.log('✓ pipes + flagpole build compiles via cc65 (' + r.size + ' bytes, engine v' + r.engineVersion + ')');
} finally {
  srv.kill('SIGTERM');
  await sleep(300);
}
console.log('\nSMB level structure (engine v8) smoke-test complete.');
