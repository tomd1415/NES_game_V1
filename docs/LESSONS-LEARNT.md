# Lessons learnt

What has actually cost time on this project, and what would have told us sooner.

**The rule for adding an entry:** "X was broken" is not a lesson. The lesson is
*"X looked like Y, and here is the check that would have distinguished them."*
Include the false theory you held on the way — the next person will hold it too.

Entries are grouped by the *shape* of the mistake, not by date, because the shape
is what recurs. Most of these cost between twenty minutes and a whole session.

## If you read nothing else

This file is long — deliberately not saying how long, because the last hardcoded figure
here went stale the same day someone added to it — and you are told to read it *before*
debugging, which nobody does. So: five reflexes account for most of what it contains, and
each costs seconds.

1. **A search that finds nothing is a claim about your pattern, not about the code.**
   Print the raw region and look. Five separate times in one week this was the only
   thing standing between a regex artefact and a confidently wrong report. (§1)
2. **"Nothing caught this" is ambiguous.** It means either the guard is hollow *or*
   your break was a no-op — and they are indistinguishable from the output. Verify
   the break changes what you are measuring, then interpret. Twice this stopped a
   working guard being reported as broken. (§1, §5)
3. **Ask both questions of a guard.** Could it *pass* when something is wrong? Could
   it *fail* when nothing is? The second is the one nobody asks, and a gate that
   cries wolf gets deleted along with its coverage. (§1)
4. **A dated measurement and a live claim read identically in prose.** "114 suites"
   is true forever as a record and wrong the next time someone adds a file. Mark
   which you mean; it costs four words. (§3)
5. **Before writing a guard's pattern, list every way the thing can be absent.**
   Declaration-only, line comment, block comment, HTML comment, a different but
   equally valid spelling. Then test the list in *both* directions. Applied to three
   guards on 2026-08-15 it found a real hole in all three — including two written
   hours earlier by someone who had just fixed the same fault elsewhere. Fixing the
   case in front of you and leaving its neighbour is the default outcome, not a
   lapse. (§1)

Everything below is an instance of one of those, with the false theory that was held
on the way.

*One negative result belongs here too, so nobody re-runs it: on 2026-08-15 all seven
pure-presence invariants in `run-all.mjs` were checked for whether comment text alone
satisfies them — comparing match counts raw versus comment-stripped. None does. They
remain vulnerable if someone later adds an explanatory comment quoting the pattern,
which is exactly how the re-render guard was contaminated, but no guard is passing on
prose today.*

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
  If the parser cannot see a port you *know* is open, the parser is broken.
- **What to use instead, in this container:** a **connect probe** —
  `curl -fsS http://127.0.0.1:<port>/health` — and, to find which process owns a
  port, `PLAYGROUND_PORT` read out of `/proc/<pid>/environ`. The socket-listing
  tools are not dependable here; measured 2026-08-14, and the orphaned-servers entry
  in this section has the evidence and the working snippet.
  *(An earlier version of this line recommended a socket-listing tool as the cure.
  The recommendation is withdrawn and is not repeated here, because a correction
  printed next to the claim it corrects gets read as the claim.)*

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
- **It keeps happening, which is the actual lesson.** Six times in one week, by
  someone who had already written this entry: `PORT *=` missing `PORT_C`
  (twice — the second time nearly producing "the documented 18897 is unused");
  `modules\['<name>'\]` returning nothing when the guide's module list was
  checked; `^#{1,4} *#[0-9]+` finding no backlog items because they are a plain
  numbered list; anchoring on the first textual `ROLE_TABLE`, which is a comment
  400 lines above the definition; `\.enabled = true` reporting `globals`
  covered by zero suites when it has a dedicated one; and the sixth, below,
  which is a different shape and the most expensive of them.
- **The sixth: searching the wrong DIMENSION, not writing a bad pattern.**
  Asked whether any suite could drive a door transition, the search was
  `grep -ln door *.mjs` — suites whose *name or text* mentions doors. Four
  matched and none of them emulate anything, so the conclusion was "no suite
  does this", and it went into an accepted work-list as the justification for
  building one. `per-room.mjs` had been doing exactly it since v75: it builds a
  ROM, walks the player onto a door tile, and asserts the active room changed.
  It was missed because it is named for the *feature* it tests, not the
  *mechanism* it uses — and no pattern over the word "door" would ever have
  found it, however carefully written.
  - **The fix is to search by behaviour.** What was actually being asked was
    "which suites emulate input?", and that has a direct signature:
    `grep -c 'buildRom'`, `grep -c 'BTN\.'`, `grep -c 'nes.frame'` across every
    suite. Two lines, and it names the right file immediately. **When a
    name-based search comes back empty, ask what the thing DOES and search for
    that** — the name is the one attribute free to vary.
  - **It was caught by luck plus one habit**: reading a neighbouring file before
    writing a new one. The claim had already been accepted by the owner. Nothing
    would have failed if it had gone unnoticed — a redundant suite is green
    forever, and duplicated coverage is invisible in exactly the way missing
    coverage is not.
  - Not wasted, but only because the gap turned out to be real and narrower:
    every room in `per-room.mjs` is 1x1, so `px` is an 8-bit screen coordinate
    and the 16-bit world path is untested. The new suite is the wide case. **A
    wrong premise that happens to produce useful work is still a wrong premise;
    say so rather than quietly re-scoping and letting the record stand.**
