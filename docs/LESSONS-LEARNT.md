# Lessons learnt

What has actually cost time on this project, and what would have told us sooner.

**The rule for adding an entry:** "X was broken" is not a lesson. The lesson is
*"X looked like Y, and here is the check that would have distinguished them."*
Include the false theory you held on the way — the next person will hold it too.

Entries are grouped by the *shape* of the mistake, not by date, because the shape
is what recurs. Most of these cost between twenty minutes and a whole session.

---

## 1. Checks that report "clean" because they never ran properly

The most expensive class on this project, by a wide margin. A check that fails to
*run* looks exactly like a check that *passed*.

### `awk`'s `strtonum` is a GNU extension — Debian's `mawk` prints nothing

Parsing `/proc/net/tcp` to see what was listening, with an `awk` script using
`strtonum()` to decode the hex port. On the dev container that is **mawk**, which
has no `strtonum`, so it emitted nothing and exited quietly.

- **Looked like:** "nothing is listening on 8765."
- **Actually:** the server was listening the whole time.
- **Cost:** a confident, wrong report to the user, which they then had to correct
  from the host.
- **What would have told us sooner:** any output at all from a positive control.
  If the parser cannot see a port you *know* is open, the parser is broken. Prefer
  a Python connect-scan or `ss -ltnp` over hand-rolled `/proc` parsing.

### A search pattern narrower than the thing it searches for

Auditing which ports the builder-test suites claim, with
`grep -o "PORT *= *[0-9]\{5\}"`. Clean result, no conflicts — because three suites
declare `const PORT_C = 18790, PORT_A = 18791;` and `PORT_C` does not match
`PORT *=`.

- **Looked like:** "the documented 18790 clash has already been fixed."
- **Actually:** all three claimants were still there, exactly as documented.
- **What would have told us sooner:** grep for the *value space* (`18[78][0-9][0-9]`),
  not the *variable name*. When auditing "what claims X", match X.
- **The uncomfortable part:** `docs/guides/TEST-SERVERS.md` already said, in
  bold, *"Do not trust a grep for `PORT =` — the suites spell it several ways"*,
  and supplied the correct command. The doc was right and had been right for
  weeks; it was simply not read before the audit that it existed to prevent.
  **A written warning only works if it is read before the task, not after the
  mistake.** If a doc exists for an area you are about to audit, read it first —
  that is cheaper than the audit.

### Piping a long suite through `tail`

`node tools/builder-tests/run-all.mjs | tail -40` on a failing run shows the
summary — `❌ One or more checks failed.` — and discards the one block that says
*which* check and *why*.

- **What to do instead:** redirect the whole run to a file and read the file.
  `> /tmp/run.txt 2>&1`, then grep it. Costs nothing, keeps everything.

### Silent-failure audit of the editor and server — 2026-08-09

Recorded so the next person knows this ground was covered, what it found, and
what was deliberately left. A sweep whose result nobody wrote down gets repeated.

**Server (`playground_server.py`).** Scanned with Python's `ast` rather than grep,
after three pattern-too-narrow misses in the same session. Exactly **one**
except-handler in ~4,700 lines has a body of only `pass`, and it is deliberate and
documented — tolerant gallery-metadata reads, so a half-written publish cannot
break the listing. No bare `except:` anywhere. This is a disciplined file.

**Editor JS.** ~26 empty `catch` blocks. Almost all are correct defensive wrappers
around browser APIs that throw for environmental reasons — `localStorage` in
private mode, `AudioContext`, `scrollIntoView`, `dialog.close()`. Three were worth
reading properly rather than waving through, and only one was a real defect:

- **`studio.js` `onRenderOverlay` (both sites) — fixed.** A mode whose overlay
  threw stopped drawing for ever with nothing said, while the `renderTV` catch
  three lines above had always logged. Now reported once per mode.
- **`project-menu.js` `onAfterRecover` — NOT a bug, and I had implied otherwise.**
  The `return` sits *inside* the `try` on purpose: if the callback throws, control
  falls through to the default page-reload path. That is a deliberate fallback,
  not a swallowed error.
