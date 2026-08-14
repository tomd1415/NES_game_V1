#!/usr/bin/env bash
# Run the Studio Playwright suite and re-report its results in a form `mutate` can read.
#
# WHY THIS EXISTS
# ---------------
# The same adapter problem `tools/builder-tests/mutate-report.sh` solves for the
# builder suite, solved again for the E2E one. `mutate` parses two output shapes:
# Python unittest, and bash suites printing `  PASS name` / `  FAIL name`.
# Playwright's `list` reporter prints neither — it prints `  ✓  1 nav.spec.js:12:3 ›
# switches mode (412ms)`, which matches none of mutate's regexes. A suite yielding
# no parseable names is treated by mutate as an error rather than as success, so the
# failure mode is loud rather than silent; this adapter is simply the shape the job
# takes.
#
# WHAT IT DOES
# ------------
# 1. Runs the suite with the JSON reporter, which is a contract rather than a
#    human-readable format — the `list` reporter's ✓/✗ glyphs and timing suffixes
#    would have to be re-parsed every time Playwright changed them.
# 2. Echoes a readable summary with a `| ` prefix, so the log is still legible and
#    no incidental line inside a test's own output can be mistaken for a result.
# 3. Emits one normalised `  PASS <label>` / `  FAIL <label>` per test.
# 4. Exits with Playwright's own status.
#
# LABELS. `<spec file> - <full test title>`. The file prefix is not decoration: 158
# tests across 34 specs contain repeated titles (several specs have a test called
# "renders"), and a bare title would make a spec ambiguous about which one it means.
#
# THE COLON RULE, inherited and for the same reason: mutate's FAIL regex is
# `^\s*FAIL (.+?)(?::.*)?$`, which stops at the first colon — so a label containing
# one is recorded by its full name when green and truncated when red, and the two
# never match. `: ` is rewritten to ` - ` on PASS and FAIL ALIKE. Rewriting one side
# only would leave the two spellings disagreeing, which is the bug rather than the fix.
#
# A skipped test is reported as neither PASS nor FAIL. That is deliberate: a spec
# naming a skipped test should fail to find it rather than silently count it as
# proof, which is the same reason mutate rejects a name the suite does not have.
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/../.." && pwd)"
json="$(mktemp)"
trap 'rm -f "$json"' EXIT

cd "$root" || exit 1
# TIMEOUT. The committed config uses 30 s, which is right for a normal run and
# wrong here. This box carries ten containers; measured at load 19.0 on
# 2026-08-14, `tutorial.spec.js`'s two long tests time out, and re-running that
# spec alone passes. STATUS.md already records that test as the only one ever to
# exceed the committed timeout.
#
# For mutation testing that flakiness is not merely noise, it inverts the result:
# a test that goes red because the box was busy is indistinguishable from one that
# went red because the break was caught, so a slow test manufactures FALSE
# "caught" verdicts — the opposite of the error mutation testing exists to find.
# A generous timeout weakens no assertion; every test still asserts exactly what
# it did. Override with E2E_MUTATE_TIMEOUT if a run still trips it.
timeout_ms="${E2E_MUTATE_TIMEOUT:-120000}"
PLAYWRIGHT_JSON_OUTPUT_NAME="$json" npx playwright test --reporter=json --timeout="$timeout_ms" >/dev/null 2>&1
rc=$?

if [ ! -s "$json" ]; then
  echo "| no JSON report was produced at $json — the run did not start."
  echo "| Not emitting any PASS/FAIL lines: a spec must not be able to pass"
  echo "| against a suite that never ran."
  exit "${rc:-1}"
fi

node -e '
const fs = require("fs");
const rep = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const out = [];
// Playwright nests suites arbitrarily deep (file -> describe -> describe).
// Walk rather than assuming a depth, and carry the file down from wherever it
// is set — only the top level reliably has it.
const walk = (node, file) => {
  const f = node.file || file;
  for (const spec of node.specs || []) {
    const status = (spec.tests || []).flatMap(t => t.results || []).map(r => r.status);
    const skipped = status.length > 0 && status.every(s => s === "skipped");
    if (skipped) continue;
    const base = (f || "?").split("/").pop();
    out.push([spec.ok ? "PASS" : "FAIL", base + " - " + spec.title]);
  }
  for (const s of node.suites || []) walk(s, f);
};
for (const s of rep.suites || []) walk(s, s.file);

const pass = out.filter(o => o[0] === "PASS").length;
console.log("| playwright: " + out.length + " tests reported, " + pass + " passed, " + (out.length - pass) + " failed");
for (const [st, label] of out) console.log("  " + st + " " + label.replace(/: /g, " - "));
' "$json"

exit "$rc"
