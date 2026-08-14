#!/usr/bin/env node
// Translate a builder run's output into the PASS/FAIL lines `mutate` parses.
//
// WHY. Mutation testing needs to know WHICH named assertion went red, not merely that
// something did — "caught" and "caught for the reason I claimed" are different sentences,
// and only the second is evidence about the guard you were aiming at. `mutate` reads
// either Python unittest output or lines of the form `PASS <name>` / `FAIL <name>`. The
// builder tests speak neither:
//
//   run-all.mjs invariants   `invariant: both templates use OAM DMA (…) ... OK`
//   a suite                  `✓ smb emits BW_SMB_JUMP; platformer + pre-v3 do not`
//                            `FAIL: smb did not #define BW_SMB_JUMP`
//
// So this runs one of them and rewrites those into names mutate can expect against.
//
//   node tools/builder-tests/mutation-report.mjs --invariants
//   node tools/builder-tests/mutation-report.mjs round2-dialogue.mjs
//
// A suite exits on its FIRST failed assertion, so a break reddens exactly one name and
// the assertions after it never run. That is a property of the suites, not of this
// wrapper — `expect` must therefore name the first assertion a break trips, and a spec
// that names a later one will (correctly) be reported as a shortfall.
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Lives in lib/ so run-all.mjs's suite glob cannot mistake it for a suite. SUITES is the
// parent; ROOT is the repository. Getting this wrong is silent — the spawn simply fails
// and every assertion "disappears", which the named===0 guard below turns into a loud
// exit 2 rather than a run that looks like it passed.
const SUITES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(SUITES, '..', '..');
const target = process.argv[2];

if (!target) {
  console.error('usage: mutation-report.mjs --invariants | <suite>.mjs');
  process.exit(2);
}

const invariants = target === '--invariants';
const argv = invariants ? [path.join(SUITES, 'run-all.mjs')] : [path.join(SUITES, target)];
const env = invariants ? { ...process.env, BUILDER_TESTS_SKIP_SUITES: '1' } : { ...process.env };

const r = spawnSync('node', argv, { cwd: ROOT, encoding: 'utf8', env, timeout: 15 * 60 * 1000 });
const out = (r.stdout || '') + (r.stderr || '');

// mutate's FAIL pattern is /^\s*FAIL (.+?)(?::.*)?$/ — it stops at the first COLON, while
// its PASS pattern keeps the whole line. Every builder label starts "invariant: ...", so a
// pass was recorded as the full label and a failure as the bare word "invariant": two
// different names for one assertion, which reads as "the expected assertion stayed green"
// while something unnamed went red. Emit colon-free names so both halves agree.
const name = (s) => s.replace(/:/g, ' —');

let named = 0;
for (const line of out.split('\n')) {
  let m;
  // run-all.mjs's own checks: "<label> ... OK" / "<label> ... FAIL"
  if ((m = line.match(/^(.*\S)\s+\.\.\.\s+(OK|FAIL)$/))) {
    console.log(`${m[2] === 'OK' ? 'PASS' : 'FAIL'} ${name(m[1])}`);
    named++;
    continue;
  }
  // a suite's per-assertion lines
  if ((m = line.match(/^\s*✓\s+(.*\S)\s*$/))) { console.log(`PASS ${name(m[1])}`); named++; continue; }
  if ((m = line.match(/^\s*FAIL:\s*(.*\S)\s*$/))) { console.log(`FAIL ${name(m[1])}`); named++; continue; }
}

// A STABLE name for the whole target, emitted last.
//
// The per-assertion names above are good for reading but cannot be `expect`ed against a
// suite, because a suite words success and failure DIFFERENTLY — `✓ smb emits
// BW_SMB_JUMP; platformer + pre-v3 do not` when it passes, `FAIL: smb did not #define
// BW_SMB_JUMP` when it does not. Those are two different strings, so mutate (which looks
// for one name going from green to red) can never match them, and a suite also exits on
// its first failure so later assertions never report at all. This line is the same string
// either way, so a suite-level break has something to name. The cost is honest and worth
// stating: for builder SUITES this proves "this suite reddens", not "this named assertion
// reddens". The run-all invariants above do support the finer claim, because `check()`
// prints one label for both outcomes.
console.log(`${r.status === 0 ? 'PASS' : 'FAIL'} ${invariants ? 'run-all invariants' : target}`);
named++;

// A run that names nothing is indistinguishable from a run that passed, which is the
// exact failure this whole exercise exists to stop. Say so and fail loudly.
if (named === 0) {
  console.error(`FAIL mutation-report parsed no assertions from ${target} (exit ${r.status})`);
  console.error(out.split('\n').slice(-20).join('\n'));
  process.exit(2);
}
process.exit(r.status === 0 ? 0 : 1);
