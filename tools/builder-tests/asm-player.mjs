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

const PORT_C = 18788, PORT_A = 18789, PORT_D = 18790;
let failed = false;
const ok = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };

const win = H.loadBuilderModules();
new Function(fs.readFileSync(path.join(H.WEB, 'engine-version.js'), 'utf8'))();  // target latest engine
const tpl = H.readTemplate();

function makeState(screensX, pw = 2, ph = 2) {
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
  const sprites = [{ role: 'player', name: 'hero', width: pw, height: ph, cells: H.mkCells(pw, ph) }];
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

async function runCase(screensX, pw = 2, ph = 2) {
  const wide = screensX > 1;
  const dimTag = (pw === 2 && ph === 2) ? '' : ` ${pw}x${ph} player`;
  const label = `${screensX}-screen (${wide ? 'u16' : 'u8'} px/py)${dimTag}`;
  const s = makeState(screensX, pw, ph);
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

// ---- Player-2 top-down (2-player, BW_GAME_STYLE 1 + PLAYER2_ENABLED). P1 runs the
// ASM td_update, P2 runs the ASM p2_td_update; both drive their own pad. The C
// reference (PLAYGROUND_NO_ASM) runs both in C. Matched-tick compares P1 px/py AND
// P2 px2/py2. A P2-aware probe exposes px2/py2 (they exist only in a 2P build).
const PX2 = 0x0718, PY2 = 0x071A;
function withProbe2(mainC) {
  const inj = '{static unsigned int _tk; ++_tk;'
    + `(*(unsigned char*)${TICK})=(unsigned char)(_tk&0xFF);(*(unsigned char*)${TICK + 1})=(unsigned char)(_tk>>8);`
    + `(*(unsigned char*)${PX})=(unsigned char)px;(*(unsigned char*)${PX + 1})=(unsigned char)(px>>8);`
    + `(*(unsigned char*)${PY})=(unsigned char)py;(*(unsigned char*)${PY + 1})=(unsigned char)(py>>8);`
    + `(*(unsigned char*)${PX2})=(unsigned char)px2;(*(unsigned char*)${PX2 + 1})=(unsigned char)(px2>>8);`
    + `(*(unsigned char*)${PY2})=(unsigned char)py2;(*(unsigned char*)${PY2 + 1})=(unsigned char)(py2>>8);} `;
  return mainC.replace('while (oam_idx < 256) {', inj + 'while (oam_idx < 256) {');
}

function makeP2TdState() {
  const cols = 32, rows = 30;
  const beh = Array.from({ length: rows }, () => Array(cols).fill(0));
  // WALL blocks both players bump into (P1 moving down-right from the top-left,
  // P2 moving down-left from the top-right).
  for (const [c, r] of [[10, 8], [10, 9], [22, 8], [22, 9], [16, 20]]) beh[r][c] = 2;
  const bg = {
    name: 'bg', dimensions: { screens_x: 1, screens_y: 1 },
    nametable: Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ tile: 0, palette: 0 }))),
    behaviour: beh,
  };
  const sprites = [
    { role: 'player', name: 'hero', width: 2, height: 2, cells: H.mkCells(2, 2) },
    { role: 'player', name: 'hero2', width: 2, height: 2, cells: H.mkCells(2, 2) },
  ];
  const s = {
    name: 'p2td', version: 1, universal_bg: 0x21, sprites,
    sprite_tiles: H.blankPool(), bg_tiles: H.blankPool(),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x0F, 0x10, 0x30] })),
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    backgrounds: [bg], behaviour_types: H.BEHAVIOUR_TYPES, selectedBgIdx: 0, builder: win.BuilderDefaults(),
  };
  s.builder.modules.game.config.type = 'topdown';
  s.builder.modules.players.config.count = 2;
  s.builder.modules.players.submodules.player1.enabled = true;
  s.builder.modules.players.submodules.player2.enabled = true;
  return s;
}

// P1 pad 1 moves down-right; P2 pad 2 moves down-left. Both 4-way top-down.
const stepP2 = (n) => {
  n.buttonDown(1, H.BTN.RIGHT); n.buttonDown(1, H.BTN.DOWN);
  n.buttonDown(2, H.BTN.LEFT);  n.buttonDown(2, H.BTN.DOWN);
  n.frame();
  n.buttonUp(1, H.BTN.RIGHT); n.buttonUp(1, H.BTN.DOWN);
  n.buttonUp(2, H.BTN.LEFT);  n.buttonUp(2, H.BTN.DOWN);
};

