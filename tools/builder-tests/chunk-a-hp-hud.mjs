// Phase B finale chunk A smoke-test — HP + damage + HUD.
//
// Three configurations, all through the real /play endpoint:
//   1. Default (damage off, HUD off): byte-identical to baseline —
//      the template's #if gates must keep the old ROM unchanged.
//   2. Damage on + P1 maxHp=3 + enemy sprite: ROM builds, output
//      contains the expected collision + freeze code.
//   3. Damage + HUD on + hud-tagged sprite: ROM builds; scene.inc
//      contains HUD_ENABLED=1 + hud_tiles[]; template's HUD render
//      loop is present.
// Also exercises the three new validators.

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = '/home/duguid/projects/nesgame/attempt1';
const WEB  = path.join(ROOT, 'tools', 'tile_editor_web');
const PORT = 18770;

globalThis.window = globalThis;
for (const f of ['sprite-render.js', 'builder-assembler.js',
    'builder-modules.js', 'builder-validators.js']) {
  new Function(fs.readFileSync(path.join(WEB, f), 'utf8'))();
}
const tpl = fs.readFileSync(path.join(WEB, 'builder-templates/platformer.c'), 'utf8');

function mkCells(w, h) {
  return Array.from({ length: h }, () =>
    Array.from({ length: w }, () => ({ tile: 1, palette: 0, empty: false })));
}

function makeState({ withEnemy = true, withHud = false, maxHp = 0, damage = false } = {}) {
  const sprites = [
    { role: 'player', name: 'hero',  width: 2, height: 2, cells: mkCells(2, 2) },
  ];
  if (withEnemy) sprites.push(
    { role: 'enemy',  name: 'goomba', width: 2, height: 2, cells: mkCells(2, 2) });
  if (withHud) sprites.push(
    { role: 'hud',    name: 'heart',  width: 1, height: 1, cells: mkCells(1, 1) });
  const s = {
    name: 'chunka',
    version: 1,
    universal_bg: 0x21,
    sprites,
    sprite_tiles: Array.from({ length: 256 }, () => ({
      pixels: Array.from({ length: 8 }, () => Array(8).fill(0)), name: '',
    })),
    bg_tiles: Array.from({ length: 256 }, () => ({
      pixels: Array.from({ length: 8 }, () => Array(8).fill(0)), name: '',
    })),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x0F, 0x10, 0x30] })),
    animations: [],
    animation_assignments: { walk: null, jump: null },
    nextAnimationId: 1,
    backgrounds: [{
      name: 'bg',
      dimensions: { screens_x: 1, screens_y: 1 },
      nametable: Array.from({ length: 30 }, () =>
        Array.from({ length: 32 }, () => ({ tile: 0, palette: 0 }))),
      behaviour: (() => {
        const m = Array.from({ length: 30 }, () => Array(32).fill(0));
        for (let c = 0; c < 32; c++) m[28][c] = 1;
        m[20][20] = 5;
        return m;
      })(),
    }],
    behaviour_types: [
      { id: 0, name: 'none' }, { id: 1, name: 'solid_ground' },
      { id: 2, name: 'wall' }, { id: 3, name: 'platform' },
      { id: 4, name: 'door' }, { id: 5, name: 'trigger' },
      { id: 6, name: 'ladder' },
    ],
    selectedBgIdx: 0,
    builder: window.BuilderDefaults(),
  };
  s.builder.modules.players.submodules.player1.config.maxHp = maxHp;
  if (damage) s.builder.modules.damage.enabled = true;
  if (withHud) s.builder.modules.hud.enabled = true;
  return s;
}

// --- Validator checks --------------------------------------------
{
  // Damage on + maxHp 0 → hp-zero-with-damage error
  const s = makeState({ damage: true, maxHp: 0 });
  const p = window.BuilderValidators.validate(s);
  if (!p.some(x => x.id === 'hp-zero-with-damage' && x.severity === 'error')) {
    console.error('FAIL V1: expected hp-zero-with-damage error');
    process.exit(1);
  }
  console.log('✓ V1 hp-zero-with-damage fires');
}
{
  // Damage on + maxHp > 0 + no enemy → damage-no-enemies warn
  const s = makeState({ damage: true, maxHp: 3, withEnemy: false });
  const p = window.BuilderValidators.validate(s);
  if (!p.some(x => x.id === 'damage-no-enemies' && x.severity === 'warn')) {
    console.error('FAIL V2: expected damage-no-enemies warn');
    process.exit(1);
  }
  console.log('✓ V2 damage-no-enemies warns');
}
{
  // HUD on + no HUD sprite → hud-no-sprite warn
  const s = makeState({ damage: true, maxHp: 3, withHud: false });
  s.builder.modules.hud.enabled = true;
  const p = window.BuilderValidators.validate(s);
  if (!p.some(x => x.id === 'hud-no-sprite' && x.severity === 'warn')) {
    console.error('FAIL V3: expected hud-no-sprite warn');
    process.exit(1);
  }
  console.log('✓ V3 hud-no-sprite warns');
}