- **So stop trying to write better patterns and change what a zero means.** Every
  one of those was caught by the same reflex and nothing else: *a search that
  finds nothing is a claim about my pattern until proven otherwise.* Print the
  raw region and look at it. The cost is ten seconds; the alternative is a
  confident finding built on a regex artefact, which is worse than no finding at
  all because it gets acted on.

### A test satisfied by anything is green for the life of the bug

`world.spec.js` had this, and had had it since the preview was written:

```js
test('full-screen preview opens a modal with a canvas', async ({ page }) => {
  await expect(dlg.locator('canvas')).toBeVisible();
});
```

Meanwhile `renderBgInto` looped `cx < SCREEN_W`, so on any level bigger than one
screen the preview showed the **top-left screen**, whatever screen the pupil was
actually on. The test never had a chance of catching it: *any* canvas satisfies
it, including the wrong one.

- **The tell is in the assertion, not the code.** "A canvas is visible", "the
  response was 200", "no exception was thrown" — each is true of the working
  version *and* of most broken ones. Ask what the assertion would reject.
- **Fix:** assert a quantity that only the correct behaviour produces. Here, the
  canvas is as wide as the LEVEL — 2 screens is 64 columns, 1024 device pixels,
  against 512 for the old render. Proved by putting the old behaviour back and
  watching it go red, and the original test stayed green while it did, which is
  the clearest possible statement of what it was worth.
- Same family as the palette-clash count (`6a93e3f`) and worth naming: **a
  control that describes a different place from the one you are on**, silently,
  because a plausible-looking screen and the right screen are indistinguishable.

### A meta-test that cannot tell the bug from the fix

Writing #14 Step 2, the accepted work-list specified its own proof: *"flip the
threshold to 239 and the tall-project assertion must go red."* It does not.

The tall fixture places an entity at `y = 400`. The old threshold rejects
`y > 238`; the broken one rejects `y > 239`. **400 exceeds both**, so that
assertion passes under the correct threshold and under the off-by-one alike, and
would have signed off the bug.

Only an entity at **exactly 239** separates them — which is the whole point of
that number, since `0xEF` *is* 239 and the draw guards test `>=`.

- **The rule:** a meta-test has to exercise the *boundary*, not merely a value on
  the far side of it. "Well past the limit" proves the check exists; only the
  limit itself proves the check is in the right place.
- **And it was written by someone who knew why 238 mattered** — the same document
  explains the `0xEF` collision two paragraphs above. Knowing the boundary and
  testing the boundary are separate acts, and the second is the one that counts.
- Caught only because the suite was written with a case per side of the gate
  rather than one case per feature. **If a gate has a threshold, give it a test
  at the threshold, and expect the plan's own suggested proof to be one value
  out.**

### The script you write to audit a stale list is itself unaudited

Checking the guides against the code (2026-08-15), three throwaway scripts were written
and **all three were wrong on the first run**, each in a way that produced a confident
finding:

| audit | first answer | why it was wrong |
|---|---|---|
| do doc-referenced paths exist? | 18 missing | Python's `glob` skips dot-directories, so `.devcontainer/*` read as absent |
| are the guides' ports real? | 1 orphan | 18990 is an example value for an env override the config does honour |
| how many ports are shared? | 25 | counted `run-all.mjs` — which contains `18790` *inside the guard forbidding it* — and counted ports named in comments |

Every one of those, reported without checking, would have been a plausible bug report
that cost someone an afternoon. The last is the sharpest: the guard against claiming the
E2E port was itself counted as a claim on the E2E port.

- **The rule:** an audit script is code written in one minute to judge code written over
  months, and it gets the benefit of no review at all. **Triage every hit by hand before
  reporting a count.** Of 18+1+25 apparent findings, exactly one was real — the shared-port
  figure, which had genuinely drifted 19 → 20.
- **And when the fix is "refresh the list", ship the command instead**, with its traps
  written down. `TEST-SERVERS.md` now carries the regeneration snippet and both
  contamination warnings, because the next person to recount will make the same two
  mistakes — the evidence being that the person who *knew about them* made them anyway.

### A guard pinned to one spelling of the code it guards

