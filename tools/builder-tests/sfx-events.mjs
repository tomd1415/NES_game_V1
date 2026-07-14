#!/usr/bin/env node
// Event sound effects (engine v74).  With an SFX pack loaded and the "Play
// sounds on game events" toggle on, main.c's per-frame edge-detectors call
// famistudio_sfx_play on jump / pickup / hurt / win.  The whole thing is gated
// `#ifdef BW_SFX_EVENTS`, which the server sets (as BW_SFX_EVENTS=1) ONLY when a
// real sfx pack is present AND audioSfxEvents is true — so OFF is byte-identical.
//
// This proves three things without needing to listen to audio (that is the
// attended FCEUX sign-off):
//   1. events-ON compiles — every detector branch (jump + pickup are always in;
//      hurt needs PLAYER_HP_ENABLED, win needs BW_WIN_ENABLED, both enabled here).
//   2. turning events on CHANGES the ROM vs the same build with events off
//      (i.e. BW_SFX_EVENTS actually engaged and linked the sfx_play calls).
//   3. the events flag WITHOUT an sfx pack is a no-op (audio-gated) — byte-
//      identical to a plain build, so a project can't accidentally enable it.
import crypto from 'node:crypto';
import * as H from './lib/render-harness.mjs';

const sha1 = (b) => crypto.createHash('sha1').update(b).digest('hex');
const PORT = 18871;
let failed = false;
const ok  = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };

// Minimum-viable FamiStudio-engine-compatible stubs (lifted from audio.mjs,
// which the audio smoke suite already proves compile + link).  The stub song is
// silent; the stub sfx pack resolves `audio_sfx_data` so the link succeeds.
const STUB_SONGS_ASM = `
.export _audio_default_music:=audio_default_music
.export audio_default_music
audio_default_music:
\t.byte 1
\t.word @instruments
\t.word @samples-4
\t.word @song0ch0
\t.word @song0ch1
\t.word @song0ch2
\t.word @song0ch3
\t.word @song0ch4
\t.byte .lobyte(@tempo_env_1_mid), .hibyte(@tempo_env_1_mid), 0, 0
@instruments:
\t.byte 0
@samples:
@song0ch0:
@song0ch1:
@song0ch2:
@song0ch3:
@song0ch4:
\t.byte $00
@tempo_env_1_mid:
\t.byte 6, 6, 6, 6, $00
`;
const STUB_SFX_ASM = `
.export _audio_sfx_data:=audio_sfx_data
.export audio_sfx_data
audio_sfx_data:
\t.word @ntsc
\t.word @ntsc
@ntsc:
\t.byte $00, $00
`;

const START = { x: 60, y: 120 };

function makeState(win) {
  const rows = 30, cols = 32;
  const beh = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let c = 0; c < cols; c++) beh[28][c] = 1;   // SOLID_GROUND floor
  beh[20][16] = 5;                                  // a TRIGGER tile so reach_tile win is valid
  const s = {
    name: 'sfxevents', version: 1, universal_bg: 0x0F,
    sprites: [
      { role: 'player', name: 'hero',   width: 2, height: 2, cells: H.mkCells(2, 2) },
      { role: 'enemy',  name: 'baddie', width: 2, height: 2, cells: H.mkCells(2, 2) },
      { role: 'pickup', name: 'coin',   width: 1, height: 1, cells: H.mkCells(1, 1) },
    ],
    sprite_tiles: H.blankPool(), bg_tiles: H.blankPool(),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x30, 0x10, 0x20] })),
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    backgrounds: [{
      name: 'bg', dimensions: { screens_x: 1, screens_y: 1 },
      nametable: Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ tile: 0, palette: 0 }))),
      behaviour: beh,
    }],
    behaviour_types: H.BEHAVIOUR_TYPES, selectedBgIdx: 0,
    builder: win.BuilderDefaults(),
  };
  const p1 = s.builder.modules.players.submodules.player1;
  p1.config = Object.assign({}, p1.config, { startX: START.x, startY: START.y, maxHp: 3 });
  s.builder.modules.damage.enabled = true;          // -> PLAYER_HP_ENABLED (hurt detector)
  s.builder.modules.damage.config = Object.assign({}, s.builder.modules.damage.config,
    { amount: 1, invincibilityFrames: 20 });
  s.builder.modules.win_condition.enabled = true;   // -> BW_WIN_ENABLED (win detector)
  s.builder.modules.pickups.enabled = true;          // -> BW_HAS_PICKUPS (pickup detector)
  s.builder.modules.scene.enabled = true;
  s.builder.modules.scene.config.instances = [
    { id: 'e0', spriteIdx: 1, x: 120, y: 208, ai: 'static', speed: 1 },
    { id: 'p0', spriteIdx: 2, x: 80,  y: 208, ai: 'static', speed: 1 },
  ];
  return s;
}

const win = H.loadBuilderModules();
const tpl = H.readTemplate();
const { srv } = await H.startServer(PORT);

function payloadFor(s, extra) {
  return {
    state: s, playerSpriteIdx: 0, playerStart: START,
    sceneSprites: [{ spriteIdx: 1, x: 120, y: 208 }],
    mode: 'browser', customMainC: win.BuilderAssembler.assemble(s, tpl),
    ...extra,
  };
}

try {
  const s = makeState(win);
  const AUDIO = { audioSongsAsm: STUB_SONGS_ASM, audioSfxAsm: STUB_SFX_ASM };

  // A — audio on, events OFF.
  const A = await H.buildRom(PORT, payloadFor(s, { ...AUDIO, audioSfxEvents: false }));
  if (!A.ok) bad('events-OFF build failed at stage ' + A.stage + ':\n' + String(A.log || '').slice(-1000));
  else ok('audio + events-OFF builds (' + A.romBytes.length + ' bytes)');

  // B — audio on, events ON.  Compiles the jump/pickup/hurt/win detector branches.
  const B = await H.buildRom(PORT, payloadFor(s, { ...AUDIO, audioSfxEvents: true }));
  if (!B.ok) bad('events-ON build failed at stage ' + B.stage + ':\n' + String(B.log || '').slice(-1000));
  else ok('audio + events-ON builds — all detector branches (jump/pickup/hurt/win) compile');

  if (A.ok && B.ok) {
    if (sha1(A.romBytes) !== sha1(B.romBytes))
      ok('event sounds change the ROM (BW_SFX_EVENTS engaged): '
        + sha1(A.romBytes).slice(0, 12) + ' != ' + sha1(B.romBytes).slice(0, 12));
    else
      bad('events ON/OFF produced identical ROMs — BW_SFX_EVENTS did not engage');
  }

  // C — events flag but NO sfx pack: must be a no-op (audio-gated), i.e. equal
  // to a plain build with neither audio nor events.
  const C = await H.buildRom(PORT, payloadFor(s, { audioSfxEvents: true }));
  const P = await H.buildRom(PORT, payloadFor(s, {}));
  if (C.ok && P.ok) {
    if (sha1(C.romBytes) === sha1(P.romBytes))
      ok('events flag without an sfx pack is a no-op (audio-gated, byte-identical)');
    else
      bad('events flag without audio changed the ROM — should be gated behind audio/sfx presence');
  } else {
    bad('no-audio control builds failed (C.ok=' + C.ok + ', P.ok=' + P.ok + ')');
  }
} finally {
  srv.kill('SIGTERM');
}

if (failed) { console.error('\nEvent-SFX (engine v74) test FAILED.'); process.exit(1); }
console.log('\nEvent-SFX (engine v74) test complete.');