async function runP2Topdown() {
  const s = makeP2TdState();
  const mainC = win.BuilderAssembler.assemble(s, tpl);
  if (!/#define BW_GAME_STYLE 1/.test(mainC)) { bad('p2-td: not a top-down build'); return; }
  if (!/^#define PLAYER2_ENABLED 1/m.test(mainC) && !/PLAYER2_ENABLED 1/.test(mainC)) { /* server emits PLAYER2_ENABLED into scene.inc, not main.c — can't line-check here */ }
  const payload = {
    state: s, playerSpriteIdx: 0, playerStart: { x: 40, y: 24 },
    playerSpriteIdx2: 1, playerStart2: { x: 200, y: 24 }, mode: 'browser',
    customMainC: withProbe2(mainC), sceneSprites: [],
  };
  const rc = await H.buildRom(PORT_C, payload);
  const ra = await H.buildRom(PORT_A, payload);
  if (!rc.ok) { bad(`p2-td: C build failed (${rc.stage}): ` + String(rc.log || '').slice(-300)); return; }
  if (!ra.ok) { bad(`p2-td: ASM build failed (${ra.stage}): ` + String(ra.log || '').slice(-300)); return; }
  if (rc.romBytes.equals(ra.romBytes)) { bad('p2-td: ASM ROM == C ROM (NES_ASM_PLAYER2 did not engage)'); return; }

  const c = boot(rc.romBytes), a = boot(ra.romBytes);
  const rd = (n, addr) => rd16(n, addr);
  let bootF = 0;
  while (bootF < 400 && (rd16(c, TICK) > 60000 || rd16(a, TICK) > 60000)) { stepP2(c); stepP2(a); bootF++; }
  if (rd16(c, TICK) > 60000 || rd16(a, TICK) > 60000) { bad('p2-td: game loop never started'); return; }

  let diffs = 0, firstDiff = '', compared = 0;
  const p1x0 = rd(c, PX), p2x0 = rd(c, PX2);
  let p1xMax = p1x0, p2xMin = p2x0;
  for (let step = 0; step < 20000 && compared < 300; step++) {
    const tc = rd16(c, TICK), ta = rd16(a, TICK);
    if (tc > 60000 || ta > 60000) { bad('p2-td: tick overflowed'); return; }
    if (tc !== ta) { if (tc < ta) stepP2(c); else stepP2(a); continue; }
    const c1x = rd(c, PX), a1x = rd(a, PX), c1y = rd(c, PY), a1y = rd(a, PY);
    const c2x = rd(c, PX2), a2x = rd(a, PX2), c2y = rd(c, PY2), a2y = rd(a, PY2);
    if (c1x !== a1x || c1y !== a1y || c2x !== a2x || c2y !== a2y) {
      diffs++; if (!firstDiff) firstDiff = `tick ${tc}: C p1(${c1x},${c1y}) p2(${c2x},${c2y}) A p1(${a1x},${a1y}) p2(${a2x},${a2y})`;
    }
    if (c1x > p1xMax) p1xMax = c1x;
    if (c2x < p2xMin) p2xMin = c2x;
    compared++;
    stepP2(c); stepP2(a);
  }

  if (compared < 250) { bad(`p2-td: too few matched-tick samples (${compared})`); return; }
  if (p1xMax <= p1x0 + 8) { bad(`p2-td: P1 did not move right (${p1x0}->${p1xMax})`); return; }
  if (p2xMin >= p2x0 - 8) { bad(`p2-td: P2 did not move left (${p2x0}->${p2xMin})`); return; }
  if (diffs === 0)
    ok(`p2 top-down (NES_ASM_PLAYER2): C ≡ ASM P1 px/py AND P2 px2/py2 at every matched tick over `
      + `${compared} ticks (P1 ${p1x0}->${p1xMax} right, P2 ${p2x0}->${p2xMin} left, both 4-way + wall bumps)`);
  else bad(`p2-td: divergence — ${diffs} diffs (first: ${firstDiff}) over ${compared} matched ticks`);
}

// ---- Player-2 racer (2-player, BW_GAME_STYLE 3 + PLAYER2_ENABLED). P1 runs the ASM
// racer_update, P2 runs the ASM p2_racer_update; both steer + accelerate their own
// car. Matched-tick compares P1 px/py AND P2 px2/py2.
function makeP2RacerState() {
  const cols = 64, rows = 30;
  const beh = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let c = 0; c < cols; c++) { beh[0][c] = 1; beh[1][c] = 1; beh[rows - 2][c] = 1; beh[rows - 1][c] = 1; }
  for (let r = 0; r < rows; r++) { beh[r][0] = 1; beh[r][1] = 1; beh[r][cols - 2] = 1; beh[r][cols - 1] = 1; }
  const bg = {
    name: 'bg', dimensions: { screens_x: 2, screens_y: 1 },
    nametable: Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ tile: 0, palette: 0 }))),
    behaviour: beh,
  };
  const sprites = [
    { role: 'player', name: 'car1', width: 2, height: 2, cells: H.mkCells(2, 2) },
    { role: 'player', name: 'car2', width: 2, height: 2, cells: H.mkCells(2, 2) },
  ];
  const s = {
    name: 'p2racer', version: 1, universal_bg: 0x21, sprites,
    sprite_tiles: H.blankPool(), bg_tiles: H.blankPool(),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x0F, 0x10, 0x30] })),
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    backgrounds: [bg], behaviour_types: H.BEHAVIOUR_TYPES, selectedBgIdx: 0, builder: win.BuilderDefaults(),
  };
  s.builder.modules.game.config.type = 'racer';
  s.builder.modules.players.config.count = 2;
  s.builder.modules.players.submodules.player1.enabled = true;
  s.builder.modules.players.submodules.player2.enabled = true;
  return s;
}

// Both cars accelerate (A on both pads); P1 sweeps its heading with RIGHT, P2 with
// LEFT (so the two cars curve opposite ways). Tick-keyed.
const stepP2R = (n) => {
  const tk = rd16(n, TICK);
  n.buttonDown(1, H.BTN.A); n.buttonDown(2, H.BTN.A);
  if (tk % 8 === 0) { n.buttonDown(1, H.BTN.RIGHT); n.buttonDown(2, H.BTN.LEFT); }
  n.frame();
  n.buttonUp(1, H.BTN.A); n.buttonUp(2, H.BTN.A);
  n.buttonUp(1, H.BTN.RIGHT); n.buttonUp(2, H.BTN.LEFT);
};

