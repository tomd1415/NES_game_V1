# ADR: Native Linux app is a second sibling product over frozen contracts

**Date:** 2026-07-10 · **Baseline:** engine v63 · **Owner:** `@tomd1415`

**Status:** Accepted for *direction*. The QJSEngine mechanism (below) is
provisional pending the Phase 3 go/no-go spike. Full detail and the phased
delivery plan live in
[`../linux-native/2026-07-10-linux-native-migration-plan.md`](../linux-native/2026-07-10-linux-native-migration-plan.md);
day-to-day rules live in [`../../../CONTRIBUTING.md`](../../../CONTRIBUTING.md).
This ADR records only the load-bearing decisions and the alternatives rejected,
so the "why" survives independently of the much longer plan.

## Context

A separate team will build a genuine native Linux desktop application while the
browser app continues to be developed and shipped. The repository's hardest-won
asset is not its UI — it is the **project→ROM contract**: the canonical JSON
project schema plus 63 versioned engine snapshots and the deterministic
Builder/cc65 pipeline that turns a project into a byte-stable ROM. Any native
effort that risks that contract is not worth doing.

## Decision

1. **Two permanent sibling products, one repo, one `main`.** The native app is
   an *addition*, not a cutover. The web app (`tools/tile_editor_web/`) remains
   supported with its own release path; the native app lives under `native/`.
   Neither may silently change the shared JSON or ROM contract for the other.
   No permanent `web`/`native` branches — those would let shared engines and
   fixtures drift.

2. **Freeze the contracts; rewrite only the UI.** The native app loads/saves the
   *same* project JSON (unknown fields round-trip), builds through the *same*
   engine snapshots, and must meet the *same* ROM/behavior contracts. What gets
   rewritten is the presentation layer (HTML/CSS/DOM/Canvas/localStorage) — not
   the data model or the build core.

3. **Extract a transport-neutral Python build core** out of
   `playground_server.py` (4,421 lines today). The web app keeps an HTTP adapter
   over that core; the native app calls it directly. Both adapters get permanent
   contract tests so a core change can't break one target while passing on the
   other.

4. **PySide6 / Qt 6 Widgets** for the native UI (QPainter/QGraphicsView editors,
   QUndoStack, SQLite + XDG persistence, worker-thread builds). A genuinely
   native interface — native menus, dialogs, accessibility, no browser engine.

5. **The QJSEngine bet (provisional).** Preserve the *versioned JavaScript
   Builder codegen* (`builder-assembler.js` + `builder-modules.js`) by running
   it in Qt's embedded QJSEngine, rather than porting 62 historical generators
   to Python. Evidence supports the premise: those scripts already run headless
   under Node with only `window = globalThis` — no DOM/localStorage/fetch. The
   residual risk is narrower — whether QJSEngine's ES coverage matches what the
   V8-authored scripts use — and is gated by an explicit Phase 3 spike across all
   63 snapshots with a byte-for-byte Node differential and a documented go/no-go.

## Alternatives rejected

- **Electron / Tauri / Qt WebEngine / GTK WebKit.** Fastest to an installer, but
  the interface stays HTML/CSS/JS in a browser engine — it fails the stated
  "not a web app" requirement.
- **Full Python rewrite of the Builder codegen.** Would discard the QJSEngine
  risk but forfeit 62 proven, byte-stable generators and their rollback story.
  Held as the fallback *only if* the Phase 3 spike fails broadly.
- **Strict zero-JavaScript.** Possible, but forces the rewrite above. Adopted
  interpretation of "not a web app": no HTML/CSS/DOM/Canvas/localStorage, no
  WebView/Chromium, no required HTTP listener — trusted bundled JS as an internal
  codegen detail is permitted.
- **Native UI over the existing localhost HTTP server.** Retains ports,
  base64/HTTP and source-tree path assumptions; useful only as a throwaway
  transition, not the architecture.
- **A permanent native branch.** Rejected — guarantees contract drift between
  the two products.

## Consequences

- **QJSEngine compatibility becomes a shared contract.** `builder-assembler.js` /
  `builder-modules.js` must stay evaluable by the native runtime (ES subset, no
  browser-only globals); a web-only PR that violates this can silently break
  native ROM output. Enforced via CODEOWNERS on those files + the native codegen
  differential test running on any PR that touches them (see CONTRIBUTING).
- **Never build from the live document.** The HTTP boundary currently provides an
  accidental deep-copy; direct native calls lose it while the build genuinely
  mutates state (metatile expansion, racer frames). BuildService must deep-copy +
  validate a detached snapshot, with a pre/post-hash contract test.
- **Untrusted compiler input is a security boundary.** Pupil custom C/ASM/audio
  needs a trusted-local vs. sandboxed-classroom split; the remote profile runs in
  a real OS sandbox with no network/host access and hard resource limits.
- **Historical-engine honesty.** v1–v63 Python codegen was never snapshotted, so
  exact historical reconstruction can't be promised from snapshots alone; record
  it as a limitation and bundle Python codegen from the new baseline forward.
- **Effort is a floor, not a target.** The plan's 28–47 person-weeks is
  single-engineer and excludes two-team coordination; painted-editor
  accessibility (custom `QAccessible`/AT-SPI for WORLD/CHARS/TILES) is the
  highest-variance line item. Re-baseline after Phases 0–3.

## Review / go-no-go conditions

- **Phase 0** freezes parity scope (full Studio+legacy union vs. Studio-only) and
  commits baseline fixtures/hashes.
- **Phase 3** is the QJSEngine gate: if the spike fails broadly, stop and choose
  the bundled-Node-codegen worker or the funded Python rewrite before any UI
  port. Do not proceed on the unproven assumption.

*This decision optimizes for behavioral preservation over source-language
purity. The web and native UIs are siblings backed by shared project, engine and
ROM contracts — not successive versions where one replaces the other.*