`invariant: PPU register macros are volatile` had been green since it was written and
**could not have gone red**. Its regex was

```js
/\*\s*\(\s*\(\s*unsigned\s+char\s*\*\s*\)\s*0x[0-9A-Fa-f]+\s*\)/   // *((unsigned char*)0x20XX)
```

— the double-paren spelling the files used *before* the original fix. Every macro is now
written `(*(volatile unsigned char*)0x2006)`. Delete the `volatile` and you get
`(*(unsigned char*)0x2006)`: one paren after the `*`, so the pattern never matched. The
guard was looking for a spelling nobody uses any more.

What it was protecting is not cosmetic: without `volatile`, cc65 elides repeated writes to
the same address, and the scroll stride silently stops updating — a rendering fault with no
error anywhere, which is exactly why someone wrote a guard for it.

- **Only mutation testing finds this.** Reading the check, it looks right: it names the
  hazard, the comment explains the mechanism, the error message is good. Nothing about it
  reads as broken. It was found by planting the exact fault it claims to catch and watching
  the suite stay green.
- **The shape:** *a guard written against the code as it was spelled that day.* The fix that
  prompted the guard also **reformatted the thing being guarded**, so the guard shipped
  matching the pre-fix text. Suspect any check whose pattern encodes punctuation — brackets,
  spacing, argument order — rather than the thing that actually matters.
- **The repair is to match the hazard, not the line.** The hazard is a hardware address
  dereferenced through a cast with no `volatile`; the brackets around it are irrelevant. The
  check now matches the *cast* and passes when `volatile` is present, which covers both
  spellings and any future one. Measured on install: 24 such casts across the three files,
  all volatile, so it passes on merit rather than on vacuity.
- **And measure that, too.** Before installing a widened pattern, run it and count what it
  flags. A widened guard that fires on legitimate code gets reverted within a day, taking
  the coverage with it — the mirror failure in `prove-coverage`.

**Scope, checked rather than assumed.** Three guards in `run-all.mjs` had this defect, so the
obvious question is how far it spreads. Measured 2026-08-15: **36 builder suites do
source-scanning assertions, and none of them has it.** They already do the thing the
`run-all.mjs` checks did not — *slice the region first, then assert inside it*:
`emulator-watchdog.mjs` extracts `startLoop()`'s body before checking it calls
`watchdog.tick(`, and `round2-dialogue.mjs` walks marker-to-marker through generated output
rather than grepping the whole file. So the fault is not "source-scanning tests are bad"; it
is **asserting a name over a whole file instead of the property over the right region**. The
suites were written the careful way and the invariants were not.

*A first attempt at this scope check returned zero and I nearly believed it* — the pattern
that produced the zero was mine, not the code's, so two suites were read by hand before the
result was trusted. Same reflex as §1, applied to a negative finding, which is the case where
it is easiest to skip because the answer is the one you were hoping for.

### Fixing a guard three times: name, then syntax, then comments

One guard, three wrong versions in a single sitting, each fixing the last one's fault and
introducing the next:

| version | matched | what it got wrong |
|---|---|---|
| original | `animFrameSizeMismatch\(` anywhere | the **declaration** satisfies it — a function nobody calls reads as wired up |
| fix 1 | `= animFrameSizeMismatch\(` | pinned to **assignment**; a refactor to `if (name(...))` would fail with nothing wrong |
| fix 2 | any call (lookbehind on `function`) | matched the **commented-out call** a mutation leaves behind, so two proven breaks silently stopped being caught |

Only the third was caught automatically — by re-running the mutation spec and seeing 22 of
24 instead of 24 of 24. The first two needed someone to sit and think about what the guard
was *for*.

- **This is the `prove-coverage` trade-off in miniature.** Narrowing a guard opens silent
  holes; widening it creates false alarms. Both were done here within an hour, in the same
  guard, by someone who had just written the entry above about pinning a guard to one
  spelling.
- **The settled shape:** *any call, minus the declaration, minus anything after a comment
  marker on the line.* Extracted as `callsOutsideComments()` in `run-all.mjs` and shared by
  both guards that needed it, with all three failure modes named in its comment — because
  the next person will re-derive exactly one of them and think they are done.
- **Re-run the mutation spec after touching a guard, not just the suite.** The suite was
  green for all three versions. Only the spec could tell that fix 2 had quietly unprotected
  two things it used to catch, and it cost 4 seconds to find out.
- **There was a fourth version.** Reviewing the extracted helper an hour later: it handled
  `//` and nothing else, so a call disabled inside `/* ... */` or `<!-- ... -->` still
  satisfied it — and commenting a block out is the *more* likely way someone switches a
  feature off. Both returned `true` when tested.
