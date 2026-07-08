#!/usr/bin/env node
// ASM engine — Phase 2c: the TOP-DOWN player update on hand-written 6502.
//
// player_asm.s (td_update) is the 4-way top-down move+collision, linked only
// under NES_ASM_PLAYER (a test toggle, PLAYGROUND_ASM_PLAYER; NOT shipped). Its
// logic is proven in asm-lab (functions/td_update); this proves the WIRED build
// in BOTH px/py widths: a 1-screen project (u8 px/py) and a 2-screen scroll
// project (u16), each with a moving player (holds RIGHT+DOWN, bumps walls),
// dual-built pure C (PLAYGROUND_NO_ASM=1) vs the ASM player (PLAYGROUND_ASM_PLAYER=1),
// matched-tick comparing the real player px/py. Any diff is a real bug.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as H from './lib/render-harness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const jsnes = require(path.join(H.ROOT, 'tools', 'tile_editor_web', 'jsnes.min.js'));

const PORT_C = 18788, PORT_A = 18789;
let failed = false;
const ok = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };

const win = H.loadBuilderModules();
new Function(fs.readFileSync(path.join(H.WEB, 'engine-version.js'), 'utf8'))();  // target latest engine
const tpl = H.readTemplate();

function makeState(screensX) {
  const cols = 32 * screensX, rows = 30;
  const beh = Array.from({ length: rows }, () => Array(cols).fill(0));
  // scattered WALL blocks the diagonally-moving player bumps into (top-down: no
  // gravity/floor). Scale positions across however many screens.
  const walls = screensX === 1
    ? [[12, 6], [12, 7], [20, 12], [24, 18], [16, 22], [28, 24]]
    : [[12, 6], [12, 7], [20, 12], [21, 12], [34, 9], [34, 10], [48, 16], [30, 20]];
  for (const [c, r] of walls) beh[r][c] = 2;
  const bg = {
    name: 'bg', dimensions: { screens_x: screensX, screens_y: 1 },
    nametable: Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ tile: 0, palette: 0 }))),
    behaviour: beh,
  };
  const sprites = [{ role: 'player', name: 'hero', width: 2, height: 2, cells: H.mkCells(2, 2) }];
  const s = {
    name: 'tdplayer', version: 1, universal_bg: 0x21, sprites,
    sprite_tiles: H.blankPool(), bg_tiles: H.blankPool(),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x0F, 0x10, 0x30] })),
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    backgrounds: [bg], behaviour_types: H.BEHAVIOUR_TYPES, selectedBgIdx: 0, builder: win.BuilderDefaults(),
  };
  s.builder.modules.game.config.type = 'topdown';
  return s;
}

const TICK = 0x0710, PX = 0x0712, PY = 0x0714, JU = 0x0716;
function withProbe(mainC) {
  const inj = '{static unsigned int _tk; ++_tk;'
    + `(*(unsigned char*)${TICK})=(unsigned char)(_tk&0xFF);(*(unsigned char*)${TICK + 1})=(unsigned char)(_tk>>8);`
    + `(*(unsigned char*)${PX})=(unsigned char)px;(*(unsigned char*)${PX + 1})=(unsigned char)(px>>8);`
    + `(*(unsigned char*)${PY})=(unsigned char)py;(*(unsigned char*)${PY + 1})=(unsigned char)(py>>8);`
    + `(*(unsigned char*)${JU})=(unsigned char)jumping;} `;
  return mainC.replace('while (oam_idx < 256) {', inj + 'while (oam_idx < 256) {');
}

const boot = (b) => { const n = new jsnes.NES({ onFrame() {}, onAudioSample() {} }); n.loadROM(b.toString('binary')); return n; };
const rd16 = (n, a) => (n.cpu.mem[a] & 0xFF) | ((n.cpu.mem[a + 1] & 0xFF) << 8);
const stepMove = (n) => {
  n.buttonDown(1, H.BTN.RIGHT); n.buttonDown(1, H.BTN.DOWN);
  n.frame();
  n.buttonUp(1, H.BTN.RIGHT); n.buttonUp(1, H.BTN.DOWN);
};

