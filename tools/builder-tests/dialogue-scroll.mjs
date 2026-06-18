// Scrolling-dialogue compile smoke-test.
//
// Dialogue on a multi-screen (scrolling) background writes its text at the
// CAMERA-relative nametable position so the box stays on the visible screen
// (web-feedback: "I cannot see the text on the game screen at all" — the box
// opened but, on a scrolling map, the old fixed-NT0 draw landed off-screen).
// That path is `#ifdef SCROLL_BUILD`-only, so the 1x1 tests never compiled it.
// This builds a real 2x1 scrolling project with dialogue and asserts the ROM
// compiles (the camera-relative C + the bg_world_tiles restore).
//
// See docs/changelog/changelog-implemented.md and round2-dialogue.mjs (A9b).

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = '/home/duguid/projects/nesgame/attempt1';
const WEB  = path.join(ROOT, 'tools', 'tile_editor_web');
const PORT = 18783;
const W = 64, H = 30;   // 2 screens wide x 1 tall

globalThis.window = globalThis;
for (const f of ['sprite-render.js', 'builder-assembler.js',
    'builder-modules.js', 'builder-validators.js']) {
  new Function(fs.readFileSync(path.join(WEB, f), 'utf8'))();
}
const tpl = fs.readFileSync(path.join(WEB, 'builder-templates/platformer.c'), 'utf8');

const mkCells = (w, h) => Array.from({ length: h }, () =>
  Array.from({ length: w }, () => ({ tile: 1, palette: 0, empty: false })));
const blankPool = () => Array.from({ length: 256 }, () => ({
  pixels: Array.from({ length: 8 }, () => Array(8).fill(0)), name: '' }));

function makeState() {
  const s = {
    name: 'dlgscroll', version: 1, universal_bg: 0x0F,
    sprites: [
      { role: 'player', name: 'hero', width: 2, height: 2, cells: mkCells(2, 2) },
      { role: 'npc',    name: 'old',  width: 2, height: 2, cells: mkCells(2, 2) },
    ],
    sprite_tiles: blankPool(), bg_tiles: blankPool(),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x30, 0x10, 0x20] })),
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    backgrounds: [{
      name: 'bg', dimensions: { screens_x: 2, screens_y: 1 },
      nametable: Array.from({ length: H }, () =>
        Array.from({ length: W }, () => ({ tile: 0, palette: 0 }))),
      behaviour: (() => {
        const m = Array.from({ length: H }, () => Array(W).fill(0));
        for (let c = 0; c < W; c++) m[28][c] = 1;
        return m;
      })(),
    }],
    behaviour_types: [
      { id: 0, name: 'none' }, { id: 1, name: 'solid_ground' }, { id: 2, name: 'wall' },
      { id: 3, name: 'platform' }, { id: 4, name: 'door' }, { id: 5, name: 'trigger' },
      { id: 6, name: 'ladder' },
    ],
    selectedBgIdx: 0, builder: window.BuilderDefaults(),
  };
  s.builder.modules.dialogue.enabled = true;
  // Per-NPC override too, so the per-NPC scrolling path compiles as well.
  s.builder.modules.scene.config.instances = [
    { id: 'n', spriteIdx: 1, x: 300, y: 120, ai: 'static', text: 'HELLO THERE' },
  ];
  return s;
}

const srv = spawn('python3', [path.join(ROOT, 'tools', 'playground_server.py')],
  { env: { ...process.env, PLAYGROUND_PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
await sleep(1500);

let failed = false;
try {
  const s = makeState();
  const customMainC = window.BuilderAssembler.assemble(s, tpl);
  if (!/bg_world_tiles\[dlg_src_base/.test(customMainC)) {
    console.error('FAIL: assembled C is missing the camera-relative SCROLL_BUILD dialogue path');
    failed = true;
  }
  const res = await fetch(`http://127.0.0.1:${PORT}/play`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      state: s, playerSpriteIdx: 0, playerStart: { x: 24, y: 120 },
      sceneSprites: [{ spriteIdx: 1, x: 300, y: 120 }],
      mode: 'browser', customMainC,
    }),
  });
  const r = await res.json();
  if (!r.ok) {
    console.error('FAIL: 2x1 scrolling dialogue project did not compile at stage ' + r.stage + ':');
    console.error((r.log || '').slice(-2000));
    failed = true;
  } else {
    console.log('✓ 2x1 scrolling dialogue (incl. per-NPC) compiles (' + r.size + ' bytes)');
  }
} catch (e) {
  console.error('FAIL: threw:', e);
  failed = true;
} finally {
  srv.kill('SIGTERM');
  await sleep(300);
}

if (failed) process.exit(1);
console.log('\nScrolling-dialogue compile smoke-test complete.');