- **`account-menu.js` "Load a starter game" and `studio-starter.js` `turnOffWin`
  — left alone, raised not fixed.** Both are genuine silent no-ops (a pupil could
  click a button and get nothing), but the right fix is a product decision —
  disable the button when the hook is absent, or log and continue? — so guessing
  would be worse than recording it.

**A related shape, from the same week.** `countAttrConflicts` read the nametable
without the view-screen offset while the red-X overlay applied it, so the count
and the marks described different screens. Fixed. Sweeping for siblings found one
more: `renderBgInto` renders screen 0 only, behind a button labelled "⛶
Full-screen preview". Weaker — nothing on screen contradicts it — and what it
*should* show (current screen, or the whole level scaled) is a product call. Also
raised rather than guessed.

### A green snapshot check does not mean your tree is clean

`run-all.mjs`'s *"engine snapshot matches live sources"* was deliberately broken
four ways on 2026-08-06 to see it fail. It caught three of them. It did **not**
catch a line appended to the snapshot's own copy of `builder-modules.js`.

- **Why:** `--check` compares the **committed (HEAD)** bytes of each live source
  against the sha1s in `manifest.json`. Uncommitted working-tree changes — and
  edits to the frozen copies themselves — are invisible to it by design.
- **Why it matters:** it is easy to read "snapshot OK" as "the engine I am about
  to test is the engine I think it is". It is not that. **Commit first, then
  trust it.**
- Full mutation table, including the three it did catch, is in
  `tools/builder-tests/README.md`.

### A regex guard that matched its own explanatory comment

The B6i guard in `round2-dialogue.mjs` asserts the generated dialogue vblank block
contains no `PPU_MASK` write. It passed a block that *did* contain the word — in a
comment explaining why there is no longer a `PPU_MASK` write there.

- **Looked like:** a guard protecting the fix.
- **Actually:** a guard that would go green on prose alone.
- **Fix, now in the file:** strip `/* */` and `//` comments before testing
  generated code. Any assertion about emitted source should run on code, not text.

---

## 2. Two lists that must agree, with nothing checking that they do

### Port 18790 is claimed by both Playwright and three builder-test suites

`playwright.config.js` binds 18790 for the Studio E2E server.
`asm-corpus.mjs`, `asm-realproj.mjs` and `asm-player.mjs` each also bind it.

The failure is silent in the worst possible way. `playground_server.py`, on
finding a *working* playground server already on its port, prints
`already running -- nothing to do` and **returns 0** — it does not bind, and it
silently discards the environment the caller set (`PLAYGROUND_ACCOUNTS_DB`,
`PLAYGROUND_PORT`, the isolated DB path). The suite then runs happily against a
server it did not configure.

- **Looked like:** flaky tests. Occasionally wrong data. Nothing red.
- **What would have told us sooner:** a guard that no builder-test suite claims
  the Studio E2E port. That guard now exists in `run-all.mjs`
  (`no builder-test suite claims the Studio E2E port`).
- **The general shape:** two independent lists of the same resource, agreement
  maintained by hand and by documentation. Documentation is not a check. If two
  lists must agree, something must fail when they don't.

### A hand-written list of what to check loses coverage silently

`run-all.mjs` syntax-checked a hand-written array of 14 filenames, followed by
`if (!fs.existsSync(full)) continue;`. Two silent-coverage bugs in four lines: a
module added to the editor was never checked, and a module renamed dropped off
without anything going red.

- **Measured 2026-08-07:** 18 of the 32 shipped modules were unchecked — including
  *every* Studio mode module. The WORLD palette-keys change of 2026-07-30 edited a
  file this gate was not looking at.
- **Fix:** enumerate the directory at runtime. Vendored bundles are identifiable
  by name (`*.min.js`), so there is no second list to keep in step with the first —
  which is the whole point, since a hand-maintained list is what failed.
- **Still open at the time of writing:** the same file hand-lists five of the eight
  HTML pages for its inline-`<script>` check. `audio.html` and `gallery.html` are
  not covered.
- **The general rule:** if a check takes a list of what to check, ask where the
  list comes from. Derived is safe; hand-written decays and is trusted while it
  does.

