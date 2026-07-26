// Item #37 — "the game keeps crashing" / "the emulator froze for no reason".
//
// Two guards live here:
//  1. Unit tests for the pure frame-loop watchdog (stall + sustained-slow
//     detection, and its resistance to false positives on a slow device).
//  2. Source-level guards that the frame loop in emulator.js is actually
//     wired to it — a watchdog nothing calls is worse than none, because it
//     reads as covered.
//
// The frame loop lives inside open(), which needs a real DOM, so the wiring
// is checked by inspecting the source the same way emulator-p2-keys.mjs does.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = new URL('../..', import.meta.url).pathname;
const WEB = path.join(ROOT, 'tools', 'tile_editor_web');

function fail(m) { console.error('FAIL:', m); process.exit(1); }
function assert(c, m) { if (!c) fail(m); }

globalThis.window = globalThis;
new Function(fs.readFileSync(path.join(WEB, 'emulator.js'), 'utf8'))();

const E = window.NesEmulator;
assert(E && typeof E.createFrameWatchdog === 'function',
  'emulator.js did not expose NesEmulator.createFrameWatchdog');

// --------------------------------------------------------------------
// 1. Healthy emulation never trips the watchdog.
// --------------------------------------------------------------------
{
  const wd = E.createFrameWatchdog();
  for (let i = 0; i < 5000; i++) {
    // A normal tick: 1-4 frames rendered in a handful of ms.
    assert(wd.tick(4 + (i % 12), 1 + (i % 4)) === null,
      `healthy tick ${i} tripped the watchdog`);
  }
  console.log('✓ 5000 healthy ticks do not trip the watchdog');
}

// --------------------------------------------------------------------
// 2. A stall (ticks firing, zero frames rendered) trips 'stalled'.
// --------------------------------------------------------------------
{
  const wd = E.createFrameWatchdog({ stallTicks: 10 });
  for (let i = 0; i < 9; i++) {
    assert(wd.tick(3, 0) === null, `stalled early at tick ${i}`);
  }
  const v = wd.tick(3, 0);
  assert(v && v.reason === 'stalled', 'watchdog did not report a stall on the 10th empty tick');
  console.log('✓ zero rendered frames for stallTicks ticks reports "stalled"');
}

// --------------------------------------------------------------------
// 3. Sustained pathological slowness trips 'slow'.
// --------------------------------------------------------------------
{
  const wd = E.createFrameWatchdog({ slowTickMs: 750, slowStreak: 8 });
  for (let i = 0; i < 7; i++) {
    assert(wd.tick(800, 4) === null, `slow tripped early at tick ${i}`);
  }
  const v = wd.tick(800, 4);
  assert(v && v.reason === 'slow', 'watchdog did not report sustained slowness');
  console.log('✓ slowTickMs exceeded for slowStreak consecutive ticks reports "slow"');
}

// --------------------------------------------------------------------
// 4. FALSE-POSITIVE GUARD — the one that matters most in a classroom.
//    A wrongly-shown "your game stopped" on a working game is worse than a
//    freeze. An occasional GC pause or a struggling Chromebook must not trip
//    it: only an unbroken streak counts, and one good tick clears the count.
// --------------------------------------------------------------------
{
  const wd = E.createFrameWatchdog({ slowTickMs: 750, slowStreak: 8 });
  for (let round = 0; round < 200; round++) {
    // 7 bad ticks — one short of the streak — then one recovered tick.
    for (let i = 0; i < 7; i++) {
      assert(wd.tick(900, 2) === null, `intermittent slowness tripped at round ${round}`);
    }
    assert(wd.tick(20, 3) === null, `recovery tick tripped at round ${round}`);
  }
  console.log('✓ intermittent slowness with recovery never trips (200 rounds)');

  const wd2 = E.createFrameWatchdog({ stallTicks: 10 });
  for (let round = 0; round < 200; round++) {
    for (let i = 0; i < 9; i++) assert(wd2.tick(5, 0) === null, 'intermittent stall tripped');
    assert(wd2.tick(5, 1) === null, 'stall recovery tick tripped');
  }
  console.log('✓ intermittent empty ticks with recovery never trip (200 rounds)');
}

// --------------------------------------------------------------------
// 5. Once tripped it stays quiet until reset() — the caller has already
//    torn the loop down, so repeat verdicts would be noise.
// --------------------------------------------------------------------
{
  const wd = E.createFrameWatchdog({ stallTicks: 2 });
  wd.tick(3, 0);
  assert(wd.tick(3, 0) && wd.tick(3, 0) === null, 'setup: expected a trip then silence');
  for (let i = 0; i < 50; i++) assert(wd.tick(3, 0) === null, 'tripped watchdog kept reporting');
  wd.reset();
  wd.tick(3, 0);
  assert(wd.tick(3, 0) !== null, 'reset() did not re-arm the watchdog');
  console.log('✓ a tripped watchdog stays silent until reset(), then re-arms');
}