- **The actual failure across all four is not regex skill, it is never enumerating the set.**
  Each version fixed the case in front of me and left its neighbour. The question "in how
  many ways can this call be absent or disabled?" — declaration-only, line comment, block
  comment, HTML comment — takes thirty seconds and was not asked until the fourth pass.
  When a guard's job is *"X is really there"*, **write down every way X can fail to be there
  before writing the pattern**, and test the list. Six directions, one table, done.

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

### A run with failing suites leaves orphaned servers — and `ss` will not show them

Two findings from one incident (2026-08-14), and the second is the dangerous one.

A deliberately-broken run failed 25 suites. Suites that fail before their
`stopServer` leave the server they spawned **orphaned** (`ppid=1`). The very next
full run then failed two unrelated suites — `asm-player` and `smb-hud`, which share
port 18789 — with:

```
Port 18789 is in use by something else (not a playground server).
```

The orphans held the sockets without answering `/health`, which is exactly why the
server classified them as "something else". The hardened `startServer` did its job:
it refused and named the port, instead of silently testing against a server it had
not configured.

- **After any run with failing suites, clear orphans before re-running.** They are
  reparented to init, so they do not die with the run.

**`ss` did not show them.** `ss -ltn` reported *nothing* listening across the whole
18768–18897 range while two processes were holding ports in it. I had used that same
check minutes earlier to conclude "no orphans, clear" — and it was wrong then too.

- **What worked instead:** read `PLAYGROUND_PORT` out of `/proc/<pid>/environ` for
  every `playground_server.py` process. That identifies which port each one owns, and
  lets you kill exactly the right ones without touching the dev server on 8765.
  ```bash
  for p in $(pgrep -f playground_server.py); do
    printf 'pid=%s PORT=%s\n' "$p" \
      "$(tr '\0' '\n' < /proc/$p/environ | grep '^PLAYGROUND_PORT=' | cut -d= -f2)"
  done
  ```
- **The general shape:** this is §1's "tool that returns a confident wrong answer"
  wearing a different hat. `ss` printing nothing is indistinguishable from `ss`
  seeing nothing, and in this container it is the former. **A negative result from a
  process/socket tool needs a positive control** — probe a port you know is open, or
  read the state from somewhere else entirely.

### Interrupting `run-all.mjs` can leave a frozen engine source modified

`invariant: template (no modules) ROM matches golden hash` swaps the Builder template
over `steps/Step_Playground/src/main.c`, builds, compares the hash, and restores the
original in a `finally`. Kill the process before that `finally` runs — which
`timeout N node run-all.mjs` does, and which I did repeatedly on 2026-08-13 while
sampling early invariants — and **`main.c` is left holding foreign content**.

- **Why it matters more than ordinary build dirt:** `main.c` is a frozen engine file
  in the snapshot manifest. Commit it by accident and `engine snapshot matches live
  sources` goes red, and the fix is a version bump nobody wanted.
- **Why it is easy to miss:** the leftover is a perfectly valid C file, and the next
  thing most people do is read *other* output. I only noticed because I ran
  `git status` for an unrelated reason two commands later.
- **What to do:** after any interrupted `run-all`, check
  `git status steps/Step_Playground/` before doing anything else. If it is dirty,
  restore it — and prefer `cp` from a backup you took, or `git checkout --` **only**
  when you have confirmed the file holds no work of your own (this file normally
  does not, which is the one case where §5's "never `git checkout`" rule is safe to
  set aside — say so out loud when you do).
- **Better still, do not interrupt it.** Sampling an early check with a short
  `timeout` is exactly how this happens. Redirect a full run to a file and read the
  file; the run is ~6 minutes and the cleanup is not.

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

**It happened again, in a different file (2026-08-13).**
`invariant: playground_server.py native launch uses _play_latest.nes` tested the raw
file for the bare string `_play_latest.nes`. That name appears twice there: in code,
and in a comment three lines above explaining why a dedicated file is used. Changing
the assignment while leaving the comment left the guard **green**; the replacement,
which matches `latest_rom = STEP_DIR / "_play_latest.nes"`, goes red.

- **Matching the assignment beats stripping comments here.** A naive `#` strip for
  Python also cuts `#` inside string literals. A code-shaped pattern cannot appear in
  prose, so it needs no stripping at all — cheaper, and it cannot corrupt the input.
- **The whole set was then audited, and the risk is not uniform.** 16 of run-all's
  invariants read source; only 2 strip comments. That sounds alarming and mostly is
  not: a **negative** assertion ("must not contain X") *fails* on a comment — loud and
  annoying, never silent. Only **positive** assertions ("must contain X") pass on
  prose. Checking just those found one real case (above); the rest require
  code-shaped anchors — `def _docs_static(self,`, `ROLE_TABLE = [`,
  `state.sprite_tiles[t] =`, `PPU_MASK = 0x1E | 0x20` — which prose does not contain.
  **So the question to ask is not "does this strip comments" but "could a sentence
  satisfy this pattern".**

