// Phase B+ Round 2 — dialogue module end-to-end.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = '/home/duguid/projects/nesgame/attempt1';
const WEB  = path.join(ROOT, 'tools', 'tile_editor_web');
const PORT = 18775;

globalThis.window = globalThis;
for (const f of ['sprite-render.js', 'builder-assembler.js',
    'builder-modules.js', 'builder-validators.js']) {
  new Function(fs.readFileSync(path.join(WEB, f), 'utf8'))();
}
const tpl = fs.readFileSync(path.join(WEB, 'builder-templates/platformer.c'), 'utf8');
const mkCells = (w, h, t = 1) => Array.from({ length: h }, () =>
  Array.from({ length: w }, () => ({ tile: t, palette: 0, empty: false })));

function mkState({ withNpc = true, dialogueOn = false, text = 'HELLO' } = {}) {
  const sprites = [
    { role: 'player', name: 'hero', width: 2, height: 2, cells: mkCells(2, 2) },
    { role: 'enemy',  name: 'goomba', width: 2, height: 2, cells: mkCells(2, 2) },
  ];
  if (withNpc) sprites.push(
    { role: 'npc', name: 'villager', width: 2, height: 2, cells: mkCells(2, 2) });
  const s = {
    name: 'r2', version: 1, universal_bg: 0x21, sprites, animations: [],
    animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    sprite_tiles: Array.from({ length: 256 }, () => ({
      pixels: Array.from({ length: 8 }, () => Array(8).fill(0)), name: '',
    })),
    bg_tiles: Array.from({ length: 256 }, () => ({
      pixels: Array.from({ length: 8 }, () => Array(8).fill(0)), name: '',
    })),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x0F, 0x10, 0x30] })),
    backgrounds: [{ name: 'bg', dimensions: { screens_x: 1, screens_y: 1 },
      nametable: Array.from({ length: 30 }, () =>
        Array.from({ length: 32 }, () => ({ tile: 0, palette: 0 }))),
      behaviour: (() => {
        const m = Array.from({ length: 30 }, () => Array(32).fill(0));
        for (let c = 0; c < 32; c++) m[28][c] = 1;
        m[20][20] = 5;
        return m;
      })() }],
    behaviour_types: [
      { id: 0, name: 'none' }, { id: 1, name: 'solid_ground' },
      { id: 2, name: 'wall' }, { id: 3, name: 'platform' },
      { id: 4, name: 'door' }, { id: 5, name: 'trigger' },
      { id: 6, name: 'ladder' },
    ],
    selectedBgIdx: 0,
    builder: window.BuilderDefaults(),
  };
  if (dialogueOn) {
    s.builder.modules.dialogue.enabled = true;
    s.builder.modules.dialogue.config.text = text;
  }
  return s;
}

// V1: dialogue on + no NPC → error
{
  const s = mkState({ withNpc: false, dialogueOn: true });
  const p = window.BuilderValidators.validate(s);
  if (!p.some(x => x.id === 'dialogue-no-npc' && x.severity === 'error')) {
    console.error('FAIL V1: expected dialogue-no-npc error'); process.exit(1);
  }
  console.log('✓ V1 dialogue-no-npc error fires');
}
// V2: dialogue on + empty text → warn
{
  const s = mkState({ dialogueOn: true, text: '   ' });
  const p = window.BuilderValidators.validate(s);
  if (!p.some(x => x.id === 'dialogue-empty-text' && x.severity === 'warn')) {
    console.error('FAIL V2: expected dialogue-empty-text warn'); process.exit(1);
  }
  console.log('✓ V2 dialogue-empty-text warn fires');
}
// Assembler: HELLO emits as expected hex bytes
{
  const s = mkState({ dialogueOn: true, text: 'HELLO' });
  const out = window.BuilderAssembler.assemble(s, tpl);
  if (!/^#define BW_DIALOGUE_ENABLED 1/m.test(out)) {
    console.error('FAIL A1: expected BW_DIALOGUE_ENABLED'); process.exit(1);
  }
  if (!/0x48, 0x45, 0x4C, 0x4C, 0x4F, 0x00/.test(out)) {
    console.error('FAIL A2: expected HELLO byte sequence'); process.exit(1);
  }
  // Regression guard: dialogue MUST NOT call draw_text / clear_text_row
  // from per_frame — that pattern caused a double-waitvsync glitch.
  // The fix uses a pending-command flag + vblank_writes slot instead.
  if (/\bdraw_text\(BW_DIALOG_ROW/.test(out) ||
      /\bclear_text_row\(BW_DIALOG_ROW/.test(out)) {
    console.error('FAIL A3: dialogue regressed to draw_text/clear_text_row ' +
      'pattern — reintroduces the double-vblank glitch.');
    process.exit(1);
  }
  if (!/\[builder\] dialogue — PPU writes \(in vblank\)/.test(out)) {
    console.error('FAIL A4: vblank_writes block missing'); process.exit(1);
  }
  if (!/bw_dialog_cmd = 1;\s*\/\* draw \*\//.test(out)) {
    console.error('FAIL A5: per_frame pending-draw marker missing'); process.exit(1);
  }
  if (!/bw_dialog_cmd = 2;\s*\/\* clear \*\//.test(out)) {
    console.error('FAIL A6: per_frame pending-clear marker missing'); process.exit(1);
  }
  console.log('✓ A dialogue assembler: HELLO → bytes emit, vblank-writes pattern used');
}
// /play end-to-end
const srv = spawn('python3',
  [path.join(ROOT, 'tools', 'playground_server.py')],
  { env: { ...process.env, PLAYGROUND_PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'] });
await sleep(1500);
try {
  const s = mkState({ dialogueOn: true, text: 'HI THERE' });
  const r = await (await fetch(`http://127.0.0.1:${PORT}/play`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      state: s, playerSpriteIdx: 0, playerStart: { x: 60, y: 120 },
      sceneSprites: [
        { spriteIdx: 1, x: 96, y: 120 },    // enemy
        { spriteIdx: 2, x: 160, y: 120 },   // npc
      ],
      mode: 'browser', customMainC: window.BuilderAssembler.assemble(s, tpl),
    }),
  })).json();
  if (!r.ok) {
    console.error('FAIL E1:', r.stage, (r.log||'').slice(-1800));
    process.exit(2);
  }
  console.log('✓ E1 dialogue /play build (' + r.size + ' bytes, ' + r.build_time_ms + ' ms)');
} finally {
  srv.kill('SIGTERM');
  await sleep(300);
}
console.log('\nRound 2 (dialogue) smoke-test complete.');