### The first version of a guard is not a guard until you watch it fail

Hardening `startServer` so it could not silently accept a server it did not start,
the first implementation polled `/health` after spawning and gave the child 150 ms
to have died. Run against the dev server on 8765 it **reported success**.

- **Why:** the foreign server answers `/health` instantly, while our own child is
  still in Python startup — nowhere near its port check. The grace period proved
  nothing at all.
- **Had I only tested the happy path**, it would have shipped looking correct and
  catching nothing — a guard whose failure mode is "always passes".
- **The working version** pre-checks the port *before* spawning, then waits for the
  child's own `listening on` banner rather than for the port to answer, because a
  stranger satisfies the latter just as well.
- **Lesson:** write the negative test first, and make it fail before you believe
  the positive one. Both directions are now checked — occupied port throws in
  ~90 ms, free port ready in ~340 ms.

### …and then check the mirror image of the bug you just fixed

Reviewing that fix with fresh eyes turned up `stopServer` doing exactly the same
thing in reverse: `kill('SIGTERM'); await sleep(300)` — assuming 300 ms is enough
to die, precisely as `startServer` had assumed 1500 ms was enough to bind.

- **It mattered more after the fix, not less.** Two suites
  (`render-p1-oam-cursor.mjs`, `physics-globals.mjs`) stop a server and start
  another on the *same* port. A child outliving the sleep used to produce a
  silently wrong result; against the now-strict `startServer` it becomes a hard
  error instead.
- **Fixed** by polling until the child is actually dead, with a `SIGKILL`
  fallback. Faster too: ~100 ms instead of a flat 300 ms.
- **Lesson:** a fix for "we assumed a duration instead of waiting for the event"
  should be followed by a search for the same assumption elsewhere in the same
  file. It is rarely written only once.

### Engine version lives in two files

`tools/engines/ENGINE_VERSION` and `tools/tile_editor_web/engine-version.js`.
This one *is* guarded (`run-all.mjs`, "engine version constants agree"), which is
why it has never bitten — a useful counter-example proving the guard is what makes
the difference, not the care of the person editing.

---

## 3. Environment differences invisible from where you are standing

### The container binds its own loopback; the published port goes to its interface

`playground_server.py` defaults to `HOST = 127.0.0.1`. Docker publishes to the
container's *interface* (172.17.0.2), so the publish got connection-refused and
nothing reached the host — while, inside the container, everything looked perfect.

- **False theory held for some time:** the SSH tunnel is broken.
- **Second false theory:** nothing is listening (see `strtonum` above — two
  independent faults pointing the same wrong way, which is what made it stick).
- **The check that distinguishes them, and the only one that does:**
  ```sh
  curl -fsS http://127.0.0.1:8765/health        # passes even when publish is broken
  curl -fsS "http://$(hostname -i):8765/health" # this is the one that matters
  ```
  Testing loopback proves the process is alive. It proves nothing about
  reachability. **In a container, always test the container's own IP.**
- **Fixed durably** by `PLAYGROUND_HOST=0.0.0.0` in `.devcontainer/devcontainer.json`
  `containerEnv`, and written up in `docs/guides/TEST-SERVERS.md`. This will bite
  every containerised service that defaults to loopback, not just this one.

### Host load is invisible from inside the container, and reads as test failure

A `npx playwright test` run showed several failures. The container was ~1.5% CPU.
The *host* was at load 22–32 with 6.9 GB of 7.9 GB used — none of which is visible
from inside.

- **Looked like:** a change broke the suite.
- **Actually:** tests entirely unrelated to the change were timing out, which is
  the tell. `project-file` NAM round-trip took 59.1s and `budget` CHR took 41.6s
  against a committed 30s per-test limit.
- **What would have told us sooner:** *which* tests failed, before *why*. If the
  failures do not touch your diff, suspect the environment before the code.
  Re-running with `--timeout=120000` turned 147 tests green and settled it.

---

## 4. Assuming an outcome instead of measuring it

### "Verification: visual, needs Mesen"