async function runP2Racer() {
  const s = makeP2RacerState();
  const mainC = win.BuilderAssembler.assemble(s, tpl);
  if (!/^#define BW_GAME_STYLE 3\b/m.test(mainC)) { bad('p2-racer: not a racer build'); return; }
  const payload = {
    state: s, playerSpriteIdx: 0, playerStart: { x: 200, y: 96 },
    playerSpriteIdx2: 1, playerStart2: { x: 300, y: 160 }, mode: 'browser',
    customMainC: withProbe2(mainC), sceneSprites: [],
  };
  const rc = await H.buildRom(PORT_C, payload);
  const ra = await H.buildRom(PORT_A, payload);
  if (!rc.ok) { bad(`p2-racer: C build failed (${rc.stage}): ` + String(rc.log || '').slice(-300)); return; }
  if (!ra.ok) { bad(`p2-racer: ASM build failed (${ra.stage}): ` + String(ra.log || '').slice(-300)); return; }
  if (rc.romBytes.equals(ra.romBytes)) { bad('p2-racer: ASM ROM == C ROM (NES_ASM_PLAYER2 did not engage)'); return; }

  const c = boot(rc.romBytes), a = boot(ra.romBytes);
  let bootF = 0;
  while (bootF < 400 && (rd16(c, TICK) > 60000 || rd16(a, TICK) > 60000)) { stepP2R(c); stepP2R(a); bootF++; }
  if (rd16(c, TICK) > 60000 || rd16(a, TICK) > 60000) { bad('p2-racer: game loop never started'); return; }

  let diffs = 0, firstDiff = '', compared = 0;
  const b1x = rd16(c, PX), b1y = rd16(c, PY), b2x = rd16(c, PX2), b2y = rd16(c, PY2);
  let r1x = [b1x, b1x], r1y = [b1y, b1y], r2x = [b2x, b2x], r2y = [b2y, b2y];
  const upd = (r, v) => { if (v < r[0]) r[0] = v; if (v > r[1]) r[1] = v; };
  for (let step = 0; step < 24000 && compared < 400; step++) {
    const tc = rd16(c, TICK), ta = rd16(a, TICK);
    if (tc > 60000 || ta > 60000) { bad('p2-racer: tick overflowed'); return; }
    if (tc !== ta) { if (tc < ta) stepP2R(c); else stepP2R(a); continue; }
    const c1x = rd16(c, PX), a1x = rd16(a, PX), c1y = rd16(c, PY), a1y = rd16(a, PY);
    const c2x = rd16(c, PX2), a2x = rd16(a, PX2), c2y = rd16(c, PY2), a2y = rd16(a, PY2);
    if (c1x !== a1x || c1y !== a1y || c2x !== a2x || c2y !== a2y) {
      diffs++; if (!firstDiff) firstDiff = `tick ${tc}: C p1(${c1x},${c1y}) p2(${c2x},${c2y}) A p1(${a1x},${a1y}) p2(${a2x},${a2y})`;
    }
    upd(r1x, c1x); upd(r1y, c1y); upd(r2x, c2x); upd(r2y, c2y);
    compared++;
    stepP2R(c); stepP2R(a);
  }

  if (compared < 300) { bad(`p2-racer: too few matched-tick samples (${compared})`); return; }
  const d1 = (r1x[1] - r1x[0]) + (r1y[1] - r1y[0]), d2 = (r2x[1] - r2x[0]) + (r2y[1] - r2y[0]);
  if (d1 < 24) { bad(`p2-racer: P1 barely moved (spread ${d1})`); return; }
  if (d2 < 24) { bad(`p2-racer: P2 barely moved (spread ${d2})`); return; }
  if (diffs === 0)
    ok(`p2 racer (NES_ASM_PLAYER2 + NES_ASM_RACER): C ≡ ASM P1 px/py AND P2 px2/py2 at every matched tick over `
      + `${compared} ticks (both cars steer+accelerate, COS16 velocity + slide collision; P1 spread ${d1}, P2 spread ${d2})`);
  else bad(`p2-racer: divergence — ${diffs} diffs (first: ${firstDiff}) over ${compared} matched ticks`);
}

// ---- Player-2 platformer (2-player, BW_GAME_STYLE 0 + PLAYER2_ENABLED). P1 runs
// the ASM plat_update, P2 runs the ASM p2_plat_update (simpler: walk + UP-jump +
// gravity, no ladder/ceiling). Both walk+jump their own pad. Compares px/py + px2/py2.
function makeP2PlatState() {
  const cols = 64, rows = 30, floorRow = 26;
  const beh = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let c = 0; c < cols; c++) beh[floorRow][c] = 1;               // SOLID floor
  for (let r = floorRow - 1; r >= floorRow - 4; r--) { beh[r][20] = 2; beh[r][44] = 2; } // WALL columns
  const bg = {
    name: 'bg', dimensions: { screens_x: 2, screens_y: 1 },
    nametable: Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ tile: 0, palette: 0 }))),
    behaviour: beh,
  };
  const sprites = [
    { role: 'player', name: 'hero', width: 2, height: 2, cells: H.mkCells(2, 2) },
    { role: 'player', name: 'hero2', width: 2, height: 2, cells: H.mkCells(2, 2) },
  ];
  const s = {
    name: 'p2plat', version: 1, universal_bg: 0x21, sprites,
    sprite_tiles: H.blankPool(), bg_tiles: H.blankPool(),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x0F, 0x10, 0x30] })),
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    backgrounds: [bg], behaviour_types: H.BEHAVIOUR_TYPES, selectedBgIdx: 0, builder: win.BuilderDefaults(),
  };
  s.builder.modules.game.config.type = 'platformer';
  s.builder.modules.players.config.count = 2;
  s.builder.modules.players.submodules.player1.enabled = true;
  s.builder.modules.players.submodules.player2.enabled = true;
  return s;
}

// P1 walks right + periodic UP-jump; P2 walks left + periodic UP-jump (offset phase).
const stepP2P = (n) => {
  const tk = rd16(n, TICK);
  n.buttonDown(1, H.BTN.RIGHT); if (tk % 40 < 2) n.buttonDown(1, H.BTN.UP);
  n.buttonDown(2, H.BTN.LEFT);  if (tk % 40 >= 20 && tk % 40 < 22) n.buttonDown(2, H.BTN.UP);
  n.frame();
  n.buttonUp(1, H.BTN.RIGHT); n.buttonUp(1, H.BTN.UP);
  n.buttonUp(2, H.BTN.LEFT);  n.buttonUp(2, H.BTN.UP);
};

