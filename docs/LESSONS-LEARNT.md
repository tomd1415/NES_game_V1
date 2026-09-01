# Lessons learnt

What has actually cost time on this project, and what would have told us sooner.

**The rule for adding an entry:** "X was broken" is not a lesson. The lesson is
*"X looked like Y, and here is the check that would have distinguished them."*
Include the false theory you held on the way — the next person will hold it too.

Entries are grouped by the *shape* of the mistake, not by date, because the shape
is what recurs. Most of these cost between twenty minutes and a whole session.

*Merged 2026-08-27.* `main` kept this file; the `chore/linux-native-bootstrap-v63`
branch had grown its own chronological one at `docs/guides/LESSONS_LEARNT.md`. Two
files that a merge would have kept side by side is exactly the failure §2 is about, so
the branch's twenty-two entries were folded into the sections below and its copy
deleted. They carry their dates in the heading. Two links in `main`'s entries — to
`reference/shared-tooling-findings.md` and `plans/current/2026-08-06-item-14-multiscreen-rooms.md`
— pointed at files the branch did not have. **`main` was merged in on 2026-09-02 and
they resolve now**; this sentence is kept because it is the record of why they were left
alone rather than deleted.

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

6. **A negative result from a tool you did not verify is running is not a result.**
   `python3 -m pytest` failing says nothing about whether pytest is installed (it is,
   via pipx); empty `ss` output says nothing about listeners (the binary is absent).
   `command -v` first. Three separate stalls, one of them nine days long. (§1)
7. **On-disk existence is not archival, and `git add` says nothing when it declines.**
   Assert the thing is *tracked*, not that it is *there*. Cost so far: seven ROM
   baselines, a whole `.devcontainer/`, and three files missing from all 75 engine
   snapshots taken before it was found. (§1)

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

### "The code contains X" is not "X runs" — three times in one day

The same error wearing three costumes, all on 2026-08-15, all by the same hand:

| where | what was found | what was concluded | what was true |
|---|---|---|---|
| `sprites.html` | `animFrameSizeMismatch(` appears | the warning is computed | it was the **declaration**; nothing called it |
| `playground_server.py` | `_seed_dialogue_font(` appears | the font is seeded | it was the **`def` line**; the call could be dropped invisibly |
| `ai_asm.s` | `cmp #$EF` sentinel test appears | the ASM AI honours parking | it is **never linked for these projects** — `nes_asm_ai` is gated on `not _scene_is_perroom(...)` |

The first two were guards making the mistake. The third was **me** making it, in
prose, in a committed plan — asserting the ASM AI was "the SHIPPED DEFAULT" and
would silently diverge, having checked that the file contains the test and never
checked whether it is built. Half the evidence, stated with full confidence, in a
document written to be acted on.

- **The check is always the same and always cheap:** having found the text, ask
  *what makes this run?* A call site. A registration. A build flag. An `#ifdef`.
  For anything behind a build toggle, grep the toggle, not the symbol — the
  server's `nes_asm_ai = bool(...)` expression answered it in one line.
- **Guards and prose fail this identically**, which is why they belong in one
  entry. A guard that matches a declaration and a sentence that cites a file's
  contents are both asserting presence and both being read as liveness.
- **It is worst when the conclusion is alarming.** "Invisible enemies that can
  still hit you" is exactly the sentence someone reorders their week around. A
  claim's cost of being wrong should set how hard you check it, and that one was
  checked less than a typo would have been.
- *And the correction was worth more than the alarm:* the real asymmetry —
  `chaser`/`flyer` test the sentinel, `walker`/`patrol` do not — is why the gate
  exists at all, and it is the thing the next engine change has to preserve.

### Audits run 2026-08-15/16 — what they found, and what they did not

Recorded so nobody re-runs them. Four of these found nothing, which is the useful part:
this codebase is in better shape on these axes than the guard work suggested.

| audit | result |
|---|---|
| TODO/FIXME debt | **none owned by this project** — all 16 are in vendored FamiStudio 4.5.0, which `sync.sh` would overwrite |
| Studio mode test coverage | **no gaps** — all 8 modes in the `MODES` table have behavioural assertions, not just visibility. `pals`/`sound`/`style`/`code` are thin (2 specs each) but not presence-only |
| server route references | **all 25 referenced** — the two that looked orphaned were my own false positive (see below) |
| behaviour-type ids across `collision.h`, `studio-starter.js`, the harness | **exact agreement** on 0–6; the engine's extra `custom7` is the generic slot the editor fills per game type |
| doc claims in `docs/guides/` | one real drift (the shared-port table), recorded separately |
| pure-presence invariants satisfied by comment text | **none** |
| editor AI types vs the four `ai_asm.s` routines | **sound, and deliberately so** — see below |

**The one real finding came out of an audit that found nothing.** `/lessons/*` and
`/snippets/*` looked unreferenced; they are not — the URLs are built as
`PLAYGROUND_LESSONS + '/' + encodeURIComponent(id)`, so the literal never appears in
source. Sixth instance of searching the spelling rather than the behaviour. But asking
*why* they looked orphaned turned up something real: `studio-code.js` carries its own
hardcoded array of **6** snippets while `snippets/` on disk holds **24**, and only the
legacy `code.html` fetches the 24. The Studio — the primary front-end — cannot see
them. Raised in `.mc-outbox.md`; it is a product decision, not a bug to fix unasked.

- **Chase why a null result looks the way it does.** The audit's stated finding was
  nothing. Its by-product was a silent gap affecting the front-end pupils actually use.
