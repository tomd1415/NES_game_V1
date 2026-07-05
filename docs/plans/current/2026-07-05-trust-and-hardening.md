# Trust & hardening — sprint plan + phased roadmap

**Started:** 2026-07-05 · **Branch:** `feature/smb-engine` (or a follow-on)
**Source:** distilled from [`docs/ADVICE.md`](../../ADVICE.md) (the 2026-07-05
health check) + hands-on findings from the v3–v9 engine work.

> **Premise (ADVICE "Final thought"):** the engine is feature-rich now; the next
> work is about **trust** — ownership, authorization, versioning discipline,
> validation — not raw features. The most exposed surface is authorization on
> the gallery/feedback routes, and it just got *more* exposed because the Studio
> now surfaces a **Gallery** button + prominent Publish/Open. So Sprint 1 is
> authorization.

## Current state (verified in code, 2026-07-05)
- **Identity exists:** session cookie (`session`, HttpOnly, SameSite=Lax, Secure
  over HTTPS) → `ACCOUNTS.user_for_session(token)` → `{id, username}`;
  `_require_user()` guards account routes.
- **Teacher/admin = a shared secret** (`PLAYGROUND_ADMIN_SECRET`), compared with
  `hmac.compare_digest` (see `accounts.admin_reset`). There is **no per-user
  role column** — teacher actions are gated by presenting the admin secret.
- **Gaps (ADVICE #1–#3):** `/gallery/remove` has **no auth** (explicit code
  comment); publish writes `"owner": None` always; `/feedback/handled`
  (`_feedback_toggle_handled`) is ungated. The gallery UI shows "🗑 Remove" on
  **every** card.

---

## SPRINT 1 — Authorization on gallery + feedback  *(✅ complete 2026-07-05)*

Goal: **deny by default** on every state-changing gallery/feedback route
(OWASP), using the identity + admin-secret machinery that already exists.

**Landed:** publish stamps the owner from the session; `/gallery/remove` and
`/feedback/handled` are owner-or-teacher gated; the gallery list exposes an
`owned` flag (never the raw owner id) and the gallery page shows Remove only on
owned entries with a 🔑 Teacher-mode toggle for moderation. Covered by
`tools/builder-tests/gallery-auth.mjs` (14 assertions) + the updated
`gallery.mjs`; full suite green.

### S1.1 · Publish records an owner ✅
- `_gallery_publish_response` looks up the session user and passes it in;
  metadata `owner` = the user **id** (int) when signed in, plus `owner_name`
  for display; `owner` stays `None` for anonymous posts.
- No client change needed — the Studio's publish fetch is same-origin so the
  session cookie rides along.

### S1.2 · Remove requires owner **or** teacher ✅
- `_gallery_remove_response` loads the entry's `owner`, then allows the delete
  only if **either**: the session user's id == `owner` (a pupil deleting their
  own), **or** a valid `admin_secret` is supplied (teacher moderation). Else
  **403**. Anonymous entries (`owner == None`) are **teacher-only** to remove.

### S1.3 · Feedback "handled" requires teacher ✅
- `_feedback_toggle_handled` requires a valid `admin_secret`; else 403.

### S1.4 · Gallery UI respects ownership ✅
- `/gallery/list` computes an `owned` boolean per entry against the requesting
  session (and returns `signed_in`), and **never** leaks the raw numeric owner
  id. The gallery page shows "🗑 Remove" only on entries where `owned` is true.
  A 🔑 **Teacher-mode** control (enter the admin secret once, held in
  `sessionStorage` only) reveals Remove on all entries and sends the secret with
  deletes; a rejected secret is dropped automatically.
- Delete fetches use `credentials: 'same-origin'` (cookie) + optional secret.