async function runCase(screensX) {
  const wide = screensX > 1;
  const label = `${screensX}-screen (${wide ? 'u16' : 'u8'} px/py)`;
  const s = makeState(screensX);
  const mainC = win.BuilderAssembler.assemble(s, tpl);
  if (!/#define BW_GAME_STYLE 1/.test(mainC)) { bad(`${label}: not a top-down build — server gate would not engage`); return; }
  if (wide !== /#define SCROLL_BUILD/.test(mainC)) { /* sanity only; SCROLL_BUILD is #if'd from BG_WORLD_COLS */ }
  const payload = {
    state: s, playerSpriteIdx: 0, playerStart: { x: 24, y: 24 }, mode: 'browser',
    customMainC: withProbe(mainC), sceneSprites: [],
  };
  const rc = await H.buildRom(PORT_C, payload);
  const ra = await H.buildRom(PORT_A, payload);
  if (!rc.ok) { bad(`${label}: C build failed (${rc.stage}): ` + String(rc.log || '').slice(-300)); return; }
  if (!ra.ok) { bad(`${label}: ASM build failed (${ra.stage}): ` + String(ra.log || '').slice(-300)); return; }
  if (rc.romBytes.equals(ra.romBytes)) { bad(`${label}: ASM ROM == C ROM (NES_ASM_PLAYER did not engage)`); return; }

  const c = boot(rc.romBytes), a = boot(ra.romBytes);
  let bootF = 0;
  while (bootF < 400 && (rd16(c, TICK) > 60000 || rd16(a, TICK) > 60000)) { stepMove(c); stepMove(a); bootF++; }
  if (rd16(c, TICK) > 60000 || rd16(a, TICK) > 60000) { bad(`${label}: game loop never started`); return; }

  let diffs = 0, firstDiff = '', compared = 0;
  const pxStart = rd16(c, PX), pyStart = rd16(c, PY);
  let pxMax = pxStart, pyMax = pyStart;
  for (let step = 0; step < 20000 && compared < 300; step++) {
    const tc = rd16(c, TICK), ta = rd16(a, TICK);
    if (tc > 60000 || ta > 60000) { bad(`${label}: tick overflowed`); return; }
    if (tc !== ta) { if (tc < ta) stepMove(c); else stepMove(a); continue; }
    const cpx = rd16(c, PX), apx = rd16(a, PX), cpy = rd16(c, PY), apy = rd16(a, PY);
    if (cpx !== apx || cpy !== apy) { diffs++; if (!firstDiff) firstDiff = `tick ${tc}: C(${cpx},${cpy}) A(${apx},${apy})`; }
    if (cpx > pxMax) pxMax = cpx;
    if (cpy > pyMax) pyMax = cpy;
    compared++;
    stepMove(c); stepMove(a);
  }

  if (compared < 250) { bad(`${label}: too few matched-tick samples (${compared})`); return; }
  if (pxMax <= pxStart + 8 || pyMax <= pyStart + 8) { bad(`${label}: player did not move (px ${pxStart}->${pxMax}, py ${pyStart}->${pyMax})`); return; }
  if (wide && pxMax < 256) { bad(`${label}: player never crossed to screen 2 (px max ${pxMax}) — u16 path not exercised`); return; }
  if (!wide && pxMax >= 256) { bad(`${label}: px exceeded 255 in a 1-screen build (${pxMax}) — not the u8 path`); return; }
  if (diffs === 0)
    ok(`td player update ${label}: C ≡ ASM px/py at every matched tick over ${compared} ticks `
      + `(px ${pxStart}->${pxMax}, py ${pyStart}->${pyMax}, wall bumps)`);
  else bad(`${label}: divergence — ${diffs} px/py diffs (first: ${firstDiff}) over ${compared} matched ticks`);
}

// --- Platformer (BW_GAME_STYLE 0): the ASM plat_update vs the C, with jumps ---
function makePlatformerState() {
  const cols = 64, rows = 30, floorRow = 26;
  const beh = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let c = 0; c < cols; c++) beh[floorRow][c] = 1;              // SOLID floor
  for (let r = floorRow - 1; r >= floorRow - 5; r--) beh[r][20] = 2; // WALL column (bump)
  for (let r = floorRow - 1; r >= 8; r--) beh[r][44] = 6;           // LADDER column (climb)
  const bg = {
    name: 'bg', dimensions: { screens_x: 2, screens_y: 1 },
    nametable: Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ tile: 0, palette: 0 }))),
    behaviour: beh,
  };
  const sprites = [{ role: 'player', name: 'hero', width: 2, height: 2, cells: H.mkCells(2, 2) }];
  const s = {
    name: 'platplayer', version: 1, universal_bg: 0x21, sprites,
    sprite_tiles: H.blankPool(), bg_tiles: H.blankPool(),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x0F, 0x10, 0x30] })),
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    backgrounds: [bg], behaviour_types: H.BEHAVIOUR_TYPES, selectedBgIdx: 0, builder: win.BuilderDefaults(),
  };
  s.builder.modules.game.config.type = 'platformer';
  return s;
}

