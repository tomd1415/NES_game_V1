#!/usr/bin/env node
// ASM engine generator — Phase 2b: broaden the ai_update A/B across SHAPES.
//
// asm-ai.mjs proves C ≡ ASM for one walker/chaser/flyer/patrol at 2x2 size. This
// widens the corpus to the dimensions that actually change the ASM's control
// flow — sprite SIZE and SPEED — in a single dual-build:
//   * bw_sprite_blocked probes the whole leading edge across the sprite body, so
//     the sprite HEIGHT (sh) sets the probe loop's iteration count and the WIDTH
//     (sw) sets the edge column / world-edge math. We mix 1x1, 2x2, 3x3, 1x3 and
//     3x1 enemies so every combination of those is exercised.
//   * per-instance speed (1..4) drives add_speed/sub_speed by different strides.
// Everything is matched-tick / RAM-state compared exactly like asm-ai.mjs; a
// single position diff at any matched tick is a real ASM bug.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as H from './lib/render-harness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const jsnes = require(path.join(H.ROOT, 'tools', 'tile_editor_web', 'jsnes.min.js'));

const PORT_C = 18792, PORT_A = 18793;
let failed = false;
const ok = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };

const win = H.loadBuilderModules();
new Function(fs.readFileSync(path.join(H.WEB, 'engine-version.js'), 'utf8'))();  // target latest engine
const tpl = H.readTemplate();

// One enemy sprite per distinct (w,h) so instances can pick a body shape.
const SIZES = [[1, 1], [2, 2], [3, 3], [1, 3], [3, 1]];
const sizeIdx = (w, h) => 1 + SIZES.findIndex(([sw, sh]) => sw === w && sh === h);

// Walkers of every size at two speeds (turn at the walls / edges), plus each
// non-walker type at a NON-2x2 size + a high speed, so chaser/flyer/patrol run
// with body shapes their asm-ai.mjs instances never used.
const INSTANCES = [];
for (const [w, h] of SIZES) for (const speed of [1, 3])
  INSTANCES.push({ spriteIdx: sizeIdx(w, h), x: 24 + INSTANCES.length * 13, y: 196, ai: 'walker', speed });
INSTANCES.push({ spriteIdx: sizeIdx(3, 3), x: 40, y: 196, ai: 'chaser', speed: 4 });
INSTANCES.push({ spriteIdx: sizeIdx(1, 1), x: 232, y: 60, ai: 'chaser', speed: 2 });
INSTANCES.push({ spriteIdx: sizeIdx(3, 1), x: 20, y: 90, ai: 'flyer', speed: 2 });
INSTANCES.push({ spriteIdx: sizeIdx(1, 3), x: 120, y: 196, ai: 'patrol', speed: 3 });
const N = INSTANCES.length;

function makeState() {
  const cols = 32, rows = 30, floorRow = 26;
  const beh = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let c = 0; c < cols; c++) beh[floorRow][c] = 1;
  for (const wc of [8, 16, 24]) for (let r = floorRow - 1; r >= floorRow - 8; r--) beh[r][wc] = 2;
  const bg = {
    name: 'bg', dimensions: { screens_x: 1, screens_y: 1 },
    nametable: Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ tile: 0, palette: 0 }))),
    behaviour: beh,
  };
  const sprites = [{ role: 'player', name: 'hero', width: 2, height: 2, cells: H.mkCells(2, 2) }];
  for (const [w, h] of SIZES) sprites.push({ role: 'enemy', name: `e${w}x${h}`, width: w, height: h, cells: H.mkCells(w, h) });
  const s = {
    name: 'corpus', version: 1, universal_bg: 0x21, sprites,
    sprite_tiles: H.blankPool(), bg_tiles: H.blankPool(),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x0F, 0x10, 0x30] })),
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    backgrounds: [bg], behaviour_types: H.BEHAVIOUR_TYPES, selectedBgIdx: 0, builder: win.BuilderDefaults(),
  };
  s.builder.modules.game.config.type = 'platformer';
  s.builder.modules.scene.config.instances = INSTANCES.map((it) => ({ ...it }));
  return s;
}

const XBASE = 0x0712, YBASE = XBASE + N;
function withProbe(mainC) {
  let inj = '{static unsigned int _tk; ++_tk;'
    + '(*(unsigned char*)0x0710)=(unsigned char)(_tk&0xFF);(*(unsigned char*)0x0711)=(unsigned char)(_tk>>8);';
  for (let i = 0; i < N; i++) inj += `(*(unsigned char*)${XBASE + i})=(unsigned char)ss_x[${i}];`;
  for (let i = 0; i < N; i++) inj += `(*(unsigned char*)${YBASE + i})=(unsigned char)ss_y[${i}];`;
  inj += '} ';
  return mainC.replace('while (oam_idx < 256) {', inj + 'while (oam_idx < 256) {');
}

