// Engine v6 — interactive SMB blocks (coin / question / brick) codegen + cc65
// compile. Gated on the SMB game type + engine v6; pre-v6 / non-smb emits
// nothing, so the golden ROM stays byte-identical.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = new URL('../..', import.meta.url).pathname;
const WEB = path.join(ROOT, 'tools', 'tile_editor_web');
const PORT = 18787;

globalThis.window = globalThis;
globalThis.NES_TARGET_ENGINE = 6;
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
    name: 'smb-blocks', version: 1, universal_bg: 0x21,
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
  m.players.submodules.player1.config.maxHp = 3;
  m.powerups.enabled = true;   // so ? / brick react to the power state
  m.blocks.enabled = true;
  m.blocks.config.blockList = [
    { x: 10, y: 20, kind: 'coin' },
    { x: 12, y: 18, kind: 'question' },
    { x: 14, y: 18, kind: 'brick' },
  ];
  return s;
}

// Codegen: v6 emits the block table + all three kinds; pre-v6 / non-smb emit nothing.
{
  const out = window.BuilderAssembler.assemble(makeState(), tpl);
  for (const re of [/#define BW_SMB_BLOCKS 1/, /#define BW_BLOCK_COUNT 3/, /bw_block_tbl\[\]/, /bw_coins\+\+/]) {
    if (!re.test(out)) { console.error('FAIL: v6 blocks codegen missing', re); process.exit(1); }
  }
  console.log('✓ engine v6 emits the block table + coin/question/brick handling');

  globalThis.NES_TARGET_ENGINE = 5;
  if (/#define BW_SMB_BLOCKS/.test(window.BuilderAssembler.assemble(makeState(), tpl))) {
    console.error('FAIL: engine v5 target emitted BW_SMB_BLOCKS (should be gated to v6+)'); process.exit(1);
  }
  globalThis.NES_TARGET_ENGINE = 6;
  const plat = makeState(); plat.builder.modules.game.config.type = 'platformer';
  if (/#define BW_SMB_BLOCKS/.test(window.BuilderAssembler.assemble(plat, tpl))) {
    console.error('FAIL: platformer game type emitted BW_SMB_BLOCKS (needs smb)'); process.exit(1);
  }
  console.log('✓ blocks need engine v6 + the SMB game type (else byte-identical)');
}

// cc65 compile of the full v6 build.
const srv = spawn('python3', [path.join(ROOT, 'tools', 'playground_server.py')],
  { env: { ...process.env, PLAYGROUND_PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
await sleep(1500);
try {
  const s = makeState();
  const out = window.BuilderAssembler.assemble(s, tpl);
  const r = await (await fetch(`http://127.0.0.1:${PORT}/play`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state: s, playerSpriteIdx: 0, playerStart: { x: 60, y: 120 },
      sceneSprites: [], mode: 'browser', customMainC: out, targetEngine: 6 }),
  })).json();
  if (!r.ok) { console.error('FAIL compile: smb-blocks build rejected:', r.stage); console.error((r.log || '').slice(-2500)); process.exit(2); }
  console.log('✓ blocks build compiles via cc65 (' + r.size + ' bytes, engine v' + r.engineVersion + ')');
} finally {
  srv.kill('SIGTERM');
  await sleep(300);
}
console.log('\nSMB blocks (engine v6) smoke-test complete.');