// Input is a function of the injected TICK (not the frame) so both builds get the
// same pad at the same game-tick: hold RIGHT, tap UP for 2 ticks every 40 (an edge
// -> a jump). Reading each build's own tick before stepping keeps them in step.
const stepPlat = (n) => {
  const tk = rd16(n, TICK);
  n.buttonDown(1, H.BTN.RIGHT);
  if (tk % 40 < 2) n.buttonDown(1, H.BTN.UP);
  n.frame();
  n.buttonUp(1, H.BTN.RIGHT); n.buttonUp(1, H.BTN.UP);
};

async function runPlatformer() {
  const s = makePlatformerState();
  const mainC = win.BuilderAssembler.assemble(s, tpl);
  // line-anchored so the template's explanatory comment (which contains the text
  // `#define BW_GAME_STYLE 1`) doesn't false-match — only a REAL define counts.
  if (/^#define BW_GAME_STYLE [123]\b/m.test(mainC) || /^#define BW_SMB_JUMP\b/m.test(mainC)) {
    bad('platformer: not a plain non-SMB platformer — server gate would not engage'); return;
  }
  const payload = {
    state: s, playerSpriteIdx: 0, playerStart: { x: 24, y: 180 }, mode: 'browser',
    customMainC: withProbe(mainC), sceneSprites: [],
  };
  const rc = await H.buildRom(PORT_C, payload);
  const ra = await H.buildRom(PORT_A, payload);
  if (!rc.ok) { bad(`platformer: C build failed (${rc.stage}): ` + String(rc.log || '').slice(-300)); return; }
  if (!ra.ok) { bad(`platformer: ASM build failed (${ra.stage}): ` + String(ra.log || '').slice(-300)); return; }
  if (rc.romBytes.equals(ra.romBytes)) { bad('platformer: ASM ROM == C ROM (NES_ASM_PLAYER did not engage)'); return; }

  const c = boot(rc.romBytes), a = boot(ra.romBytes);
  let bootF = 0;
  while (bootF < 400 && (rd16(c, TICK) > 60000 || rd16(a, TICK) > 60000)) { stepPlat(c); stepPlat(a); bootF++; }
  if (rd16(c, TICK) > 60000 || rd16(a, TICK) > 60000) { bad('platformer: game loop never started'); return; }

  let diffs = 0, firstDiff = '', compared = 0;
  const pxStart = rd16(c, PX);
  let pxMax = pxStart, jumpedC = false;
  for (let step = 0; step < 24000 && compared < 400; step++) {
    const tc = rd16(c, TICK), ta = rd16(a, TICK);
    if (tc > 60000 || ta > 60000) { bad('platformer: tick overflowed'); return; }
    if (tc !== ta) { if (tc < ta) stepPlat(c); else stepPlat(a); continue; }
    const cpx = rd16(c, PX), apx = rd16(a, PX), cpy = rd16(c, PY), apy = rd16(a, PY);
    const cj = c.cpu.mem[JU] & 0xFF, aj = a.cpu.mem[JU] & 0xFF;
    if (cpx !== apx || cpy !== apy || cj !== aj) {
      diffs++; if (!firstDiff) firstDiff = `tick ${tc}: C(${cpx},${cpy},j${cj}) A(${apx},${apy},j${aj})`;
    }
    if (cpx > pxMax) pxMax = cpx;
    if (cj) jumpedC = true;
    compared++;
    stepPlat(c); stepPlat(a);
  }

  if (compared < 300) { bad(`platformer: too few matched-tick samples (${compared})`); return; }
  if (pxMax <= pxStart + 8) { bad(`platformer: player did not walk right (px ${pxStart}->${pxMax})`); return; }
  if (!jumpedC) { bad('platformer: player never jumped (jumping stayed 0) — jump path not exercised'); return; }
  if (diffs === 0)
    ok(`platformer player update (NES_ASM_PLAYER): C ≡ ASM px/py/jumping at every matched tick over `
      + `${compared} ticks (walk RIGHT ${pxStart}->${pxMax}, periodic jumps, wall + ladder)`);
  else bad(`platformer: divergence — ${diffs} px/py/jumping diffs (first: ${firstDiff}) over ${compared} matched ticks`);
}