async function runP2Platformer() {
  const s = makeP2PlatState();
  const mainC = win.BuilderAssembler.assemble(s, tpl);
  if (/^#define BW_GAME_STYLE [123]\b/m.test(mainC) || /^#define BW_SMB_JUMP\b/m.test(mainC)) { bad('p2-plat: not a plain platformer'); return; }
  const payload = {
    state: s, playerSpriteIdx: 0, playerStart: { x: 40, y: 180 },
    playerSpriteIdx2: 1, playerStart2: { x: 300, y: 180 }, mode: 'browser',
    customMainC: withProbe2(mainC), sceneSprites: [],
  };
  const rc = await H.buildRom(PORT_C, payload);
  const ra = await H.buildRom(PORT_A, payload);
  if (!rc.ok) { bad(`p2-plat: C build failed (${rc.stage}): ` + String(rc.log || '').slice(-300)); return; }
  if (!ra.ok) { bad(`p2-plat: ASM build failed (${ra.stage}): ` + String(ra.log || '').slice(-300)); return; }
  if (rc.romBytes.equals(ra.romBytes)) { bad('p2-plat: ASM ROM == C ROM (NES_ASM_PLAYER2 did not engage)'); return; }

  const c = boot(rc.romBytes), a = boot(ra.romBytes);
  let bootF = 0;
  while (bootF < 400 && (rd16(c, TICK) > 60000 || rd16(a, TICK) > 60000)) { stepP2P(c); stepP2P(a); bootF++; }
  if (rd16(c, TICK) > 60000 || rd16(a, TICK) > 60000) { bad('p2-plat: game loop never started'); return; }

  let diffs = 0, firstDiff = '', compared = 0;
  const p1x0 = rd16(c, PX), p2x0 = rd16(c, PX2);
  let p1xMax = p1x0, p2xMin = p2x0;
  let p1yMin = 255, p1yMax = 0, p2yMin = 255, p2yMax = 0;
  for (let step = 0; step < 24000 && compared < 400; step++) {
    const tc = rd16(c, TICK), ta = rd16(a, TICK);
    if (tc > 60000 || ta > 60000) { bad('p2-plat: tick overflowed'); return; }
    if (tc !== ta) { if (tc < ta) stepP2P(c); else stepP2P(a); continue; }
    const c1x = rd16(c, PX), a1x = rd16(a, PX), c1y = rd16(c, PY), a1y = rd16(a, PY);
    const c2x = rd16(c, PX2), a2x = rd16(a, PX2), c2y = rd16(c, PY2), a2y = rd16(a, PY2);
    if (c1x !== a1x || c1y !== a1y || c2x !== a2x || c2y !== a2y) {
      diffs++; if (!firstDiff) firstDiff = `tick ${tc}: C p1(${c1x},${c1y}) p2(${c2x},${c2y}) A p1(${a1x},${a1y}) p2(${a2x},${a2y})`;
    }
    if (c1x > p1xMax) p1xMax = c1x;
    if (c2x < p2xMin) p2xMin = c2x;
    if (c1y < p1yMin) p1yMin = c1y; if (c1y > p1yMax) p1yMax = c1y;
    if (c2y < p2yMin) p2yMin = c2y; if (c2y > p2yMax) p2yMax = c2y;
    compared++;
    stepP2P(c); stepP2P(a);
  }

  if (compared < 300) { bad(`p2-plat: too few matched-tick samples (${compared})`); return; }
  if (p1xMax <= p1x0 + 8) { bad(`p2-plat: P1 did not walk right (${p1x0}->${p1xMax})`); return; }
  if (p2xMin >= p2x0 - 8) { bad(`p2-plat: P2 did not walk left (${p2x0}->${p2xMin})`); return; }
  if (p1yMax - p1yMin < 8 || p2yMax - p2yMin < 8) { bad(`p2-plat: a player never jumped (P1 py range ${p1yMax - p1yMin}, P2 ${p2yMax - p2yMin})`); return; }
  if (diffs === 0)
    ok(`p2 platformer (NES_ASM_PLAYER2): C ≡ ASM P1 px/py AND P2 px2/py2 at every matched tick over `
      + `${compared} ticks (P1 walk+jump ${p1x0}->${p1xMax}, P2 walk+jump ${p2x0}->${p2xMin}, gravity + wall bumps)`);
  else bad(`p2-plat: divergence — ${diffs} diffs (first: ${firstDiff}) over ${compared} matched ticks`);
}

// ---- Player-2 runner (2-player, BW_GAME_STYLE 2 + PLAYER2_ENABLED). P1 autoscrolls
// (ASM run_update) + jumps; P2 does the walk-only ASM p2_run_update via pad2. The C
// reference runs both in C. Compares P1 px/py + P2 px2/py2.
function makeP2RunnerState() {
  const cols = 64, rows = 30, floorRow = 26;
  const beh = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let c = 0; c < cols; c++) beh[floorRow][c] = 1;             // SOLID floor
  for (let r = floorRow - 1; r >= floorRow - 3; r--) beh[r][40] = 2; // WALL for P2 to bump
  const bg = {
    name: 'bg', dimensions: { screens_x: 2, screens_y: 1 },
    nametable: Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ tile: 0, palette: 0 }))),
    behaviour: beh,
  };
  const sprites = [
    { role: 'player', name: 'hero', width: 2, height: 2, cells: H.mkCells(2, 2) },
    { role: 'player', name: 'hero2', width: 2, height: 2, cells: H.mkCells(2, 2) },
  ];
  const s = {
    name: 'p2run', version: 1, universal_bg: 0x21, sprites,
    sprite_tiles: H.blankPool(), bg_tiles: H.blankPool(),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x0F, 0x10, 0x30] })),
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    backgrounds: [bg], behaviour_types: H.BEHAVIOUR_TYPES, selectedBgIdx: 0, builder: win.BuilderDefaults(),
  };
  s.builder.modules.game.config.type = 'runner';
  s.builder.modules.players.config.count = 2;
  s.builder.modules.players.submodules.player1.enabled = true;
  s.builder.modules.players.submodules.player2.enabled = true;
  return s;
}

// P1 taps A to jump (it autoscrolls automatically); P2 walks RIGHT via pad2.
const stepP2Run = (n) => {
  const tk = rd16(n, TICK);
  if (tk % 44 < 2) n.buttonDown(1, H.BTN.A);
  n.buttonDown(2, H.BTN.RIGHT);
  n.frame();
  n.buttonUp(1, H.BTN.A); n.buttonUp(2, H.BTN.RIGHT);
};