- **One of those clean results has a trap in it, so it is written down rather than just
  ticked.** `ai_asm.s` dispatches on four codes and ends `jmp next` — an unknown code
  makes it SKIP the entity, with no default case. That reads exactly like a missing
  `else`, and "fixing" it to fall through to `walker` would be a real bug: the editor
  emits `aiType = 0` for hopper, shooter, goomba and koopa **precisely so the ASM loop
  skips them**, because per-instance C blocks own those. Falling through would move them
  twice. The absent default is the design, and `builder-modules.js` says so in a comment
  at the branch that sets it.
- **And say "found nothing" plainly when that is the answer.** Four of six here. A
  sweep that reports nothing is worth writing down precisely because the next person
  will otherwise spend the same hour discovering the same absence.

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

### "The tool is not installed" is a claim, and it needs evidence (2026-08-06)

Three separate stalls this month traced to the same shape: a session concluded a
tool was absent, wrote that conclusion into a document, and every later session
inherited it as fact. Each conclusion came from a command that failed for a
different reason than "not installed".

#### `pytest` was present the whole time

`docs/handoffs/2026-07-28-native-main-integration.md` listed pytest under
**Absent**, and marked it "re-confirmed". It has been in the image since the
Dockerfile was written (`pipx install pytest`).

* **What it looked like:** `python3 -m pytest` → `No module named pytest`.
* **Why that is not the same question:** pipx installs into its own venv and
  exposes only the **console script**. `command -v pytest` →
  `/root/.local/bin/pytest` → `/root/.local/pipx/venvs/pytest/bin/pytest`. The
  module form can never work, by design, and says nothing about availability.
* **Cost:** the native test suite was declared unrunnable in this container and
  went unrun for nine days. When it was finally run (2026-08-06) it took **six
  seconds** to surface two genuine failures — see *The engine version and the native baseline* in §2.
* **The check that settles it:** `command -v <tool>` **before** `python3 -m <tool>`.
  If you must record "absent", record the command you ran and its exact output, so
  the next reader can tell a missing package from a wrong invocation.

#### The general rule

> A negative result from a tool you did not verify is running is not a result.

The same mistake appeared twice more in this repo's recent history:

* **No socket tools.** A session reported "nothing is listening in this container"
  from empty `ss`/`netstat` output. Neither binary is installed; both printed
  nothing and exited. A server had been running for eight days. `command -v ss
  netstat lsof` returns nothing here — use `/proc/net/tcp` (there is a worked
  snippet in the 2026-07-28 handoff).
* **`audio.mjs` "fails on main too".** A leaked server squatting on the hard-coded
  port 18815 made a clean-`main` comparison fail *identically*, which read as
  confirmation of the environmental theory. It was a real regression. Freeing the
  port first would have settled it in a minute.

All three share a structure: **a check that cannot distinguish the two hypotheses
was treated as if it had.** Before trusting a negative, ask what else would produce
that same output.

### A contract test whose fixtures `.gitignore` swallowed (2026-08-06)

`native/tests/contract/test_phase0_starter_fixtures.py` compares the native
target's generated artefacts against seven frozen starter-project baselines —
`project.json.gz`, `play-request.json.gz`, `main.c.gz` and **`game.nes`**.

The three `.gz` files are committed. `game.nes` is not, and never was: `.gitignore:3`
is `*.nes`, so the ROM baselines were silently swallowed on the way in. **Zero
`.nes` files are tracked in this repository.** In a fresh clone the test raises
`FileNotFoundError` on the size check and dies before it reaches the hash
comparison at all.

* **What it looked like:** a `tests/contract/` directory whose README line — "proves
  both targets emit byte-identical ROMs" — is quoted in the project `CLAUDE.md`,
  in `native/README.md`, and in every handoff since. It reads like the strongest
  guarantee in the project.
* **The false theory:** that "the cross-target contract holds" was an *observed*
  property. It was an inherited sentence. Nobody in this container had ever run the
  suite (see *"The tool is not installed" is a claim*), and the suite would have failed if they had.
* **Why `.gitignore` hid it:** the pattern is correct and necessary — this repo
  generates `.nes` files everywhere, and `steps/Step_Playground/src/` is rewritten
  on every `/play`. A broad build-output ignore is the right call. The trap is that
  a *fixture* that happens to share an extension with build output is
  indistinguishable to `git`, and `git add` says nothing when it declines.
* **The check that settles it:** for any directory of committed fixtures, assert
  the fixture files exist as a **separate, named test**, so a missing baseline
  fails as "baseline missing" rather than as a confusing assertion error inside the
  test it was meant to support. And after adding fixtures, `git status --ignored`
  on the fixture directory before you believe they landed.

### A missing optional dependency and a real regression are the same word (2026-08-06)

Running the native suite without PySide6 gives:

```
11 failed, 189 passed, 149 skipped, 12 errors
```

The 149 skips are deliberate and well built: `tests/ui/support.py` guards
`StudioTest` with `@unittest.skipUnless(PYSIDE_AVAILABLE, ...)`, so the UI layer
stands down cleanly on a headless box. That is good design.

The trap is the **12 errors**: twelve modules import PySide6 at module scope, so
they hard-error at collection instead of skipping — and three further tests
(`test_palette_parity.py` ×2, `test_icons.py` ×1) import it *inside* the test body,
so they show up as ordinary **failures** indistinguishable from real ones.

* **What it looks like:** a summary line where a genuine regression and an absent
  optional dependency are the same word. Of the 11 failures above, exactly **one**
  is real (the baseline manifest — *The engine version and the native baseline*, §2) and three are "PySide6 is not
  installed" wearing a failure's clothes. Working out which took longer than
  finding the real bug.
* **The rule:** if a suite is designed to degrade without an optional dependency,
  that has to be true of **every** module in it. A half-applied skip guard is worse
  than none, because it teaches you to read past failures.

### Watching the engine gate fail on purpose — and the two things it does not watch (2026-08-06)

