/* Shared "assemble + build + launch" helper used by every editor page.
 *
 * Before this module existed, each page (Backgrounds, Sprites, Behaviour,
 * Builder, Code) had its own copy of the Play flow — compute player
 * index / start, build sceneSprites, POST /play, handle response.  The
 * payloads drifted: Builder sent customMainC, Sprites did not; Code
 * offered a native-emulator selector, Builder hardcoded browser mode;
 * Backgrounds and Behaviour had no Play button at all.
 *
 * This helper centralises the flow.  Every page now:
 *   1. loads `state` from storage (as before),
 *   2. calls `PlayPipeline.play(state, { mode, download, onStatus, onRom })`.
 *
 * The pipeline:
 *   * migrates state.builder to the current module-tree shape,
 *   * clones state and injects sensible fallbacks (stub player sprite if
 *     the pupil hasn't made one yet) so a brand-new project still builds,
 *   * assembles customMainC via BuilderAssembler,
 *   * derives playerSpriteIdx / playerStart / sceneSprites from
 *     state.builder (the Builder tree is the source of truth),
 *   * POSTs /play,
 *   * forwards the result: ROM bytes to the page's emulator callback,
 *     or triggers a .nes download, or reports the native-launch status.
 *
 * Kept intentionally free of direct DOM access (except the one anchor
 * trick for downloads) so the smoke tests can import it under Node.
 */