async function runP2Runner() {
  const s = makeP2RunnerState();
  const mainC = win.BuilderAssembler.assemble(s, tpl);
  if (!/^#define BW_GAME_STYLE 2\b/m.test(mainC)) { bad('p2-runner: not a runner build'); return; }
  const payload = {
    state: s, playerSpriteIdx: 0, playerStart: { x: 24, y: 180 },
    playerSpriteIdx2: 1, playerStart2: { x: 200, y: 180 }, mode: 'browser',
    customMainC: withProbe2(mainC), sceneSprites: [],
  };
  const rc = await H.buildRom(PORT_C, payload);
  const ra = await H.buildRom(PORT_A, payload);
  if (!rc.ok) { bad(`p2-runner: C build failed (${rc.stage}): ` + String(rc.log || '').slice(-300)); return; }
  if (!ra.ok) { bad(`p2-runner: ASM build failed (${ra.stage}): ` + String(ra.log || '').slice(-300)); return; }
  if (rc.romBytes.equals(ra.romBytes)) { bad('p2-runner: ASM ROM == C ROM (NES_ASM_PLAYER2 did not engage)'); return; }

  const c = boot(rc.romBytes), a = boot(ra.romBytes);
  let bootF = 0;
  while (bootF < 400 && (rd16(c, TICK) > 60000 || rd16(a, TICK) > 60000)) { stepP2Run(c); stepP2Run(a); bootF++; }
  if (rd16(c, TICK) > 60000 || rd16(a, TICK) > 60000) { bad('p2-runner: game loop never started'); return; }

  let diffs = 0, firstDiff = '', compared = 0;
  const p1x0 = rd16(c, PX), p2x0 = rd16(c, PX2);
  let p1xMax = p1x0, p2xMax = p2x0;
  for (let step = 0; step < 24000 && compared < 400; step++) {
    const tc = rd16(c, TICK), ta = rd16(a, TICK);
    if (tc > 60000 || ta > 60000) { bad('p2-runner: tick overflowed'); return; }
    if (tc !== ta) { if (tc < ta) stepP2Run(c); else stepP2Run(a); continue; }
    const c1x = rd16(c, PX), a1x = rd16(a, PX), c1y = rd16(c, PY), a1y = rd16(a, PY);
    const c2x = rd16(c, PX2), a2x = rd16(a, PX2), c2y = rd16(c, PY2), a2y = rd16(a, PY2);
    if (c1x !== a1x || c1y !== a1y || c2x !== a2x || c2y !== a2y) {
      diffs++; if (!firstDiff) firstDiff = `tick ${tc}: C p1(${c1x},${c1y}) p2(${c2x},${c2y}) A p1(${a1x},${a1y}) p2(${a2x},${a2y})`;
    }
    if (c1x > p1xMax) p1xMax = c1x;
    if (c2x > p2xMax) p2xMax = c2x;
    compared++;
    stepP2Run(c); stepP2Run(a);
  }

  if (compared < 300) { bad(`p2-runner: too few matched-tick samples (${compared})`); return; }
  if (p1xMax <= p1x0 + 8) { bad(`p2-runner: P1 did not autoscroll (${p1x0}->${p1xMax})`); return; }
  if (p2xMax <= p2x0 + 8) { bad(`p2-runner: P2 did not walk right (${p2x0}->${p2xMax})`); return; }
  if (diffs === 0)
    ok(`p2 runner (NES_ASM_PLAYER2): C ≡ ASM P1 px/py AND P2 px2/py2 at every matched tick over `
      + `${compared} ticks (P1 autoscroll ${p1x0}->${p1xMax}, P2 walk ${p2x0}->${p2xMax} + wall bump)`);
  else bad(`p2-runner: divergence — ${diffs} diffs (first: ${firstDiff}) over ${compared} matched ticks`);
}

// ---- Racer lap-FSM coverage (2-player). The other racer cases never place
// CHECKPOINT/FINISH tiles, so rc_laps / p2_rc_laps (the checkpoint/finish FSM) and
// the brake/reverse drive path go unexercised in the WIRED build (only the asm-lab
// leaves cover them). This drives both cars across checkpoint(5) + finish(7) tiles,
// with P2 also braking/reversing, and matched-tick compares px/py/px2/py2 PLUS the
// FSM state (racer_cp_stage/laps/finished + the *2 twins).
const RCP = 0x071C, RLP = 0x071D, RFN = 0x071E, RCP2 = 0x0720, RLP2 = 0x0721, RFN2 = 0x0722;
function withProbeRacerLaps(mainC) {
  const inj = '{static unsigned int _tk; ++_tk;'
    + `(*(unsigned char*)${TICK})=(unsigned char)(_tk&0xFF);(*(unsigned char*)${TICK + 1})=(unsigned char)(_tk>>8);`
    + `(*(unsigned char*)${PX})=(unsigned char)px;(*(unsigned char*)${PX + 1})=(unsigned char)(px>>8);`
    + `(*(unsigned char*)${PY})=(unsigned char)py;(*(unsigned char*)${PY + 1})=(unsigned char)(py>>8);`
    + `(*(unsigned char*)${PX2})=(unsigned char)px2;(*(unsigned char*)${PX2 + 1})=(unsigned char)(px2>>8);`
    + `(*(unsigned char*)${PY2})=(unsigned char)py2;(*(unsigned char*)${PY2 + 1})=(unsigned char)(py2>>8);`
    + `(*(unsigned char*)${RCP})=racer_cp_stage;(*(unsigned char*)${RLP})=racer_laps;(*(unsigned char*)${RFN})=racer_finished;`
    + `(*(unsigned char*)${RCP2})=racer_cp_stage2;(*(unsigned char*)${RLP2})=racer_laps2;(*(unsigned char*)${RFN2})=racer_finished2;} `;
  return mainC.replace('while (oam_idx < 256) {', inj + 'while (oam_idx < 256) {');
}

function makeRacerLapsState() {
  const cols = 64, rows = 30;
  const beh = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let c = 0; c < cols; c++) { beh[0][c] = 1; beh[1][c] = 1; beh[rows - 2][c] = 1; beh[rows - 1][c] = 1; }
  for (let r = 0; r < rows; r++) { beh[r][0] = 1; beh[r][1] = 1; beh[r][cols - 2] = 1; beh[r][cols - 1] = 1; }
  // CHECKPOINT (behaviour slot 5) + FINISH (slot 7) columns spanning the play area
  // (not solid, so the cars drive THROUGH them; the centre-cell FSM picks them up).
  for (let r = 3; r <= 26; r++) { beh[r][15] = 5; beh[r][30] = 6; beh[r][45] = 7; }
  const bg = {
    name: 'bg', dimensions: { screens_x: 2, screens_y: 1 },
    nametable: Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ tile: 0, palette: 0 }))),
    behaviour: beh,
  };
  const sprites = [
    { role: 'player', name: 'car1', width: 2, height: 2, cells: H.mkCells(2, 2) },
    { role: 'player', name: 'car2', width: 2, height: 2, cells: H.mkCells(2, 2) },
  ];
  const s = {
    name: 'racerlaps', version: 1, universal_bg: 0x21, sprites,
    sprite_tiles: H.blankPool(), bg_tiles: H.blankPool(),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x0F, 0x10, 0x30] })),
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    backgrounds: [bg], behaviour_types: H.BEHAVIOUR_TYPES, selectedBgIdx: 0, builder: win.BuilderDefaults(),
  };
  s.builder.modules.game.config.type = 'racer';
  s.builder.modules.players.config.count = 2;
  s.builder.modules.players.submodules.player1.enabled = true;
  s.builder.modules.players.submodules.player2.enabled = true;
  return s;
}

