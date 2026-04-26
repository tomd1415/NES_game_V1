/* Shared in-browser NES emulator dialog.
 *
 * Originally lived only on the Builder page.  Extracted so Backgrounds
 * and Behaviour can surface the same embedded emulator their Play
 * button triggers — the user wanted one unified experience everywhere.
 *
 * Sprites.html and code.html keep their own (richer) emulator
 * implementations with pause / reset / fullscreen controls; this
 * module is deliberately simpler so it's safe to drop into any page
 * that doesn't already host an emulator.
 *
 * Usage:
 *   <script src="jsnes.min.js"></script>    (or rely on on-demand load)
 *   <script src="emulator.js"></script>
 *   await NesEmulator.open(romUint8Array, { hasP2: true });
 *
 * The dialog element + its CSS are injected into the page on the
 * first `open()` call — pages don't need any boilerplate HTML.
 */
(function () {
  'use strict';

  // --------------------------------------------------------------------
  // Lazy jsnes loader.  Builder historically loaded it on demand so
  // pupils who never hit Play pay no download cost.  Keep that.
  // --------------------------------------------------------------------
  let _jsnesPromise = null;
  function ensureJsnes() {
    if (window.jsnes) return Promise.resolve();
    if (_jsnesPromise) return _jsnesPromise;
    _jsnesPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'jsnes.min.js';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('jsnes.min.js failed to load'));
      document.head.appendChild(s);
    });
    return _jsnesPromise;
  }

  // --------------------------------------------------------------------
  // Ensure <dialog id="emu-dialog"> + its CSS exist on the page.  Idempotent.
  // --------------------------------------------------------------------
  function ensureDialog() {
    if (document.getElementById('emu-dialog')) return;

    // Inject CSS.  Scoped by class prefixes so it doesn't clash with
    // sprites.html / code.html's own emulator styling.  Uses the CSS
    // custom properties every page already defines (--bg / --fg /
    // --panel / --border / --muted) so colours match the host page.
    const style = document.createElement('style');
    style.textContent = [
      '.shared-emu-dialog {',
      '  background: var(--bg, #14121f); color: var(--fg, #e0e0e0);',
      '  border: 1px solid var(--border, #3a3560); border-radius: 6px;',
      '  padding: 14px; width: min(680px, 96vw);',
      '}',
      '.shared-emu-dialog::backdrop { background: rgba(0,0,0,0.7); }',
      '.shared-emu-dialog .emu-header {',
      '  display: flex; align-items: center; gap: 10px; margin-bottom: 8px;',
      '}',
      '.shared-emu-dialog .emu-header h2 { margin: 0; }',
      '.shared-emu-dialog .close-fab {',
      '  margin-left: auto;',
      '  background: var(--panel2, #2a2640); color: var(--fg, #e0e0e0);',
      '  border: 1px solid var(--border, #3a3560);',
      '  border-radius: 50%; width: 28px; height: 28px; cursor: pointer;',
      '}',
      '.shared-emu-dialog #emu-canvas {',
      '  display: block; margin: 0 auto;',
      '  image-rendering: pixelated; background: #000;',
      '  width: 512px; height: 480px;',
      '}',
      '.shared-emu-dialog .emu-status {',
      '  color: var(--muted, #9791b6); font-size: 0.88em;',
      '  margin-top: 8px; text-align: center; line-height: 1.7;',
      '}',
      '.shared-emu-dialog .emu-status > div + div { margin-top: 2px; }',
      '.shared-emu-dialog .emu-status kbd {',
      '  display: inline-block;',
      '  font-family: Menlo, Consolas, monospace;',
      '  background: var(--panel2, #2a2640); color: var(--fg, #e0e0e0);',
      '  border: 1px solid var(--border, #3a3560); border-bottom-width: 2px;',
      '  border-radius: 3px; padding: 0 5px; font-size: 0.9em;',
      '}',
      '.shared-emu-dialog.single-player .emu-p2-controls { display: none; }',
    ].join('\n');
    document.head.appendChild(style);

    const dlg = document.createElement('dialog');
    dlg.id = 'emu-dialog';
    dlg.className = 'shared-emu-dialog';
    dlg.innerHTML =
      '<div class="emu-header">' +
      '  <h2>▶ Your game</h2>' +
      '  <button type="button" class="close-fab" id="emu-mute" title="Mute / unmute audio" aria-pressed="false">🔊</button>' +
      '  <button type="button" class="close-fab" id="emu-close" title="Close">×</button>' +
      '</div>' +
      '<canvas id="emu-canvas" width="256" height="240"></canvas>' +
      '<div class="emu-status">' +
      '  <div><strong>Player 1:</strong> Arrow keys move · <kbd>F</kbd>&nbsp;= jump (A) · <kbd>D</kbd>&nbsp;= B · <kbd>Enter</kbd>&nbsp;= Start · <kbd>Right&nbsp;Shift</kbd>&nbsp;= Select</div>' +
      '  <div class="emu-p2-controls"><strong>Player 2:</strong> <kbd>I</kbd>/<kbd>J</kbd>/<kbd>K</kbd>/<kbd>L</kbd> move · <kbd>O</kbd>&nbsp;= jump (A) · <kbd>U</kbd>&nbsp;= B · <kbd>1</kbd>&nbsp;= Start · <kbd>2</kbd>&nbsp;= Select</div>' +
      '</div>';
    document.body.appendChild(dlg);
  }

  // --------------------------------------------------------------------
  // Keyboard → NES pad mapping.  Identical to the Builder's original —
  // pupils have built muscle memory for arrow keys + F/D on P1 and the
  // I/J/K/L cluster on P2.
  // --------------------------------------------------------------------
  function mapCode(code) {
    switch (code) {
      case 'ArrowUp':    return { pad: 1, button: jsnes.Controller.BUTTON_UP };
      case 'ArrowDown':  return { pad: 1, button: jsnes.Controller.BUTTON_DOWN };
      case 'ArrowLeft':  return { pad: 1, button: jsnes.Controller.BUTTON_LEFT };
      case 'ArrowRight': return { pad: 1, button: jsnes.Controller.BUTTON_RIGHT };
      case 'KeyF':       return { pad: 1, button: jsnes.Controller.BUTTON_A };
      case 'KeyD':       return { pad: 1, button: jsnes.Controller.BUTTON_B };
      case 'Enter':      return { pad: 1, button: jsnes.Controller.BUTTON_START };
      case 'ShiftRight': return { pad: 1, button: jsnes.Controller.BUTTON_SELECT };
      case 'KeyI':       return { pad: 2, button: jsnes.Controller.BUTTON_UP };
      case 'KeyK':       return { pad: 2, button: jsnes.Controller.BUTTON_DOWN };
      case 'KeyJ':       return { pad: 2, button: jsnes.Controller.BUTTON_LEFT };
      case 'KeyL':       return { pad: 2, button: jsnes.Controller.BUTTON_RIGHT };
      case 'KeyO':       return { pad: 2, button: jsnes.Controller.BUTTON_A };
      case 'KeyU':       return { pad: 2, button: jsnes.Controller.BUTTON_B };
      case 'Digit1':     return { pad: 2, button: jsnes.Controller.BUTTON_START };
      case 'Digit2':     return { pad: 2, button: jsnes.Controller.BUTTON_SELECT };
    }
    return null;
  }

  // Web Audio plumbing — Phase 4.3.  jsnes emits stereo samples
  // through `onAudioSample(left, right)`; we drop them into a small
  // ring buffer and a ScriptProcessorNode pulls from the same buffer
  // to fill the speaker output.  Lazily created and cached: opening
  // the emulator twice in one session reuses the same AudioContext
  // (browsers limit how many you can create, and resuming a
  // suspended context inside a click handler is what unlocks audio
  // post-autoplay-policy).
  //
  // ScriptProcessorNode is deprecated in favour of AudioWorklet but
  // (a) every shipping browser still supports it, (b) AudioWorklet
  // needs a separate worklet file, which we'd rather avoid for a
  // single shared module.  Trade-off documented so a future cleanup
  // pass knows what to swap to.
  let audioCtx = null;
  let audioMuted = false;
  function ensureAudioContext() {
    if (audioCtx) return audioCtx;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    try {
      audioCtx = new Ctor({ sampleRate: 44100 });
    } catch (_) {
      try { audioCtx = new Ctor(); } catch (__) { audioCtx = null; }
    }
    return audioCtx;
  }

  // --------------------------------------------------------------------
  // Open the dialog, load ROM, run.  Returns a Promise that resolves
  // when the dialog closes, so pages can sequence things if they want.
  // --------------------------------------------------------------------
  async function open(rom, opts) {
    opts = opts || {};
    await ensureJsnes();
    ensureDialog();

    const dlg    = document.getElementById('emu-dialog');
    const canvas = document.getElementById('emu-canvas');
    const ctx    = canvas.getContext('2d');
    const img    = ctx.createImageData(256, 240);
    const frame  = new Uint32Array(img.data.buffer);

    // Single-player hint: hide the P2 row when the caller explicitly
    // says there's no P2.  We set both the dialog class (used by the
    // CSS this module injects) and a body class (matches the Builder's
    // pre-existing `body.emu-single-player #emu-p2-controls` rule),
    // so the hint hides regardless of which page's dialog we land on.
    dlg.classList.toggle('single-player', opts.hasP2 === false);
    document.body.classList.toggle('emu-single-player', opts.hasP2 === false);

    // Audio ring buffer: 4096 stereo frames = 8192 samples.  At
    // 44.1 kHz that's ~93 ms of headroom, comfortably more than the
    // ~17 ms between rAF-driven jsnes frames so we don't underrun
    // even if a frame is late.  Stereo is interleaved L,R,L,R,...
    const SAMPLE_BUF_LEN = 8192;
    const sampleBuf = new Float32Array(SAMPLE_BUF_LEN);
    let writeIdx = 0;
    let readIdx  = 0;

    const nes = new jsnes.NES({
      onFrame(buf) {
        for (let i = 0; i < buf.length; i++) frame[i] = 0xff000000 | buf[i];
        ctx.putImageData(img, 0, 0);
      },
      onAudioSample(left, right) {
        sampleBuf[writeIdx]     = left;
        sampleBuf[writeIdx + 1] = right;
        writeIdx = (writeIdx + 2) % SAMPLE_BUF_LEN;
      },
    });
    let romStr = '';
    for (let i = 0; i < rom.length; i++) romStr += String.fromCharCode(rom[i]);
    nes.loadROM(romStr);

    // Web Audio output.  Best-effort — if the browser refuses
    // (very old WebKit, locked-down WebView, or AudioContext
    // creation fails) the game still runs silently.
    const ac = ensureAudioContext();
    let scriptNode = null;
    if (ac) {
      // open() always runs from a click handler, which is the
      // gesture the autoplay policy needs.  Resume in case a
      // previous open() left the context suspended.
      if (ac.state === 'suspended') {
        try { ac.resume(); } catch (_) {}
      }
      scriptNode = ac.createScriptProcessor(2048, 0, 2);
      scriptNode.onaudioprocess = (e) => {
        const out0 = e.outputBuffer.getChannelData(0);
        const out1 = e.outputBuffer.getChannelData(1);
        if (audioMuted) {
          // Drain the ring buffer even when muted so the producer
          // doesn't keep overwriting itself + producing audible
          // glitches when un-muted.
          for (let i = 0; i < out0.length; i++) {
            out0[i] = 0; out1[i] = 0;
            readIdx = (readIdx + 2) % SAMPLE_BUF_LEN;
          }
          return;
        }
        for (let i = 0; i < out0.length; i++) {
          out0[i] = sampleBuf[readIdx]     || 0;
          out1[i] = sampleBuf[readIdx + 1] || 0;
          readIdx = (readIdx + 2) % SAMPLE_BUF_LEN;
        }
      };
      scriptNode.connect(ac.destination);
    }

    // Mute toggle.  The button's label/aria-pressed update on click
    // so screen readers + the a11y high-contrast theme both reflect
    // the state.
    const muteBtn = document.getElementById('emu-mute');
    function syncMuteUi() {
      if (!muteBtn) return;
      muteBtn.textContent = audioMuted ? '🔇' : '🔊';
      muteBtn.setAttribute('aria-pressed', audioMuted ? 'true' : 'false');
      muteBtn.title = audioMuted ? 'Unmute audio' : 'Mute audio';
    }
    syncMuteUi();
    function onMute() {
      audioMuted = !audioMuted;
      syncMuteUi();
    }
    if (muteBtn) muteBtn.onclick = onMute;

    const kd = (e) => { const m = mapCode(e.code); if (m) nes.buttonDown(m.pad, m.button); };
    const ku = (e) => { const m = mapCode(e.code); if (m) nes.buttonUp(m.pad,   m.button); };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup',   ku);

    // Drive emulation from a fixed-time-step setInterval rather than
    // requestAnimationFrame.  rAF stalls whenever the main thread is
    // busy (heavy sprite scenes, scrolling) — that drops jsnes from
    // 60 fps to 30-50 fps, and because the audio device keeps
    // consuming samples at 44.1 kHz the producer falls behind, the
    // ring buffer underruns, and pupils hear the music tempo wobble.
    // setInterval is steady (browsers clamp at ~4 ms minimum, well
    // below our 16.67 ms target), and a small catch-up loop runs
    // 1-2 frames per tick if the timer fires late.  We cap the
    // catch-up at 4 frames to stop a paused tab from triggering a
    // death-spiral on resume.
    const FRAME_MS = 1000 / 60;   // NES NTSC: 60.0988 Hz; close enough.
    const CATCHUP_CAP = 4;
    let lastTick = performance.now();
    const intervalId = setInterval(() => {
      const now = performance.now();
      let elapsed = now - lastTick;
      // Tab-resume: cap so we don't churn through dozens of frames
      // in one go (which would block the main thread for hundreds
      // of ms and cause an audible lurch on its own).
      if (elapsed > CATCHUP_CAP * FRAME_MS) {
        elapsed = FRAME_MS;
        lastTick = now - FRAME_MS;
      }
      let frames = Math.max(1, Math.floor(elapsed / FRAME_MS));
      if (frames > CATCHUP_CAP) frames = CATCHUP_CAP;
      for (let i = 0; i < frames; i++) nes.frame();
      lastTick += frames * FRAME_MS;
    }, FRAME_MS);

    dlg.showModal();

    return new Promise(resolve => {
      const close = () => {
        if (intervalId) clearInterval(intervalId);
        window.removeEventListener('keydown', kd);
        window.removeEventListener('keyup',   ku);
        if (scriptNode) {
          try { scriptNode.disconnect(); } catch (_) {}
          scriptNode.onaudioprocess = null;
          scriptNode = null;
        }
        // Suspend (don't close) the AudioContext so the next open()
        // can resume it cheaply.  Closing it would force creating a
        // new context, which browsers throttle.
        if (ac && ac.state === 'running') {
          try { ac.suspend(); } catch (_) {}
        }
        if (muteBtn) muteBtn.onclick = null;
        try { dlg.close(); } catch (_) {}
        if (typeof opts.onClose === 'function') {
          try { opts.onClose(); } catch (_) {}
        }
        resolve();
      };
      document.getElementById('emu-close').onclick = close;
      dlg.addEventListener('close', close, { once: true });
    });
  }

  window.NesEmulator = {
    open: open,
    ensureJsnes: ensureJsnes,
  };
})();
