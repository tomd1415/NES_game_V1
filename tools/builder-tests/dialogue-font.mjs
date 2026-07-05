// Dialogue font-seeding smoke-test (Sprint 3).
//
// When the dialogue module is on, the server seeds a built-in UPPERCASE font
// into the BLANK background tile slots at their ASCII indices, so dialogue
// renders real letters even when the pupil never painted a font (the "dialogue
// shows garbage" bug, web-feedback 31).  Pupil art already in a slot must be
// preserved.  This builds a real ROM through /play and inspects its CHR.
//
// See docs/plans/current/2026-06-18-codegen-rework-implementation.md (Sprint 3).

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = new URL('../..', import.meta.url).pathname;
const WEB  = path.join(ROOT, 'tools', 'tile_editor_web');
const PORT = 18782;

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
function blankTile() {
  return { pixels: Array.from({ length: 8 }, () => Array(8).fill(0)), name: '' };
}
function solidTile() {   // every pixel = colour 1 → a recognisable CHR pattern
  return { pixels: Array.from({ length: 8 }, () => Array(8).fill(1)), name: '' };
}

// state with dialogue on; bg pool blank except one painted glyph slot (0x5A 'Z').
function makeDialogueState() {
  const bg = Array.from({ length: 256 }, () => blankTile());
  bg[0x5A] = solidTile();   // pupil art sitting where 'Z' would seed
  const s = {
    name: 'dlg', version: 1, universal_bg: 0x21,
    sprites: [
      { role: 'player', name: 'hero',  width: 2, height: 2, cells: mkCells(2, 2) },
      { role: 'npc',    name: 'oldman',width: 2, height: 2, cells: mkCells(2, 2) },
    ],
    sprite_tiles: Array.from({ length: 256 }, () => blankTile()),
    bg_tiles: bg,
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x0F, 0x10, 0x30] })),
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    backgrounds: [{
      name: 'bg', dimensions: { screens_x: 1, screens_y: 1 },
      nametable: Array.from({ length: 30 }, () =>
        Array.from({ length: 32 }, () => ({ tile: 0, palette: 0 }))),
      behaviour: (() => {
        const m = Array.from({ length: 30 }, () => Array(32).fill(0));
        for (let c = 0; c < 32; c++) m[28][c] = 1;
        return m;
      })(),
    }],
    behaviour_types: [
      { id: 0, name: 'none' }, { id: 1, name: 'solid_ground' }, { id: 2, name: 'wall' },
      { id: 3, name: 'platform' }, { id: 4, name: 'door' }, { id: 5, name: 'trigger' },
      { id: 6, name: 'ladder' },
    ],
    selectedBgIdx: 0,
    builder: window.BuilderDefaults(),
  };
  s.builder.modules.dialogue.enabled = true;   // default text 'HELLO'
  return s;
}

// One 16-byte bg pattern-table tile out of an iNES ROM.  build_chr lays the
// bg pool in the SECOND 4 KB of CHR (the $1000 table), regardless of any
// trailing NESfont, so derive the offset from PRG size only.
function bgTile(rom, tileIdx) {
  if (!(rom[0] === 0x4E && rom[1] === 0x45 && rom[2] === 0x53 && rom[3] === 0x1A)) {
    throw new Error('not an iNES ROM');
  }
  const chrStart = 16 + rom[4] * 16384;
  const off = chrStart + 4096 + tileIdx * 16;
  return rom.subarray(off, off + 16);
}
const isZero = buf => buf.every(b => b === 0);

const srv = spawn('python3', [path.join(ROOT, 'tools', 'playground_server.py')],
  { env: { ...process.env, PLAYGROUND_PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
let srvLog = '';
srv.stdout.on('data', d => srvLog += d.toString());
srv.stderr.on('data', d => srvLog += d.toString());
await sleep(1500);

let failed = false;
function check(cond, msg) { if (!cond) { console.error('FAIL: ' + msg); failed = true; } }

try {
  const s = makeDialogueState();
  const res = await fetch(`http://127.0.0.1:${PORT}/play`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      state: s, playerSpriteIdx: 0, playerStart: { x: 60, y: 120 },
      sceneSprites: [{ spriteIdx: 1, x: 140, y: 120 }],
      mode: 'browser', customMainC: window.BuilderAssembler.assemble(s, tpl),
    }),
  });
  const r = await res.json();
  if (!r.ok) {
    console.error('FAIL: dialogue build rejected:', r.stage, (r.log || '').slice(-1500));
    process.exit(1);
  }
  const rom = Buffer.from(r.rom_b64, 'base64');

  // Letters of HELLO (and 'A') must be seeded (non-blank) even though the
  // pupil painted nothing.
  for (const [name, code] of [['H', 0x48], ['E', 0x45], ['L', 0x4C], ['O', 0x4F], ['A', 0x41]]) {
    check(!isZero(bgTile(rom, code)),
      `glyph '${name}' (tile 0x${code.toString(16)}) should be seeded, but its CHR is blank`);
  }
  // A bg tile OUTSIDE the font range must stay blank (we only fill glyph slots).
  check(isZero(bgTile(rom, 0x10)),
    'non-glyph bg tile 0x10 should stay blank, but it has data');
  // The pupil's painted art at a glyph slot ('Z' 0x5A) must be PRESERVED, i.e.
  // the all-colour-1 pattern (plane0 = 0xFF*8, plane1 = 0x00*8), not the font Z.
  const z = bgTile(rom, 0x5A);
  const expected = Buffer.from([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
                                0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  check(z.equals(expected),
    'painted art at glyph slot 0x5A was overwritten by the font seed (should be preserved)');

  if (!failed) console.log('✓ dialogue font seeded into blank glyph slots; pupil art preserved');
} catch (e) {
  console.error('FAIL: dialogue-font threw:', e);
  console.error(srvLog.slice(-1500));
  failed = true;
} finally {
  srv.kill('SIGTERM');
  await sleep(300);
}

if (failed) process.exit(1);
console.log('\nDialogue font-seeding smoke-test complete.');
