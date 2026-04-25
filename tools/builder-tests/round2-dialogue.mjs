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
  // Regression guard: the clear path MUST NOT stamp 0x20 across the row.
  // That was the original "transparent row gets baked in" bug — the
  // fix restores each cell from bg_world_tiles (the ROM source-of-truth
  // copy of the Backgrounds-page data).  Reading VRAM via PPU_DATA is
  // NOT used — the buffered-read semantics + cc65 quirks around the
  // required dummy read broke the restore in practice.
  if (/PPU_DATA = 0x20;/.test(out)) {
    console.error('FAIL A7: dialogue regressed to writing 0x20 on clear.');
    process.exit(1);
  }
  if (/= PPU_DATA;/.test(out)) {
    console.error('FAIL A8: dialogue should not read VRAM via PPU_DATA ' +
      '— restore from bg_world_tiles instead.');
    process.exit(1);
  }
  if (!/PPU_DATA = bg_nametable_0\[dlg_src \+ dlg_j\];/.test(out)) {
    console.error('FAIL A9: dialogue clear should write bg_nametable_0[] ' +
      'back, not spaces or stale data.'); process.exit(1);
  }
  console.log('✓ A dialogue assembler: HELLO → bytes emit, bg_nametable_0 restore used');
}

// ----- autoClose + pauseOnOpen combinations -----------------------------
// Each case exercises one quadrant of the (pause × autoClose) matrix and
// asserts the exact #define values + presence/absence of the save-restore
// freeze block so the four behaviours can't regress silently.
function assembleWithDialog(overrides) {
  const s = mkState({ dialogueOn: true, text: 'HI' });
  Object.assign(s.builder.modules.dialogue.config, overrides);
  return window.BuilderAssembler.assemble(s, tpl);
}
// Default config (pauseOnOpen=true, autoClose=0) — this is what a pupil
// sees if they just tick the module and never open the config form.
{
  const out = assembleWithDialog({});
  if (!/^#define BW_DIALOG_PAUSE 1$/m.test(out)) {
    console.error('FAIL B1a: default should emit BW_DIALOG_PAUSE 1'); process.exit(1);
  }
  if (!/^#define BW_DIALOG_AUTOCLOSE 0$/m.test(out)) {
    console.error('FAIL B1b: default should emit BW_DIALOG_AUTOCLOSE 0'); process.exit(1);
  }
  if (!/bw_dialog_saved_walk = walk_speed;/.test(out)) {
    console.error('FAIL B1c: default pause=on should snapshot walk_speed'); process.exit(1);
  }
  if (!/walk_speed = bw_dialog_saved_walk;/.test(out)) {
    console.error('FAIL B1d: default pause=on should restore walk_speed on close'); process.exit(1);
  }
  console.log('✓ B1 defaults: pause=1, autoClose=0, save/restore emitted');
}
// Pause on + timer on (e.g. 120 frames ≈ 2s) — text freezes the world
// AND the box auto-closes after the delay.  B may still close it early.
{
  const out = assembleWithDialog({ pauseOnOpen: true, autoClose: 120 });
  if (!/^#define BW_DIALOG_AUTOCLOSE 120$/m.test(out)) {
    console.error('FAIL B2a: autoClose=120 should emit matching define'); process.exit(1);
  }
  if (!/bw_dialog_timer = BW_DIALOG_AUTOCLOSE;/.test(out)) {
    console.error('FAIL B2b: expected timer assignment on open'); process.exit(1);
  }
  if (!/bw_dialog_timer--;/.test(out)) {
    console.error('FAIL B2c: expected per-frame timer decrement'); process.exit(1);
  }
  console.log('✓ B2 pause+timer: timer init + decrement present alongside pause');
}
// Pause off + timer on — floating-hint style that disappears on its own.
{
  const out = assembleWithDialog({ pauseOnOpen: false, autoClose: 60 });
  if (!/^#define BW_DIALOG_PAUSE 0$/m.test(out)) {
    console.error('FAIL B3a: pauseOnOpen=false → BW_DIALOG_PAUSE 0'); process.exit(1);
  }
  if (!/^#define BW_DIALOG_AUTOCLOSE 60$/m.test(out)) {
    console.error('FAIL B3b: autoClose=60 should emit matching define'); process.exit(1);
  }
  // The freeze/save code is guarded by #if BW_DIALOG_PAUSE so at cc65
  // build-time it simply drops out, but the source text still contains
  // the #if lines themselves.  The marker we assert on is the define.
  console.log('✓ B3 no-pause+timer: BW_DIALOG_PAUSE 0, timer active');
}
// Pause off + timer off — plain "hint text, B to dismiss" mode, no
// world-freeze.  Mostly a sanity check that nothing assumes pause.
{
  const out = assembleWithDialog({ pauseOnOpen: false, autoClose: 0 });
  if (!/^#define BW_DIALOG_PAUSE 0$/m.test(out)) {
    console.error('FAIL B4a: expected BW_DIALOG_PAUSE 0'); process.exit(1);
  }
  if (!/^#define BW_DIALOG_AUTOCLOSE 0$/m.test(out)) {
    console.error('FAIL B4b: expected BW_DIALOG_AUTOCLOSE 0'); process.exit(1);
  }
  // B-press path must still exist — close logic keys off should_close.
  if (!/unsigned char should_close = b_edge;/.test(out)) {
    console.error('FAIL B4c: b_edge close path missing'); process.exit(1);
  }
  console.log('✓ B4 no-pause+no-timer: minimal emission, B still closes');
}
// Clamp: autoClose should clamp to [0, 240].
{
  const out = assembleWithDialog({ autoClose: 9999 });
  if (!/^#define BW_DIALOG_AUTOCLOSE 240$/m.test(out)) {
    console.error('FAIL B5: autoClose should clamp to 240'); process.exit(1);
  }
  console.log('✓ B5 autoClose clamps to 240');
}

