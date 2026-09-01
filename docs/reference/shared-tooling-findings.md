# Findings in the shared fleet tools (`preflight`, `mutate`)

**For whoever maintains `/usr/local/bin/preflight` and `/usr/local/bin/mutate`.**
Written 2026-08-13 from the `nesgame` container. Self-contained — no knowledge of
this project is needed to act on any of it. Nothing here is urgent, nothing here
blocks us, and we have changed neither tool.

Both tools are good, and all three findings were only visible *because* they fail
loudly elsewhere. Two were found while using them as intended; the third was found by
testing a command before documenting it.

---

## 1. `preflight`'s Python coverage cannot fire

**Severity: worth fixing.** A clean Python result currently means "no detector could
look", not "nothing found" — which is the exact distinction `preflight` exists to
enforce.

Two of the six detectors list `*.py` in their `files` tuple:
`sudo-with-redirect` and `git-checkout-to-undo`. But `scan_text()` calls
`strip_noise(..., python=is_python(path))`, which **blanks string literals** for
Python. In Python, both of those traps occur essentially *only* inside strings —
`os.system("git checkout -- x.py")`, a `subprocess` list, a shell string built for
`sh -c`.

Reproduce:

```python
import types
src = open('/usr/local/bin/preflight').read().split('def main(')[0]
mod = types.ModuleType("pf"); exec(compile(src, 'preflight', 'exec'), mod.__dict__)
det = [d for d in mod.DETECTORS if d["id"] == "git-checkout-to-undo"]

bare  = 'git checkout -- scripts/scheduler.py\n'
inpy  = 'import os\nos.system("git checkout -- scripts/scheduler.py")\n'
print(bool(mod.scan_text(bare, "x.py", det)))   # True  — fires
print(bool(mod.scan_text(inpy, "x.py", det)))   # False — does not
```

The string-stripping itself is **correct and deliberate** — it is what stops a
detector firing on the prose that documents it, and that protection matters. The gap
is only that Python-shaped call sites were never given a Python-shaped pattern.

Possible fixes, in the maintainer's order of preference:
- add patterns that match the traps *as they appear in Python* (inside a string
  argument to `os.system`/`subprocess`), or
- have `--list` state plainly that these detectors are shell-only in practice, so a
  clean Python scan is not read as coverage.

## 2. `preflight --self-test` exits 1 in any repo but the one where the incident happened

**Severity: cosmetic, but it discourages running the self-test at all.**

`self_test()` asserts that every commit sha cited in a detector's `incident` string is
reachable in the repo being scanned:

```python
for sha in re.findall(r"\b(?=[0-9a-f]*\d)([0-9a-f]{7,40})\^?\b", d["incident"]):
    if not commit_exists(sha):
        bad.append((d["id"], f"cites {sha}, which is not in this repository", ...))
```

`rsync-unanchored-exclude` cites `43dd216`, which is a Godot project's commit
(`ArtRegistry`, `scripts/core/`). It cannot exist here, so we get
`1 detector problem(s)` and exit 1 on every run — while all three *logic* assertions
(fires on its own incident, quiet on sound code, quiet on prose describing itself)
pass for every detector.

The intent is clearly right: a citation that no longer resolves is evidence the tool
cannot produce. It just does not generalise to a fleet-wide tool shipped into many
repos. Options: make the citation check advisory outside the originating repo, scope
it to a fleet-wide history, or record the origin repo alongside the sha.

The risk of leaving it is specific: someone reads `1 detector problem(s)`, concludes
the scan is untrustworthy, and stops running `--self-test` — losing the part that
actually re-proves the detectors.

## 3. `mutate --list` exits 0 on a spec path that does not exist

**Severity: small.**

```
$ mutate --list does-not-exist.json ; echo "exit=$?"
does-not-exist.json: [Errno 2] No such file or directory: 'does-not-exist.json'
exit=0
```

The error *is* printed, so a human sees it — but the exit status says success, so
`mutate --list spec.json && …` proceeds on a typo. A real run with the same bad path
correctly exits 1; only the `--list` path disagrees with itself.

Worth noting how this was found, because it is the same lesson the tools teach: I ran
the command with `>/dev/null 2>&1` first, saw exit 0, and wrote "silently succeeds" —
which was wrong. I had suppressed the very message I was claiming did not exist. The
real bug is narrower and still real: the message and the exit code disagree, and only
one of them is machine-readable.

---

## What we did with these

Recorded in `docs/LESSONS-LEARNT.md` and carried on. `preflight --all` over this
project is clean (0 findings, 17 files) and we proved that result is not vacuous by
planting a detector's own fixture and watching it go red. `mutate` is in routine use
here with two checked-in specs and has caught real hollow guards.