### When a guard leans on prose — and when that is fine

Three gates here could fail with nothing wrong, all for the same reason: they
asserted something **incidental** rather than the structural fact. The useful part is
that only two were worth changing, and the rule for telling them apart.

| Gate | Coupled to | Verdict |
| ---- | ---------- | ------- |
| BUILDER_GUIDE module count | a comment mentioning `modules['example']` | **fixed** — strip comments |
| `harness-startserver` pre-flight | the *wording* of the error message | **fixed** — assert structure |
| E2E-port literal scan | digits inside a sha1 | measured, **left** (1 in 150,000) |
| `mode-hook-errors` / `mode-module-registry` console text | the wording of a message | **left** — see below |

**The test is not "does it touch text". It is two questions:**

1. **Is the prose a proxy for a structural fact?** `harness-startserver` matched a
   sentence to decide *which code path threw* — a fact the code already exposes
   another way (the pre-flight throws before spawning, so its error carries no
   captured child output). Asserting the proxy instead of the fact is the bug.
   Where the message **is** the deliverable — a developer-facing report that must
   name the mode and hook — asserting its content is legitimate.
2. **Does the false failure misdiagnose?** The reworded pre-flight message made the
   test report *"the pre-flight is missing"*, sending someone to hunt a guard that
   was sitting there. By contrast `expect(hits[0]).toContain('threw')` fails with the
   assertion visible in the message: obviously a wording check, obviously fixable, no
   wrong turn taken. A loud, self-explaining false failure is cheap; a confidently
   wrong one is not.

So the console-message assertions were left alone deliberately. **Churning every
string assertion would be its own mistake** — each change to a working guard is a
chance to open a hole, and the two that were fixed had a structural alternative that
strictly dominated.

### Measuring a gate's false-alarm rate instead of arguing about it

A gate that fires when nothing is wrong gets called flaky, then skipped, then
deleted — and takes its coverage with it. The E2E-port guard scans every suite file
for the Studio port as a literal:

```js
new RegExp('(?<![\\d.])' + e2ePort + '(?![\\d.])')
```

Hex hashes are made of digits too, and the lookarounds only exclude digits and dots —
so `a18790b3c` **matches**. Verified, not assumed. A golden sha1 in a suite file could
therefore fail the port guard with a message about port collisions.

**Measured rather than argued**, generating sha1s exactly as the real ones are shaped:

| | rate |
|---|---|
| a random 40-char sha1 trips the guard | **1 in 150,000** |
| long hex literals in the scanned suite files today | **1** |

So the chance of a false alarm on a given run is about 1 in 150,000, and my
back-of-envelope guess beforehand was 1 in 29,000 — **five times too pessimistic**,
which is the whole argument for generating the numbers.

**No change made.** The fix is one regex tweak (exclude hex neighbours as well as
digits), but narrowing a working guard for a 1-in-150,000 risk buys less than the
chance of introducing a hole while doing it — and every narrowing needs its own
two-way proof. Recorded instead, with the threshold that would change the answer:

> **This becomes worth fixing if golden hashes move into suite files.** The rate is
> per hash and scales linearly. Ten hashes is 1 in 15,000; a hundred is 1 in 1,500,
> which is a false red every few weeks on a different suite each time — the exact
> pattern that gets a gate deleted.

### Six copies of a list, checked, and deliberately not gated

Searching for a constant's *name* does not find its duplicates — the name is the one
part of a copy that is free to differ. Searching for its **contents** does:

```python
# any file quoting 4+ of the six behaviour-type names as literals
found = [n for n in names if f"'{n}'" in src or f'"{n}"' in src]
if len(found) >= 4: ...
```

Run 2026-08-14: **31 files** carry their own behaviour-type list; exactly one uses
the shared `BEHAVIOUR_TYPES` export. A `grep BEHAVIOUR_TYPES` finds that one file and
misses thirty. Of the 31, 24 are test fixtures (fine — each defines its own world) and
**six are production**, in four different shapes: `{id, name}` arrays in three HTML
pages, a name→id map in `builder-validators.js`, an enum option list in
`builder-modules.js`, and a starter that extends the defaults.

**They agree, and no gate was added.** That is the judgement, not laziness:

- The set is `0..6` plus per-project slots, **hardware-capped at 8** — the behaviour
  map packs 3 bits (`v & 0x07` in `playground_server.py`). It cannot grow the way
  routes or config keys grow, which is the trigger for a coverage gate.
- `studio-starter.js` carrying an extra `{id: 7, name: 'finish'}` is **not** drift: the
  racer starter extends the defaults for its ring track, and the server maps custom
  slot ids generically. I nearly filed that as an inconsistency; reading the call site
  is what stopped it.