// ---- SMB (game type 'smb'): BW_GAME_STYLE 0 + BW_SMB_JUMP. The move is 8.8
// fixed-point accel/skid horizontal + ladder + A/UP jump (run-boosted, variable
// -cut) + +3 gravity — the hand-written 6502 smb_update, linked via NES_ASM_SMB
// (which implies NES_ASM_PLAYER). 2-screen so px/py are u16 (PX_WIDE path).
function makeSmbState() {
  const cols = 64, rows = 30, floorRow = 26;
  const beh = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let c = 0; c < cols; c++) beh[floorRow][c] = 1;              // SOLID floor
  for (let r = floorRow - 1; r >= floorRow - 3; r--) beh[r][20] = 2; // WALL column (3-tall: bump, clearable by a run-jump)
  for (let r = floorRow - 1; r >= 8; r--) beh[r][44] = 6;           // LADDER column
  const bg = {
    name: 'bg', dimensions: { screens_x: 2, screens_y: 1 },
    nametable: Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ tile: 0, palette: 0 }))),
    behaviour: beh,
  };
  const sprites = [{ role: 'player', name: 'hero', width: 2, height: 2, cells: H.mkCells(2, 2) }];
  const s = {
    name: 'smbplayer', version: 1, universal_bg: 0x21, sprites,
    sprite_tiles: H.blankPool(), bg_tiles: H.blankPool(),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x0F, 0x10, 0x30] })),
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    backgrounds: [bg], behaviour_types: H.BEHAVIOUR_TYPES, selectedBgIdx: 0, builder: win.BuilderDefaults(),
  };
  s.builder.modules.game.config.type = 'smb';
  return s;
}

// Hold RIGHT + B (run) so the accel/skid path is exercised, and tap A (the
// classic Mario jump) for 2 ticks every 40 — an edge -> a run-boosted jump whose
// variable-cut trims when released. Tick-keyed so both builds get the same pad.
const stepSmb = (n) => {
  const tk = rd16(n, TICK);
  n.buttonDown(1, H.BTN.RIGHT);
  n.buttonDown(1, H.BTN.B);
  // Hold A for 16 of every 44 ticks: an edge takes off (run-boosted, jmp_up=28),
  // the hold builds height to clear the wall, and RELEASING it while jmp_up>4
  // fires the SMB variable-cut — so both the full-rise and the cut paths run.
  if (tk % 44 < 16) n.buttonDown(1, H.BTN.A);
  n.frame();
  n.buttonUp(1, H.BTN.RIGHT); n.buttonUp(1, H.BTN.B); n.buttonUp(1, H.BTN.A);
};

