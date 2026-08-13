# Mutation specs — proving the guards can fail

A guard nobody has watched fail is decoration. These specs plant a break on purpose and
assert that a **named** assertion goes red.

```bash
mutate tests/mutations/guards.json            # run every break
mutate tests/mutations/guards.json --list     # what it would do, and what each must turn red
mutate tests/mutations/guards.json --only snapshot-include-list-removed
```

Run from the repository root (the tool mutates paths relative to `$MUTATE_ROOT`, which
defaults to the working directory).

## Why this is a tool and not a checklist

Every guard on this branch was originally proved red by hand: edit a file, clear the
bytecode cache, run the suite, read the output, restore the file, verify the restore.
Six steps, **no feedback when one is skipped** — which is the definition of a tooling
gap rather than a discipline gap. Doing it by hand went wrong twice here in one week:

* a restore silently did not happen (`git checkout --` run from the wrong directory
  prints its complaint and changes nothing, and the message lands right after a red
  assertion, where it reads as part of it);
* the git-ignore probe was a **no-op** — `git check-ignore` never reports a tracked
  file, so the "break" could not have changed the result either way.

`mutate` fails the run if a named assertion stays green, if the break produced no
failure anywhere, if the anchor matched zero times or more than once, if the baseline
was not green before mutating, or if the file did not come back byte-identical.

## What the run has already found

`snapshot-include-list-removed` **stayed green** the first time it ran, confirming F14
independently: the guard matched a substring of raw source, so deleting the
`'tools/nes_studio_core'` entry and leaving a comment that named the path satisfied it.
The guard now matches string *literals* with comments stripped, and the same break turns
it red.

## Adding a break

* `find` must match **exactly once** — the tool enforces this, in both directions.
* `expect` must name assertions the suite actually reports; a name that does not exist
  is rejected before anything is edited, because it would otherwise never go red and
  read as the code's fault.
* A break that genuinely should *not* be caught is recorded with `expect_none_because`
  rather than left out.

Assertion names come from `unittest -v` output, so the command runs the guard modules
under `python -m unittest`, not pytest. It uses the pipx interpreter
(`/root/.local/pipx/venvs/pytest/bin/python`) because the modules import `pytest` and
the system `python3` has no such module — a pipx install exposes only the console
script.

## Known gap

`test_no_fixture_file_is_git_ignored` has **no break here**, and cannot have one made of
a text substitution: `git check-ignore` is index-aware and never reports a tracked file,
so no edit to `.gitignore` can make it fail while the fixtures stay committed. Breaking
it requires creating an untracked file whose extension is ignored. Recorded rather than
faked — an absent break is honest, a break that cannot fail is the thing this directory
exists to stop.