// --------------------------------------------------------------------
// 6. Defaults are sane and conservative.
// --------------------------------------------------------------------
{
  const d = E.WATCHDOG_DEFAULTS;
  assert(d && d.slowTickMs >= 500, 'slowTickMs default is too twitchy for a school Chromebook');
  assert(d.slowStreak >= 4, 'slowStreak default is too short — one GC pause could trip it');
  assert(d.stallTicks >= 60, 'stallTicks default is too short (< ~1 s of stall)');
  console.log(`✓ defaults are conservative (${d.slowTickMs}ms × ${d.slowStreak}, stall ${d.stallTicks})`);
}

// --------------------------------------------------------------------
// 7. Every failure mode has pupil-facing wording, and none of it blames the
//    pupil or leaks jargon. Several of these fire on OUR bugs.
// --------------------------------------------------------------------
{
  const msgs = E.CRASH_MESSAGES;
  for (const reason of ['crash', 'stalled', 'slow', 'load']) {
    const m = msgs[reason];
    assert(typeof m === 'string' && m.length > 10, `no crash message for "${reason}"`);
    assert(!/\b(exception|null|undefined|stack|NaN|jsnes|OAM)\b/i.test(m),
      `crash message for "${reason}" leaks jargon: ${m}`);
    assert(/safe/i.test(m), `crash message for "${reason}" should reassure that work is safe`);
  }
  console.log('✓ all four failure modes have plain-language, reassuring wording');
}

// --------------------------------------------------------------------
// 8. Wiring guards on emulator.js's frame loop.
// --------------------------------------------------------------------
{
  const src = fs.readFileSync(path.join(WEB, 'emulator.js'), 'utf8');

  // The nes.frame() batch must be inside a try/catch. An exception in a
  // setInterval callback does NOT stop the interval, so an unguarded throw
  // repeats 60x/second into a console the pupil never sees.
  const loopBody = src.slice(src.indexOf('function startLoop'), src.indexOf('function startLoop') + 2500);
  assert(/function startLoop/.test(src), 'emulator.js no longer has a startLoop()');
  assert(/try\s*\{[\s\S]*?nes\.frame\(\)[\s\S]*?\}\s*catch/.test(loopBody),
    'the nes.frame() batch is not wrapped in try/catch');
  assert(/onEmulationFailure\('crash'/.test(loopBody),
    'a thrown frame error does not route to onEmulationFailure');

  // The watchdog must actually be consulted each tick, and its verdict acted on.
  assert(/watchdog\.tick\(/.test(loopBody), 'startLoop() never calls watchdog.tick()');
  assert(/if\s*\(verdict\)\s*onEmulationFailure/.test(loopBody),
    'the watchdog verdict is computed but never acted on');

  // Failure must stop the loop, not just show a message.
  assert(/function onEmulationFailure[\s\S]{0,300}stopLoop\(\)/.test(src),
    'onEmulationFailure does not stop the frame loop');

  // loadROM must not be able to reject open() before the dialog shows.
  assert(/try\s*\{\s*\n?\s*nes\.loadROM\(/.test(src), 'nes.loadROM() is not guarded by try/catch');

  // Closing the dialog must tear the loop down (no orphaned interval).
  assert(/const close = \(\) => \{\s*\n\s*stopLoop\(\);/.test(src),
    'closing the dialog no longer stops the frame loop');

  // Stopping the loop leaves nothing writing the audio ring buffer, so the
  // ScriptProcessor would loop the last ~93 ms of samples forever — a drone
  // under the crash banner. The audio callback must honour the halt flag.
  assert(/function onEmulationFailure[\s\S]{0,300}emulationHalted = true/.test(src),
    'a failure does not silence the audio ring buffer (emulationHalted)');
  assert(/if \(audioMuted \|\| emulationHalted\)/.test(src),
    'the audio callback does not check emulationHalted, so a crash would drone');
  assert(/function startLoop\(\)[\s\S]{0,200}emulationHalted = false/.test(src),
    'restarting the loop does not clear emulationHalted — retry would be silent');

  // The banner has to exist in the injected markup.
  assert(/id="emu-crash"/.test(src) && /id="emu-crash-retry"/.test(src),
    'the crash banner markup is missing from the injected dialog');
  assert(/role="alert"/.test(src), 'the crash banner is not announced to screen readers');

  console.log('✓ emulator.js frame loop is wired to the watchdog, try/catch and banner');
}

console.log('\nitem-37 emulator-watchdog: all checks passed');