*Overlaps the entry above deliberately — the two probings were done independently, on
two branches, a week apart, and neither found everything. `main`'s found the fourth
mutation this one missed (an edit to the snapshot's **own frozen copy** goes unnoticed,
which is the hole that became `An archive can be incomplete from the day it is written`,
below). This one adds the write-side hazard and the Python-shaped blind spot. Read both;
they are the same gate seen from two sides.*

A check nobody has seen fail is decoration. `scripts/snapshot-engine.mjs --check`
— invoked by `tools/builder-tests/run-all.mjs` as *engine snapshot matches live
sources* — had never been watched go red here, so it was broken deliberately three
ways and restored. Every probe was working-tree only and reverted with
`git checkout --`; the tree was verified clean afterwards.

| Probe | Predicted | Observed |
| --- | --- | --- |
| Baseline | green | `✓ v75 snapshot matches HEAD (30 files).` exit 0 |
| **A.** Append a line to `tools/tile_editor_web/engine-version.js` (uncommitted) | **still green** | still green, exit 0 |
| **B.** `ENGINE_VERSION` → 76 with no `v76/` snapshot | red | `No snapshot for v76 …` exit 1 |
| **C.** Corrupt one `sha1` in `tools/engines/v75/manifest.json` | red, naming the file | `DRIFT (vs HEAD): steps/Step_Playground/Makefile` exit 1 |

**The gate works.** B and C both go red, C names the offending file, and both
return to green on restore.

**Probe A is the one to remember.** It is green *by design* — `--check` compares
committed (HEAD) bytes precisely so it stays deterministic while a `/play` is
rewriting `steps/Step_Playground/src/` underneath it. The cost of that choice is
that **an engine edit you have not committed yet is invisible to the gate**. Run it
after committing, not before, or it will cheerfully bless work it never looked at.

#### The blind spot worth knowing about

The v75 snapshot covers **30 files and not one line of Python**:

```
steps/Step_Playground/{Makefile,assets,cfg,src}
tools/tile_editor_web/{builder-assembler.js,builder-modules.js,
                       builder-templates,engine-version.js}
```

Neither `tools/playground_server.py` nor `tools/nes_studio_core/` is in it — yet
`nes_studio_core` now emits most of the ROM, since the codegen was extracted out of
the server. So **a change to the Python codegen alters ROM output and cannot make
this gate go red.** The v64–v75 port landed entirely inside that gap.

That is not the same as "untested": the builder suites drive the real server
(`tools/builder-tests/lib/render-harness.mjs` spawns it), so the codegen is
exercised *behaviourally* — 110 suites, all green. It is simply not *frozen*, so
nothing detects that its output changed. Written up with the decision it implies in
[`design/engine-versioning.md`](design/engine-versioning.md).

#### The same HEAD semantics have a nastier edge on the *write* side

`snapshot-engine.mjs` reads HEAD when it **creates** a snapshot too. So the
release workflow that `tools/engines/README.md` prescribed — change the engine,
bump the version, write the changelog, snapshot — froze the *previous* engine into
the new `v<N>/` if you had not committed yet. A modified file is written at its
committed bytes with **no warning**; only a brand-new file prints
`(skip, not committed)`. And because `--check` then compares HEAD against a
manifest also derived from HEAD, the two agree perfectly. Snapshots are immutable,
so the only way out is to bump again.

Nobody has hit this, as far as the changelog shows. It is here because it is a
*write* path that fails silently and self-consistently, which is the hardest kind
to notice: the wrong artefact passes its own check. The README now has an explicit
commit step.

#### Small thing found on the way

`run-all.mjs`'s header says "Exits 0 if every step passes, 1 on the first failure."
It does not stop on the first failure — it accumulates `anyFail` and exits 1 at the
end. A reader who believes the comment will assume everything after a `FAIL` line
was skipped, when in fact those results are real. One-line comment fix, not done
here (this pass was documentation-only and that is a source file).

### A probe that stays green because it probed something that was never a failure (2026-08-06)

Guarding "no fixture a test depends on may be git-ignored", I tried to prove the
guard could fail by appending an ignore rule over the committed ROMs. The test
stayed green, and for a moment that looked like a broken guard.

It is not: `git check-ignore` never reports a **tracked** file, and that is the
behaviour you want here — a tracked file is in a fresh clone whatever
`.gitignore` says. The probe was testing a scenario that is not a failure. The
real failure is an *untracked* file swallowed by a pattern, and dropping a
`probe.bak` under the fixtures turns it red immediately.

* **A probe that does not go red has two explanations**, and "the check is
  broken" is only one of them. The other is that you probed something that was
  never a failure. Work out which before either trusting or rewriting the check.
* Recorded in the test itself, because the next person will reach for the same
  invalid probe.

### Widening a gate splits history into two eras; say so loudly (2026-08-06)

Adding `tools/nes_studio_core/` to the engine snapshot took it from 30 files with
**no Python at all** to 41 including the codegen that emits most of the ROM. The
change itself is small. The consequence for the record is not: **v1–v75 were all
taken without it**, so two matching snapshots anywhere in that range say nothing
about whether the codegen changed between them.

That cannot be repaired — snapshot directories are immutable by design, and
back-filling them would mean inventing provenance for files nobody captured.

* **When a check gets wider, every earlier pass silently means less than a reader
  will assume.** Write the discontinuity down where the comparison happens, not
  only in the changelog: it went in the CHANGELOG, `tools/engines/README.md` and
  `docs/design/engine-versioning.md`, each with the two-era table.
* **Prove the widened gate fires.** `--check` reads committed bytes, so proving
  it needed an actual throwaway commit to a codegen file — then `DRIFT (vs HEAD):
  tools/nes_studio_core/collision.py`, exit 1, and reset. An unproven widening is
  just a longer file list.

### An archive can be incomplete from the day it is written (2026-08-13)

