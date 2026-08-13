// The port a builder-test suite may bind — assigned by run-all.mjs, not chosen.
//
// WHY THIS EXISTS. run-all.mjs's header claimed each suite "spawns its own playground
// server on a unique port". Nothing enforced it and 21 ports were shared across 42 of
// the 110 suites. Three separate audits of "which suites claim which port" got three
// different answers, because suites spelled it five ways:
//
//     const PORT = 18783;
//     const port = 18869;                                    // lowercase
//     const PORT_C = 18788, PORT_A = 18789, PORT_D = 18790;  // several in one statement
//     await H.startServer(18882, env);                       // inline, never bound
//     const romC = await buildWith(18871, {...});            // inline, via a helper
//
// Each pattern found more than the last, so the answer is not a better pattern: it is to
// remove the choice. The runner hands each suite a reserved block in BUILDER_TEST_PORT;
// this returns a port from that block, and the literal becomes a fallback used only when
// a suite is run on its own — where nothing else is running, so it cannot clash.
//
// The reap is the runner's job too: it frees the whole block after each suite, so a suite
// that exits from inside its own try/finally (23 of the 33 that spawn a server can) does
// not leave a server squatting for the next one.

/** Base of this suite's reserved block, or null when run standalone. */
export function assignedBase() {
  const raw = process.env.BUILDER_TEST_PORT;
  if (!raw) return null;
  const base = Number(raw);
  if (!Number.isInteger(base) || base <= 0) {
    throw new Error(`BUILDER_TEST_PORT is not a port number: ${raw}`);
  }
  return base;
}

/** How many ports this suite may use. */
export const BLOCK = Number(process.env.BUILDER_TEST_PORT_BLOCK || 3);

/**
 * The port to bind. `fallback` is the suite's historic literal, used only when no
 * assignment is present. `index` picks within the block for a suite needing more than
 * one server (the ASM-vs-C comparisons need two, `asm-player.mjs` three).
 */
export function testPort(fallback, index = 0) {
  if (!Number.isInteger(index) || index < 0 || index >= BLOCK) {
    throw new Error(
      `testPort index ${index} is outside this suite's block of ${BLOCK}. ` +
      `Raise BLOCK in run-all.mjs rather than reaching past the end of the block.`);
  }
  const base = assignedBase();
  return base === null ? fallback : base + index;
}
