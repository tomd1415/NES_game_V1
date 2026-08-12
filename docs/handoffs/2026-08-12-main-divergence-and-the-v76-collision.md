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