Every engine snapshot in `tools/engines/` — all 77 of them — was missing the same three
files, and had been since v1. `.gitignore` carried bare patterns (`scene.inc`,
`game.chr`, `level.nam`), git matches a bare pattern at **any depth**, and that includes
inside the archive. `git add` declined them silently, in every snapshot, for the whole
life of the scheme.

* **What it looked like:** `✓ v77 snapshot matches HEAD (41 of 41 files compared, 0
  missing).` Green, specific, and quoted in `CLAUDE.md` as the thing that keeps engine
  changes safe.
* **Why the gate could not see it:** both its directions compared the **live** engine
  sources against the manifest. Neither ever opened the frozen copy. "0 missing" was true
  of what it checked and false of what any reader assumes it checked. An archive is the
  one artefact whose *stored* copy is the entire point, and that copy was the one thing
  unexamined.
* **How it surfaced:** not by looking for it. Anchoring those `.gitignore` patterns —
  a one-line tidy filed under "minor, listed for completeness" a week earlier — made four
  paths appear as untracked, and the question "why are those untracked?" did the rest.
* **The damage:** v76 and v77 were repairable because their bytes were still on disk in
  this container. **v1–v75 are permanently three files short**, gone from git and disk
  both. The scheme exists so a future engine can rebuild a game with the engine it was
  authored for; seventy-five of them cannot.

**The check, and it is one line of intent:** *enumerate the manifest and assert every
promised file is readable from HEAD at its archived path.* Not that it exists — that it
is **in the repository**.

**My first version of that check used `existsSync()` and passed**, because the files were
sitting on disk untracked: present locally, absent from every fresh clone. That is F5
(the ROM fixtures swallowed by `*.nes`) committed inside the fix for F5's own class.
Three incidents here now share one sentence, so it is worth stating flatly:

> **On-disk existence is not archival, and `git add` says nothing when it declines.**

The generalisation worth carrying to any project: if something keeps a **manifest** and a
set of **files it promises**, one test must enumerate the manifest and assert each promise
is tracked. In this repo three artefact sets have a manifest; two had that test and are
sound, one did not and had rotted since v1. That is as close to a controlled experiment as
this kind of thing gets.

### A golden that does not use a feature cannot detect it changing (2026-08-13)

Three shipped starter games (`smb`, `runner`, `geodash`) changed ROM bytes between
engine v63 and v75 and nobody noticed for twelve versions. Bisected to `4554de9`
("compress ANY multi-screen level", v66), and the change was **deliberate** — column
dedup is supposed to alter how a multi-screen level is emitted.

The interesting part is the guard. Every version in that range says, correctly:

> goldens `1730448e` + `_rom-equiv` `0aed6e95` **UNCHANGED**

and every one of those claims is **true**. The goldens are the stock `Step_Playground`
ROM and the no-modules template — deliberately minimal projects. Neither has a
multi-screen level, so neither can observe multi-screen emission changing.

* **What it looked like:** a byte-identical-ROM gate, green across twelve engine
  versions, quoted in `CLAUDE.md` as the lever that keeps engine changes safe.
* **The false theory:** that "goldens unchanged" meant "ROM output is stable". It means
  "**unused** features are stripped and add nothing" — which is what the goldens were
  built to prove, and they prove it well. The larger reading was never justified.
* **Why the gap is structural, not careless:** a minimal golden is the *right* design
  for the claim it makes. You cannot fix it by making the golden bigger without losing
  the property that makes it a useful invariant. You fix it by adding a **second**
  corpus of realistic projects — which is what `native/tests/fixtures/phase0/` now is,
  and it is why the drift surfaced at all.
* **The check that would have told us sooner:** for each feature gated "off by
  default", one fixture with it **on**. Ask of any golden: *which of my features does
  this project actually exercise?* The answer is the list of things it can detect —
  and everything else is uncovered, however green it goes.

The specificity is the tell that this is a real rule rather than a vague worry: `racer`
is multi-screen (2×2) and was **not** affected, because the change is *column* dedup and
racer uses the four-screen path. Exactly the projects that used the changed feature
changed; exactly the ones that did not, did not.

### An ignore rule that names a place, not the files you meant (2026-08-12)

`.gitignore:3` is `*.nes`. It silently swallowed seven committed ROM baselines and a
contract test's assertion never once executed — that is *A contract test whose fixtures `.gitignore` swallowed*, above, and
it cost nine days.

The same shape has now happened twice more in this repo, and the pattern is sharper
than "beware .gitignore":

| Rule | Intent | What it actually took |
| --- | --- | --- |
| `*.nes` | ignore build output | + seven fixture baselines (F5) |
| `.devcontainer/` | ignore local container mess | + the Dockerfile, `devcontainer.json`, `init-firewall.sh` and `post-create.sh` — i.e. every file that makes the app buildable |
| `*.bak-*` (on `main`) | ignore `Dockerfile.bak-tools-174621` | exactly that, and nothing else |

The third is the interesting one. `main` and this branch hit the *same* irritation —
timestamped backup files cluttering `.devcontainer/` — within weeks of each other.
`main` ignored **the backups**. This branch ignored **the directory**. Both make
`git status` clean; only one of them loses the configuration.

* **What it looks like:** nothing. `git status` is clean, which is what you wanted, and
  `git add .devcontainer/post-create.sh` prints **no output at all** when it declines.
  There is no state in which the repository tells you the file is missing — you have to
  ask a different question (`git ls-tree`, `git check-ignore -v`, `git status
  --ignored`).
* **The false theory:** "it is in the repo, I can see it in the editor." An ignored
  file and a committed file look identical in every tool that shows you a filesystem.
* **The check that settles it:** for anything a documented workflow depends on, verify
  it is *tracked*, not that it *exists* —

  ```bash
  git ls-tree -r --name-only HEAD .devcontainer/ | wc -l    # 0 means it is not there
  ```

  and when writing an ignore rule, **name the files you mean, not the place they live**.
  A directory rule is a bet that nothing important will ever be put in that directory.