- The skill's own "when this does not apply" covers exactly this: *a set that is small,
  stable and visible in one screen costs more to gate than it saves.*

Recorded because the next person to run a contents-search will find the same 31 files
and be tempted. The count is alarming and the risk is not.

### A guard can be tight on the token and loose on the gap

Two hollow assertions were found on 2026-08-13/14, and they failed in different
ways. The first matched a bare string that also appeared in a comment. The second —
`invariant: ladder climb checks target-cell behaviour` — matched the *right two
tokens* with a gap that spanned the whole file:

```js
/up_ladder\s*=.*BEHAVIOUR_LADDER/s      // dotall: `.*` crosses everything
```

`BEHAVIOUR_LADDER` occurs six times in `platformer.c`, so gutting the climb-up
branch — the exact regression the guard is named for — left it **green**. Scoped to
one statement (`[^;]*`, no `/s`) it goes red.

- **The question that finds these:** not "does this pass?" but **"could this pass on
  something it should not?"** Both were invisible to a passing run and obvious the
  moment a break was planted.
- **The audit is cheap and worth repeating** after adding assertions. Every regex
  used in a `.test()` call, flagged if it contains an unbounded gap:

  ```bash
  python3 - <<'EOF'
  import re
  src = open('tools/builder-tests/run-all.mjs').read()
  for pat, flags in re.findall(r"/((?:[^/\\\n]|\\.)+)/([a-z]*)\.test", src):
      if re.search(r"\.\*|\[\^;\]\*|\.\+", pat):
          print(f"/{pat}/{flags}")
  EOF
  ```

  Run 2026-08-14: 35 regex literals, 2 with an unbounded gap — both the deliberately
  statement-scoped `[^;]*` ladder pair. Nothing else in the file is loose.
- **`/s` on a pattern containing no `.` is a no-op**, so its presence is not evidence
  of looseness by itself. The one other dotall regex here (`Popen\(\s*\[…`) is
  tight; only the gap matters.

### A success message that counts the wrong thing

Two gates on this project printed a confident total for work they had not done.
Both were found on 2026-08-12 by asking one question — *what does this print if
the thing it iterates is empty?*

- **`run-all.mjs`** enumerates its suites from disk. Point that filter at an
  extension matching nothing and it prints **"✅ All Builder regression checks
  pass"**, exit 0, having run none of them — golden byte-identical ROM hashes
  included. Only the 38 syntax checks and 21 invariants actually execute.
- **`snapshot-engine.mjs --check`** printed `✓ v78 snapshot matches HEAD (30
  files)` where the 30 came from `manifest.json` — the manifest's own claim about
  itself, not a count of anything compared. It read the same whether 30 files were
  checked or none were.

- **Looked like:** the strongest green in the project. The suite that guards every
  engine change, and the gate that guards the frozen engine snapshots.
- **Actually:** a headline describing the *intended* scope of the run rather than
  its actual scope, in the one situation where those differ.
- **The rule:** a completion message must count what was done, not what was meant
  to be done. `${man.files.length}` is the manifest talking about itself;
  `${compared}` is the run talking about itself. Only one of them can fall.
- **The cheap test:** make the input empty and read the output. If it still says
  something reassuring, the message is decoration. Neither of these needed a
  clever mutation — an extension that matches nothing, and one `mv`.

### Only one direction of a two-way comparison was checked

`snapshot-engine.mjs --check` walked the live engine files and looked each up in
the frozen manifest. So it saw a file that had been *changed* (hash mismatch) and
a file that had been *added* (absent from the manifest), but never a file that had
been **deleted or renamed** — that file is not in the live enumeration, so the
loop simply never visits it. Verified by moving `src/asm_macros.inc` aside: green,
exit 0, "(30 files)".

- **Why it hid:** the gate demonstrably worked. Corrupt a hash and it goes red, so
  everyone had watched it fail — at the one thing it did check.
- **The generalisation:** watching a gate fail proves it can fail, *not* that it
  covers the ground you think. When two lists must agree, ask which list the loop
  is driven by; whatever is only in the *other* one is invisible. Iterating A and
  looking up B never sees a B without an A.

### The `silent-success` skill proposal, and why nothing was authored (2026-08-13)

Recorded because "we decided not to build it" is worth as much as the reverse, and
because the next person to notice this shape will otherwise re-propose it.

The proposal was a skill covering *checks that pass because they never ran*, built
from five instances found in one night. The devil's advocate said drop the abstract
version — "silent success" is a concept, not a task, so nothing would ever load it —
keep a narrow task-named one, and merge it with `reportgen`'s `list-drift-gates`
proposal. **I agreed then and still do.** The abstract framing was me liking a
pattern, which the proposal admitted at the time.