async function runSmb() {
  const s = makeSmbState();
  const mainC = win.BuilderAssembler.assemble(s, tpl);
  if (!/^#define BW_SMB_JUMP\b/m.test(mainC)) { bad('smb: not an SMB build (no BW_SMB_JUMP) — server gate would not engage'); return; }
  if (/^#define BW_GAME_STYLE [123]\b/m.test(mainC)) { bad('smb: unexpected non-0 BW_GAME_STYLE'); return; }
  const payload = {
    state: s, playerSpriteIdx: 0, playerStart: { x: 24, y: 180 }, mode: 'browser',
    customMainC: withProbe(mainC), sceneSprites: [],
  };
  const rc = await H.buildRom(PORT_C, payload);
  const ra = await H.buildRom(PORT_A, payload);
  if (!rc.ok) { bad(`smb: C build failed (${rc.stage}): ` + String(rc.log || '').slice(-300)); return; }
  if (!ra.ok) { bad(`smb: ASM build failed (${ra.stage}): ` + String(ra.log || '').slice(-300)); return; }
  if (rc.romBytes.equals(ra.romBytes)) { bad('smb: ASM ROM == C ROM (NES_ASM_SMB did not engage)'); return; }

  const c = boot(rc.romBytes), a = boot(ra.romBytes);
  let bootF = 0;
  while (bootF < 400 && (rd16(c, TICK) > 60000 || rd16(a, TICK) > 60000)) { stepSmb(c); stepSmb(a); bootF++; }
  if (rd16(c, TICK) > 60000 || rd16(a, TICK) > 60000) { bad('smb: game loop never started'); return; }

  let diffs = 0, firstDiff = '', compared = 0;
  const pxStart = rd16(c, PX);
  let pxMax = pxStart, jumpedC = false;
  for (let step = 0; step < 24000 && compared < 400; step++) {
    const tc = rd16(c, TICK), ta = rd16(a, TICK);
    if (tc > 60000 || ta > 60000) { bad('smb: tick overflowed'); return; }
    if (tc !== ta) { if (tc < ta) stepSmb(c); else stepSmb(a); continue; }
    const cpx = rd16(c, PX), apx = rd16(a, PX), cpy = rd16(c, PY), apy = rd16(a, PY);
    const cj = c.cpu.mem[JU] & 0xFF, aj = a.cpu.mem[JU] & 0xFF;
    if (cpx !== apx || cpy !== apy || cj !== aj) {
      diffs++; if (!firstDiff) firstDiff = `tick ${tc}: C(${cpx},${cpy},j${cj}) A(${apx},${apy},j${aj})`;
    }
    if (cpx > pxMax) pxMax = cpx;
    if (cj) jumpedC = true;
    compared++;
    stepSmb(c); stepSmb(a);
  }

  if (compared < 300) { bad(`smb: too few matched-tick samples (${compared})`); return; }
  if (pxMax <= pxStart + 8) { bad(`smb: player did not run right (px ${pxStart}->${pxMax})`); return; }
  if (pxMax < 256) { bad(`smb: player never crossed to screen 2 (px max ${pxMax}) — u16 path not exercised`); return; }
  if (!jumpedC) { bad('smb: player never jumped (jumping stayed 0) — jump path not exercised'); return; }
  if (diffs === 0)
    ok(`smb player update (NES_ASM_SMB): C ≡ ASM px/py/jumping at every matched tick over `
      + `${compared} ticks (run RIGHT ${pxStart}->${pxMax}, accel/skid, A-jumps, wall + ladder)`);
  else bad(`smb: divergence — ${diffs} px/py/jumping diffs (first: ${firstDiff}) over ${compared} matched ticks`);
}

// ---- Auto-runner (game type 'runner'): BW_GAME_STYLE 2. The camera autoscrolls
// every frame and the player rides it at a fixed on-screen X (px = cam_x +
// RUNNER_SCREEN_X); reaching the track end wraps back to the start. Jump is
// UP/A-edge. The hand-written 6502 run_update = run_hstep (forced-scroll + respawn)
// + the shared plat vertical (pl_ladder/run_jump/pl_vmove). 2-screen so PX_WIDE.
function makeRunnerState() {
  const cols = 64, rows = 30, floorRow = 26;
  const beh = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let c = 0; c < cols; c++) beh[floorRow][c] = 1;              // SOLID floor to land on
  const bg = {
    name: 'bg', dimensions: { screens_x: 2, screens_y: 1 },
    nametable: Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ tile: 0, palette: 0 }))),
    behaviour: beh,
  };
  const sprites = [{ role: 'player', name: 'hero', width: 2, height: 2, cells: H.mkCells(2, 2) }];
  const s = {
    name: 'runplayer', version: 1, universal_bg: 0x21, sprites,
    sprite_tiles: H.blankPool(), bg_tiles: H.blankPool(),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x0F, 0x10, 0x30] })),
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    backgrounds: [bg], behaviour_types: H.BEHAVIOUR_TYPES, selectedBgIdx: 0, builder: win.BuilderDefaults(),
  };
  s.builder.modules.game.config.type = 'runner';
  return s;
}