The cost here has not landed yet, and that is only luck: `devcontainer up` reads the
workspace on disk, so the rebuild works *on this machine*. The provisioning that would
un-skip 161 tests is four untracked files, one lost container away from gone, and
unreviewable in the meantime.

### Restoring a probe mutation is a step that can silently not happen (2026-08-08)

Breaking a gate on purpose means editing a tracked file and putting it back. I did
that five times today and **three of the five restores failed**, every one of them
`git checkout -- <path>` run from `native/` with a repo-root path:

    error: pathspec 'tools/playground_server.py' did not match any file(s) known to git

That line is loud, but it arrives at the end of a test run that has just printed a
satisfying red failure — the thing I was looking for. Attention is on the assertion,
not on the last line of the shell. One of the three was an edit to
`packaging/install-desktop-entry.sh` that removed a size from the *uninstall* loop:
left in the tree it would have shipped an installer that orphans the 256px icon,
introduced by the very exercise meant to prove the check against that catches it.

What actually fixes it is not "remember the cwd". It is that **the restore needs its
own assertion**, the same way the break does:

    git checkout -- <path> && git status --porcelain | grep -v '^??'

Print the status and look at it. An empty tracked-changes list is the evidence the
probe is over; a passing test afterwards is not, because the mutated file may simply
not be one that test reads.

Related: the same session's `git reset --hard HEAD~1` discarded an uncommitted fix
twice, for the same underlying reason — a destructive step taken while thinking about
something else. Commit first, then probe, then restore.

### A probe harness that read an exit code as an outcome (2026-08-09)

I built a harness to break a gate on purpose and check it goes red. It decided the
outcome from pytest's **exit code**. Three probes came back "STAYED GREEN — hole",
which for a coverage gate is a serious finding, and I nearly wrote them up as one.

They were skips. The harness ran pytest with a stripped `env=` that had no `node` on
`PATH`, and the parity test skips itself when the web harness cannot run. `pytest`
exits **0** for a skip, and it exits 0 for "no test matched that node id" as well. So
three different states — the gate held, the gate never ran, the gate does not exist
under that name — arrived as the same integer, and the one I wanted to detect was the
least likely of the three.

The tell was there and I nearly read past it: the summary line said `1 skipped in
0.03s`, printed right next to the word GREEN in my own output.

**What would have told me sooner:** assert the run happened, not just that nothing
complained.

```python
if not re.search(r"\d+ (passed|failed)", summary):
    raise AssertionError(f"gate did not run ({nodeid}): {summary}")
```

With that in, the same three probes re-ran and split cleanly: one genuine hole (F17),
one control red, one phantom red. Without it, the control would have read as a hole
too, and I would have reported a gate as broken when it works.

Two things generalise:

* **This is the third time on this branch that an exit code has been read as an
  outcome** — `tail` masking node's status, `git checkout --` printing a complaint and
  exiting 0, now pytest's skip. A harness built specifically to catch checks that pass
  without running is worth nothing if the harness itself passes without running.
* **A tool that is careless about the difference between "fine" and "did not happen"
  is the tool you use to audit other tools at your peril.** Give the harness the same
  meta-test you are demanding of the code: make it fail on purpose. Pointing it at a
  node id that does not exist should raise, and now does.

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

### …and a third place, which was not guarded, and bit within five days

The version is also written into `tools/builder-tests/mutations/*.json`, as the
literal text a mutation break anchors on. Three of `gates.json`'s seven breaks
quoted `78`. v79 shipped on 2026-08-20; from that moment the builder gates could
not be proved at all, and nothing said so until someone tried on the 26th.

Two things make this worse than an ordinary stale reference:

- **`mutate` refuses a spec whose anchor no longer matches** — correctly, because a
  break landing nowhere proves nothing. But the refusal is per *spec*, not per
  break, so one stale anchor disabled the other six with it.
- **It is invisible until someone runs it.** A check that only fails when you go
  looking has no upper bound on its decay. This is §1's silent success one level
  up: the *prover* had stopped working, not the thing being proved.

Two of the three are now version-agnostic — anchor on `global.NES_ENGINE_VERSION = `
and prefix a digit, rather than quoting the digits. The third cannot be:
`snapshot-engine.mjs --check` derives its directory from `ENGINE_VERSION`, so the
manifest path must name the current version to mean anything. That one is covered by
enumerating instead — `invariant: mutation specs name the current engine snapshot`
reads every spec's `breaks[].file` at runtime and fails the seconds-long checks-only
run when one has fallen behind. It was watched failing on the live staleness before
it was fixed, which is the only reason to believe it.

Worth copying: it reads `breaks[].file`, **not** the spec's raw text. The first draft
regexed the whole file and would have tripped on the `expect_none_because` prose that
names an old version for a historical reason — and a gate that fires when nothing is
wrong gets called flaky and deleted, taking the coverage with it.

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

### The engine version and the native baseline (2026-08-06)

`native/tests/contract/test_baseline_manifest.py` asserts the manifest's
`engine_version` equals the live `tools/engines/ENGINE_VERSION`. It fails
`63 != 75`, and the manifest file is still literally named `baseline-v63.json`.

This is the honest version of *A contract test whose fixtures `.gitignore`
swallowed* and its "contract holds by construction" reasoning: the engine versioning gate (`node
tools/builder-tests/run-all.mjs`, which runs `snapshot-engine.mjs --check`)
protects the **web/engine** side and is genuinely green. Nothing was protecting
the native baseline, and it drifted twelve versions without a single red light —
because the test that would have gone red was never run.