### S1.5 · Route-level auth tests (the real deliverable — ADVICE) ✅
New `tools/builder-tests/gallery-auth.mjs` (mirrors `accounts.mjs`: spawns the
server with a join code + admin secret + an isolated `PLAYGROUND_GALLERY_DIR`).
Asserts: the list exposes `owned` (true for the owner, false for others/anon)
and never the raw owner id; anonymous delete of an owned entry → **401**; a
**different** signed-in user → **403 not_owner**; owner → **200**; anonymous
entry deleted by a random pupil → **403**; admin secret → **200**; a wrong
secret → rejected; anonymous `/feedback/handled` → **403 not_teacher**; admin →
**200**. `gallery.mjs` updated for the new `owned` contract + teacher-secret
removes. (Run standalone or via `run-all.mjs`, which auto-discovers it.)

### S1.6 · CSRF note
Session cookie is `SameSite=Lax`, which already blocks cross-site POST cookies —
the main CSRF vector for these routes. A full per-session CSRF token
(`X-CSRF-Token`) is deferred to **Sprint 2** and captured there, not blocked here.

---

## Phased roadmap (after Sprint 1)

### Sprint 2 — Contracts & documentation truth  *(ADVICE #5, #6, maintainability)*
- **`docs/reference/project-state-schema.md`** — the single schema reference:
  top-level fields + versions, migration owners, Studio-vs-old-page ownership,
  fields emitted into ROM, deprecated-but-round-tripped fields. (Highest-ROI
  maintainability item; the state now crosses storage / Studio / old pages /
  assembler / server / snapshots.)