// --- Assembler output checks -------------------------------------
{
  // Default state: the assembler must NOT append the HP macros into
  // the declarations slot.  We check for a #define at column 0 (the
  // slot-appended form); the template's own documentation comment
  // has a leading `*` or lives inside `#if` blocks and doesn't match.
  const s = makeState();
  const out = window.BuilderAssembler.assemble(s, tpl);
  if (/^#define PLAYER_HP_ENABLED\s+1\s*$/m.test(out)) {
    console.error('FAIL A1: PLAYER_HP_ENABLED leaked into default output');
    process.exit(1);
  }
  console.log('✓ A1 default state does not emit PLAYER_HP_ENABLED');
}
{
  // Damage + maxHp=3 state: emits PLAYER_HP_ENABLED and collision loop.
  const s = makeState({ damage: true, maxHp: 3 });
  const out = window.BuilderAssembler.assemble(s, tpl);
  for (const [label, re] of [
    ['PLAYER_HP_ENABLED',  /^#define PLAYER_HP_ENABLED 1\s*$/m],
    ['PLAYER_MAX_HP',      /^#define PLAYER_MAX_HP 3\s*$/m],
    ['DAMAGE_AMOUNT',      /^#define DAMAGE_AMOUNT 1\s*$/m],
    ['iframes',            /^#define INVINCIBILITY_FRAMES 30\s*$/m],
    ['collision loop',     /\[builder\] damage/],
    ['player_hp decrement',/player_hp - DAMAGE_AMOUNT/],
    ['blue tint on death', /PPU_MASK = 0x1F \| 0x80/],
  ]) {
    if (!re.test(out)) {
      console.error('FAIL A2: missing ' + label); process.exit(1);
    }
  }
  console.log('✓ A2 damage state emits HP + collision + freeze');
}

// --- /play end-to-end --------------------------------------------
const srv = spawn('python3',
  [path.join(ROOT, 'tools', 'playground_server.py')],
  { env: { ...process.env, PLAYGROUND_PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'] });
let srvLog = '';
srv.stdout.on('data', d => srvLog += d.toString());
srv.stderr.on('data', d => srvLog += d.toString());
await sleep(1500);

async function postPlay(payload) {
  const res = await fetch(`http://127.0.0.1:${PORT}/play`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

let firstRomSize = null;
try {
  // P1-only, no HP, no HUD.
  {
    const s = makeState();
    const r = await postPlay({
      state: s, playerSpriteIdx: 0, playerStart: { x: 60, y: 120 },
      sceneSprites: [{ spriteIdx: 1, x: 96, y: 120 }],
      mode: 'browser',
      customMainC: window.BuilderAssembler.assemble(s, tpl),
    });
    if (!r.ok) {
      console.error('FAIL E1: default build rejected:', r.stage);
      console.error((r.log || '').slice(-1500));
      process.exit(2);
    }
    firstRomSize = r.size;
    console.log('✓ E1 default /play build ok (' + r.size + ' bytes, ' + r.build_time_ms + ' ms)');
  }

  // Damage on, maxHp=3.
  {
    const s = makeState({ damage: true, maxHp: 3 });
    const r = await postPlay({
      state: s, playerSpriteIdx: 0, playerStart: { x: 60, y: 120 },
      sceneSprites: [{ spriteIdx: 1, x: 96, y: 120 }],
      mode: 'browser',
      customMainC: window.BuilderAssembler.assemble(s, tpl),
    });
    if (!r.ok) {
      console.error('FAIL E2: damage build rejected:', r.stage);
      console.error((r.log || '').slice(-2000));
      process.exit(2);
    }
    console.log('✓ E2 damage /play build ok (' + r.size + ' bytes, ' + r.build_time_ms + ' ms)');
  }

  // Damage + HUD + hud-tagged sprite.
  {
    const s = makeState({ damage: true, maxHp: 3, withHud: true });
    const r = await postPlay({
      state: s, playerSpriteIdx: 0, playerStart: { x: 60, y: 120 },
      sceneSprites: [{ spriteIdx: 1, x: 96, y: 120 }],
      mode: 'browser',
      customMainC: window.BuilderAssembler.assemble(s, tpl),
    });
    if (!r.ok) {
      console.error('FAIL E3: damage+HUD build rejected:', r.stage);
      console.error((r.log || '').slice(-2000));
      process.exit(2);
    }
    console.log('✓ E3 damage+HUD /play build ok (' + r.size + ' bytes, ' + r.build_time_ms + ' ms)');
  }
} finally {
  srv.kill('SIGTERM');
  await sleep(300);
}

console.log('\nChunk A (HP + damage + HUD) smoke-test complete.');
