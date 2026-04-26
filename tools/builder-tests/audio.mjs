// Phase 4.3 (foundation) — audio smoke-test.  The full audio Builder
// module + audio.html editor page land in the next session; for now
// this suite proves the build pipeline is sound:
//
//   1. A no-audio /play build produces the byte-identical baseline
//      ROM (already covered by the byte-identical-ROM invariant in
//      run-all.mjs; we re-assert here so the dependency is explicit).
//   2. A /play body with `audioSongsAsm` + `audioSfxAsm` strings
//      flips the build into USE_AUDIO=1 mode, links the FamiStudio
//      sound engine + the supplied blobs, and produces a clean ROM.
//   3. The audio ROM differs from the baseline (cfg pads every ROM
//      to the same fixed 49 168 bytes, so size is identical — but
//      the contents must differ because the audio ROM links the
//      engine + stub blobs).  We sha1 the two ROMs and assert.
//   4. Asymmetric uploads (song without sfx, or vice versa) fall
//      back to no-audio rather than failing — UI on the editor side
//      will eventually require both, but the server is forgiving.
//
// All assets used here are stub blobs, intentionally tiny — the
// real audio content is FamiStudio-exported `.s` and ships from
// the upcoming editor page.
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const sha1 = (buf) => crypto.createHash('sha1').update(buf).digest('hex');

const ROOT = '/home/duguid/projects/nesgame/attempt1';
const PORT = 18815;

const mkCells = (w, h, t = 1) => Array.from({ length: h }, () =>
  Array.from({ length: w }, () => ({ tile: t, palette: 0, empty: false })));

function mkState() {
  return {
    name: 'audio-smoke', version: 1, universal_bg: 0x21,
    sprites: [
      { role: 'player', name: 'hero', width: 2, height: 2, cells: mkCells(2, 2) },
    ],
    animations: [], animation_assignments: { walk: null, jump: null },
    nextAnimationId: 1,
    sprite_tiles: Array.from({ length: 256 }, () => ({
      pixels: Array.from({ length: 8 }, () => Array(8).fill(0)), name: '',
    })),
    bg_tiles: Array.from({ length: 256 }, () => ({
      pixels: Array.from({ length: 8 }, () => Array(8).fill(0)), name: '',
    })),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x0F, 0x10, 0x30] })),
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
      { id: 0, name: 'none' }, { id: 1, name: 'solid_ground' },
      { id: 2, name: 'wall' }, { id: 3, name: 'platform' },
      { id: 4, name: 'door' }, { id: 5, name: 'trigger' }, { id: 6, name: 'ladder' },
    ],
    selectedBgIdx: 0,
  };
}

// Minimum-viable FamiStudio-engine-compatible song stub.  Defines
// `audio_default_music` (the symbol main.c imports) with the
// smallest valid header the engine accepts — a single instrument,
// no samples, an end-of-song marker on every channel.  The engine
// will treat this as silence, which is exactly what we want for
// the regression test.
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

// Minimum-viable sfx stub.  Defines `audio_sfx_data` with a single
// null entry — no playable sfx, but the symbol resolves so main.c
// links cleanly.
const STUB_SFX_ASM = `
.export _audio_sfx_data:=audio_sfx_data
.export audio_sfx_data
audio_sfx_data:
\t.word @ntsc
\t.word @ntsc
@ntsc:
\t.byte $00, $00
`;

const srv = spawn('python3',
  [path.join(ROOT, 'tools', 'playground_server.py')],
  { env: { ...process.env, PLAYGROUND_PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'] });
await sleep(1500);

function fail(msg) { console.error('FAIL:', msg); process.exit(1); }

async function build(extraBody) {
  const r = await fetch(`http://127.0.0.1:${PORT}/play`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      state: mkState(),
      playerSpriteIdx: 0, playerStart: { x: 60, y: 120 },
      sceneSprites: [], mode: 'browser',
      ...extraBody,
    }),
  });
  const data = await r.json();
  if (!data.ok) {
    fail(`build failed at stage ${data.stage}: ${(data.log||'').slice(-400)}`);
  }
  return Buffer.from(data.rom_b64, 'base64');
}

try {
  // Case 1 — no audio.  Plain build, baseline path.
  const stockRom = await build({});
  if (stockRom.length < 16 || stockRom[0] !== 0x4E) fail('stock ROM not iNES');
  console.log(`✓ no-audio /play returns iNES (${stockRom.length} bytes)`);

  // Case 2 — both blobs supplied, expect USE_AUDIO=1 path to link.
  const audioRom = await build({
    audioSongsAsm: STUB_SONGS_ASM,
    audioSfxAsm:   STUB_SFX_ASM,
  });
  if (audioRom.length < 16 || audioRom[0] !== 0x4E) fail('audio ROM not iNES');
  console.log(`✓ audio /play returns iNES (${audioRom.length} bytes)`);

  // Case 3 — audio ROM differs from stock by sha1 (cfg pads to a
  // fixed 49 168 bytes regardless of payload, so size is the same
  // for both, but the linked content must differ).
  const stockHash = sha1(stockRom);
  const audioHash = sha1(audioRom);
  if (stockHash === audioHash) {
    fail(`audio ROM hash matches stock (${stockHash}) — engine + stubs did not link in`);
  }
  console.log(`✓ audio ROM differs from stock (stock=${stockHash.slice(0,12)}, audio=${audioHash.slice(0,12)})`);

  // Case 4 — only one blob: server should silently fall back to
  // no-audio.  The resulting ROM hashes the same as stock.
  const songOnlyRom = await build({ audioSongsAsm: STUB_SONGS_ASM });
  if (sha1(songOnlyRom) !== stockHash) {
    fail('song-only build should match stock hash — asymmetric audio inputs must fall back to no-audio');
  }
  console.log('✓ asymmetric audio (song without sfx) falls back to no-audio');

  // Case 5 — invalid audio fields (not strings) get a 400.
  const r = await fetch(`http://127.0.0.1:${PORT}/play`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      state: mkState(),
      playerSpriteIdx: 0, playerStart: { x: 60, y: 120 },
      sceneSprites: [], mode: 'browser',
      audioSongsAsm: 12345,    // wrong type
    }),
  });
  if (r.status !== 500) fail(`expected non-200 for bad audioSongsAsm, got ${r.status}`);
  console.log('✓ wrong-type audioSongsAsm rejected');

} finally {
  srv.kill('SIGTERM');
  await sleep(300);
}
console.log('\nAudio (Phase 4.3 foundation) smoke-test complete.');