// The runner ignores RIGHT/LEFT (px is camera-driven); tap A for 2 ticks every 44
// (an edge -> a jump). Tick-keyed so both builds get the same pad per game-tick.
const stepRunner = (n) => {
  const tk = rd16(n, TICK);
  if (tk % 44 < 2) n.buttonDown(1, H.BTN.A);
  n.frame();
  n.buttonUp(1, H.BTN.A);
};

async function runRunner() {
  const s = makeRunnerState();
  const mainC = win.BuilderAssembler.assemble(s, tpl);
  if (!/^#define BW_GAME_STYLE 2\b/m.test(mainC)) { bad('runner: not a runner build (no BW_GAME_STYLE 2) — server gate would not engage'); return; }
  const payload = {
    state: s, playerSpriteIdx: 0, playerStart: { x: 24, y: 180 }, mode: 'browser',
    customMainC: withProbe(mainC), sceneSprites: [],
  };
  const rc = await H.buildRom(PORT_C, payload);
  const ra = await H.buildRom(PORT_A, payload);
  if (!rc.ok) { bad(`runner: C build failed (${rc.stage}): ` + String(rc.log || '').slice(-300)); return; }
  if (!ra.ok) { bad(`runner: ASM build failed (${ra.stage}): ` + String(ra.log || '').slice(-300)); return; }
  if (rc.romBytes.equals(ra.romBytes)) { bad('runner: ASM ROM == C ROM (NES_ASM_PLAYER did not engage)'); return; }

  const c = boot(rc.romBytes), a = boot(ra.romBytes);
  let bootF = 0;
  while (bootF < 400 && (rd16(c, TICK) > 60000 || rd16(a, TICK) > 60000)) { stepRunner(c); stepRunner(a); bootF++; }
  if (rd16(c, TICK) > 60000 || rd16(a, TICK) > 60000) { bad('runner: game loop never started'); return; }

  let diffs = 0, firstDiff = '', compared = 0;
  let pxMax = 0, jumpedC = false, wrapped = false, prevPx = rd16(c, PX);
  for (let step = 0; step < 24000 && compared < 400; step++) {
    const tc = rd16(c, TICK), ta = rd16(a, TICK);
    if (tc > 60000 || ta > 60000) { bad('runner: tick overflowed'); return; }
    if (tc !== ta) { if (tc < ta) stepRunner(c); else stepRunner(a); continue; }
    const cpx = rd16(c, PX), apx = rd16(a, PX), cpy = rd16(c, PY), apy = rd16(a, PY);
    const cj = c.cpu.mem[JU] & 0xFF, aj = a.cpu.mem[JU] & 0xFF;
    if (cpx !== apx || cpy !== apy || cj !== aj) {
      diffs++; if (!firstDiff) firstDiff = `tick ${tc}: C(${cpx},${cpy},j${cj}) A(${apx},${apy},j${aj})`;
    }
    if (cpx > pxMax) pxMax = cpx;
    if (cpx + 100 < prevPx) wrapped = true;   // px dropped sharply -> track-end respawn
    prevPx = cpx;
    if (cj) jumpedC = true;
    compared++;
    stepRunner(c); stepRunner(a);
  }

  if (compared < 300) { bad(`runner: too few matched-tick samples (${compared})`); return; }
  if (pxMax < 256) { bad(`runner: player never crossed toward screen 2 (px max ${pxMax}) — u16/autoscroll not exercised`); return; }
  if (!wrapped) { bad('runner: never hit a track-end respawn (px never wrapped) — respawn path not exercised'); return; }
  if (!jumpedC) { bad('runner: player never jumped (jumping stayed 0) — jump path not exercised'); return; }
  if (diffs === 0)
    ok(`runner player update (NES_ASM_PLAYER): C ≡ ASM px/py/jumping at every matched tick over `
      + `${compared} ticks (autoscroll to px ${pxMax}, track-end wrap respawn, A-jumps, gravity)`);
  else bad(`runner: divergence — ${diffs} px/py/jumping diffs (first: ${firstDiff}) over ${compared} matched ticks`);
}

// ---- Top-down racer (game type 'racer'): BW_GAME_STYLE 3. Steer rotates a
// 16-direction heading, A/UP accelerates 8.8 along it (vx/vy from COS16), per-axis
// integrate + world-clamp + box_on_edge slide, dominant-axis speed bleed, centre-
// cell lap FSM. The hand-written 6502 racer_update = rc_drive -> rc_vel -> rc_axis
// -> rc_laps. 2-screen (PX_WIDE) with a SOLID border so the accelerating car bumps.
function makeRacerState() {
  const cols = 64, rows = 30;
  const beh = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let c = 0; c < cols; c++) { beh[0][c] = 1; beh[1][c] = 1; beh[rows - 2][c] = 1; beh[rows - 1][c] = 1; }
  for (let r = 0; r < rows; r++) { beh[r][0] = 1; beh[r][1] = 1; beh[r][cols - 2] = 1; beh[r][cols - 1] = 1; }
  const bg = {
    name: 'bg', dimensions: { screens_x: 2, screens_y: 1 },
    nametable: Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ tile: 0, palette: 0 }))),
    behaviour: beh,
  };
  const sprites = [{ role: 'player', name: 'hero', width: 2, height: 2, cells: H.mkCells(2, 2) }];
  const s = {
    name: 'racerplayer', version: 1, universal_bg: 0x21, sprites,
    sprite_tiles: H.blankPool(), bg_tiles: H.blankPool(),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x0F, 0x10, 0x30] })),
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    backgrounds: [bg], behaviour_types: H.BEHAVIOUR_TYPES, selectedBgIdx: 0, builder: win.BuilderDefaults(),
  };
  s.builder.modules.game.config.type = 'racer';
  return s;
}

