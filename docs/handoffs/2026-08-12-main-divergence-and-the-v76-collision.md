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
