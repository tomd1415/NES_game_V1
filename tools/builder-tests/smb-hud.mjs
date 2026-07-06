// Engine v7 — SMB HUD (coins / time / score / lives) codegen + cc65 compile,
// plus a behavioural check that the count-down timer decrements. Gated on the
// SMB game type + engine v7; pre-v7 / non-smb emits nothing (golden-ROM safe).
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = new URL('../..', import.meta.url).pathname;
const WEB = path.join(ROOT, 'tools', 'tile_editor_web');
const PORT = 18789;

globalThis.window = globalThis;
globalThis.NES_TARGET_ENGINE = 7;
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
    name: 'smb-hud', version: 1, universal_bg: 0x21,
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
  m.damage.enabled = true;
  m.smbhud.enabled = true;
  m.smbhud.config.startTime = 300;
  m.smbhud.config.startLives = 3;
  return s;
}

{
  const out = window.BuilderAssembler.assemble(makeState(), tpl);
  for (const re of [/#define BW_SMB_HUD 1/, /#define BW_HUD_START_TIME 300/, /#define BW_HUD_START_LIVES 3/, /bw_hud_digit/]) {
    if (!re.test(out)) { console.error('FAIL: v7 HUD codegen missing', re); process.exit(1); }
  }
  globalThis.NES_TARGET_ENGINE = 6;
  if (/#define BW_SMB_HUD/.test(window.BuilderAssembler.assemble(makeState(), tpl))) {
    console.error('FAIL: engine v6 target emitted BW_SMB_HUD'); process.exit(1);
  }
  globalThis.NES_TARGET_ENGINE = 7;
  console.log('✓ engine v7 emits the HUD (coins/time/score/lives); pre-v7 does not');
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
      sceneSprites: [], mode: 'browser', customMainC: out, targetEngine: 7 }),
  })).json();
  if (!r.ok) { console.error('FAIL compile: smb-hud rejected:', r.stage); console.error((r.log || '').slice(-2500)); process.exit(2); }
  console.log('✓ HUD build compiles via cc65 (' + r.size + ' bytes, engine v' + r.engineVersion + ')');

  // Behavioural: the timer digits (top-centre) count down over time in jsnes.
  const mm = { exports: {} };
  new Function('module', 'exports', fs.readFileSync(path.join(WEB, 'jsnes.min.js'), 'utf8'))(mm, mm.exports);
  const jsnes = mm.exports.NES ? mm.exports : window.jsnes;
  let romStr = ''; const bb = Buffer.from(r.rom_b64, 'base64');
  for (let i = 0; i < bb.length; i++) romStr += String.fromCharCode(bb[i]);
  const nes = new jsnes.NES({ onFrame: () => {}, onAudioSample: () => {} });
  nes.loadROM(romStr);
  // Sprite tiles for the three TIME digits should change as it counts down
  // (startTime 300 → within ~a few seconds the ones digit ticks). Read the OAM
  // tile of the ones-digit sprite and confirm it changes across ~2s.
  for (let i = 0; i < 30; i++) nes.frame();
  // Find the HUD ones-digit sprite (x≈136, y≈8) in OAM.
  function onesTile() {
    const m = nes.ppu.spriteMem;
    for (let i = 0; i < 64; i++) { const o = i * 4; if (m[o] === 8 && m[o + 3] === 136) return m[o + 1]; }
    return -1;
  }
  const t0 = onesTile();
  for (let i = 0; i < 130; i++) nes.frame();   // ~2.1s; timer ticks ~every 0.4s → several units
  const t1 = onesTile();
  if (t0 < 0 || t1 < 0) { console.error('FAIL: HUD time digit not found in OAM (t0=' + t0 + ', t1=' + t1 + ')'); process.exit(3); }
  if (t0 === t1) { console.error('FAIL: HUD timer did not count down (digit tile stayed ' + t0 + ')'); process.exit(3); }
  console.log('✓ HUD timer counts down in jsnes (ones-digit tile ' + t0 + ' → ' + t1 + ')');
} finally {
  srv.kill('SIGTERM');
  await sleep(300);
}
console.log('\nSMB HUD (engine v7) smoke-test complete.');
