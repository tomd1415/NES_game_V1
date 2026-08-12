// Harness self-test: `startServer` must prove it owns the port.
//
// Sixty suites call startServer and every one of them trusts it to fail loudly
// when the port is not theirs. Until 2026-08-12 nothing asserted that. The guard
// itself was added on 2026-08-07 after the silent version cost weeks: on finding
// a working playground server already on its port, playground_server.py prints
// "already running -- nothing to do" and returns 0, so the suite ran green
// against a server it had not configured — losing PLAYGROUND_NO_ASM, the
// isolated accounts DB, everything it asked for.
//
// WHY THIS ASSERTS THE MESSAGE AND NOT MERELY "IT THREW".
// Removing the pre-flight does not stop startServer throwing: the child spawns,
// surrenders, exits 0, and the readiness loop then throws down the `surrendered()`
// path instead. A test that only checked "an occupied port is rejected" would stay
// green with the guard deleted — it would be measuring the fallback, not the
// guard. So the two paths are distinguished by their messages, which is what makes
// this mutation-detectable at all.
import { startServer, stopServer } from './lib/render-harness.mjs';

// A free gap inside the documented builder range (18768–18897), not a new ceiling:
// adding a suite should not force five docs that restate the range to be edited.
// Verified unclaimed 2026-08-12 — see docs/guides/TEST-SERVERS.md for the grep.
const PORT = 18771;

let failed = false;
const ok  = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };

// --- 1. Positive control -----------------------------------------------------
// If a free port did not work, every assertion below would be meaningless — a
// refusal would prove nothing, because startServer would be refusing everything.
let srv;
try {
  ({ srv } = await startServer(PORT, { PLAYGROUND_NO_ASM: '1' }));
  ok('startServer binds a free port and returns a live child');
} catch (e) {
  bad('startServer could not bind a free port at all: ' + e.message);
  process.exit(1);
}

// --- 2. The guard ------------------------------------------------------------
try {
  const second = await startServer(PORT, {});
  bad('startServer RETURNED for an occupied port — nothing refused it, which is '
    + 'the silent-success bug this guard exists to prevent');
  await stopServer(second.srv);
} catch (e) {
  const msg = e.message || String(e);
  if (/already serving \/health on this port/.test(msg)) {
    ok('an occupied port is refused by the pre-flight, before spawning anything');
  } else if (/between the pre-flight check and the spawn|exited .* instead of binding/.test(msg)) {
    bad('the port was refused, but NOT by the pre-flight — it got as far as '
      + 'spawning a child that surrendered. The pre-flight is missing or no longer '
      + 'runs first. Message was: ' + msg);
  } else {
    bad('refused for an unrecognised reason: ' + msg);
  }
}

// --- 3. Teardown releases the port ------------------------------------------
await stopServer(srv);
try {
  const again = await startServer(PORT, { PLAYGROUND_NO_ASM: '1' });
  ok('the port is free again after stopServer, so the child really died');
  await stopServer(again.srv);
} catch (e) {
  bad('the port was still held after stopServer returned: ' + e.message);
}

console.log(failed
  ? '\nharness-startserver: FAILED'
  : '\nharness-startserver: startServer proves it owns its port.');
process.exit(failed ? 1 : 0);