* **The pattern to distrust:** "the contract holds by construction, because both
  targets delegate to the same function." That may be true *today*, and it is not
  a test. A delegation can be re-inlined by the next person who is in a hurry, and
  the reasoning leaves no artefact that fails when it stops being true.

### Two copies a test requires to be identical, with one hand-maintained (2026-08-06)

That same timestamp did real damage. It made the fixtures non-reproducible, so
regenerating always looked like a change; it made three of the four hash columns
useless as a drift signal; and it silently decoupled the test corpus from the
copy of the starters the app actually ships, which are required to be
byte-identical. Re-baselining the corpus broke that sibling test, and the break
had nothing to do with anything I had intended to change.

It was also **inert**: `StarterCatalog.create()` overwrites both fields with the
real clock on every project it makes, so no pupil ever saw the value. A field
that changes every run, affects nothing at runtime, and is compared for equality
by a test is pure downside.

* **Freeze non-determinism at the point it enters**, not downstream. Frozen to an
  obviously-synthetic epoch, so nobody reads it as a capture date.
* **Two copies that a test requires to be identical need one writer.** The
  packaged copy was hand-maintained; that is why it drifted. The generator now
  writes both, and running it twice produces a byte-identical tree.

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

### …but "the box was busy" became an excuse for two tests that were genuinely wrong

The entry above is right and was over-applied. For weeks two `tutorial.spec.js`
tests reddened under load and were waved through as weather, with a `--timeout`
override wired into the mutation adapter so they would stop reddening *there*.
Measuring them (2026-08-27) settled it in one run: at a quiet box they take
**13.8 s and 9.8 s** while the next slowest test in the whole suite takes 3.6 s and
the median is ~1 s. A uniform 30 s limit gave 163 tests 8×–30× headroom and those
two 2.2× and 3.1×. They were not flaky; they were under-budgeted.

- **The tell was available all along:** it was always the *same two* tests. Genuine
  environment noise moves around; a fixed cast is a property of those tests.
- **The load penalty is ADDITIVE, not proportional**, which broke the model I sized
  the fix with at first. At load ~26 two tests that did not fail went 2.9 s → 26.4 s
  and 2.5 s → 25.6 s — about **+23 s each**, independent of quiet duration. So
  reasoning in ratios ("it has 10× headroom") is wrong; the penalty is a per-test
  fixed cost that contention inflates.
- **Fixing it inside the mutation adapter was the wrong place** and is the part
  worth generalising. It made the symptom disappear where I was looking and left it
  for everyone running the suite normally — which is how a suite earns a reputation
  for flakiness and then stops being believed. If a workaround is invisible from the
  ordinary path, it is hiding the problem, not solving it.

### A summary line that asserts a condition nothing measured

Proving the fix needed "five consecutive runs at load ≥ 15". The driver I wrote for
it printed:

> ════ 5 of 5 runs green at load >= 15, no per-run override

and it had **never looked at the load**. It counted green runs; the load figure in
that sentence was decoration. Two of the five were actually below the bar (13.95 and
12.29) because ambient load fell away mid-series.

This is §1's silent success wearing a summary line, and it is worth its own entry
because the tempting fix — printing the load — is not enough either. The next
version printed load at the two *endpoints*, and a run that started at 18.5 and
ended at 14.9 still read as qualifying. Only sampling throughout and judging on the
**minimum** actually tests the claim.

- **Rule:** a headline may only name conditions the code evaluated. If a sentence
  says "green AND at load ≥ 15", something must be able to print `NO`.
- **Second-order:** `/proc/loadavg` is a 1-minute EWMA, so a fixed `sleep` before a
  run does not mean the load is up yet — the first strict run disqualified itself at
  13.33 for exactly that. Wait for the value, do not assume a sleep reached it.

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

### A hash tells you two things differ; only the diff tells you what (2026-08-06)

Regenerating the "v63" starter fixtures changed three of seven ROMs, and **all
seven** project / play-request / generated-source hashes. I concluded the starter
definitions had drifted, wrote it up as F13, and reported it as the blocker.

Then I decompressed the artefacts and diffed them. The seven input projects were
**byte-identical apart from a wall-clock `metadata.created`/`modified`
timestamp**. The starters had never moved. What had moved was the generated C:
`targetEngine: 63` stamps a version but builds with the templates at `HEAD`, so
the "v63 fixtures" were a v63-*era* capture that had been drifting with the
engine for twelve versions.

* **The tell I ignored:** "all seven changed" is a suspiciously uniform signal.
  Real drift in seven hand-written starter definitions would not hit every one of
  them; a timestamp would. A uniform diff across unrelated inputs points at
  something injected by the machinery, not at the inputs.
* **What made the difference:** four commands. `gunzip | python3 -m json.tool |
  diff`. I had the artefacts the whole time and reasoned about the hashes instead
  of reading the bytes. **A hash tells you two things differ; only the diff tells
  you what.**
* **Why it still ended well:** the finding was written down and the work stopped
  rather than being committed. Correcting a recorded wrong diagnosis costs one
  commit. An uncorrected one becomes the thing the next person builds on.

### A number nobody measured reads exactly like one somebody did (2026-08-08)

Two wrong numbers surfaced this week, from unrelated documents, both load-bearing:

* `native/README.md`: "the **fifteen** Qt-dependent modules by
  `pytest.importorskip`". Twelve are guarded. Fifteen was the count of red lines
  removed; three of those were tests that never needed Qt and were made to run.
* F11: "**32 suites** bypass the `try/finally` reap". ~~Three do.~~ **Twenty-three do
  — see the section added below on 2026-08-09, in which the re-measurement in this
  very entry turned out to be the worse number of the two.** Thirty-three suites
  *have* a reap, so the original 32 counted the population with the guard rather than
  the population that defeats it — it was unmeasured, and it was also nearly right.

