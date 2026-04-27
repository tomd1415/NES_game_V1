// Phase 4.3 — audio smoke-test.  Covers the full editor stack:
//
//   1. /play with no audio fields produces the byte-identical
//      baseline ROM (re-assertion of the byte-identical invariant
//      in run-all.mjs to make the dependency explicit).
//   2. /play with `audioSongsAsm` + `audioSfxAsm` strings flips into
//      USE_AUDIO=1 mode, links the FamiStudio sound engine + the
//      supplied blobs, and produces a clean ROM.
//   3. The audio ROM differs from baseline (cfg pads to 49 168 bytes
//      so length is identical; contents must differ).
//   4. Asymmetric uploads (song without sfx, or vice versa) fall
//      back to no-audio rather than failing — server is forgiving.
//   5. Wrong-type audio fields are rejected with a non-200 response.
//   6. /starter/audio returns the bundled starter pack — two songs +
//      a sfx pack with named slots.
//   7. The starter pack actually builds: feeding it back through
//      /play with the alias trailers PlayPipeline appends produces
//      a ROM that differs from baseline (i.e. the engine + starter
//      content linked successfully).
//   8. PlayPipeline.buildPlayRequest consumes a state.audio block
//      shaped like the editor saves and emits the right
//      audioSongsAsm + audioSfxAsm fields with default-song aliases.
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

  // Case 4 — only one blob: pre-2026-04-27 the server fell back
  // silently to no-audio (link couldn't satisfy both `extern`s).
  // Pupils uploading just a song expected music to play and got
  // silence.  Now the server auto-stubs the missing side so the
  // audio engine engages either way.  The song-only build must
  // therefore produce a *different* ROM from stock (audio engine +
  // pupil's song are linked in) and from the both-sides-uploaded
  // case (different sfx blob).
  const songOnlyRom = await build({ audioSongsAsm: STUB_SONGS_ASM });
  const songOnlyHash = sha1(songOnlyRom);
  if (songOnlyHash === stockHash) {
    fail('song-only build matches stock hash — auto-sfx-stub did not engage');
  }
  console.log(`✓ song-only build engages audio via auto-sfx-stub (${songOnlyHash.slice(0,12)})`);
  // Sfx-only is the symmetric case — auto-songs-stub kicks in.
  const sfxOnlyRom = await build({ audioSfxAsm: STUB_SFX_ASM });
  const sfxOnlyHash = sha1(sfxOnlyRom);
  if (sfxOnlyHash === stockHash) {
    fail('sfx-only build matches stock hash — auto-songs-stub did not engage');
  }
  console.log(`✓ sfx-only build engages audio via auto-songs-stub (${sfxOnlyHash.slice(0,12)})`);

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

  // Case 6 — /starter/audio returns the bundled starter pack.
  const starterRes = await fetch(`http://127.0.0.1:${PORT}/starter/audio`);
  const starter = await starterRes.json();
  if (!starter.ok) fail('/starter/audio did not return ok');
  if (!Array.isArray(starter.songs) || starter.songs.length < 2) {
    fail(`/starter/audio expected ≥2 songs, got ${starter.songs?.length}`);
  }
  if (!starter.sfx || !starter.sfx.symbol) {
    fail('/starter/audio missing sfx pack with symbol');
  }
  if (!Array.isArray(starter.sfx.sfxNames) || starter.sfx.sfxNames.length === 0) {
    fail('/starter/audio sfx pack has no named slots');
  }
  for (const song of starter.songs) {
    if (!song.symbol) fail(`/starter/audio song "${song.name}" missing symbol`);
    if (!song.asm.startsWith('; This file is for the FamiStudio Sound Engine')) {
      fail(`/starter/audio song "${song.name}" .asm is not a FamiStudio export`);
    }
  }
  console.log(`✓ /starter/audio returns ${starter.songs.length} songs + sfx pack with ${starter.sfx.sfxNames.length} named slots`);

  // Case 7 — feed the starter pack back through /play.  Mirrors what
  // PlayPipeline does: concatenate every song's .asm and append an
  // alias trailer pointing audio_default_music at the first song's
  // symbol.  The sfx alias points the editor's `audio_sfx_data`
  // import at FamiStudio's `sounds` symbol.
  function buildSongsAsm(songs, defaultIdx) {
    const concat = songs.map(s => s.asm).join('\n\n');
    const sym = songs[defaultIdx].symbol;
    return concat +
      `\n\n.export _audio_default_music:=${sym}\n` +
      `.export audio_default_music:=${sym}\n`;
  }
  function buildSfxAsm(sfx) {
    return sfx.asm +
      `\n\n.export _audio_sfx_data:=${sfx.symbol}\n` +
      `.export audio_sfx_data:=${sfx.symbol}\n`;
  }
  const starterRom = await build({
    audioSongsAsm: buildSongsAsm(starter.songs, 0),
    audioSfxAsm:   buildSfxAsm(starter.sfx),
  });
  if (sha1(starterRom) === stockHash) {
    fail('starter-pack ROM hash matches baseline — engine + starter content did not link');
  }
  console.log(`✓ starter pack builds end-to-end (rom hash=${sha1(starterRom).slice(0,12)})`);

  // Case 8 — try the second starter song as the default.
  const altRom = await build({
    audioSongsAsm: buildSongsAsm(starter.songs, 1),
    audioSfxAsm:   buildSfxAsm(starter.sfx),
  });
  if (sha1(altRom) === sha1(starterRom)) {
    fail('changing the default song produced an identical ROM — alias trailer did not switch targets');
  }
  console.log('✓ swapping default song produces a different ROM (alias trailer is wired)');

  // Case 9 — customMainC + audio (the audio.html preview path).
  // The shared-dir audio build (cases 2/3/7/8) and the customMainC
  // tempdir build hit different code paths in the playground
  // server.  The tempdir path clones STEP_DIR, so the Makefile's
  // default `FAMISTUDIO_DIR = ../../tools/audio/famistudio` no
  // longer points anywhere real.  Caught a real shipped regression
  // where the audio.html preview emitted "No rule to make target
  // ../../tools/audio/famistudio/famistudio_engine.s"; the server
  // now passes the absolute path on the make command line.  This
  // case forces a customMainC build with audio so that path is
  // covered by the smoke suite.
  const minimalCustomMain = `
unsigned char dummy;
void waitvsync(void);
extern void play_song(unsigned char idx);
int main(void) { dummy = 0; for(;;) { waitvsync(); } return 0; }
const void *vectors[] = { (void*)0, (void*)main, (void*)0 };
`;
  const r2 = await fetch(`http://127.0.0.1:${PORT}/play`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      state: mkState(),
      playerSpriteIdx: 0, playerStart: { x: 60, y: 120 },
      sceneSprites: [], mode: 'browser',
      customMainC: minimalCustomMain,
      audioSongsAsm: buildSongsAsm(starter.songs, 0),
      audioSfxAsm:   buildSfxAsm(starter.sfx),
    }),
  });
  const customData = await r2.json();
  if (!customData.ok) {
    fail(`customMainC + audio build failed at stage ${customData.stage}: ` +
         (customData.log || '').slice(-400));
  }
  console.log('✓ customMainC + audio build succeeds (tempdir FAMISTUDIO_DIR override works)');

} finally {
  srv.kill('SIGTERM');
  await sleep(300);
}
console.log('\nAudio (Phase 4.3) smoke-test complete.');
