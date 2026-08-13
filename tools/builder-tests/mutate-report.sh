#!/usr/bin/env bash
# Run the builder suite and re-report its results in a form `mutate` can read.
#
# WHY THIS EXISTS
# ---------------
# `mutate` (on PATH, /usr/local/bin/mutate) parses two output shapes: Python
# unittest (`test_x (mod.Class) ... ok`) and bash suites (`  PASS name` /
# `  FAIL name`). run-all.mjs prints neither — it prints `<label> ... OK` and
# `<label> ... FAIL`. Measured 2026-08-12: NOT ONE run-all line matches any of
# mutate's regexes.
#
# That is not a silent problem — a suite yielding no parseable names is treated
# by mutate as an error rather than as success, on purpose ("a search that finds
# nothing is indistinguishable from a search that never ran"). So the failure
# mode was loud. This adapter is simply the shape the job takes.
#
# WHAT IT DOES
# ------------
# 1. Runs run-all.mjs, capturing stdout+stderr.
# 2. Echoes the raw output with a `| ` prefix so a human can read the log and so
#    no incidental line inside a suite's own output can be mistaken for a result
#    line (several suites print `FAIL: message` themselves).
# 3. Emits one normalised `  PASS <label>` / `  FAIL <label>` per check.
# 4. Exits with run-all's own status, not the pipeline's.
#
# KNOWN LIMIT, stated rather than discovered later: mutate's FAIL regex is
# `^\s*FAIL (.+?)(?::.*)?$`, which stops at the first colon. A label containing
# one — `invariant: Step_Playground stock ROM matches golden hash` — is recorded
# as `invariant` when red but by its full name when green, so the two never
# match and `expect` can never be satisfied for it. Assertions targeted by a spec
# must therefore be colon-free until that is resolved upstream. Verified by
# testing the regex directly, not by reading it.
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

out="$(node "$here/run-all.mjs" 2>&1)"
rc=$?

printf '%s\n' "$out" | sed 's/^/| /'

# `... OK` and `... FAIL` are what run-all's check() prints. The trailing `.*`
# absorbs a suite's summary tail (`suite a11y.mjs ... OK — smoke-test complete.`).
printf '%s\n' "$out" | sed -n \
  -e 's/^\(.*\) \.\.\. OK.*$/  PASS \1/p' \
  -e 's/^\(.*\) \.\.\. FAIL.*$/  FAIL \1/p'

exit "$rc"
