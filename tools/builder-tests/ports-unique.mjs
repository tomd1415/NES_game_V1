#!/usr/bin/env node
// No builder-test suite may choose its own playground port.
//
// run-all.mjs assigns each suite a reserved block in BUILDER_TEST_PORT and lib/test-port.mjs
// hands it out. This asserts the arrangement still holds, in the only form that has no
// spellings to miss: a suite may mention a port number ONLY as the fallback argument to
// testPort(). Counting "which suite claims which port" was tried three times and gave three
// answers, because suites spelled it five ways -- const PORT, lowercase const port, several
// in one statement, an inline argument, and an inline argument to a helper. This rule needs
// none of that: there is either a bare literal or there is not.
//
// It lives in tools/builder-tests/ deliberately. An earlier draft sat beside the suites, read
// its own directory, and reported "OK -- 0 suites" from the scratchpad: the vacuous pass this
// whole exercise exists to stop. Hence the scanned==0 guard below, which exits 2.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF = path.basename(fileURLToPath(import.meta.url));
const DIR = path.dirname(fileURLToPath(import.meta.url));
const RUNNER = 'run-all.mjs';

// A port literal that is NOT the first argument of testPort(...).
const ANY_PORT = /\b18\d{3}\b/g;
const AS_FALLBACK = /testPort\(\s*18\d{3}\b/g;

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
}

const suites = fs.readdirSync(DIR)
  .filter((f) => f.endsWith('.mjs') && f !== RUNNER && f !== SELF)
  .sort();

const offenders = [];
let scanned = 0;
for (const file of suites) {
  scanned++;
  const code = stripComments(fs.readFileSync(path.join(DIR, file), 'utf8'));
  const total = (code.match(ANY_PORT) || []).length;
  const guarded = (code.match(AS_FALLBACK) || []).length;
  if (total > guarded) offenders.push(`${file}  (${total - guarded} bare literal(s))`);
}

// The runner's allocation must stay injective and inside the reserved range. Cheap, and it
// is the half a future edit to run-all.mjs could break without any suite changing.
const PORT_BASE = 18800, PORT_BLOCK = 3, CEILING = 19200;
const bases = suites.map((_, i) => PORT_BASE + i * PORT_BLOCK);
const overlapping = new Set(bases).size !== bases.length;
const top = bases.length ? bases[bases.length - 1] + PORT_BLOCK - 1 : PORT_BASE;

// The Studio E2E server's port, read from playwright.config.js rather than repeated
// here. An allocation that covers it re-creates the clash `main` fixed -- which is
// exactly what happened when this allocator was first written with base 18768.
const cfg = fs.readFileSync(path.join(DIR, '..', '..', 'playwright.config.js'), 'utf8');
const e2eMatch = cfg.match(/STUDIO_TEST_PORT\s*\|\|\s*(\d+)/);
if (!e2eMatch) {
  console.error('FAIL: could not read the default STUDIO_TEST_PORT from playwright.config.js');
  process.exit(2);
}
const e2ePort = Number(e2eMatch[1]);
if (e2ePort >= PORT_BASE && e2ePort <= top) {
  console.error(`FAIL: the allocation ${PORT_BASE}-${top} covers the Studio E2E port ${e2ePort} ` +
                `(playwright.config.js). A suite would be handed the port Playwright binds.`);
  process.exit(1);
}

if (scanned === 0) {
  console.error(`FAIL: scanned ${scanned} suites — the scan did not run, so this proves nothing.`);
  process.exit(2);
}
if (overlapping || top > CEILING) {
  console.error(`FAIL: the allocation is unusable — ${overlapping ? 'blocks overlap' : `it reaches ${top}, past ${CEILING}`}.`);
  process.exit(1);
}
if (offenders.length) {
  console.error(`${offenders.length} of ${scanned} suites choose their own port instead of asking for one:`);
  for (const o of offenders) console.error('  ' + o);
  console.error('\n  Fix: import { testPort } from \'./lib/test-port.mjs\' and wrap the number,');
  console.error("  e.g. `const PORT = testPort(18783);`. A suite needing two servers passes an");
  console.error('  index: `testPort(18784, 1)`. The literal then applies only to a standalone run.');
  process.exit(1);
}
console.log(`OK — ${scanned} suites, all ports assigned by the runner; blocks ${PORT_BASE}–${top}.`);
