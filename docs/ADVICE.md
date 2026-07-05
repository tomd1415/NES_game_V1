# ADVICE

Codebase review notes captured on 2026-07-05 while the project was actively
being edited. I treated this as a broad health check, not a full audit of every
line. The strongest existing planning sources are:

- `docs/feedback/recently-observed-bugs.md`
- `docs/plans/current/2026-07-05-studio-redesign.md`
- `docs/plans/current/2026-06-21-pupil-accounts.md`
- `docs/design/feature-parity.md`
- `docs/design/engine-versioning.md`

## Executive summary

This is an ambitious and unusually rich teaching project: a real NES build
pipeline, a browser-based game studio, generated C/assembly, pupil-friendly
lessons, a gallery, account support, and a growing regression suite. The main
risk now is not lack of features; it is keeping the old multi-page editor, new
Studio shell, generated engine snapshots, Python server, and documentation from
drifting apart.

The next phase should be deliberately boring in the best way: harden ownership
and authentication around gallery actions, finish the engine-version fallback
story, tighten generated-code contracts with tests, and keep the Studio
switch-over gated on feature parity rather than enthusiasm.

## Bugs and risks spotted

### 1. Gallery removal is still unauthenticated

`tools/playground_server.py` explicitly notes that `/gallery/remove` has no
auth. That was once acceptable under a single-machine classroom assumption, but
the project now has account support and docs that talk about cross-device saves.
This should move to the top of the security/product list.

Suggested fix:

- Store an `owner` on publish when a signed-in pupil posts.
- Allow removal only when the current session owns the entry.
- Add a teacher/admin moderation path for removing anyone's entry.
- For anonymous posts, either disable removal or issue a one-time delete token
  that is shown immediately after publishing.

### 2. Published gallery ownership is reserved but not wired

`_gallery_publish()` writes `"owner": None` for every entry. That is a useful
placeholder, but it means account-backed publishing and account-backed deletion
are not yet connected. This is likely to confuse future contributors because
the data model looks ready while the behaviour is not.

Suggested fix: connect publish to `_current_user()` or equivalent session lookup
and test signed-in vs signed-out publishing separately.

### 3. Feedback "handled" changes appear unauthenticated

The feedback viewer posts to `/feedback/handled`. If that route is reachable
from a pupil-facing host, pupils may be able to mark reports handled. Even if
the current deployment is trusted, this is a teacher-only action and should be
treated as such before wider classroom/network use.

Suggested fix: put feedback management behind the same teacher/admin mechanism
as gallery moderation.

### 4. `.env` exists in the working tree

`.env` is correctly gitignored, and `.env.example` exists. Still, a real `.env`
file in the project root means local secrets are close to the repo. This is not
a bug by itself, but it deserves discipline.

Suggested fix:

- Keep `.env` out of commits forever.
- Add a short "rotate these if exposed" note to `docs/guides/TEACHER_GUIDE.md`.
- Consider a startup warning when `PLAYGROUND_HOST=0.0.0.0` and admin/reset
  secrets or join codes are missing.

### 5. Some live backlog items are duplicated across docs

The same themes appear in feedback, design parity, current plans, and
changelogs. That is understandable in a fast-moving project, but duplicated
truth tends to decay.

Suggested fix: make `docs/plans/current/2026-07-05-studio-redesign.md` the
single active tracker for Studio work, and link out to feedback/design docs
instead of repeating checklist details in multiple places.

### 6. Root README still describes the older multi-page path first

The README is very pupil-friendly, but the project now has a major Studio
redesign in place. If Studio is not yet the default, the README should say that
clearly. If it is intended to become the default soon, the README needs a
switch-over section that names the old pages as legacy rather than primary.

Suggested fix: add a small "Current editor status" section:

- "Studio is the new integrated editor and is being brought to parity."
- "The older pages remain available until every parity item is checked."
- "Teachers should use X for lessons today."

### 7. Generated engine snapshots are a major drift risk

`tools/engines/v*` snapshots plus live files are a smart move, but they create a
new failure mode: fixes landing in live sources but not in snapshots, or vice
versa. The test runner already checks snapshot integrity, which is good.

Suggested fix:

- Keep `scripts/snapshot-engine.mjs --check` mandatory in CI.
- Require a changelog entry for every engine snapshot.
- Add a short "when to snapshot" rule to `docs/design/engine-versioning.md`.

### 8. Build endpoints serialize through one shared work directory

`BUILD_LOCK` avoids concurrent writes to `steps/Step_Playground`, which is the
right safe default. The tradeoff is that a classroom pressing Play at once will
queue behind one directory and one compiler. That may become the next UX pain
point.