// P1 drives STRAIGHT right (heading starts at 0 = right; no steering) so it crosses
// checkpoint(15) -> checkpoint2(30) -> finish(45) in order and completes a full lap
// (exercises the racer_laps++/finished branch). P2 accelerates, steers, and
// periodically brakes/reverses (DOWN) to exercise rc_drive's brake+reverse path.
const stepRacerLaps = (n) => {
  const tk = rd16(n, TICK);
  n.buttonDown(1, H.BTN.A);
  if (tk % 30 < 18) n.buttonDown(2, H.BTN.A); else n.buttonDown(2, H.BTN.DOWN);
  if (tk % 10 === 0) n.buttonDown(2, H.BTN.LEFT);
  n.frame();
  n.buttonUp(1, H.BTN.A);
  n.buttonUp(2, H.BTN.A); n.buttonUp(2, H.BTN.DOWN); n.buttonUp(2, H.BTN.LEFT);
};

async function runRacerLaps() {
  const s = makeRacerLapsState();
  const mainC = win.BuilderAssembler.assemble(s, tpl);
  if (!/^#define BW_GAME_STYLE 3\b/m.test(mainC)) { bad('racer-laps: not a racer build'); return; }
  const payload = {
    state: s, playerSpriteIdx: 0, playerStart: { x: 100, y: 96 },
    playerSpriteIdx2: 1, playerStart2: { x: 360, y: 160 }, mode: 'browser',
    customMainC: withProbeRacerLaps(mainC), sceneSprites: [],
  };
  const rc = await H.buildRom(PORT_C, payload);
  const ra = await H.buildRom(PORT_A, payload);
  if (!rc.ok) { bad(`racer-laps: C build failed (${rc.stage}): ` + String(rc.log || '').slice(-300)); return; }
  if (!ra.ok) { bad(`racer-laps: ASM build failed (${ra.stage}): ` + String(ra.log || '').slice(-300)); return; }
  if (rc.romBytes.equals(ra.romBytes)) { bad('racer-laps: ASM ROM == C ROM (NES_ASM did not engage)'); return; }

  const c = boot(rc.romBytes), a = boot(ra.romBytes);
  let bootF = 0;
  while (bootF < 400 && (rd16(c, TICK) > 60000 || rd16(a, TICK) > 60000)) { stepRacerLaps(c); stepRacerLaps(a); bootF++; }
  if (rd16(c, TICK) > 60000 || rd16(a, TICK) > 60000) { bad('racer-laps: game loop never started'); return; }

  let diffs = 0, firstDiff = '', compared = 0, sawCp = false, sawLapOrFin = false;
  const rd8 = (n, x) => n.cpu.mem[x] & 0xFF;
  for (let step = 0; step < 24000 && compared < 500; step++) {
    const tc = rd16(c, TICK), ta = rd16(a, TICK);
    if (tc > 60000 || ta > 60000) { bad('racer-laps: tick overflowed'); return; }
    if (tc !== ta) { if (tc < ta) stepRacerLaps(c); else stepRacerLaps(a); continue; }
    const fC = [rd16(c, PX), rd16(c, PY), rd16(c, PX2), rd16(c, PY2), rd8(c, RCP), rd8(c, RLP), rd8(c, RFN), rd8(c, RCP2), rd8(c, RLP2), rd8(c, RFN2)];
    const fA = [rd16(a, PX), rd16(a, PY), rd16(a, PX2), rd16(a, PY2), rd8(a, RCP), rd8(a, RLP), rd8(a, RFN), rd8(a, RCP2), rd8(a, RLP2), rd8(a, RFN2)];
    if (!fC.every((v, i) => v === fA[i])) { diffs++; if (!firstDiff) firstDiff = `tick ${tc}: C[${fC}] A[${fA}]`; }
    if (fC[4] > 0 || fC[7] > 0) sawCp = true;                 // a checkpoint was armed (cp_stage advanced)
    if (fC[5] > 0 || fC[8] > 0 || fC[6] > 0 || fC[9] > 0) sawLapOrFin = true;  // a lap counted / finished
    compared++;
    stepRacerLaps(c); stepRacerLaps(a);
  }

  if (compared < 350) { bad(`racer-laps: too few matched-tick samples (${compared})`); return; }
  if (!sawCp) { bad('racer-laps: neither car ever armed a checkpoint — the FSM was not exercised (adjust the track)'); return; }
  if (!sawLapOrFin) { bad('racer-laps: no lap ever counted — the racer_laps++/finished branch was not exercised (adjust the track)'); return; }
  if (diffs === 0)
    ok(`racer lap FSM (NES_ASM_RACER + NES_ASM_PLAYER2): C ≡ ASM px/py/px2/py2 AND cp_stage/laps/finished (x2) at every matched tick over `
      + `${compared} ticks (both cars drive across checkpoint+finish tiles${sawLapOrFin ? ', laps counted' : ''}; P2 brakes/reverses)`);
  else bad(`racer-laps: divergence — ${diffs} diffs (first: ${firstDiff}) over ${compared} matched ticks`);
}

// Phase 2d — the P1 OAM DRAW loop on hand-written 6502 (pdraw_asm.s / draw_player).
// Isolation: both sides run the SAME (ASM) physics, so px/py/plrdir/anim_base are
// byte-identical; the ONLY difference is C-draw (PORT_A) vs ASM-draw (PORT_D,
// PLAYGROUND_ASM_PDRAW=1). Any OAM divergence is therefore a pure draw bug. Drive
// the player RIGHT across screen 2 (u16 base_x + scrolled world_to_screen), then
// LEFT (plrdir=0x40 -> horizontal-flip path), comparing the P1 OAM entries
// (spriteMem[0 .. PLAYER_W*PLAYER_H*4)) at every matched tick. Covers square + two
// non-square player dims (the tile/attr running-pointer walk + the (PW-1-c) flip).
async function runPDraw(pw = 2, ph = 2) {
  const N = pw * ph * 4;
  const dimTag = (pw === 2 && ph === 2) ? '' : ` ${pw}x${ph}`;
  const label = `P1 OAM draw${dimTag}`;
  const s = makeState(2, pw, ph);                 // 2-screen: u16 px/py + world_to_screen
  const mainC = withProbe(win.BuilderAssembler.assemble(s, tpl));
  const payload = { state: s, playerSpriteIdx: 0, playerStart: { x: 24, y: 120 }, mode: 'browser', customMainC: mainC, sceneSprites: [] };
  const ra = await H.buildRom(PORT_A, payload);   // ASM physics + C draw (reference)
  const rd = await H.buildRom(PORT_D, payload);   // ASM physics + ASM draw
  if (!ra.ok) { bad(`${label}: C-draw build failed (${ra.stage}): ` + String(ra.log || '').slice(-300)); return; }
  if (!rd.ok) { bad(`${label}: ASM-draw build failed (${rd.stage}): ` + String(rd.log || '').slice(-300)); return; }
  if (ra.romBytes.equals(rd.romBytes)) { bad(`${label}: ASM-draw ROM == C-draw ROM (NES_ASM_PDRAW did not engage)`); return; }

  const c = boot(ra.romBytes), a = boot(rd.romBytes);
  const oamP1 = (n) => { const o = []; for (let i = 0; i < N; i++) o.push(n.ppu.spriteMem[i] & 0xFF); return o; };
  const press = (n, btns) => { for (const b of btns) n.buttonDown(1, b); n.frame(); for (const b of btns) n.buttonUp(1, b); };
  let bf = 0;
  while (bf < 400 && (rd16(c, TICK) > 60000 || rd16(a, TICK) > 60000)) { press(c, []); press(a, []); bf++; }
  if (rd16(c, TICK) > 60000 || rd16(a, TICK) > 60000) { bad(`${label}: game loop never started`); return; }

  let diffs = 0, cmp = 0, firstDiff = '', flipSeen = false;
  const pxStart = rd16(c, PX); let pxMax = pxStart;
  for (let step = 0; step < 340 && cmp < 320; step++) {
    const btns = step < 260 ? [H.BTN.RIGHT] : [H.BTN.LEFT];   // right (cross screen 2), then left (flip)
    press(c, btns); press(a, btns);
    const tc = rd16(c, TICK), ta = rd16(a, TICK);
    if (tc !== ta) { bad(`${label}: physics desynced (C tick ${tc}, ASM tick ${ta}) — not a pure draw comparison`); return; }
    const oc = oamP1(c), oa = oamP1(a);
    for (let i = 0; i < N; i++) { if (oc[i] !== oa[i]) { diffs++; if (!firstDiff) firstDiff = `step ${step} tick ${tc} oam[${i}]: C=${oc[i]} ASM=${oa[i]}`; break; } }
    for (let i = 2; i < N; i += 4) { if (oc[i] & 0x40) flipSeen = true; }  // attr byte with H-flip bit
    const px = rd16(c, PX); if (px > pxMax) pxMax = px;
    cmp++;
  }

  if (cmp < 300) { bad(`${label}: too few samples (${cmp})`); return; }
  if (pxMax <= pxStart + 16) { bad(`${label}: player did not move (px ${pxStart}->${pxMax})`); return; }
  if (pxMax < 256) { bad(`${label}: player never crossed to screen 2 (px max ${pxMax}) — u16 base_x path not exercised`); return; }
  if (!flipSeen) { bad(`${label}: horizontal-flip (plrdir 0x40) never occurred — flip path not exercised`); return; }
  if (diffs === 0)
    ok(`${label} (NES_ASM_PDRAW): C-draw ≡ ASM-draw OAM at every matched tick over ${cmp} ticks `
      + `(px ${pxStart}->${pxMax} across screen 2, H-flip exercised)`);
  else bad(`${label}: OAM divergence — ${diffs} diffs (first: ${firstDiff}) over ${cmp} matched ticks`);
}

// Phase 2d — the PLAYER-2 draw twin (pdraw_asm.s / draw_player2), for a 2-player
// non-racer build with no tagged P2 animation. Same isolation as runPDraw: both
// sides run identical ASM physics (P1 td_update + P2 p2_td_update), so the only
// difference is C-draw vs ASM-draw. Compares the P1+P2 OAM entries. P1 drives
// RIGHT across screen 2; P2 drives LEFT (plrdir2=0x40 -> P2 horizontal-flip path).
async function runPDraw2P() {
  const label = 'P1+P2 OAM draw (2P)';
  const cols = 64, rows = 30;   // 2-screen -> scroll build (pdraw needs is_scroll)
  const beh = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (const [c, r] of [[12, 6], [12, 7], [34, 9], [48, 16]]) beh[r][c] = 2;
  const bg = { name: 'bg', dimensions: { screens_x: 2, screens_y: 1 },
    nametable: Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ tile: 0, palette: 0 }))),
    behaviour: beh };
  const sprites = [
    { role: 'player', name: 'hero', width: 2, height: 2, cells: H.mkCells(2, 2) },
    { role: 'player', name: 'hero2', width: 2, height: 2, cells: H.mkCells(2, 2) },
  ];
  const s = {
    name: 'p2draw', version: 1, universal_bg: 0x21, sprites,
    sprite_tiles: H.blankPool(), bg_tiles: H.blankPool(),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x0F, 0x10, 0x30] })),
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    backgrounds: [bg], behaviour_types: H.BEHAVIOUR_TYPES, selectedBgIdx: 0, builder: win.BuilderDefaults(),
  };
  s.builder.modules.game.config.type = 'topdown';
  s.builder.modules.players.config.count = 2;
  s.builder.modules.players.submodules.player1.enabled = true;
  s.builder.modules.players.submodules.player2.enabled = true;
  const N = 2 * 2 * 4 * 2;   // P1 (2x2) + P2 (2x2) = 32 OAM bytes
  const mainC = withProbe2(win.BuilderAssembler.assemble(s, tpl));
  const payload = { state: s, playerSpriteIdx: 0, playerStart: { x: 24, y: 120 },
    playerSpriteIdx2: 1, playerStart2: { x: 200, y: 120 }, mode: 'browser', customMainC: mainC, sceneSprites: [] };
  const ra = await H.buildRom(PORT_A, payload);   // ASM P1+P2 physics + C draw
  const rd = await H.buildRom(PORT_D, payload);   // ASM P1+P2 physics + ASM draw (draw_player + draw_player2)
  if (!ra.ok) { bad(`${label}: C-draw build failed (${ra.stage}): ` + String(ra.log || '').slice(-300)); return; }
  if (!rd.ok) { bad(`${label}: ASM-draw build failed (${rd.stage}): ` + String(rd.log || '').slice(-300)); return; }
  if (ra.romBytes.equals(rd.romBytes)) { bad(`${label}: ASM-draw ROM == C-draw ROM (NES_ASM_PDRAW did not engage)`); return; }

  const c = boot(ra.romBytes), a = boot(rd.romBytes);
  const PX2 = 0x0718, PY2 = 0x071A;
  const oamN = (n) => { const o = []; for (let i = 0; i < N; i++) o.push(n.ppu.spriteMem[i] & 0xFF); return o; };
  const press = (n) => {
    n.buttonDown(1, H.BTN.RIGHT); n.buttonDown(2, H.BTN.LEFT); n.frame();
    n.buttonUp(1, H.BTN.RIGHT); n.buttonUp(2, H.BTN.LEFT);
  };
  let bf = 0;
  while (bf < 400 && (rd16(c, TICK) > 60000 || rd16(a, TICK) > 60000)) { press(c); press(a); bf++; }
  if (rd16(c, TICK) > 60000 || rd16(a, TICK) > 60000) { bad(`${label}: game loop never started`); return; }

  let diffs = 0, cmp = 0, firstDiff = '', p2flip = false;
  const px1Start = rd16(c, PX), px2Start = rd16(c, PX2); let px1Max = px1Start, px2Min = px2Start;
  for (let step = 0; step < 340 && cmp < 320; step++) {
    press(c); press(a);
    const tc = rd16(c, TICK), ta = rd16(a, TICK);
    if (tc !== ta) { bad(`${label}: physics desynced (C ${tc}, ASM ${ta})`); return; }
    const oc = oamN(c), oa = oamN(a);
    for (let i = 0; i < N; i++) { if (oc[i] !== oa[i]) { diffs++; if (!firstDiff) firstDiff = `step ${step} tick ${tc} oam[${i}]: C=${oc[i]} ASM=${oa[i]}`; break; } }
    for (let i = 16 + 2; i < N; i += 4) { if (oc[i] & 0x40) p2flip = true; }   // P2 attr bytes (second half)
    const px1 = rd16(c, PX), px2 = rd16(c, PX2);
    if (px1 > px1Max) px1Max = px1;
    if (px2 < px2Min) px2Min = px2;
    cmp++;
  }

  if (cmp < 300) { bad(`${label}: too few samples (${cmp})`); return; }
  if (px1Max < 256) { bad(`${label}: P1 never crossed to screen 2 (px max ${px1Max})`); return; }
  if (px2Min >= px2Start) { bad(`${label}: P2 did not move left (px2 ${px2Start}->${px2Min})`); return; }
  if (!p2flip) { bad(`${label}: P2 horizontal-flip never occurred — draw_player2 flip path not exercised`); return; }
  if (diffs === 0)
    ok(`${label} (NES_ASM_PDRAW + NES_ASM_PLAYER2): C-draw ≡ ASM-draw OAM at every matched tick over ${cmp} ticks `
      + `(P1 ${px1Start}->${px1Max} across screen 2, P2 ${px2Start}->${px2Min} left with H-flip)`);
  else bad(`${label}: OAM divergence — ${diffs} diffs (first: ${firstDiff}) over ${cmp} matched ticks`);
}