Neither was a lie and neither was careless in the moment: each is a real count of a
real set, attached to the wrong sentence. That is what makes the failure mode hard.
**In prose, a measured number and an invented one are typographically identical.**
There is no hedge, no "approximately", nothing to make a reader pause — so the number
gets quoted onward, and by the third document it is simply a fact.

A number that is wrong does not merely misinform, it **reprioritises** — it makes work
look cheaper or dearer than it is, and that changes what gets done. The close-out plan
deferred this fix as "a 32-file harness change that deserves its own session", and that
deferral survived three passes on a number nobody had measured.

*(This paragraph originally continued "The work was three files." It is not. See the
2026-08-09 section below — the correction reprioritised it in the other direction, on
my authority, which is worse.)*

What actually helps, in order of how much:

1. **Write the command next to the number.** `21 ports shared by 42 of 110 suites
   (node tools/builder-tests/ports-unique.mjs)` can be re-run by the next reader in
   seconds. `23 suites share a port` cannot be checked at all without redoing the
   work from scratch, so nobody does. *(This example originally read "11 ports shared
   by 23 of 72 suites" — the wrong number, held up as the model of a checkable one.
   Citing a command does not make the number right; it makes the number **findable**
   when it is wrong, which is how this one was caught.)*
2. **Re-measure before you rely on a number, especially your own.** Both of these
   were mine, written days earlier, and I quoted them back confidently.
3. **Distrust round-ish numbers and numbers that justify a decision.** "32 files, so
   it needs its own session" is the shape to look at hardest — the number is doing
   the arguing.

And a trap inside the recount itself, because the obvious re-measurement was wrong
twice:

* `grep -l importorskip tests/` returns **13** files, one of which only names the
  call inside an assertion message. Counting files that contain a string is not
  counting files that do a thing.
* `gallery.mjs`'s `fail()` calls `process.exit(**2**)`, not `1`. A recount grepping
  `process.exit(1)` silently misses it — a wrong number surviving its own
  verification, which is this file's oldest theme in a new costume.

Both recounts had to be done with `ast`/structural parsing, or by reading the
control flow (`try` at 60, `finally` at 143, `exit` at 149 — that suite does *not*
leak), before they meant anything.

#### 2026-08-09 — the correction was worse than the error it corrected

The recount above is wrong. **23 suites bypass the reap, not three** — and the error
is more instructive than the original, so this entry keeps both.

The mechanism has two forms and I only searched for one:

```js
try { fail('x'); }              // exits via a helper defined outside the try — 3 suites
try { process.exit(2); }        // exits literally inside the try  — 20 suites
```

Having found the helper form first, I wrote the conclusion in terms of it — *"only a
`process.exit` inside the try leaks, **and that means a `fail()`-style helper**"* — and
that second clause silently redefined the question. Everything downstream was then
consistent with itself: I even examined `preview-capture.mjs`, asked whether its
`fail()` was called inside the try, found it was not, and **cleared it as a false
positive**. It has a literal `process.exit(2)` on line 61, inside the try, four lines
from where I was looking.

Why this is worse than the original 32:

* The 32 was inherited and unmeasured, and it was **nearly right**. It happened to be
  in the right order of magnitude for the wrong reason.
* The 3 was *mine*, freshly "measured", and published with a table headed **"What the
  re-measurement actually shows"** and a note that the deferral "was justified by a
  number that was never measured, so it is no longer justified". I used the authority
  of having measured to overturn a correct decision.
* A correction carries more weight than an original claim, because it advertises that
  someone checked. Mine reprioritised real work from "needs its own session" to
  "three-file change" and I wrote it into the plan.

**The rule this earns:** when a re-measurement *disagrees sharply* with the number it
replaces, that is the moment for most suspicion, not least. A recount that lands near
the old number is boring and probably fine. One that cuts it by 90% has either found a
real mistake or made a new one, and the two feel identical from the inside — both
produce the small satisfying click of a discrepancy resolved.

The concrete test, which costs a minute: **name the ways the thing can happen before
counting any of them, then confirm your search covers each.** Two arms here — literal
exit, helper exit. Ask "what would this search miss?" and answer it in writing next to
the number. And where the answer is cheap to get, **verify by hand**: reading `spawn`
at 74, `try` at 77, `exit` at 84, `finally` at 88 in `smb-jump.mjs` takes ten seconds
and is not fooled by a regex's blind spot.

Confirm the mechanism too, rather than reasoning about it — this is three lines:

```js
function fail(m){ process.exit(1); }
try { fail('x'); } finally { console.log('FINALLY RAN'); }   // never prints
```

#### The same day, again — and the rule that actually ends it

Straight after writing the paragraph above, I applied it to the *other* number in the
same finding: "11 ports shared by 23 suites". I named the arms first, as instructed.
The count went to 14/34. Then I checked for arms I had not named, and it went to
**21/42**. Suites spell the port five ways:

```js
const PORT = 18783;                                   // what I originally matched
const port = 18869;                                   // lowercase
const PORT_C = 18788, PORT_A = 18789, PORT_D = 18790; // three in one declaration
await H.startServer(18882, env);                      // inline, never bound
const romC = await buildWith(18871, {...});           // inline, via a helper
```

Naming the arms was an improvement and it was **not enough**, because the arms were
not enumerable by inspection — each pattern I added revealed the next. So the rule from
the section above needs a second half:

> **When successive attempts at a pattern keep finding more instances, stop counting
> and change the structure so the thing cannot vary.**

Here that is: let `run-all.mjs` assign each suite a port via `PLAYGROUND_PORT` instead
of each suite choosing one. The guard then becomes *"no suite source may contain a port
literal"* — one rule, no spellings to miss — rather than an ever-growing enumeration of
how a port might be written. Three iterations of "now I have counted it properly" is
the signal to stop counting.

