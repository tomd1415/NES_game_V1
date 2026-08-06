# Starter fixtures: what the v63 baseline recorded, before it was replaced

Written 2026-08-06. This file exists so that re-baselining the phase-0 starter
fixtures does not erase what the previous baseline said. It is committed
**before** the re-baseline, deliberately, and is the only surviving record of the
pre-existing hashes in a readable form.

The re-baseline itself is the commit immediately after this one.

Origin: F13 in
[`2026-08-06-overnight-review-findings.md`](2026-08-06-overnight-review-findings.md).
**That finding's conclusion was wrong, and this file corrects it** — see
"Correction" below.

---

## 1. What was recorded (the v63 manifest, verbatim)

`native/tests/fixtures/phase0/starters/manifest.json` at commit `3d2ad63`,
`engine_version: 63`. Every ROM is 49168 bytes.

| Fixture | `rom_sha256` |
| --- | --- |
| basics | `4d11fa59045c4fc6dd9f6edf0d65bfbb4f868e1a401138067e317d3cba5e829b` |
| geodash | `4a4415746ac53375724a2b1c5040f11a45025aa8f4d50167e54ea3ac38685ab8` |
| racer | `a4e1c538a7f11a38fdb50da83abdc22634873015f4fcc742bc7e959c7d5fb816` |
| runner | `8bfefb002b4e9f5f31e3a8fa2ed0db737820f73650c7549526c0e43ecb95c6f3` |
| scratch | `15478717180594537ad14319026f1d62e49b1cb6dd5d7d66f60d9727c3fe5d5d` |
| smb | `4427934de87af620e4ad892712c7231744318fde2dcc1c97c2ce52735d82d39b` |
| topdown | `3bf0d377e28897c57f248bc1f8467a3d2a869f7ea36b6e70b419b93b776ddcf8` |

The full manifest, including the project / play-request / generated-source
hashes, is recoverable at any time with:

```
git show 3d2ad63:native/tests/fixtures/phase0/starters/manifest.json
```

## 2. What the same generator produces now

`node native/tests/contract/generate_phase0_starters.mjs`, run at commit
`3d2ad63`. The generator pins `NES_TARGET_ENGINE = 63` and sends
`targetEngine: 63`, so this *ought* to reproduce section 1 byte for byte.

**Three of the seven ROMs differ:**

| Fixture | v63 recorded | Regenerated at `3d2ad63` | |
| --- | --- | --- | --- |
| basics | `4d11fa59045c…` | `4d11fa59045c…` | same |
| racer | `a4e1c538a7f1…` | `a4e1c538a7f1…` | same |
| scratch | `154787171805…` | `154787171805…` | same |
| topdown | `3bf0d377e288…` | `3bf0d377e288…` | same |
| **smb** | `4427934de87a…` | `30fae8aed339…` | **differs** |
| **runner** | `8bfefb002b4e…` | `890944e9093d…` | **differs** |
| **geodash** | `4a4415746ac5…` | `414f2a8090bb…` | **differs** |

Sizes are unchanged at 49168 bytes throughout.

**This is reproducible, not flaky.** The generator was run twice; both runs
produced identical hashes for all seven fixtures, including the three that
differ from the baseline.

## 3. Correction to F13

F13 concluded that the differing hashes meant *"the input projects have moved,
pointing at `studio-starter.js` / `default-state.js`"*. **That was wrong.** The
input projects have not moved at all.

Decompressing and diffing all seven `project.json.gz` against their committed
versions gives **4 changed lines each, and all four are timestamps**:

```json
 "metadata": {
-    "created":  "2026-07-10T21:51:29.097Z",
-    "modified": "2026-07-10T21:51:29.097Z"
+    "created":  "2026-08-06T22:02:10.113Z",
+    "modified": "2026-08-06T22:02:10.113Z"
 }
```

Nothing else in any of the seven projects differs. The starters are intact. The
project / play-request hash churn across all seven was a **wall-clock timestamp
baked into the artefact**, and nothing more — which also makes those three hash
columns unusable as a change signal until the timestamp is stripped or frozen.

## 4. What actually changed, then

The generated C. `main.c` differs by ~570 lines per fixture, and the added
content is **v74/v75 engine template material** — e.g. a `BW_SFX_EVENTS` block
whose own comment reads:

> *"All of it compiles out when `BW_SFX_EVENTS` is undefined, so every project
> without event sounds — and every golden ROM — is byte-identical."*

So the real finding is this:

> **`targetEngine: 63` does not build with the archived v63 engine.** It stamps
> the version into the project and is otherwise built by the codegen and
> templates at current `HEAD` (v75). The "v63 fixtures" were never re-derivable;
> they are a v63-*era* capture, and have been silently drifting with the engine
> ever since.

Most of the v63→v75 template growth is `#ifdef`-gated and does compile out, which
is why four of the seven ROMs are byte-identical across twelve engine versions —
the "gate new behaviour behind an off-by-default flag" discipline in `CLAUDE.md`
is visibly working. But for **smb, runner and geodash** something in that range
changed ROM output.

## 5. Open question for the owner

**Is the smb / runner / geodash ROM change intended?**

I could not answer it from here, and I did not guess. What I can say:

- It is not audio: none of the seven has an SFX pack, and `BW_SFX_EVENTS` /
  `USE_AUDIO` are undefined in all seven generated sources.
- It is not any single scalar project setting. I compared every boolean, string
  and integer field of the seven play-requests looking for one that separates
  {smb, runner, geodash} from {basics, racer, scratch, topdown}. **None does.**
  Whatever the trigger is, it is structural (level size, sprite count, a nested
  feature block) rather than a flag.

Answering it needs someone who knows what changed between v63 and v75 —
`tools/engines/CHANGELOG.md` is the place to start, and
`tools/engines/v63/` still holds the archived engine to diff against.

Until it is answered, the re-baseline that follows this commit pins **current**
behaviour. If the change turns out to be a regression, this file is what tells
you which three starters to look at and what they used to produce.

## 6. Related, still unfixed

A fixture labelled "engine v63" is only half-pinned while `targetEngine` pins the
version stamp and not the engine that builds it. Either the generator should
build from `tools/engines/v63/`, or the fixtures should stop claiming a version
they are not built with. The re-baseline takes the second option — it names the
commit instead — but the first is the one that would make the label mean
something.