(function () {
  'use strict';

  // --------------------------------------------------------------------
  // Capability probe — cached for the page's lifetime.
  // --------------------------------------------------------------------
  let _capsPromise = null;
  async function capabilities() {
    if (_capsPromise) return _capsPromise;
    // The server exposes /health, not /capabilities — an earlier version
    // of this helper probed the wrong path, which left the native-fceux
    // option permanently disabled on every page even when fceux was
    // installed.  Two-argument shape of the response is
    //   { fceux: bool, modes: ['browser', ...] }.
    _capsPromise = fetch('/health', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : { fceux: false })
      .catch(() => ({ fceux: false }));
    return _capsPromise;
  }

  // --------------------------------------------------------------------
  // Template fetch — cached.  BuilderAssembler needs the platformer.c
  // text to substitute module output into.
  // --------------------------------------------------------------------
  let _templatePromise = null;
  async function loadTemplate() {
    if (_templatePromise) return _templatePromise;
    _templatePromise = fetch('builder-templates/platformer.c',
      { cache: 'no-store' })
      .then(r => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      });
    return _templatePromise;
  }

  // --------------------------------------------------------------------
  // State fortification — make sure the payload the server receives is
  // always valid, even for the most empty project a pupil could load.
  // --------------------------------------------------------------------
  function stubPlayerSprite() {
    // 2x2 fully-empty cells.  `tile: 0` + `empty: true` means the
    // server emits zeroes for every cell; the player is invisible but
    // the ROM builds and runs.  Pupils who haven't painted a player
    // sprite get a playable (if dull) level instead of a cc65 error.
    const cells = [];
    for (let r = 0; r < 2; r++) {
      const row = [];
      for (let c = 0; c < 2; c++) {
        row.push({ tile: 0, palette: 0, empty: true });
      }
      cells.push(row);
    }
    return {
      role: 'player',
      name: '(placeholder player — make one on the Sprites page)',
      width: 2, height: 2,
      cells: cells,
    };
  }

  function ensurePlayerSprite(state) {
    const sprites = Array.isArray(state.sprites) ? state.sprites.slice()
                                                 : [];
    const hasPlayer = sprites.some(sp => sp && sp.role === 'player');
    if (hasPlayer) return state;
    sprites.push(stubPlayerSprite());
    // Shallow clone so we don't mutate the caller's state.
    return Object.assign({}, state, { sprites: sprites });
  }

  function ensureBuilderTree(state) {
    if (state.builder && state.builder.version === 1) return state;
    if (!window.BuilderDefaults) return state;  // older pages; tolerate
    return Object.assign({}, state, { builder: window.BuilderDefaults() });
  }

  // Phase 4.3 — fill in state.audio with empty defaults for projects
  // that predate the audio schema.  Songs and sfx are pupil-uploaded
  // FamiStudio .s blobs (or seeded from the starter pack); both
  // optional.  defaultSongIdx is the song that plays at boot.
  function ensureAudio(state) {
    if (state.audio && Array.isArray(state.audio.songs)) return state;
    return Object.assign({}, state, {
      audio: {
        songs: [],
        sfx: null,
        defaultSongIdx: 0,
      },
    });
  }

  function fortifyState(state) {
    if (!state || typeof state !== 'object') {
      throw new Error('PlayPipeline: state is missing');
    }
    return ensureAudio(ensurePlayerSprite(ensureBuilderTree(state)));
  }

  // --------------------------------------------------------------------
  // Derive playerSpriteIdx / playerStart / sceneSprites from state.
  // Mirrors what builder.html used to do inline — same logic, same
  // auto-placement fallback — but now shared.
  // --------------------------------------------------------------------
  function moduleNode(state, id) {
    const parts = id.split('.');
    let node = state.builder && state.builder.modules
      && state.builder.modules[parts[0]];
    for (let i = 1; i < parts.length && node; i++) {
      node = node.submodules && node.submodules[parts[i]];
    }
    return node || null;
  }

  function derivePlayers(state) {
    const A = window.BuilderAssembler;
    const playerIdxs = (A && typeof A.findSpritesByRole === 'function')
      ? A.findSpritesByRole(state, 'player')
      : (state.sprites || [])
          .map((s, i) => (s && s.role === 'player') ? i : -1)
          .filter(i => i >= 0);
    const playerIdx = playerIdxs.length ? playerIdxs[0] : -1;
    const p1 = moduleNode(state, 'players.player1');
    const playerStart = (p1 && p1.config) ? {
      x: p1.config.startX, y: p1.config.startY,
    } : { x: 60, y: 120 };
    // P2 is optional.
    const p2 = moduleNode(state, 'players.player2');
    const p2Enabled = !!(p2 && p2.enabled);
    const playerIdx2 = (p2Enabled && playerIdxs[1] !== undefined)
      ? playerIdxs[1] : -1;
    const playerStart2 = (p2 && p2.config) ? {
      x: p2.config.startX, y: p2.config.startY,
    } : { x: 180, y: 120 };
    return { playerIdxs, playerIdx, playerStart, playerIdx2, playerStart2 };
  }

  function deriveSceneSprites(state, playerIdx) {
    // 1. Explicit instances[] from the Scene module's config — pupil
    //    placed these themselves, so honour their ordering exactly.
    //    Row order matters: per-instance AI references ss_x[i] by
    //    position in this array.
    const scene = moduleNode(state, 'scene');
    const instances = (scene && scene.config &&
      Array.isArray(scene.config.instances))
      ? scene.config.instances : [];
    if (instances.length > 0) {
      const out = [];
      for (const inst of instances) {
        if (!state.sprites[inst.spriteIdx]) continue;
        out.push({
          spriteIdx: inst.spriteIdx | 0,
          x: inst.x | 0,
          y: inst.y | 0,
        });
      }
      return out;
    }
    // 2. Auto-place one instance per non-player sprite with a
    //    gameplay role.  Kicks in for pupils who haven't visited
    //    the Scene module yet.
    const out = [];
    const includedRoles = new Set(['enemy', 'npc', 'pickup',
      'powerup', 'item', 'tool', 'projectile', 'decoration']);
    let cursorX = 96;
    for (let i = 0; i < (state.sprites || []).length; i++) {
      if (i === playerIdx) continue;
      const sp = state.sprites[i];
      if (!sp || !includedRoles.has(sp.role)) continue;
      const w = (sp.width || 2) * 8;
      const x = Math.min(240 - w, cursorX);
      out.push({ spriteIdx: i, x: x, y: 120 });
      cursorX += w + 24;
      if (cursorX > 240) break;
    }
    return out;
  }

  // --------------------------------------------------------------------
  // Build the /play POST body.  Pure synchronous function of (state,
  // templateText, opts) so the smoke tests can call it directly.
  //
  // opts.customMainC / opts.customMainAsm let the Code page bypass the
  // BuilderAssembler entirely — pupils writing raw C/asm on that page
  // want *their* code to run, not whatever the Builder would have
  // assembled.  Everything else (state fortification, player/scene
  // derivation, POST body shape) stays the same.
  // --------------------------------------------------------------------
  function buildPlayRequest(state, templateText, opts) {
    opts = opts || {};
    const s = fortifyState(state);
    let customMainC = null;
    let customMainAsm = null;
    if (typeof opts.customMainC === 'string') {
      customMainC = opts.customMainC;
    } else if (typeof opts.customMainAsm === 'string') {
      customMainAsm = opts.customMainAsm;
    } else {
      const A = window.BuilderAssembler;
      if (!A || typeof A.assemble !== 'function') {
        throw new Error('BuilderAssembler not loaded');
      }
      if (!templateText) {
        throw new Error('templateText required when opts.customMainC is not set');
      }
      customMainC = A.assemble(s, templateText);
    }
    const players = derivePlayers(s);
    const sceneSprites = deriveSceneSprites(s, players.playerIdx);
    const payload = {
      state: s,
      playerSpriteIdx: players.playerIdx >= 0 ? players.playerIdx : 0,
      playerStart: players.playerStart,
      sceneSprites: sceneSprites,
      mode: opts.mode === 'native' ? 'native' : 'browser',
    };
    if (customMainC !== null)   payload.customMainC = customMainC;
    if (customMainAsm !== null) payload.customMainAsm = customMainAsm;
    if (players.playerIdx2 >= 0) {
      payload.playerSpriteIdx2 = players.playerIdx2;
      payload.playerStart2 = players.playerStart2;
    }

    // Phase 4.3 — audio.  Pre-2026-04-27 this gate required *both*
    // a song and a sfx pack uploaded before audio engaged at all.
    // Pupils uploading just a song saw silence: the editor dropped
    // the songsAsm here, the server fell back to no-audio, the
    // build linked without the engine.  Now the server auto-stubs
    // whichever side is missing (see playground_server.py's
    // _AUTO_SFX_STUB_ASM / _AUTO_SONGS_STUB_ASM), so we just send
    // whatever the pupil has and let the server complete the pair.
    //
    // We still emit nothing when the pupil has *neither* — there's
    // no audio asset at all to stub against, and engaging the
    // engine just to play silence wastes ~3.5 KB of PRG.
    const audio = s.audio || { songs: [], sfx: null };
    const hasSongs = Array.isArray(audio.songs) && audio.songs.length > 0
      && audio.songs.some(s2 => s2 && typeof s2.asm === 'string'
        && s2.asm.trim().length > 0);
    const hasSfx = !!(audio.sfx && typeof audio.sfx.asm === 'string'
      && audio.sfx.asm.trim().length > 0);
    if (hasSongs) {
      const defaultIdx = (typeof audio.defaultSongIdx === 'number'
        && audio.defaultSongIdx >= 0
        && audio.defaultSongIdx < audio.songs.length)
        ? audio.defaultSongIdx : 0;
      const defaultSong = audio.songs[defaultIdx];
      // Symbol must be a strict ca65 identifier or `.export X:=<sym>`
      // throws "Constant expression expected" — that error is the
      // canonical pupil-reported audio build failure (2026-04-27).
      const validId = /^[A-Za-z_][A-Za-z0-9_]*$/;
      if (defaultSong && typeof defaultSong.asm === 'string'
          && typeof defaultSong.symbol === 'string'
          && validId.test(defaultSong.symbol)) {
        const songsAsm = audio.songs
          .map(song => song.asm || '')
          .filter(asm => asm.trim().length > 0)
          .join('\n\n');
        const aliasTrailer =
          '\n\n; Alias the pupil-chosen default song to the symbol\n' +
          '; main.c imports.  Phase 4.3.\n' +
          '.export _audio_default_music:=' + defaultSong.symbol + '\n' +
          '.export audio_default_music:=' + defaultSong.symbol + '\n';
        payload.audioSongsAsm = songsAsm + aliasTrailer;
      }
    }
    if (hasSfx) {
      const validId = /^[A-Za-z_][A-Za-z0-9_]*$/;
      const sfxSym = audio.sfx.symbol || 'sounds';
      if (validId.test(sfxSym)) {
        const sfxAlias =
          '\n\n; Alias the FamiStudio-exported `sounds` symbol to the\n' +
          '; one main.c imports.  Phase 4.3.\n' +
          '.export _audio_sfx_data:=' + sfxSym + '\n' +
          '.export audio_sfx_data:=' + sfxSym + '\n';
        payload.audioSfxAsm = audio.sfx.asm + sfxAlias;
      }
    }

    return payload;
  }

  // --------------------------------------------------------------------
  // Utility — convert base64 ROM to Uint8Array.
  // --------------------------------------------------------------------
  function decodeRomBase64(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  // --------------------------------------------------------------------
  // Save a Uint8Array as a file via an invisible <a download>.
  // --------------------------------------------------------------------
  function triggerDownload(bytes, filename) {
    const blob = new Blob([bytes], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'game.nes';
    document.body.appendChild(a);
    a.click();
    // Defer revoke so Firefox has time to start the download.
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 200);
  }

  // --------------------------------------------------------------------
  // Full flow: assemble, POST /play, dispatch the result.
  // --------------------------------------------------------------------
  async function play(state, opts) {
    opts = opts || {};
    const onStatus = opts.onStatus || function () {};
    const onRom   = opts.onRom   || function () {};
    const mode    = opts.mode === 'native' ? 'native' : 'browser';

    let payload;
    try {
      // If the caller supplies raw code we skip the template fetch
      // (Code-page case — pupils write their own main).
      const hasOwnCode = typeof opts.customMainC === 'string' ||
        typeof opts.customMainAsm === 'string';
      const templateText = hasOwnCode ? null : await loadTemplate();
      payload = buildPlayRequest(state, templateText, {
        mode: mode,
        customMainC: opts.customMainC,
        customMainAsm: opts.customMainAsm,
      });
    } catch (e) {
      onStatus('error', '⚠ Could not assemble project: ' + e.message);
      return { ok: false, stage: 'assemble', error: e.message };
    }

    onStatus('info', 'Compiling…');
    let body;
    try {
      const res = await fetch('/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      try { body = await res.json(); }
      catch { body = { ok: false, log: 'server returned non-JSON' }; }
    } catch (err) {
      onStatus('error',
        '⚠ Could not reach the playground server. ' +
        'Start it with the "Start Playground Server" VSCode task.');
      return { ok: false, stage: 'network', error: String(err) };
    }

    if (!body.ok) {
      const stage = body.stage ? '[' + body.stage + '] ' : '';
      onStatus('error', '✗ ' + stage + 'build failed');
      return body;
    }

    // Browser mode: we get rom_b64 back.  Either download or hand to
    // the page's emulator.
    if (body.rom_b64) {
      const rom = decodeRomBase64(body.rom_b64);
      if (opts.download) {
        const name = (state && state.name ? state.name : 'game')
          .replace(/[^a-zA-Z0-9_-]+/g, '_') + '.nes';
        triggerDownload(rom, name);
        onStatus('ok', '✓ Downloaded ' + name);
      } else {
        onStatus('ok', '✓ Build OK — launching emulator…');
        try { onRom(rom, body); }
        catch (e) { onStatus('error', '⚠ Emulator callback failed: ' + e.message); }
      }
    } else {
      // Native mode: server launched fceux, no ROM bytes returned.
      onStatus('ok', '✓ Build OK — FCEUX should appear on the server.');
    }
    return body;
  }

  // --------------------------------------------------------------------
  // Public surface.
  // --------------------------------------------------------------------
  window.PlayPipeline = {
    capabilities: capabilities,
    buildPlayRequest: buildPlayRequest,
    play: play,
    // Internals exposed for tests + page code that wants to reuse bits:
    _fortifyState: fortifyState,
    _derivePlayers: derivePlayers,
    _deriveSceneSprites: deriveSceneSprites,
    _decodeRomBase64: decodeRomBase64,
  };
})();
