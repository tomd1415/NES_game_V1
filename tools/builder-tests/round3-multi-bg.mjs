// Phase B+ Round 3 — multi-background doors end-to-end.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = '/home/duguid/projects/nesgame/attempt1';
const WEB  = path.join(ROOT, 'tools', 'tile_editor_web');
const PORT = 18776;

globalThis.window = globalThis;
for (const f of ['sprite-render.js', 'builder-assembler.js',
    'builder-modules.js', 'builder-validators.js']) {
  new Function(fs.readFileSync(path.join(WEB, f), 'utf8'))();
}
const tpl = fs.readFileSync(path.join(WEB, 'builder-templates/platformer.c'), 'utf8');
const mkCells = (w, h, t = 1) => Array.from({ length: h }, () =>
  Array.from({ length: w }, () => ({ tile: t, palette: 0, empty: false })));

function mkBg(name, tile, sx = 1, sy = 1) {
  const cols = 32 * sx;
  const rows = 30 * sy;
  return {
    name, dimensions: { screens_x: sx, screens_y: sy },
    nametable: Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => ({ tile, palette: 0 }))),
    behaviour: (() => {
      const m = Array.from({ length: rows }, () => Array(cols).fill(0));
      for (let c = 0; c < cols; c++) m[rows - 2][c] = 1;
      m[10][10] = 4;  // door
      return m;
    })(),
  };
}

function mkState({ bgCount = 1, doorsOn = false, targetBg = -1,
                   screensX = 1, screensY = 1 } = {}) {
  const sprites = [
    { role: 'player', name: 'hero',  width: 2, height: 2, cells: mkCells(2, 2) },
    { role: 'enemy',  name: 'goomba', width: 2, height: 2, cells: mkCells(2, 2) },
  ];
  const backgrounds = [];
  for (let i = 0; i < bgCount; i++) {
    backgrounds.push(mkBg('room' + i, i + 1, screensX, screensY));
  }
  const s = {
    name: 'r3', version: 1, universal_bg: 0x21, sprites, animations: [],
    animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    sprite_tiles: Array.from({ length: 256 }, () => ({
      pixels: Array.from({ length: 8 }, () => Array(8).fill(0)), name: '',
    })),
    bg_tiles: Array.from({ length: 256 }, () => ({
      pixels: Array.from({ length: 8 }, () => Array(8).fill(0)), name: '',
    })),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x0F, 0x10, 0x30] })),
    backgrounds, selectedBgIdx: 0,
    behaviour_types: [
      { id: 0, name: 'none' }, { id: 1, name: 'solid_ground' },
      { id: 2, name: 'wall' }, { id: 3, name: 'platform' },
      { id: 4, name: 'door' }, { id: 5, name: 'trigger' },
      { id: 6, name: 'ladder' },
    ],
    builder: window.BuilderDefaults(),
  };
  if (doorsOn) {
    s.builder.modules.doors.enabled = true;
    s.builder.modules.doors.config.targetBgIdx = targetBg;
  }
  return s;
}

// V1: targetBgIdx out of range → error
{
  const s = mkState({ bgCount: 1, doorsOn: true, targetBg: 3 });
  const p = window.BuilderValidators.validate(s);
  if (!p.some(x => x.id === 'doors-target-invalid-bg' && x.severity === 'error')) {
    console.error('FAIL V1: expected doors-target-invalid-bg error'); process.exit(1);
  }
  console.log('✓ V1 doors-target-invalid-bg error fires on out-of-range target');
}
// V2: same-room (targetBg = -1) → no multi-bg emission
{
  const s = mkState({ bgCount: 1, doorsOn: true, targetBg: -1 });
  const out = window.BuilderAssembler.assemble(s, tpl);
  if (/^#define BW_DOORS_MULTIBG_ENABLED 1/m.test(out)) {
    console.error('FAIL A1: multi-bg macro emitted in same-room mode');
    process.exit(1);
  }
  console.log('✓ A1 same-room doors keep single-bg path (no BW_DOORS_MULTIBG_ENABLED)');
}
// V3: multi-bg → emits macro + swap call
{
  const s = mkState({ bgCount: 2, doorsOn: true, targetBg: 1 });
  const out = window.BuilderAssembler.assemble(s, tpl);
  if (!/^#define BW_DOORS_MULTIBG_ENABLED 1/m.test(out)) {
    console.error('FAIL A2: expected BW_DOORS_MULTIBG_ENABLED'); process.exit(1);
  }
  if (!/^#define BW_DOOR_TARGET_BG 1/m.test(out)) {
    console.error('FAIL A3: expected BW_DOOR_TARGET_BG 1'); process.exit(1);
  }
  if (!/load_background_n\(BW_DOOR_TARGET_BG\)/.test(out)) {
    console.error('FAIL A4: expected load_background_n call'); process.exit(1);
  }
  console.log('✓ A multi-bg doors emit macros + load_background_n swap');
}

