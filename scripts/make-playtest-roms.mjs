#!/usr/bin/env node
// Build the ROMs for the two feedback items that can only be closed by a human
// with working speakers: #7/#27 (event sound effects) and #15 (stomp feel).
//
//   node scripts/make-playtest-roms.mjs      ->  playtest-roms/*.nes
//
// Then open them in any emulator WITH SOUND (fceux, Mesen, the Studio's own
// in-browser player) and follow docs/guides/PLAYTEST-CHECKLIST.md.
//
// Why this exists: the automated suite can prove the event-SFX code is linked
// (sfx-events.mjs compares an events-ON build against events-OFF) but it cannot
// prove the sounds are *audible or right* — jsnes APU inspection is too fragile
// to trust for that. Same for "does the stomp bounce feel good". So the build
// half is automated here and only the listening/judging half is left to a
// person. Regenerate whenever the engine changes.
//
// Uses the REAL starter SFX pack + song (tools/audio/starter), NOT the silent
// stubs sfx-events.mjs uses to prove wiring.
import fs from 'node:fs';
import path from 'node:path';
import * as H from '../tools/builder-tests/lib/render-harness.mjs';

const OUT = path.join(H.ROOT, 'playtest-roms');   // *.nes is gitignored
const PORT = 18877;
fs.mkdirSync(OUT, { recursive: true });

const win = H.loadBuilderModules();
globalThis.NES_TARGET_ENGINE = Number(
  fs.readFileSync(path.join(H.ROOT, 'tools', 'engines', 'ENGINE_VERSION'), 'utf8').trim());
const tpl = H.readTemplate();

// main.c links against `audio_default_music` / `audio_sfx_data`; the real
// pipeline appends an alias trailer in play-pipeline.js (~line 323) mapping the
// FamiStudio export's own symbol onto those. Replicate it exactly.
const SFX = fs.readFileSync(path.join(H.ROOT, 'tools/audio/starter/sfx_pack.s'), 'utf8')
  + '\n\n.export _audio_sfx_data:=sounds\n.export audio_sfx_data:=sounds\n';
const SONG = fs.readFileSync(path.join(H.ROOT, 'tools/audio/starter/song_cheerful_loop.s'), 'utf8')
  + '\n\n.export _audio_default_music:=music_data_startercheerful\n'
  + '.export audio_default_music:=music_data_startercheerful\n';

const START = { x: 60, y: 176 };

// A small, deliberately easy playtest level: solid floor, one stompable enemy
// straight ahead, a pickup, and a trigger tile to win on. Everything the four
// event sounds need is reachable within a few seconds of pressing Start.
function makeState(opts) {
  const rows = 30, cols = 32;
  const beh = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let c = 0; c < cols; c++) beh[26][c] = 1;    // floor
  beh[24][28] = 5;                                   // TRIGGER tile => win
  const nt = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ tile: 0, palette: 0 })));
  for (let c = 0; c < cols; c++) { nt[26][c] = { tile: 1, palette: 0 }; nt[27][c] = { tile: 1, palette: 0 }; }

  const bgPool = H.blankPool();
  bgPool[1] = { name: 'ground', pixels: Array.from({ length: 8 }, (_, y) =>
    Array.from({ length: 8 }, (_, x) => ((x ^ y) & 1) ? 1 : 2)) };
  const spPool = H.blankPool();
  spPool[1] = { name: 'solid', pixels: Array.from({ length: 8 }, () => Array(8).fill(3)) };
  spPool[2] = { name: 'ring',  pixels: Array.from({ length: 8 }, (_, y) =>
    Array.from({ length: 8 }, (_, x) => (y === 0 || y === 7 || x === 0 || x === 7) ? 2 : 0)) };

  const cellsOf = (w, h, tile) => Array.from({ length: h }, () =>
    Array.from({ length: w }, () => ({ tile, palette: 0, empty: false })));

  const s = {
    name: opts.name, version: 1, universal_bg: 0x0F,
    sprites: [
      { role: 'player', name: 'hero',   width: 2, height: 2, cells: cellsOf(2, 2, 1) },
      { role: 'enemy',  name: 'baddie', width: 2, height: 2, cells: cellsOf(2, 2, 2) },
      { role: 'pickup', name: 'coin',   width: 1, height: 1, cells: cellsOf(1, 1, 2) },
    ],
    sprite_tiles: spPool, bg_tiles: bgPool,
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x30, 0x10, 0x20] })),
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    backgrounds: [{ name: 'bg', dimensions: { screens_x: 1, screens_y: 1 }, nametable: nt, behaviour: beh }],
    behaviour_types: H.BEHAVIOUR_TYPES, selectedBgIdx: 0,
    builder: win.BuilderDefaults(),
  };
  const m = s.builder.modules;
  const p1 = m.players.submodules.player1;
  p1.config = Object.assign({}, p1.config, { startX: START.x, startY: START.y, maxHp: 3 });
  m.damage.enabled = true;
  // stompDefeat/stompBounce live under the damage module (platformer only).
  m.damage.config = Object.assign({}, m.damage.config, {
    amount: 1, invincibilityFrames: 20,
    stompDefeat: true, stompBounce: opts.stompBounce || 12,
  });
  m.win_condition.enabled = true;
  m.pickups.enabled = true;
  m.hud.enabled = true;
  m.scene.enabled = true;
  m.scene.config.instances = [
    { id: 'e0', spriteIdx: 1, x: 150, y: 192, ai: 'walker', speed: 1 },
    { id: 'p0', spriteIdx: 2, x: 96,  y: 192, ai: 'static', speed: 1 },
  ];
  return s;
}

async function build(port, s, extraDefines, filename) {
  let c = win.BuilderAssembler.assemble(s, tpl);
  // Force stomp tuning by pre-defining the macros ahead of the module's
  // #ifndef-guarded defaults.
  if (extraDefines) c = extraDefines + '\n' + c;
  const r = await H.buildRom(port, {
    state: s, playerSpriteIdx: 0, playerStart: START,
    sceneSprites: [{ spriteIdx: 1, x: 150, y: 192 }],
    mode: 'browser', customMainC: c,
    audioSongsAsm: SONG, audioSfxAsm: SFX, audioSfxEvents: true,
  });
  if (!r.ok) { console.log(`✗ ${filename}: build failed at ${r.stage}\n${String(r.log || '').slice(-900)}`); return false; }
  fs.writeFileSync(path.join(OUT, filename), Buffer.from(r.romBytes));
  console.log(`✓ ${filename}  (${r.romBytes.length} bytes)`);
  return true;
}

const { srv } = await H.startServer(PORT);
try {
  // --- #7/#27: event SFX. One ROM, all four events reachable. -------------
  await build(PORT, makeState({ name: 'sfx-events' }), null,
              '01-sfx-events.nes');

  // --- #15: stomp feel. Same level, three tunings to A/B. -----------------
  // Current shipped values are MARGIN 8 / BOUNCE 12.
  for (const [margin, bounce, tag] of [
    // (a) the CURRENT shipped tuning is byte-identical to 01-sfx-events.nes
    // (same defaults), so it is not written twice — use 01 as the baseline.
    [8, 18, 'b-bouncier-m8-b18'],
    [12, 12, 'c-forgiving-m12-b12'],
  ]) {
    await build(PORT,
      makeState({ name: 'stomp-' + tag, stompBounce: bounce }),
      `#define BW_STOMP_MARGIN ${margin}`,
      `02-stomp-${tag}.nes`);
  }
} finally {
  await H.stopServer(srv);
}
console.log('\nROMs in ' + OUT);