The clinching detail: **the checker I had proposed as the fix for this finding had the
bug itself.** `/\bPORT\s*=\s*(\d{4,5})\b/` with `RE.exec` is case-sensitive, cannot see
`PORT_C`, cannot see an inline argument, and takes only the first match per file — so a
three-port suite counted as one. It would have reported 11 clashes and stayed silent
about 10, while carrying the authority of being the remedy. Rewritten to match any
`18xxx` literal, it exits 1 naming 21; pointed at an empty directory it exits **2**,
because a scan that finds nothing must not be able to look like a scan that found
nothing wrong.

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

### `mutate` caps a suite run at 900 s, and does not say so when it bites

`SUITE_TIMEOUT = 900` in `/usr/local/bin/mutate`, hardcoded, with no flag or env
override. A full `run-all.mjs` fits comfortably at a quiet load and does **not** fit
at host load ~30, where it stretches past fifteen minutes.

What you see when it happens is not a timeout message. `mutate-report.sh` buffers the
whole run and prints at the end, so a killed run emits *nothing*, and mutate reports:

> baseline produced no recognisable test results — refusing to mutate.

Which is the correct refusal for the input it had, and points at the adapter or the
runner rather than at the clock. The `*** timed out after 900s ***` line is in the
captured output, below the verdict — read past the summary before diagnosing.

- **Fix in the repo:** none available; it is a shared tool every container uses, so
  do not patch it locally. Run the expensive spec when the box is quiet — check
  `uptime` first, the same way you would before trusting a wall-clock figure.
- **Worth asking for on the host:** a `MUTATE_SUITE_TIMEOUT` env var, and a verdict
  line that names the timeout when that is what happened.
- **Wider point, and it is the same one as the E2E timeouts:** at high load a run
  becomes indistinguishable from a failure. Any verdict that a busy box can
  manufacture is a verdict you have to re-take when it is quiet.

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

### A destructive probe during a long run corrupts the run, not just the tree (2026-08-06)

Twenty minutes into a 110-suite builder run, I probed whether the snapshot gate
notices a deleted engine file by moving `steps/Step_Playground/cfg/nes.cfg`
aside for about two seconds. The probe worked. It also landed inside the window
where `round3-multi-bg.mjs` was linking a ROM, and the suite came back
`❌ One or more checks failed` with `ld65: Error: Cannot find config file
'cfg/nes.cfg'`.

Nothing was wrong with the engine. The run had to be thrown away and repeated
from scratch — the full cost of the shortcut, paid in full.

* **A long-running suite makes the whole working tree a shared resource.** I had
  reasoned explicitly, earlier the same session, that I must not edit engine
  files while the suite ran. Then I moved one, because a *probe* felt like a
  read-only activity. It is not: `mv` is `mv`.
* **The tell that saved it:** exactly one suite failed, at the link step, on the
  one file I had touched, with suites either side of it green. A real regression
  from a snapshot-scope change would not be that narrow or that well-timed. Had I
  not known about the probe, this would have read as a genuine v76 regression and
  cost far more than a re-run.
* **Do destructive probes on a quiet tree**, or in a scratch copy. If a probe must
  happen while something is running, it is not urgent enough to be worth it.

### The document that would have prevented it was one branch away (2026-08-12)

I spent two stretches getting the builder-test port count wrong — 11/23, then 14/34,
then 21/42 — and derived a rule from it about naming the ways a thing can happen before
counting them.

All of it was already written down — in this very file, which at the time existed
only on `main` while this branch kept its own chronological one under
`docs/guides/`. The two were merged on 2026-08-27, and the entry I needed is §1's:

> **A search pattern narrower than the thing it searches for.** `grep -o "PORT *= *[0-9]\{5\}"`
> … because three suites declare `const PORT_C = 18790, PORT_A = 18791;` and `PORT_C`
> does not match `PORT *=`. Grep for the *value space*, not the *variable name*.

Same mistake, same three suites, same correction. And it goes one further: the fix was
in `docs/guides/TEST-SERVERS.md` — also `main`-only — which said **in bold** "do not
trust a grep for `PORT =`, the suites spell it several ways" and gave the right
command. Somebody made this mistake, found the doc that would have prevented it, and
wrote the meta-lesson: *a written warning only works if it is read before the task.*

Then I made it again.

* **What it looked like:** a clean, self-contained audit. Nothing about the task said
  "someone has been here" — the branch had neither `TEST-SERVERS.md` nor this file, and
  `main` was three days and 33 commits away, which is a distance that does not feel
  like a distance. (Merging the two lessons files is half the remedy; `TEST-SERVERS.md`
  is still `main`-only.)
* **The false theory:** that "check the docs first" means *this branch's* docs. I did
  check ours. Ours did not know.
* **The cost:** two stretches, three published numbers, two corrections, and a decision
  reversed in the close-out plan on the strength of the wrong one.

**The check that would have settled it,** and it is embarrassingly cheap:

```bash
git fetch -q origin && git log --oneline HEAD..origin/main | head -40
git diff --stat HEAD...origin/main -- docs/
```

Thirty seconds, before starting any audit, on any long-lived branch. A branch that has
not merged its trunk in weeks is not a snapshot of the project; it is one **opinion**
about the project, and the other opinion may already contain your answer.

The generalisation worth keeping: **"has anyone already solved this?" has a git-shaped
answer, not just a filesystem-shaped one.** Searching the working tree feels like
searching the project. It is not.

### The native app's own traps live next to the tests that guard them

Traps specific to the native app — assert pixels not document fields, destroy
windows rather than closing them, no expensive work in an off-screen refresh, and
three more — live in [`native/README.md`](../native/README.md#six-traps-all-of-which-have-bitten)
next to the tests that guard them.

---

*Add to this file when something costs you more than about twenty minutes. Write
the false theory down too — it is the most useful part.*