- **README "Current editor status"** — name the Studio as primary and the old
  pages as legacy-until-parity (ADVICE #6).
- **Consolidate planning docs** — one active tracker; link out instead of
  duplicating checklists (ADVICE #5).
- **CSRF — done as an Origin check (✅ 2026-07-05), not tokens.** After
  weighing it: the real cross-site vector is already blocked (`SameSite=Lax`
  session cookie), and teacher routes authenticate via an admin secret in the
  body (not a cookie → inherently CSRF-immune). A per-session `X-CSRF-Token`
  would touch **every** client that POSTs (Studio + seven old pages + feedback
  widget + account UI) with a real half-migration breakage risk. An **Origin/
  Referer check needs zero client changes** and gives the same defence-in-depth,
  so that is what landed:
  - `_csrf_origin_ok()` rejects a state-change only when the request's `Origin`
    (or `Referer`) host is *provably* not ours. Expected hosts = the request
    `Host` **and** any `X-Forwarded-Host` (the classroom runs behind an HTTPS
    proxy) **plus** an optional `PLAYGROUND_ALLOWED_ORIGINS` allowlist.
  - **Fail-open on ambiguity:** no Origin/Referer (curl, tests, non-browser) →
    allowed; kill-switch `PLAYGROUND_DISABLE_CSRF_ORIGIN_CHECK=1` — a
    misconfigured proxy can never lock users out.
  - Applies only to the cookie-authed state-change routes
    (`/gallery/publish`, `/gallery/remove`, `/me/projects` POST/PUT/DELETE);
    the hot `/play` path and anonymous/admin-secret routes are exempt.
  - Tests: `tools/builder-tests/csrf-origin.mjs` (9 checks) + the real-browser
    `publish.spec.js` confirms same-origin publish still returns 200.
  - A token scheme remains an option if a concrete threat emerges; captured in
    the "Later" backlog rather than blocking here.
- **"When to snapshot" rule** into `docs/design/engine-versioning.md`; keep
  `snapshot-engine.mjs --check` mandatory (ADVICE #7 — already followed for
  v3–v9).

### Sprint 3 — Robustness & classroom scale  *(ADVICE #8, #9, SQLite)*
- **Per-request temp build dirs** for browser-mode builds (keep `BUILD_LOCK`
  for shared assets); removes the Play-queue bottleneck + the build-dirt that
  complicates the harness (ADVICE #8).
- **SQLite WAL + busy timeout + checkpoint/backup**; keep `accounts.db` on local
  disk (ADVICE SQLite). *(WAL was already on; added `synchronous=NORMAL` (the
  recommended WAL pairing) + `busy_timeout=5000` so a lock held by a backup /
  second process waits instead of instantly raising "database is locked" —
  2026-07-05. Checkpoint/backup + extracted metadata table still open.)*
- **Extracted project-metadata table** (name, engine version, game style,
  updated, sprite/bg counts, builds?) for future dashboards without reading
  every blob (ADVICE #9).
- **Gallery thumbnail** — capture an interesting frame, not the first blank one.
  *(2026-07-05: empirically the capture already runs 60 frames and renders real
  content for painted projects — the "blank first frame" of bug #25 was the
  pre-60-frame behaviour. De-duplicated the two byte-identical
  `captureRomPreview` copies into a shared, headlessly-tested
  `NesEmulator.capturePreview`/`stepPreviewFrames`; Studio delegates to it,
  Builder (legacy) keeps its inline copy. New `preview-capture.mjs` builds a ROM
  and asserts the preview is non-blank + deterministic, guarding against a
  regression to a frame-0 grab. Idle-only stepping kept deliberately — a
  "walk-in" frame is livelier but risks a death frame and can't be visually
  verified unattended; noted as a possible future enhancement. Genuinely
  empty-background projects still look sparse: a content issue, not a capture
  one.)*

### Sprint 4 — Validators & pupil-facing safety  *(ADVICE validators)*
Expand `builder-validators.js` (turn compiler failures into pupil guidance):
per-screen entity placed outside the editable screen; dialogue on with
missing/reserved font tiles; door/pipe destination into a missing background;
audio on but ROM budget exceeded; **8-sprites-per-scanline** warning surfaced in
Maker/Advanced. Plus a **bug-reproduction-card** template in
`recently-observed-bugs.md`.

**Started 2026-07-05** — SMB-specific validators (the style the pupils will
push hardest), each with a headless test:
- `questionBlockPowerupWithoutModule` — a ? block set to dispense a power-up
  while the Power-ups module is off silently falls back to a coin in the
  engine, so it warns that intent ≠ result (`smb-block-validators.mjs`).
- `flagpoleNeedsWinCondition` — flagpole on but Win condition off; the flag's
  win code is `#if BW_WIN_ENABLED`, so crossing it does nothing → **error**.
- `flagpoleBeyondLevel` — flagpole column past the level width → unreachable →
  **warn** (`smb-flagpole-validators.mjs`).

- `tooManySpritesPerScanline` — estimates the classic NES 8-sprites-per-
  scanline limit from Scene instances, counting only cells that can share a
  256px screen window (so a scrolling level's spread-out enemies don't
  false-positive) → **warn** (`sprites-per-scanline.mjs`).

Audit found the plan's door/pipe gap is already covered
(`doorsTargetBgOutOfRange`; pipes are same-room only, so they can't target a
missing background). Remaining Sprint 4 items (audio ROM budget, bug-repro-card
template) unstarted.

### Sprint 5 — Old-page retirement + audio config  *(ADVICE #6, audio)*
Freeze old pages except critical fixes; keep import/export compat tests; redirect
default nav to Studio. Surface FamiStudio `FAMISTUDIO_USE_*` config + warn on
unsupported song features; treat SFX as Studio event bindings; ROM/RAM/audio
budget meter before Play (not only after a failure).

### Later (existing backlog, unchanged)
Larger scrolling worlds via compact metatile storage; **8×16 sprite mode** once
the whole pipeline agrees (deferred deliberately in v9); CHR banking / mapper
only when teaching value justifies (real SMB is NROM — decision D-9); in-browser
cc65/WASM build; teacher dashboard; the **full hand-written 6502 ASM engine**
(low-priority educational backlog).

## Guardrails carried from ADVICE
- Treat generated C/asm as a public API — test emitted text **and** ROM
  behaviour; keep golden-ROM byte-identity for the default project.
- Deny-by-default authorization; relationship checks over role checks.
- Every engine-version change paired with a changelog entry + snapshot `--check`.
- Small named migrations over broad rewrites; save a tiny repro project when
  fixing a pupil bug.
- New editor controls must teach an NES concept, prevent a mistake, or unlock a
  real game-making goal.