const boot = (b) => { const n = new jsnes.NES({ onFrame() {}, onAudioSample() {} }); n.loadROM(b.toString('binary')); return n; };
const rd = (n, a) => n.cpu.mem[a] & 0xFF;
const rd16 = (n, a) => (n.cpu.mem[a] & 0xFF) | ((n.cpu.mem[a + 1] & 0xFF) << 8);
const TICK = 0x0710;
const xs = (n) => { const a = []; for (let i = 0; i < N; i++) a.push(rd(n, XBASE + i)); return a; };
const ys = (n) => { const a = []; for (let i = 0; i < N; i++) a.push(rd(n, YBASE + i)); return a; };

const srvC = await H.startServer(PORT_C, { PLAYGROUND_NO_ASM: '1' });
const srvA = await H.startServer(PORT_A, { PLAYGROUND_ASM_AI: '1' });
try {
  const s = makeState();
  const mainC = win.BuilderAssembler.assemble(s, tpl);
  const tm = mainC.match(/ss_ai_type\[\d+\][^;]*=\s*\{([^}]*)\}/);
  const types = tm ? tm[1].split(',').map((v) => v.trim()) : [];
  for (const [t, name] of [['4', 'patrol'], ['3', 'flyer'], ['2', 'chaser'], ['1', 'walker']])
    if (!types.includes(t)) bad(`ss_ai_type has no ${name} (${t}) — instance degraded? types=[${types}]`);
  const payload = {
    state: s, playerSpriteIdx: 0, playerStart: { x: 120, y: 196 }, mode: 'browser',
    customMainC: withProbe(mainC),
    sceneSprites: INSTANCES.map((it) => ({ spriteIdx: it.spriteIdx, x: it.x, y: it.y })),
  };
  const rc = await H.buildRom(PORT_C, payload);
  const ra = await H.buildRom(PORT_A, payload);
  if (!rc.ok) bad(`C build failed (${rc.stage}): ` + String(rc.log || '').slice(-400));
  else if (!ra.ok) bad(`ASM build failed (${ra.stage}): ` + String(ra.log || '').slice(-400));
  else if (rc.romBytes.equals(ra.romBytes)) bad('ASM ROM == C ROM (NES_ASM_AI did not engage)');
  else {
    const c = boot(rc.romBytes), a = boot(ra.romBytes);
    for (let i = 0; i < 40; i++) { c.frame(); a.frame(); }
    let diffs = 0, firstDiff = -1, compared = 0, movers = 0;
    const start = xs(c), startY = ys(c);
    const everMoved = new Array(N).fill(false);
    let turned = false; const wminX = start.slice();
    for (let step = 0; step < 16000 && compared < 300; step++) {
      const tc = rd16(c, TICK), ta = rd16(a, TICK);
      if (tc > 60000 || ta > 60000) { bad('tick counter overflowed before enough samples'); break; }
      if (tc !== ta) { if (tc < ta) c.frame(); else a.frame(); continue; }
      const cx = xs(c), ax = xs(a), cy = ys(c), ay = ys(a);
      for (let i = 0; i < N; i++) {
        if (cx[i] !== ax[i] || cy[i] !== ay[i]) { diffs++; if (firstDiff < 0) firstDiff = tc; }
        if (cx[i] !== start[i] || cy[i] !== startY[i]) everMoved[i] = true;
        if (cx[i] < wminX[i]) wminX[i] = cx[i]; else if (cx[i] > wminX[i] + 6) turned = true;
      }
      compared++;
      c.frame(); a.frame();
    }
    movers = everMoved.filter(Boolean).length;
    if (compared < 250) bad(`too few matched-tick samples (${compared}) — harness did not run`);
    else if (movers < N - 2) bad(`only ${movers}/${N} enemies moved — corpus under-exercised`);
    else if (!turned) bad('no walker reversed — the bw_sprite_blocked turn path was not exercised');
    else if (diffs === 0)
      ok(`ai_update corpus: C ≡ ASM ss_x/ss_y for ${N} mixed enemies (sizes 1x1/2x2/3x3/1x3/3x1, `
        + `speeds 1-4, all 4 AI types) at every matched tick over ${compared} ticks`);
    else bad(`divergence — ${diffs} position byte-diffs (first at tick ${firstDiff}) over ${compared} matched ticks`);
  }
} catch (e) {
  bad('threw: ' + (e && e.stack || e));
} finally {
  await H.stopServer(srvC.srv);
  await H.stopServer(srvA.srv);
}

if (failed) process.exit(1);
console.log('\nasm-ai-corpus: the ASM ai_update matches the C across mixed sprite sizes, speeds, and AI types.');