// Phase 3.2 — multi-line dialogue (1-3 rows).
// Default config (text='HELLO', text2/text3 empty) → 1 row.
// Two non-empty rows → 2 rows.  Trailing empties drop, leading
// empties don't (leaving line 2 set but line 3 empty still gives 2).
{
  const out1 = assembleWithDialog({});  // default: text='HELLO'
  if (!/^#define BW_DIALOG_ROW_COUNT 1$/m.test(out1)) {
    console.error('FAIL B6a: default should emit ROW_COUNT 1'); process.exit(1);
  }
  if (!/static const unsigned char bw_dialogue_text_0\[\]/.test(out1)) {
    console.error('FAIL B6b: default should emit bw_dialogue_text_0[]'); process.exit(1);
  }
  if (/static const unsigned char bw_dialogue_text_1\[\]/.test(out1)) {
    console.error('FAIL B6c: default should NOT emit bw_dialogue_text_1[] (trailing-empty trim)'); process.exit(1);
  }
  const out2 = assembleWithDialog({ text: 'HI', text2: 'WORLD' });
  if (!/^#define BW_DIALOG_ROW_COUNT 2$/m.test(out2)) {
    console.error('FAIL B6d: two filled rows should emit ROW_COUNT 2'); process.exit(1);
  }
  if (!/static const unsigned char bw_dialogue_text_1\[\]/.test(out2)) {
    console.error('FAIL B6e: two-line config should emit bw_dialogue_text_1[]'); process.exit(1);
  }
  // The vblank loop must iterate rows now, not bake in a single
  // BW_DIALOG_ROW.  Look for the dlg_r-driven structure (Phase 3.3
  // changed the bound from BW_DIALOG_ROW_COUNT to dlg_total to
  // accommodate single-row per-NPC overrides; the BW_DIALOG_ROW_COUNT
  // initialisation lives one line above and is checked separately).
  if (!/for \(dlg_r = 0; dlg_r < dlg_total; dlg_r\+\+\)/.test(out2)) {
    console.error('FAIL B6f: vblank loop should iterate dlg_total rows'); process.exit(1);
  }
  if (!/dlg_draw_rows = BW_DIALOG_ROW_COUNT/.test(out2)) {
    console.error('FAIL B6g: vblank should default dlg_draw_rows to BW_DIALOG_ROW_COUNT'); process.exit(1);
  }
  console.log('✓ B6 multi-line dialogue: 1- and 2-row emissions + per-row vblank loop');
}

// Phase 3.3 — per-NPC dialogue text.
// When a scene instance with role=npc has a non-empty `text`, the
// module emits a per-NPC text array + lookup table, sets
// BW_DIALOG_PER_NPC to 1, and the vblank loop consults the override.
// When no NPC has its own text, BW_DIALOG_PER_NPC is 0 and nothing
// extra emits — pre-3.3 behaviour exactly.
{
  // Default state has zero scene instances → no per-NPC overrides.
  const out0 = assembleWithDialog({});
  if (!/^#define BW_DIALOG_PER_NPC 0$/m.test(out0)) {
    console.error('FAIL B7a: empty-scene config should emit BW_DIALOG_PER_NPC 0');
    process.exit(1);
  }
  // The table DECLARATION is only emitted when at least one NPC has
  // its own text.  References to bw_dialogue_per_npc inside the
  // template's vblank logic still appear in the source — they're
  // gated by `#if BW_DIALOG_PER_NPC` so the preprocessor removes
  // them at compile time when the macro is 0.
  if (/static const unsigned char \* const bw_dialogue_per_npc\[/.test(out0)) {
    console.error('FAIL B7b: should not declare bw_dialogue_per_npc[] when nothing overrides');
    process.exit(1);
  }
  // State with one NPC instance + its own text.
  const s = mkState({ dialogueOn: true });
  s.builder.modules.scene.config.instances = [
    { id: 'i1', spriteIdx: 1, x: 96,  y: 120, ai: 'static' },              // enemy, no text
    { id: 'i2', spriteIdx: 2, x: 160, y: 120, ai: 'static', text: 'HI' },   // npc, override
  ];
  const out1 = window.BuilderAssembler.assemble(s, tpl);
  if (!/^#define BW_DIALOG_PER_NPC 1$/m.test(out1)) {
    console.error('FAIL B7c: NPC with text should emit BW_DIALOG_PER_NPC 1');
    process.exit(1);
  }
  if (!/static const unsigned char bw_dialogue_npc_1\[\]/.test(out1)) {
    console.error('FAIL B7d: should emit bw_dialogue_npc_1[] for NPC at instance 1');
    process.exit(1);
  }
  if (!/bw_dialog_npc_idx = j;/.test(out1)) {
    console.error('FAIL B7e: per-frame trigger should record bw_dialog_npc_idx');
    process.exit(1);
  }
  if (!/npc_text\s*=\s*bw_dialogue_per_npc\[bw_dialog_npc_idx\]/.test(out1)) {
    console.error('FAIL B7f: vblank should look up bw_dialogue_per_npc'); process.exit(1);
  }
  console.log('✓ B7 per-NPC dialogue: lookup table + index recording + vblank routing');
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