// /play end-to-end
const srv = spawn('python3',
  [path.join(ROOT, 'tools', 'playground_server.py')],
  { env: { ...process.env, PLAYGROUND_PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'] });
await sleep(1500);
try {
  // E1: single-bg, doors off → baseline
  {
    const s = mkState();
    const r = await (await fetch(`http://127.0.0.1:${PORT}/play`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        state: s, playerSpriteIdx: 0, playerStart: { x: 60, y: 120 },
        sceneSprites: [{ spriteIdx: 1, x: 96, y: 120 }],
        mode: 'browser', customMainC: window.BuilderAssembler.assemble(s, tpl),
      }),
    })).json();
    if (!r.ok) { console.error('FAIL E1:', r.stage, (r.log||'').slice(-1500)); process.exit(2); }
    console.log('✓ E1 single-bg build (' + r.size + ' bytes, ' + r.build_time_ms + ' ms)');
  }
  // E2: 2 backgrounds, doors targeting bg 1
  {
    const s = mkState({ bgCount: 2, doorsOn: true, targetBg: 1 });
    const r = await (await fetch(`http://127.0.0.1:${PORT}/play`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        state: s, playerSpriteIdx: 0, playerStart: { x: 60, y: 120 },
        sceneSprites: [{ spriteIdx: 1, x: 96, y: 120 }],
        mode: 'browser', customMainC: window.BuilderAssembler.assemble(s, tpl),
      }),
    })).json();
    if (!r.ok) { console.error('FAIL E2:', r.stage, (r.log||'').slice(-1800)); process.exit(2); }
    console.log('✓ E2 multi-bg doors build (' + r.size + ' bytes, ' + r.build_time_ms + ' ms)');
  }
  // E3: 3 backgrounds, target bg 2, dialogue on, damage on — kitchen-sink
  {
    const s = mkState({ bgCount: 3, doorsOn: true, targetBg: 2 });
    s.sprites.push({ role: 'npc', name: 'guide', width: 2, height: 2, cells: mkCells(2, 2) });
    s.builder.modules.dialogue.enabled = true;
    s.builder.modules.dialogue.config.text = 'GO EAST';
    s.builder.modules.damage.enabled = true;
    s.builder.modules.players.submodules.player1.config.maxHp = 3;
    const r = await (await fetch(`http://127.0.0.1:${PORT}/play`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        state: s, playerSpriteIdx: 0, playerStart: { x: 60, y: 120 },
        sceneSprites: [
          { spriteIdx: 1, x: 96, y: 120 },
          { spriteIdx: 2, x: 180, y: 120 },
        ],
        mode: 'browser', customMainC: window.BuilderAssembler.assemble(s, tpl),
      }),
    })).json();
    if (!r.ok) { console.error('FAIL E3:', r.stage, (r.log||'').slice(-2000)); process.exit(2); }
    console.log('✓ E3 kitchen-sink (3 bgs + doors + dialogue + damage) (' + r.size + ' bytes, ' + r.build_time_ms + ' ms)');
  }
  // E4 — T2.1 + T2.2 (2026-04-27): 2-screen-wide world + multi-bg + door.
  // Pre-fix this scenario built fine but rendered wrong: only the first
  // 1024 bytes of the new bg got written to NT0; the second screen
  // (NT1) kept the source bg's stale tiles, and the global behaviour
  // map never swapped, so post-door collision queries returned the
  // wrong room's data.  This test asserts the *emitted source* now
  // carries the per-bg multi-screen nametable + per-bg behaviour map
  // + the door-time swap call — all three are needed for the fix to
  // actually take effect at runtime.
  {
    const s = mkState({ bgCount: 2, doorsOn: true, targetBg: 1,
                        screensX: 2, screensY: 1 });
    // Build via the shared-dir path (no customMainC) so the staged
    // scene.inc + behaviour.c land in STEP_DIR/src and the test can
    // read them back directly.  customMainC routes to a tempdir that
    // gets cleaned up post-build, hiding the emission from us.
    const r = await (await fetch(`http://127.0.0.1:${PORT}/play`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        state: s, playerSpriteIdx: 0, playerStart: { x: 60, y: 120 },
        sceneSprites: [{ spriteIdx: 1, x: 96, y: 120 }],
        mode: 'browser',
      }),
    })).json();
    if (!r.ok) {
      console.error('FAIL E4 build:', r.stage, (r.log||'').slice(-2000));
      process.exit(2);
    }
    // The shared-dir build path stages scene.inc + behaviour.c into
    // STEP_DIR/src.  Read them back to assert the new emission shape.
    const sceneInc = fs.readFileSync(
      path.join(ROOT, 'steps', 'Step_Playground', 'src', 'scene.inc'), 'utf8');
    const behaviourC = fs.readFileSync(
      path.join(ROOT, 'steps', 'Step_Playground', 'src', 'behaviour.c'), 'utf8');
    // T2.1 — bg_nametable_<n> arrays must be sized for the project's
    // 2x1 screens (= 2048 bytes), not the historic fixed 1024.
    if (!/#define BG_SCREENS_X 2/.test(sceneInc)) {
      console.error('FAIL E4-A: BG_SCREENS_X 2 missing from scene.inc');
      process.exit(2);
    }
    if (!/#define BG_NAMETABLE_BYTES 2048/.test(sceneInc)) {
      console.error('FAIL E4-B: BG_NAMETABLE_BYTES 2048 missing from scene.inc');
      process.exit(2);
    }
    if (!/bg_nametable_0\[BG_NAMETABLE_BYTES\]/.test(sceneInc) ||
        !/bg_nametable_1\[BG_NAMETABLE_BYTES\]/.test(sceneInc)) {
      console.error('FAIL E4-C: per-bg nametable arrays missing or wrongly sized');
      process.exit(2);
    }
    // T2.2 — per-bg behaviour maps + active pointer + swap function.
    if (!/behaviour_map_0\[/.test(behaviourC) ||
        !/behaviour_map_1\[/.test(behaviourC)) {
      console.error('FAIL E4-D: behaviour_map_0/_1 arrays missing from behaviour.c');
      process.exit(2);
    }
    if (!/active_behaviour_map\s*=\s*behaviour_map_/.test(behaviourC)) {
      console.error('FAIL E4-E: active_behaviour_map pointer missing');
      process.exit(2);
    }
    if (!/void behaviour_set_active_bg\(/.test(behaviourC)) {
      console.error('FAIL E4-F: behaviour_set_active_bg() function missing');
      process.exit(2);
    }
    if (!/return active_behaviour_map\[/.test(behaviourC)) {
      console.error('FAIL E4-G: behaviour_at must read through active_behaviour_map');
      process.exit(2);
    }
    console.log('✓ E4 multi-screen + multi-bg + door build (' + r.size +
      ' bytes) carries per-bg nametables (BG_SCREENS_X=2) + behaviour-map swap');
  }
} finally {
  srv.kill('SIGTERM');
  await sleep(300);
}
console.log('\nRound 3 (multi-bg doors) smoke-test complete.');