What settles it now is that `prove-coverage` exists on disk and was measured against
the proposal's five method points rather than assumed to cover them:

| Proposed method | In `prove-coverage`? |
| --- | --- |
| Every check needs a positive control | **yes** — it is the spine of the skill |
| If two lists must agree, something must fail when they don't | **yes** |
| Distrust a tool that signals failure by producing no output | partly — the "nothing matched" pole |
| Match on the value space, not the variable name you expect | **no** |
| Assertions about generated source must strip comments first | **no** |

So two points survive uncovered — and both are already here, in §1, with the
narrow-pattern entry carrying its five-times-in-one-week tally.

**Neither deserves a skill, and the reason is worth keeping.** A skill is a
procedure you follow; these two are *reflexes* you apply in a second — treat an
empty result as a claim about your pattern; strip comments before asserting on
generated code. A one-line reflex loaded from a skill file arrives too late to help,
because you have already run the grep. The narrow-pattern entry proves the point
against itself: it was written down, and then violated five times in the week after.
That is not a filing problem, and moving it into a skill would not have fixed it.

**Still open, and not mine:** the merge with `reportgen`'s `list-drift-gates`
proposal needs someone who can see both, which this container cannot. The owner's
answer on the work-list is "taken care of, if not now soon".

### A clean scan from `preflight`, triaged (2026-08-13)

Run over this project for the first time. Recorded so it is not re-run blind, and
because the useful part is not the clean result.

**Result:** `preflight --all` → **0 findings, 17 files, exit 0.**

**The clean result is real, and that had to be proved.** Planting the
`verification-through-a-pipe` fixture (`run-checks --all | grep PASS`) in a `.sh`
made the scan go red. Without that, "no findings" and "no detector could see
anything" are the same output — the distinction this whole file is about. My
*first* probe was hand-written from the detector's description and was **not**
caught; using the detector's own fixture was what worked. A positive control
written from memory can fail for the wrong reason and be read as a broken scan.

**Python coverage is nominal, not real — and I got this wrong twice.**
- `preflight --list` shows each detector's files as `*.sh, *.bash, godot-job`, so I
  wrote that no detector covers Python. That display **truncates** the tuple: it is
  seven entries, and two detectors (`sudo-with-redirect`, `git-checkout-to-undo`)
  do list `*.py`.
- But they cannot fire there. `scan_text` calls `strip_noise(..., python=True)`,
  which blanks string literals — correctly, so a detector never fires on prose
  describing itself. In Python, `git checkout -- x.py` and `sudo … < key` occur
  essentially *only* inside strings (`subprocess`, `os.system`). Measured: the bare
  fixture fires as `x.py`; the identical text inside `os.system("…")` does not.
- So a clean Python result means **no detector could look**, not that nothing is
  wrong. Six detectors, all of them shell-shaped.

**`--self-test` exits 1 here, and it is not a broken detector.**
`rsync-unanchored-exclude` cites commit `43dd216`, which is not in this repository —
its incident is a Godot project (`ArtRegistry`, `scripts/core/`). The check asserts
every cited sha is reachable in the repo being scanned, which only holds in the repo
where the incident happened; these detectors are fleet-wide. All three *logic*
assertions (fires on its incident, quiet on sound code, quiet on prose) passed for
every detector. Worth knowing before someone reads `1 detector problem(s)` as a
reason to distrust the scan — or as a reason to ignore the self-test entirely.

**And the trap I walked into while running it:** `preflight --self-test | tail -25;
echo $?` printed `0`. That is `tail`'s status. The real exit was 1. Same lesson as
§1's "piping a long suite through `tail`", committed by someone who had just
re-read it.

**A third, found the same way (2026-08-13):** `mutate --list <spec-that-does-not-exist>`
**exits 0**. It prints `[Errno 2] No such file or directory`, so a human sees it — but
the status says success, so `mutate --list spec.json && …` proceeds on a typo. A real
run with the same bad path correctly exits 1; only `--list` disagrees with itself.
Found while *testing the commands before documenting them*, which is the only reason
it was found at all — and note my first reading called it "silently succeeds", which
was wrong: `>/dev/null 2>&1` had hidden the message I was claiming did not exist.
Written up for the tool's maintainer in [`reference/shared-tooling-findings.md`](reference/shared-tooling-findings.md); not fixed here, because `mutate` is on every container.

### A test name is a promise — but the fix is not always "make it true"

Sweeping the suites for names carrying a universal quantifier ("every", "all",
"per") found four over-claims on 2026-08-12. They split evenly, and the split is
the useful part:

**The name was right and the test was too narrow** — fix the test:
- `tutorial.spec.js` "every game style" walked a hand-written list of five. Worse
  than it sounds: that list is the slow part of the test, so *losing* a style
  would have made it faster and still green. Now enumerates `STUDIO_TUTORIALS`.