Suggested fix: keep the lock for shared assets, but consider per-request temp
build directories for browser-mode builds once the pipeline is stable. Native
FCEUX launch can remain special-cased.

### 9. Project data is opaque JSON in SQLite

The account project store intentionally treats project blobs as opaque text.
That is simple and robust, but future migrations, search, class dashboards, and
gallery moderation will be harder.

Suggested fix: keep the blob, but add a small extracted metadata table or JSON
summary on save: project name, engine version, game style, updated time, sprite
count, background count, and whether it builds.

## Maintainability suggestions

### Consolidate state schema documentation

The editor state now crosses storage, Studio modes, old pages, builder
assembler, play pipeline, Python server, and engine snapshots. A compact schema
reference would pay for itself quickly.

Suggested document: `docs/reference/project-state-schema.md`

Include:

- top-level fields and versions
- migration responsibilities
- fields owned by Studio vs old pages
- fields emitted into ROM builds
- deprecated fields that must still round-trip

### Add route-level tests for auth boundaries

The account tests look healthy, but the important next tests are not just
"accounts work"; they are "protected actions reject the wrong actor."

Useful tests:

- anonymous cannot delete signed-in gallery post
- signed-in pupil cannot delete another pupil's gallery post
- teacher/admin can remove any gallery post
- anonymous cannot mark feedback handled
- stale session cannot save/delete projects

### Keep validators close to generated-code failures

`builder-validators.js` is one of the best pieces of the project because it
turns compiler failures into pupil-understandable guidance. Keep expanding it
whenever a generated C/assembly failure is discovered.

Good candidates:

- per-screen entity placement outside the current editable screen
- dialogue enabled with missing/reserved font tiles
- audio enabled but ROM budget too high
- 8 sprites per scanline warnings promoted clearly in Maker/Advanced levels
- door destination points into missing background/screen

### Add "bug reproduction cards" for active pupil issues

`recently-observed-bugs.md` already has a good diagnosis format for palette,
dialogue, and vertical scrolling. Turn that into a repeatable template for new
bugs so fixes start with observations, not guesses.

Suggested template:

- affected editor mode/page
- project JSON attached or not
- browser preview vs FCEUX vs downloaded ROM
- engine version
- exact build log if any
- smallest reproduction project

### Make old-page retirement explicit

The old pages are still valuable as stable fallbacks, but they increase testing
and design load. Once Studio reaches parity, set a retirement plan:

- freeze old pages except for critical fixes
- keep import/export compatibility tests
- redirect default navigation to Studio
- remove old-page-only docs from pupil-facing paths

## Future development goals

### Near term

1. Finish gallery/account ownership.
2. Finish Studio feature parity and document any deliberate drops.
3. Complete engine-version build fallback for older projects.
4. Keep builder tests and Playwright Studio tests green in CI.
5. Reduce duplicated planning docs so contributors know where to update status.

### Medium term

1. Per-door destinations and per-screen entity placement across all backgrounds.
2. Better dialogue tooling: preview text, font-slot validation, per-NPC text,
   and clear event binding.
3. More enemy behaviours: patrol paths, bounds, projectile shooters, jumpers,
   and configurable contact rules.
4. Game-wide physics controls in Builder/Studio: gravity, jump strength,
   acceleration, friction, knockback, and camera style.
5. A stronger gallery thumbnail pipeline that captures an interesting frame
   instead of the first blank/transition frame.

### Longer term

1. Larger scrolling worlds using compact metatile storage.
2. Optional 8x16 sprite mode once the engine really supports it.
3. CHR bank switching or mapper upgrade for bigger art/audio projects.
4. In-browser cc65/WebAssembly build so the server becomes optional.
5. Teacher dashboard: class projects, build status, moderation queue, and
   curated showcase.

## Suggested engineering guardrails

- Treat generated C/assembly as a public API. Test the emitted text and the
  resulting ROM behaviour.
- Preserve golden-ROM tests for "empty/default project" behaviour.
- Keep every engine-version change paired with docs and snapshot checks.
- Prefer small, named migrations over broad state rewrites.
- When fixing pupil bugs, save a tiny reproduction project under tests or docs.
- Avoid adding new editor controls unless they either teach an NES concept,
  prevent a common mistake, or unlock a real game-making goal.

## Final thought

The project is at the point where polish and trust matter more than raw feature
count. Pupils will forgive missing advanced options if save/load, Play, gallery,
and undo feel dependable. Make the next sprint about confidence: ownership,
versioning, validation, and a clean Studio path.