The codegen plan deferred the dialogue-flash item (#31) on the assumption that a
one-frame full-screen blank could only be judged by eye in Mesen.

- **Actually:** jsnes models it fine. Counting lit pixels in the banner band across
  the frames around the open gave 7680 → 0 → 7680, which is the flash, numerically,
  headless, in a test that now runs on every commit
  (`render-dialogue-noflash.mjs`).
- **Lesson:** "needs a human to look at it" is a claim worth testing once before
  accepting. A surprising amount of *visual* behaviour is countable.
- **The converse still holds** and is honestly recorded: the event-sound playtest
  (#7/#27) genuinely does need ears, because jsnes APU inspection was tried and is
  too fragile to trust. The distinction is that this one was *attempted* first.

### A golden-ROM hash changed, so it was re-pinned

When `_rom-equiv.mjs` drifted after the v78 dialogue work, the tempting move is to
paste the new hash in. That records the change without proving its cause.

- **What was done instead:** rebuilt with the *old* `builder-modules.js`
  (`git show fac8ac2:…`) and confirmed it reproduced the old hash exactly, proving
  the new hash came from this change and nothing else. Then re-pinned, with a note
  in the file saying so.
- **Lesson:** re-pinning a golden value is only safe when you have shown sole
  causation. Otherwise you have laundered an unrelated regression into the baseline.

---

## 5. Tooling that fights back

### `pgrep -f` matches the shell that is running it

`until ! pgrep -f "run-all.mjs"; do ...; done` never terminates: the waiting
shell's own command line contains the pattern, so `pgrep` always matches itself.
The same thing makes phantom entries appear in process listings.

- **Fix:** kill by explicit PID, and use a bracket pattern that cannot match
  itself: `ps -eo pid,args | awk '/[p]ython3 tools\/playground_server\.py/'`.

### Orphaned servers accumulate and are mistaken for the real one

Repeated mutation runs left four playground servers alive where there should have
been two, contributing to a heavily loaded box.

- **How to tell them apart:** read each one's port out of its own environment —
  `tr '\0' '\n' < /proc/$PID/environ | grep PLAYGROUND_PORT` — rather than guessing
  from the process list, which is identical for all of them.

### Grepping a directory that contains minified bundles

A broad `grep -rn` across `tools/tile_editor_web/*.js` matched
`codemirror-clike.min.js` and dumped a single 40 KB line. In an agent session that
is a meaningful chunk of context spent on nothing.

- **Fix:** exclude `*.min.js` by default when searching this tree.

### cc65 is compiled with no optimisation, and it shows

A plain `for (k = 0; k < 32; k++) PPU_DATA = buf[k];` costs 50–65 cycles per
iteration. The unrolled `lda buf+N / sta $2007` pair costs 8.

- **Why it matters:** the vblank window is ~2273 cycles and OAM DMA already spends
  513 of them. A loop that "looks fine" overruns vblank and corrupts the display.
- **Rule of thumb:** in anything that runs inside vblank, unroll, and count cycles
  rather than trusting that the compiler will. Also: C89 rules apply — no
  declaration after a statement in a block.

---

## 6. Process notes that have paid for themselves

- **Commit before snapshotting the engine.** `scripts/snapshot-engine.mjs` reads
  from git HEAD, not the working tree. Snapshot before committing and you freeze
  the *previous* state, silently.
- **Gate new engine behaviour off by default.** It is what keeps the golden ROMs
  byte-identical: unused features get stripped by the preprocessor and cc65. This
  is the single constraint that makes engine changes cheap to verify.
- **Never run the E2E suite and the builder tests at the same time.** They share
  18790 and it fails silently (§2). Serially, always.
- **A doc claim is worth verifying, not just reading.** Of ~60 concrete claims in
  `README.md` and `CLAUDE.md` audited on 2026-08-06, all but one were correct —
  which is a good result, but the one that was wrong (`level.nam` located under
  `src/`) is exactly the kind that sends someone to the wrong directory to clean up
  build mutations.

---

*Add to this file when something costs you more than about twenty minutes. Write
the false theory down too — it is the most useful part.*