const srvC = await H.startServer(PORT_C, { PLAYGROUND_NO_ASM: '1' });
const srvA = await H.startServer(PORT_A, { PLAYGROUND_ASM_PLAYER: '1' });
const srvD = await H.startServer(PORT_D, { PLAYGROUND_ASM_PLAYER: '1', PLAYGROUND_ASM_PDRAW: '1' });
try {
  await runCase(1);        // top-down non-scroll: u8 px/py
  await runCase(2);        // top-down scroll: u16 px/py
  await runCase(1, 3, 1);  // non-square player (3 wide x 1 tall): PW8/PH8 with W,H != 2
  await runCase(1, 1, 3);  // non-square player (1 wide x 3 tall)
  await runPlatformer();   // platformer: walk + jump + gravity + ladder
  await runSmb();          // SMB: accel/skid run + A-jump + variable-cut + gravity + ladder
  await runRunner();       // auto-runner: autoscroll + track-end wrap respawn + A-jump + gravity
  await runRacer();        // top-down racer: steer + accelerate + COS16 velocity + slide collision
  await runP2Topdown();    // 2-player top-down: P1 td_update + P2 p2_td_update, both ASM
  await runP2Racer();      // 2-player racer: P1 racer_update + P2 p2_racer_update, both ASM
  await runP2Platformer(); // 2-player platformer: P1 plat_update + P2 p2_plat_update, both ASM
  await runP2Runner();     // 2-player runner: P1 run_update + P2 p2_run_update (walk-only), both ASM
  await runRacerLaps();    // racer lap FSM (rc_laps/p2_rc_laps) + brake/reverse coverage
  await runPDraw();        // P1 OAM draw loop (pdraw_asm.s): C-draw ≡ ASM-draw OAM
  await runPDraw(2, 3);    // non-square player draw (2 wide x 3 tall)
  await runPDraw(3, 1);    // non-square player draw (3 wide x 1 tall)
  await runPDraw2P();      // P2 draw twin (draw_player2): P1+P2 OAM C-draw ≡ ASM-draw
} catch (e) {
  bad('threw: ' + (e && e.stack || e));
} finally {
  await H.stopServer(srvC.srv);
  await H.stopServer(srvA.srv);
  await H.stopServer(srvD.srv);
}

if (failed) process.exit(1);
console.log('\nasm-player: the ASM td_update + plat_update drive the top-down + platformer player identically to the C.');