// Hold A (accelerate) and pulse RIGHT once every 8 ticks so the 16-dir heading
// slowly sweeps through the diagonals — the car curves, so px AND vy are both
// exercised (COS16 for every heading) and it spirals out into the border. Tick-
// keyed so both builds get the same pad per game-tick.
const stepRacer = (n) => {
  const tk = rd16(n, TICK);
  if (tk % 8 === 0) n.buttonDown(1, H.BTN.RIGHT);
  n.buttonDown(1, H.BTN.A);
  n.frame();
  n.buttonUp(1, H.BTN.RIGHT); n.buttonUp(1, H.BTN.A);
};

async function runRacer() {
  const s = makeRacerState();
  const mainC = win.BuilderAssembler.assemble(s, tpl);
  if (!/^#define BW_GAME_STYLE 3\b/m.test(mainC)) { bad('racer: not a racer build (no BW_GAME_STYLE 3) — server gate would not engage'); return; }
  const payload = {
    state: s, playerSpriteIdx: 0, playerStart: { x: 256, y: 112 }, mode: 'browser',
    customMainC: withProbe(mainC), sceneSprites: [],
  };
  const rc = await H.buildRom(PORT_C, payload);
  const ra = await H.buildRom(PORT_A, payload);
  if (!rc.ok) { bad(`racer: C build failed (${rc.stage}): ` + String(rc.log || '').slice(-300)); return; }
  if (!ra.ok) { bad(`racer: ASM build failed (${ra.stage}): ` + String(ra.log || '').slice(-300)); return; }
  if (rc.romBytes.equals(ra.romBytes)) { bad('racer: ASM ROM == C ROM (NES_ASM_RACER did not engage)'); return; }

  const c = boot(rc.romBytes), a = boot(ra.romBytes);
  let bootF = 0;
  while (bootF < 400 && (rd16(c, TICK) > 60000 || rd16(a, TICK) > 60000)) { stepRacer(c); stepRacer(a); bootF++; }
  if (rd16(c, TICK) > 60000 || rd16(a, TICK) > 60000) { bad('racer: game loop never started'); return; }

  let diffs = 0, firstDiff = '', compared = 0;
  const pxStart = rd16(c, PX), pyStart = rd16(c, PY);
  let pxMin = pxStart, pxMax = pxStart, pyMin = pyStart, pyMax = pyStart;
  for (let step = 0; step < 24000 && compared < 400; step++) {
    const tc = rd16(c, TICK), ta = rd16(a, TICK);
    if (tc > 60000 || ta > 60000) { bad('racer: tick overflowed'); return; }
    if (tc !== ta) { if (tc < ta) stepRacer(c); else stepRacer(a); continue; }
    const cpx = rd16(c, PX), apx = rd16(a, PX), cpy = rd16(c, PY), apy = rd16(a, PY);
    if (cpx !== apx || cpy !== apy) { diffs++; if (!firstDiff) firstDiff = `tick ${tc}: C(${cpx},${cpy}) A(${apx},${apy})`; }
    if (cpx < pxMin) pxMin = cpx; if (cpx > pxMax) pxMax = cpx;
    if (cpy < pyMin) pyMin = cpy; if (cpy > pyMax) pyMax = cpy;
    compared++;
    stepRacer(c); stepRacer(a);
  }

  if (compared < 300) { bad(`racer: too few matched-tick samples (${compared})`); return; }
  const dx = pxMax - pxMin, dy = pyMax - pyMin;
  if (dx < 24 || dy < 24) { bad(`racer: not a diagonal move (dx ${dx}, dy ${dy}) — heading/COS16 velocity not exercised`); return; }
  // The 2-tile SOLID border sits at px/py ~16 and ~ world-8; the accelerating car
  // should reach an edge (box_on_edge slide or world clamp).
  const hitEdge = pxMin < 48 || pyMin < 48 || pxMax > (64 * 8 - 48) || pyMax > (30 * 8 - 48);
  if (!hitEdge) { bad(`racer: never reached a track edge (px ${pxMin}..${pxMax}, py ${pyMin}..${pyMax}) — collision not exercised`); return; }
  if (diffs === 0)
    ok(`racer player update (NES_ASM_RACER): C ≡ ASM px/py at every matched tick over `
      + `${compared} ticks (steer -> diagonal dx ${dx}/dy ${dy}, accelerate, box_on_edge/clamp at a border)`);
  else bad(`racer: divergence — ${diffs} px/py diffs (first: ${firstDiff}) over ${compared} matched ticks`);
}

const srvC = await H.startServer(PORT_C, { PLAYGROUND_NO_ASM: '1' });
const srvA = await H.startServer(PORT_A, { PLAYGROUND_ASM_PLAYER: '1' });
try {
  await runCase(1);        // top-down non-scroll: u8 px/py
  await runCase(2);        // top-down scroll: u16 px/py
  await runPlatformer();   // platformer: walk + jump + gravity + ladder
  await runSmb();          // SMB: accel/skid run + A-jump + variable-cut + gravity + ladder
  await runRunner();       // auto-runner: autoscroll + track-end wrap respawn + A-jump + gravity
  await runRacer();        // top-down racer: steer + accelerate + COS16 velocity + slide collision
} catch (e) {
  bad('threw: ' + (e && e.stack || e));
} finally {
  await H.stopServer(srvC.srv);
  await H.stopServer(srvA.srv);
}

if (failed) process.exit(1);
console.log('\nasm-player: the ASM td_update + plat_update drive the top-down + platformer player identically to the C.');
