# `main` has moved 33 commits, and both branches have shipped a different `v76`

*Written 2026-08-12, from `chore/linux-native-bootstrap-v63`. Everything here is
measured; the commands are inline so you can re-run rather than trust it.*

`CLAUDE.md` has said "**`main` is merged into the native branch**" since 2026-08-06.
That was true when written and is now three days and 33 commits stale — and one of
those commits allocated an engine version this branch had already used for something
else. Nothing on this branch mentions `v77` or `v78` at all
(`grep -rln "v77\|v78" docs/ CLAUDE.md` → nothing, before this file).

## The state of the two lines

```
merge base:  09df502  2026-07-15  "docs: mark #14 done in v75"
main ahead:  33 commits, 154 files changed
this branch: 215 commits, 293 files changed
touched by both: 38 files
```

## The collision, exactly

`v75` is **byte-identical on both branches** — 30 files, same sha1s. It is the fork
point. Both lines then created a `v76` from it, meaning different things:

| | `main`'s v76 | this branch's v76 |
| --- | --- | --- |
| Dated | 2026-07-26 | 2026-08-06 |
| What it is | "Player 1's OAM cursor can no longer wrap or overrun (#37)" | "The snapshot now covers the server's ROM codegen" |
| Files | 30 | **41** |
| Engine source changed vs v75 | `pdraw_asm.s`, `platformer.c` | none — only `engine-version.js`, the constant itself |
| ROM output | changed; `_rom-equiv` re-pinned | unchanged, deliberately |
| Then | v77 (#30), v78 (#31) | — |

So `main` is at **78** and this branch at **76**, and the two `v76/` directories differ
in two engine files as well as in the eleven Python files only this branch snapshots.

**Why this is worse than an ordinary conflict.** The whole point of the version stamp,
per [`../design/engine-versioning.md`](../design/engine-versioning.md), is that a
project records `state.engineVersion` "so a future engine can fall back to the one a
game was authored for". A project stamped `engineVersion: 76` is now ambiguous: from
`main` it has the OAM fix, from here it does not. And `tools/engines/README.md` — on
this branch — states that snapshot directories are immutable, which is exactly the
rule that makes two different `v76`s unrepairable rather than merely annoying.

Verify in one command:

```bash
for r in origin/main HEAD; do
  echo -n "$r v76 files: "
  git show $r:tools/engines/v76/manifest.json | python3 -c 'import json,sys;print(len(json.load(sys.stdin)["files"]))'
done            # main -> 30, HEAD -> 41
```

## What I would do about it

**Renumber this branch's bump to `v79`, not `main`'s to anything.** The reasoning, in
case you disagree with the conclusion:

* `main` is the trunk and its v76–v78 are real engine changes that altered ROM output
  and have been published. They cannot move.
* This branch's v76 changed **no** ROM output — it is a bookkeeping bump that widened
  what a snapshot covers. Renumbering it costs nothing behaviourally, and no project
  outside this branch has ever been stamped with it.
* The immutability rule protects *published* snapshots. This one has not left the
  branch.

Concretely, after merging `main` in: delete `tools/engines/v76/` **as this branch
defines it**, take `main`'s v76/v77/v78 unchanged, set `ENGINE_VERSION` and
`engine-version.js` to **79**, move the CHANGELOG entry under a `## v79` heading with a
line saying why it moved, and re-run `node scripts/snapshot-engine.mjs` — *after*
committing, because it reads HEAD (that trap is F9).

This is code and a merge action, so it is written down rather than done.

## The conflict surface, so nobody merges this blind

38 files are touched on both sides. Thirty-one of them are inside
`tools/engines/v76/` and are the collision above — resolve those by taking `main`
wholesale and renumbering, not by merging file-by-file. The remaining seven are real
edits on both sides and want reading:

```
.gitignore                        docs/design/engine-versioning.md
CLAUDE.md                         tools/builder-tests/run-all.mjs
docs/README.md                    tools/engines/{CHANGELOG.md,ENGINE_VERSION,README.md}
```

## `main` has already done some of what this branch was going to

* **`ce26f44 test(ports): fix the 18790 double-claim and guard it in run-all.`** Main
  found that Playwright's `webServer` binds 18790 and so do three builder suites, and
  added a guard. Its commit message gives the reason as *"docs/guides/TEST-SERVERS.md
  has described this for weeks; it survived because a doc note is not a check"* —
  which is this branch's F11 conclusion reached independently.
* **`docs/guides/TEST-SERVERS.md` does not exist on this branch.** It is a `main`-only
  document that has described the port problem for weeks.

Both are reasons to merge `main` in *before* doing any more port work here, not after.

## The container provisioning exists only on this disk

Checked while looking for other divergences that a merge would resolve *cleanly but
wrongly*. This one is not a merge hazard so much as a durability one, and it touches
an action currently sitting with the owner.

```
$ git check-ignore -v .devcontainer/Dockerfile
.gitignore:13:.devcontainer/    .devcontainer/Dockerfile

$ git ls-tree -r --name-only HEAD .devcontainer/ | wc -l
0
$ git ls-tree -r --name-only origin/main .devcontainer/
.devcontainer/Dockerfile  .devcontainer/devcontainer.json  .devcontainer/init-firewall.sh
```

`main` tracks three devcontainer files and has improved them four times since the fork
(rootless Docker + egress allowlist, a repaired `claude` bin, **Chromium baked into the
image**, and binding the dev server to `0.0.0.0`). This branch tracks **none** — commit
`40b52ba` ("added devcontainer to gitignore", 2026-07-20, one line, no rationale) put
the whole directory behind an ignore rule.

The files on this disk are not main's. They are a further-developed variant that:

* installs the **Qt runtime libraries** — `libgl1 libegl1 libxkbcommon0`, the full
  `libxcb-*` set — which `main`'s Dockerfile does not (`grep -c "libxcb\|libgl1\|libxkbcommon"`
  against `main`'s Dockerfile returns **0**);
* adds `python3-venv python3-dev`, and a `postCreateCommand` running
  `post-create.sh`, which builds the `nes_core` wheel from Rust source and creates
  `native/.venv` — *the venv that `CLAUDE.md`'s documented native test command
  depends on, and which does not exist in this container.*

So the provisioning that would let the UI layer be tested rather than skipped — the
161 skips, the largest uncovered surface on this branch — is **not in the repository at
all**. It is four untracked files on one disk, and because the ignore rule is in force,
`git add .devcontainer/post-create.sh` says nothing when it declines. Whoever wrote
them may reasonably believe they are committed.

**Scope this correctly.** The owner's pending rebuild (`devcontainer up
--workspace-folder … --remove-existing-container`) reads `.devcontainer/` from the
workspace **on disk**, so it will work here today. The exposure is that the config
cannot be reviewed, cannot reach `main`, and does not survive a fresh clone or a lost
container.

It is also the same bug as F5 wearing different clothes: a broad ignore pattern
swallowing files a documented workflow depends on. Note how `main` hit the same mess —
its `*.bak-*` rule was added because of `.devcontainer/Dockerfile.bak-tools-174621`,
which is sitting on this disk right now — and solved it *narrowly*, by ignoring the
backups. This branch solved it *broadly*, by ignoring the directory, and lost the
configuration.

**Suggested resolution** (not applied — it changes what is tracked, which is the
owner's call):

1. Drop `.devcontainer/` from `.gitignore`; keep `main`'s `*.bak-*`, which already
   covers the only files that genuinely should not be committed.
2. Track `Dockerfile`, `devcontainer.json`, `init-firewall.sh`, `post-create.sh`.
   Checked for credential-shaped content (`token|secret|password|api_key|BEGIN
   .*PRIVATE|ssh-rsa`) — nothing matched in any of the four.
3. On merge, **union** the two Dockerfiles rather than choosing: this branch's Qt libs
   and venv bootstrap, `main`'s pinned `PLAYWRIGHT_VERSION`, firewall handling and
   `claude`-bin repair. Neither side is a superset.

Doing (1) and (2) would also close close-out plan step 7 ("Run the Studio E2E — never
executed here, no Chromium"): both Dockerfiles already bake Chromium, so that blocker
is a rebuild away rather than an open question.

## A correction this forces to my own port finding

F11's port analysis on this branch scanned `tools/builder-tests/*.mjs` and concluded
**21 ports shared across 42 suites**. That is still an undercount, and the reason is
instructive: `playwright.config.js:13` binds

```js
const PORT = Number(process.env.STUDIO_TEST_PORT || 18790);
```

— a **sixth** spelling of a port claim, in a file my scan never opened, clashing with
three builder suites that claim 18790. I had already written that the arms were not
enumerable by inspection and that the fix was structural rather than a better pattern.
I then bounded the scan by directory and reported the number anyway. The directory was
one more unstated assumption of exactly the kind the finding is about.

It strengthens the recommendation rather than weakening it: a rule of the form *"the
runner assigns every test port"* covers Playwright and the builder suites together,
whereas any amount of scanning covers whatever you remembered to scan.

---

Related: [`2026-08-06-overnight-review-findings.md`](2026-08-06-overnight-review-findings.md)
(F11 and the gate findings), the close-out plan's merge steps in
[`../plans/current/2026-08-06-close-out-native-branch.md`](../plans/current/2026-08-06-close-out-native-branch.md),
and [`../guides/LESSONS_LEARNT.md`](../guides/LESSONS_LEARNT.md).

---

# `run-all.mjs` merges cleanly — and that is the thing to check, not to trust

*Added 2026-08-12, continuing the sweep for divergences a merge would resolve cleanly
but wrongly. A conflict is loud and safe; a clean auto-merge of two incompatible
changes is silent, so the clean ones are where to look.*

A real three-way merge of the gate itself (`git merge-file`, into a scratch directory,
nothing in the repo touched):

```
base 689 lines   main 756   this branch 698   merged 765   conflicts: 0
```

**The good news, checked rather than assumed.** Extracting every `check('…')` label from
all four versions: base has 26, `main` 28, this branch 26, and the merged file has all
**28** — nothing from either side is dropped. This branch added no new checks to the
runner (its +9 lines are elsewhere), which is why the merge is clean.

## `main`'s two new checks, run against this branch's tree

Not reasoned about — extracted from the merged file with a `check()` shim and executed:

```
RED   no builder-test suite claims the Studio E2E port
      port 18790 belongs to the Studio E2E server (playwright.config.js)
      but is also claimed by: asm-corpus.mjs, asm-player.mjs, asm-realproj.mjs
RED   devcontainer Playwright pin matches package-lock.json
      .devcontainer/Dockerfile: ARG PLAYWRIGHT_VERSION not found
```

The first is the guard working exactly as intended, and it names the same three suites
this branch's F11 found independently. It resolves on merge: `main` changed all three
(`asm-corpus` → 18895, `asm-realproj` → 18896, `asm-player` keeps 18788) and this
branch changed none of them, so the merge takes `main`'s fixed versions and the check
goes green. Verified with `git diff --quiet BASE main -- <file>` against the same for
`HEAD`.

The second fails for a reason that has nothing to do with drift: this disk's untracked
Dockerfile pins Playwright with `npm install -g playwright@1.61.1`, not `ARG
PLAYWRIGHT_VERSION=`, so the check cannot find what it looks for.

## The part that matters: both new checks pass vacuously on a tree missing their subject

Run the same two checks against a tree with no `.devcontainer/` and an empty
`tools/builder-tests/` — which is what a **fresh clone of this branch** is, since
`.devcontainer/` is gitignored here:

```
PASS  no builder-test suite claims the Studio E2E port
PASS  devcontainer Playwright pin matches package-lock.json
anyFail = false
```

Green, twice, having inspected nothing. The Playwright check says so in its own
comment — *"Skipped when the devcontainer is absent"* — which is a defensible choice on
`main`, where the devcontainer is tracked and therefore never absent. Merged into this
branch it becomes a permanent silent pass, because here the subject of the check is not
in the repository. **That is F5 arriving through a merge rather than through a
mistake:** a gate that is sound in the tree it was written for, and decorative in the
tree it lands in.

It is also a second, independent argument for tracking `.devcontainer/`: doing so is
what makes `main`'s new guard mean something here. Two reasons now — durability, and
un-vacuum-ing a gate.

## The two port checkers are complementary; take both halves

`main`'s guard and the rewritten Appendix 3 checker each close a gap the other leaves:

| | `main`'s in-runner check | Appendix 3 checker |
| --- | --- | --- |
| Strips `//` and `/* */` before matching | **yes** — prose about the clash cannot trip it | no — over-reports on comments |
| Asserts the scan actually ran | **no** — an empty directory passes, as above | yes — exits 2, "the scan did not run" |
| Scope | the one E2E port, across suites | every `18xxx`, all pairs |
| States its own limit | **yes**, in a comment: a green means "no suite *names* the port", not "no suite can bind it" | yes |

`main`'s honesty about the arithmetic case (`PORT + 1`) is the same limitation this
branch documented as "the arms are not enumerable by inspection", reached independently
and written down in the right place — next to the check. The merged tree wants
`main`'s comment-stripping **and** a floor assertion, and ultimately the structural fix
that removes hard-coded ports altogether, after which both checks reduce to one
unambiguous rule.

---

# Sweep finished: the remaining shared files, and the one that merges silently wrong

The seven non-`v76/` files touched on both sides, all three-way merged in a scratch
directory (`git merge-file`, nothing in the repo touched):

| File | Merge result |
| --- | --- |
| `.gitignore` | clean — `main` adds only `*.bak-*`, so this branch's `!native/tests/fixtures/**/*.nes` negation survives. Checked because that negation is what makes the ROM contract test executable at all. |
| `tools/builder-tests/run-all.mjs` | clean, all 28 checks retained (previous section) |
| `tools/engines/{CHANGELOG.md,ENGINE_VERSION}` | the v76 collision, covered above |
| `tools/engines/README.md` | **1 conflict** — loud |
| `docs/README.md` | **1 conflict** — loud |
| `CLAUDE.md` | **1 conflict** — loud |
| `docs/design/engine-versioning.md` | **no divergence** — `main` never touched it (187 lines both sides) |

Three conflict loudly and are therefore safe. The last row is the dangerous one.

## The false statement that a clean merge would preserve

Both `tools/engines/README.md` and `docs/design/engine-versioning.md` carry a
"two eras" table this branch wrote:

> | **v1 – v75** | 30 files, no Python |
> | **v76 onward** | plus `tools/nes_studio_core/` |

`main` never edited `engine-versioning.md`, so that table merges through untouched —
and the merge itself makes it **false**, because `main`'s v76, v77 and v78 are all
30-file snapshots with no Python. The document would then assert something wrong about
three published versions, with nothing anywhere to contradict it.

`tools/engines/README.md` does conflict — but on a different hunk entirely, about
whether to quote the current version number in prose. So git raises the cosmetic
disagreement and passes the substantive falsehood through in silence. That is this
whole document's thesis in one file.

The irony is worth keeping: `main`'s side of that very conflict is

> The authoritative current number is `ENGINE_VERSION` in this directory —
> deliberately not repeated here, because **a hard-coded version in prose goes stale
> the next time one ships.**

`main` is right, this branch's side is the one that hard-codes, and the staleness
`main` warns about is exactly what the untouched table two screens above is about to
suffer.

**Fixed now, in a form that cannot recur.** Both documents state the rule derived from
the artefact rather than as a version range — *a snapshot covers the codegen iff its
own `manifest.json` lists files under `tools/nes_studio_core/`* — with the one-line
command that answers it, run verbatim before shipping (on this branch today: v76 only,
41 files). Any version number is now labelled a *result*. This is the same move as
letting the runner assign ports: derive the fact from the thing, don't restate it in
prose where it can drift.

Take `main`'s wording on the conflicted hunk when merging.

---

# There are two lessons files, they will not conflict, and neither reader will know

```
main:        docs/LESSONS-LEARNT.md        249 lines, created by 6f7b079
this branch: docs/guides/LESSONS_LEARNT.md 600+ lines, created by 6ba5496
```

Different directory, different separator (`-` vs `_`), created independently within
days of each other. They are not a rename of one another, so **git will merge them
both in without a murmur** and the repo will carry two lessons files. `CLAUDE.md` and
`docs/README.md` on this branch point at ours; `main`'s point at theirs. Whichever a
reader finds first, they will have no reason to suspect the other exists — and a
lessons file that is only half the lessons is precisely the "stale list gets trusted"
failure it is written to prevent.

They are also organised differently, and `main`'s is better: grouped **by the shape of
the mistake** ("Checks that report clean because they never ran properly", "Two lists
that must agree, with nothing checking that they do", "Assuming an outcome instead of
measuring it") rather than by date, on the stated grounds that *the shape is what
recurs*. Ours is chronological, which makes it a diary — fine for provenance, poor for
lookup. **Merge ours into `main`'s taxonomy**, keeping `main`'s path and structure.
Our dated entries slot into its six headings almost without residue, which is itself
evidence the taxonomy is the right one.

## What `main` already knew, that I spent this week rediscovering

Reading it is uncomfortable and worth recording precisely.

**`main` documents my exact mistake, including the fix.** Under "Checks that report
clean because they never ran properly":

> ### A search pattern narrower than the thing it searches for
> Auditing which ports the builder-test suites claim, with
> `grep -o "PORT *= *[0-9]\{5\}"`. Clean result, no conflicts — because three suites
> declare `const PORT_C = 18790, PORT_A = 18791;` and `PORT_C` does not match `PORT *=`.
> — **What would have told us sooner:** grep for the *value space* (`18[78][0-9][0-9]`),
> not the *variable name*. When auditing "what claims X", match X.

That is the same error, the same three suites, and the same correction I arrived at
over two stretches and three wrong numbers. And it continues:

> **The uncomfortable part:** `docs/guides/TEST-SERVERS.md` already said, in bold,
> *"Do not trust a grep for `PORT =` — the suites spell it several ways"*, and supplied
> the correct command. The doc was right and had been right for weeks; it was simply
> not read before the audit that it existed to prevent. **A written warning only works
> if it is read before the task, not after the mistake.**

So the lesson `main` drew from making this mistake is *read the existing document
first*, and I then made the same mistake, in the same area, without reading either the
document or the lesson — neither of which is on this branch. That is not an excuse: I
knew `main` existed and had not looked at it for three days.

**Two more that overlap directly:**

* *"A regex guard that matched its own explanatory comment"* — `main` found this in
  `round2-dialogue.mjs` and **fixed** it by stripping comments before matching. That is
  F14 and F17 exactly, and both are still open here. `main` has solved this class once
  already; the fix belongs in our two guards too.
* *"A green snapshot check does not mean your tree is clean"* — `main` broke that gate
  four ways on 2026-08-06 and it caught three. Same exercise, same day, same conclusion
  as our probe A.

**And one thing `main` knows that changes a severity here**: the real cost of a shared
port is not the loud socket error I documented, but a silent one —
`playground_server.py` finding a healthy server already on the port prints
`already running -- nothing to do` and **exits 0** without binding, discarding the
caller's environment. Verified in this branch's own copy at lines 2428-2436. Recorded
against F11.

The practical conclusion for whoever merges: **`main`'s documentation is not a
duplicate of ours to be discarded. In at least four places it is ahead of us, and in
one it corrects us.**

---

# Reading `TEST-SERVERS.md` — what it corrects on both sides

Applying the lesson from the previous section rather than only writing it down: I read
`main`'s `docs/guides/TEST-SERVERS.md`, the doc whose absence here cost two stretches.
It corrects this branch **and** `main`.

## It corrects me, and reduces the work

> The runner (`run-all.mjs`) executes suites **one at a time** (`spawnSync` in a loop),
> so several suites sharing a port is deliberate and harmless — about a dozen pairs do.
> Only concurrent runs collide.

I treated 21 shared ports across 42 suites as a defect needing remediation. It is a
deliberate, documented choice, and sequential execution makes it safe. My framing was
wrong.

But `main`'s reasoning has an unstated premise — **that every suite reaps its server** —
and 23 do not. Combining both facts, ordered by how `run-all` actually executes
(`.sort()`, line 673):

```
18792:  asm-ai-corpus -> asm-vscroll -> shared-play* -> smb-render*    (* = can leak)
```

**Exactly one** of the 21 shared ports has a leak-capable suite running *before*
another suite on that port. Elsewhere the sharers never leak, or the leaker runs last
where a leaked server has nobody left to mislead. And that one pair sets only
`PLAYGROUND_PORT` — no env overrides to lose — and only arises after `shared-play` has
already failed.

Neither document had this: `main`'s says "harmless" (assuming the reap), mine said
"42 files" (not knowing the runner is sequential). The answer is one pair, and the real
fix is the one `main` already wrote down and left unapplied — make `startServer` assert
its child survived and poll `/health` instead of sleeping 1.5s, which converts the
entire class into a loud failure at the point of cause.

## It corrects `main`, in the fix for this very problem

`main`'s new guard tells you where to put a new suite's port:

```
run-all.mjs:137      'Give each suite a free port above 18894, staying under 19000.'
TEST-SERVERS.md:140  Take the next free port **above 18897** (the current highest)
```

18895, 18896 and 18897 are all taken on `main` — they are where `asm-corpus`,
`asm-realproj` and `asm-player` were moved *by the commit that added the guard*. So
following the guard's own remediation advice lands you on an occupied port. Two lists
that must agree, disagreeing, inside the fix for a finding about two lists that must
agree. The error message wants to say **18897**.

## A seventh spelling, arriving with the merge

> Do not trust a grep for `PORT =` … (`PORT`, `PORT_C`/`PORT_A`/`PORT_D`, an inline
> `startServer(18882)` in `physics-globals.mjs`, and **`PORT + 1` in `enemy-bump.mjs`**)

`enemy-bump.mjs` claims 18854 without the number ever appearing as a literal. Checked:
this branch has **no** arithmetic ports (`grep -rnE "PORT\s*[+\-]\s*[0-9]"` → nothing),
so the "any `18xxx` literal" scan really is a superset *here, today*. It stops being one
the moment `main`'s four extra suites merge in. The conservative scan is not a
permanent answer, only a currently-sufficient one — which is the argument for the
runner assigning ports, again, from a third direction.

## Two other things worth carrying

* **The builder range is 18768–18897**, not 18768–18894 as this branch's notes have it.
* **`0.0.0.0` in a container is not a widening.** `TEST-SERVERS.md` explains why the dev
  server must bind all interfaces (Docker delivers a published port to the container's
  *interface*, not its loopback) and why that is safe. This branch's untracked
  `start.sh` sets `PLAYGROUND_HOST=0.0.0.0` by hand — it is a local workaround for
  something `main` fixed properly in `devcontainer.json`'s `containerEnv`.

## `main`'s lessons §3–§6 — three more corrections, and one method we can use

### §4 turns our open owner question into an answerable one

This is the most useful thing in the file for this branch. `main`, on a golden ROM hash
that moved:

> The tempting move is to paste the new hash in. That records the change without proving
> its cause. **What was done instead:** rebuilt with the *old* `builder-modules.js`
> (`git show fac8ac2:…`) and confirmed it reproduced the old hash exactly, proving the
> new hash came from this change and nothing else. **Re-pinning a golden value is only
> safe when you have shown sole causation.** Otherwise you have laundered an unrelated
> regression into the baseline.

We have exactly that situation open and have been treating it as a *decision*: three
starter ROMs (`smb`, `runner`, `geodash`) changed between v63 and v75, recorded in
[`2026-08-06-starter-fixture-rebaseline.md`](2026-08-06-starter-fixture-rebaseline.md),
with "whether that was intended is an owner question" carried forward for a week.

It is at least partly a **measurement**, and `main` has the procedure: bisect the engine
versions, rebuild each starter at the version before and after each candidate change,
and find the version where each ROM moved. If each drift lands on a version whose
CHANGELOG entry explains it, the answer is "intended" without anyone having to remember.
If one lands on a version claiming "goldens UNCHANGED", that is a real finding.

Not run here — it is a cc65 build per fixture per version, which is exactly the heavy
work this box is not for. But it converts an indefinite owner decision into a bounded
job for a machine that can build, and that is worth knowing before asking again.

### §5 caught a check I had published — and its obvious fix was wrong too

> `pgrep -f` matches the shell that is running it.

F11 proposed `pgrep -af playground_server.py | grep -E '187[0-9]{2}|188[0-9]{2}'`.
Tested it: it returned clean — **by luck**. The invoking shell's command line does
contain `playground_server.py`, but the port filter `187[0-9]{2}` does not match the
literal characters `187[0-9]{2}` sitting in that same line. Spell the ports out and it
self-matches.

The obvious fix — `main`'s own bracket pattern, `awk '/[p]layground_server\.py/'` —
**also false-positived**, immediately, in the very command that introduced it. The
bracket trick hides the *pattern* from itself; it does nothing about the *target
string*, and a command that checks for leaked servers necessarily contains both the
process name and the port range in its own arguments.

Replaced with a check that asks the kernel instead of `ps`: read `/proc/net/tcp` for
sockets in `TCP_LISTEN` and report any in 18768–18897. Proven both directions (clean →
exit 0; bind 18800 → exit 1) and it exits **2** if it sees no listening sockets at all.
In Python, not `awk`, because this container's `mawk` has no `strtonum` — which is
`main`'s §1, and is how a `/proc/net/tcp` parser once reported "nothing is listening"
about a server that was.

**The generalisation, which belongs in whichever lessons file survives the merge:** a
check whose subject appears in its own command line cannot be made safe by escaping the
pattern. Ask a different oracle. For "is a server leaked", the kernel's socket table is
the oracle; the process list is a proxy that happens to include your own question.

### §6 has a note that its own branch has since falsified

> **Never run the E2E suite and the builder tests at the same time.** They share 18790
> and it fails silently (§2).

They no longer share 18790 — `ce26f44` moved the three suites to 18895–18897 and added
the guard, on the same branch. The advice may still be sound on a four-core box, but
the stated reason is now false, and it sits two sections below the entry describing the
fix. Worth correcting when the files are merged: this is the "stale list gets trusted"
shape, inside the file about that shape.

### §3, for the record, matches our experience

*"If the failures do not touch your diff, suspect the environment before the code"* —
and host load is invisible from inside the container. Worth remembering when the Qt
suite finally runs here: a slow first run after the rebuild is more likely to be the box
than the code.