- `enemy-bump.spec.js` "for every game type" walked three, four counting the
  default — **Auto-runner was never tested**, while the test's own comment said
  "enemies exist in every game type". Now enumerates the style cards.

**The name was wrong and the test was right** — fix the name:
- `rules.spec.js` "renders a card per builder module": RULES deliberately shows a
  *filtered* subset (powerups lives on Style; dialogue is hidden for auto-runners),
  which the very next test asserts. Enumerating modules would have asserted
  something false.
- `all-modules.mjs` "Everything optional, on": eight of eighteen, because the SMB
  set needs the SMB game type and this fixture is a platformer. Covered by the
  `smb-*` suites instead.

- **The trap:** having just fixed two by enumerating, the reflex is to enumerate
  the next one. That would have broken `rules.spec.js` — turning a correct test
  into a failing assertion about behaviour nobody wants.
- **The rule:** an over-claiming name means *either* the test is too narrow *or*
  the name is wrong, and **which one depends on the intended behaviour, which you
  have to go and establish.** Read what the surrounding tests assert before
  touching either.
- **Why it is worth the sweep anyway:** the names are load-bearing. Nobody re-reads
  a test that says it covers everything, so an over-claim is how a gap becomes
  permanent — and two of the four were real gaps.

### One behaviour change, four wrong descriptions — and the last one is frozen

`_build_rom()` moved from writing into the tracked tree to building in a
`tempfile.TemporaryDirectory`. That single change falsified the same paragraph in
**four** places, found weeks apart:

| Where | Fixed |
| --- | --- |
| `CLAUDE.md` | 2026-08-06 |
| `playground_server.py`'s module docstring — the first thing anyone reads in that file | 2026-08-13 |
| `docs/guides/TEACHER_GUIDE.md`, twice (the server section and the `/play` contract) | 2026-08-13 |
| `steps/Step_Playground/Makefile` header | **cannot be fixed alone** |

- **The lesson about finding them:** fixing the first instance felt like closing the
  issue, and three more sat untouched for a week. When a behaviour changes, grep for
  the *old behaviour's nouns* — here `scene.inc`, `palettes.inc`, `make -C
  steps/Step_Playground` — not for the file you already know about.
- **The lesson about the fourth:** it is a frozen engine file. Its HEAD bytes hash
  exactly as the v78 manifest records, so **any** committed change — a comment
  included — turns `engine snapshot matches live sources` red and demands a version
  bump, a changelog entry and a re-snapshot. Correcting a comment is not worth a
  version number, and would leave a no-op entry in the engine changelog. It is
  recorded as a ride-along for the next bump instead
  ([#14 Step 2](plans/current/2026-08-06-item-14-multiscreen-rooms.md)).
- **Worth knowing before you try:** an *uncommitted* edit there looks fine, because
  `--check` reads HEAD, not the working tree. The red appears after you commit.

### Placeholder copy outlives the state it described

When `window.StudioModes[id]` is missing, the dock renders "This mode arrives
later in the redesign — the *X* tools dock in here next." That was accurate in
Phase 0. All eight modes have shipped since, so the branch is now reachable only
when a module **fails to load** — a renamed file, a syntax error, a `<script>`
tag dropped from `studio.html`.

- **Looked like:** a feature that hasn't been written yet.
- **Actually:** a feature that is written, and broken. A teacher reads the
  message, believes it, and never reports it — so the failure has no route to
  anyone who could fix it.
- **Why it is worth its own entry:** the other silent failures in §1 are *quiet*.
  This one is confident and reassuring, which is worse — it does not merely fail
  to raise the alarm, it supplies a wrong explanation good enough to stop the
  reader looking. Anything phrased "not yet", "coming soon" or "temporarily
  unavailable" deserves the question *what happens to this text when the
  temporary state ends?*
- **Fix, now in the file:** the copy stays (a pupil can do nothing about a failed
  load), but the real reason goes to the console once per mode, and
  `mode-module-registry.spec.js` fails if any mode on the rail has no module.

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

### The mode rail and the mode registry

`MODES` in `studio.js` builds the rail; the eight `window.StudioModes.<id>`
registrations live in eight separate files, each needing its own hand-written
`<script>` tag in `studio.html`. Three places to keep in step, and until
2026-08-09 nothing checked them — see §1 for what a mismatch showed the pupil.

Worth copying from the fix: `MODES` is closure-private, so the gate does not read
it. It enumerates the **rail the DOM actually built** and the **registry object
that actually exists**, then compares those. A version that scanned `studio.js`
and `studio.html` for names would have matched the comment explaining the gate
and passed on it — the §1 mistake, made twice.

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
