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

## Web-researched solution patterns

Sources checked on 2026-07-05. These are existing solutions or constraints that
map directly onto the bugs this project is seeing or is likely to hit next.

### Auth, gallery, feedback, and account safety

Sources:

- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)
- [Python `secrets` docs](https://docs.python.org/3/library/secrets.html)
- [Python `hashlib.scrypt` docs](https://docs.python.org/3/library/hashlib.html#hashlib.scrypt)

Existing solution to use here: centralize authorization into small route guards
and make every state-changing route opt in to the right guard. OWASP's guidance
is "deny by default" and validate permissions on every request. In this project
that means:

- `require_user()` for account project save/load/delete.
- `require_owner_or_teacher(resource)` for gallery deletion.
- `require_teacher()` for feedback handled-state and moderation.
- Relationship checks over role checks where possible: gallery entry owner,
  project owner, class/teacher relationship.
- Route-level regression tests for anonymous, wrong-user, owner, and teacher
  cases.

For CSRF, this project uses cookie-backed sessions, so state-changing POST
routes should also require a CSRF signal. The simplest fit for this mostly-AJAX
app is a random per-session CSRF token returned by `/auth/me` or a small
`/auth/csrf` endpoint, then sent back in a custom header such as
`X-CSRF-Token`. Keep cookies `HttpOnly`, `SameSite=Lax` or `Strict`, and
`Secure` when HTTPS is active. Do not put CSRF tokens in URLs.

The current account code already uses `secrets`, per-user salts, and `scrypt`,
which is the right family of tools. One follow-up: benchmark the classroom
server and consider raising the `scrypt` work factor over time. OWASP's current
scrypt recommendations are stronger than the project's current `N=2**14,
r=8, p=1`; if higher settings feel slow on classroom hardware, document the
tradeoff and pair it with throttling.

For uploads/publish flows, keep the current shape of validating magic bytes,
size caps, generated filenames/slugs, and a non-web-root gallery data directory.
Extend that with account ownership and a teacher moderation path.

### Scrolling, doors, and wrong-background bugs

Sources:

- [NESdev PPU scrolling](https://www.nesdev.org/wiki/PPU_scrolling)
- [NESdev PPU registers](https://www.nesdev.org/wiki/PPU_registers)
- [NESdev PPU nametables](https://www.nesdev.org/wiki/PPU_nametables)
- [NESdev mirroring](https://www.nesdev.org/wiki/Mirroring)

Existing solution to use here: make the NMI/vblank pipeline boring and strict.
The NESdev scrolling notes emphasize two rules that match this project's
vertical-scroll and wrong-background reports:

- VRAM updates through `PPUADDR`/`PPUDATA` can disturb the scroll registers.
  Therefore set `PPUCTRL`/`PPUSCROLL` after all VRAM updates, as the last PPU
  step in vblank.
- Vblank time is tight. Treat 64 bytes of nametable updates per frame as a
  practical warning threshold unless a measured engine-specific budget says
  otherwise.

Recommended engine structure:

1. Game logic computes camera/world position and queues VRAM updates.
2. NMI performs OAM DMA.
3. NMI drains a bounded VRAM update queue: nametable bytes, attribute bytes,
   palette changes.
4. NMI writes `PPUCTRL` and the two `PPUSCROLL` writes last.
5. NMI records whether it overran its budget; Studio can surface this as a
   build/runtime warning.

For doors and behaviour maps, avoid screen-local special cases. Keep one
canonical converter:

```text
world pixel -> world tile -> background id -> screen id -> nametable address
world tile -> behaviour map slot
world pixel -> entity spawn/collision coordinates
```

Then test all four corners of a 2x2 world and every door direction. Most
"wrong background" and "wrong behaviour blocks" bugs come from one subsystem
using screen-local coordinates while another uses world coordinates.

### Palettes, attributes, and metatiles

Sources:

- [NESdev PPU attribute tables](https://www.nesdev.org/wiki/PPU_attribute_tables)
- [NESdev PPU nametables](https://www.nesdev.org/wiki/PPU_nametables)
- [NESdev mirroring](https://www.nesdev.org/wiki/Mirroring)

Existing solution to use here: make the 16x16 attribute area visible and make
it the stored truth. NES background palette choice is not per 8x8 tile. Each
attribute byte covers a 32x32 pixel area, divided into four 16x16 quadrants.
That explains many "palette mismatch" surprises.

Recommended schema direction:

- Store palette on 16x16 metatiles or 16x16 attribute quadrants.
- Treat per-8x8 palette values as derived or legacy compatibility data.
- In Studio, keep the attribute conflict overlay prominent.
- Add a test that compares the editor render, emitted `.nam` attribute bytes,
  and an emulator screenshot for the same project.

This also argues for 16x16 metatiles as the default authoring primitive. NESdev
notes that many NES games use 16x16 or 32x32 metatiles because they line up with
attribute-table constraints.

### Sprite limits, OAM, flicker, and 8x16 mode

Sources:

- [NESdev PPU OAM](https://www.nesdev.org/wiki/PPU_OAM)
- [NESdev PPU registers](https://www.nesdev.org/wiki/PPU_registers)

Existing solution to use here: keep shadow OAM plus `OAMDMA` as the only
runtime sprite upload path. NESdev describes the common pattern: write 64
sprites x 4 bytes into CPU RAM, then copy the page to OAM through `$4014`.
The current regression guard around OAM DMA is therefore worth keeping.

For sprite overload:

- Keep the Studio scanline-load warning.
- Add a deterministic flicker/drop strategy for sprites over the per-scanline
  limit, ideally with stable priority controls for player, pickups, projectiles,
  and decorations.
- Keep a hard 64-sprite budget meter and a per-scanline warning meter.

For 8x16 mode, do not expose a toggle until the engine changes too. In NES
8x16 mode, tile selection and flipping rules differ from 8x8 mode. The editor,
OAM emitter, animation preview, collision boxes, and generated C all need to
agree before this becomes a pupil-facing feature.

### Bigger worlds, CHR growth, and mapper choices

Sources:

- [NESdev CHR ROM vs. CHR RAM](https://www.nesdev.org/wiki/CHR_ROM_vs._CHR_RAM)
- [NESdev mapper overview](https://www.nesdev.org/wiki/Mapper)
- [NESdev CPU memory map](https://www.nesdev.org/wiki/CPU_memory_map)
- [cc65 NES target docs](https://cc65.github.io/doc/nes.html)
- [ld65 linker docs](https://cc65.github.io/doc/ld65.html)

Existing solution to use here: do not try to solve bigger games with raw
nametable storage. Move toward compact world data plus engine-specific
streaming.

Practical path:

- Keep NROM/simple builds for lessons and first projects.
- Use 16x16 metatile maps for larger scrolling worlds.
- Keep collision/behaviour data in parallel compact maps, not as duplicated
  per-screen blobs.
- When art exceeds 8 KB of visible CHR, choose a mapper strategy explicitly:
  CHR RAM for CPU-uploaded/generated tiles, CHR ROM banking for fast bank
  swaps, or a more capable mapper only when the teaching value justifies it.
- Generate an `ld65` map file on builds and surface PRG, CHR, RAM, zero-page,
  and audio-engine costs in Studio.

The cc65 NES docs are also a reminder that the C runtime stack and heap are
real constraints. Generated C should prefer static, bounded arrays and known
zero-page allocations over accidental dynamic-style patterns.

### Audio integration

Source:

- [FamiStudio NES/Famicom Sound Engine docs](https://famistudio.org/doc/soundengine/)

Existing solution to use here: keep using FamiStudio, but make the feature
configuration visible and testable. FamiStudio's engine supports CA65/CC65 and
expects the game to initialize audio data, play songs/SFX, and call the update
routine once per frame, ideally from NMI.

Important follow-ups:

- Parse or ask for the FamiStudio export options and enable matching
  `FAMISTUDIO_USE_*` flags.
- Warn pupils when an uploaded song uses a feature that the generated engine
  config does not enable.
- Treat sound effects as event bindings in Studio: pickup collected, player
  hurt, jump, door, win, projectile, NPC talk.
- Keep ROM/RAM/audio-engine budget visible before Play, not only after a build
  failure.

### SQLite-backed accounts and classroom concurrency

Source:

- [SQLite WAL documentation](https://www.sqlite.org/wal.html)

Existing solution to use here: SQLite WAL is a good fit for a classroom server,
but only if the database lives on the same host and checkpoints are managed.
SQLite documents that WAL allows readers and writers to proceed concurrently,
but there is still only one writer at a time and WAL is not for network
filesystems.

Recommended operational rules:

- Keep `accounts.db` on local disk, not an NFS/shared folder.
- Set a SQLite busy timeout so a burst of saves waits briefly instead of
  failing immediately.
- Add periodic or shutdown checkpointing/backup.
- Keep project blobs size-capped, but store extracted metadata for dashboards.
- Add a teacher-facing "last saved" and "build status" summary rather than
  reading every project blob on demand.

### Testing and documentation shape

Existing solution to use here: convert every researched rule above into a
small guard. The project already has the right instinct with builder tests and
golden-ROM checks.

High-value new tests:

- Scrolling: scroll register writes happen after VRAM writes in generated
  engine templates.
- Scrolling: vertical and 2x2 worlds load expected nametable and behaviour
  data at all four screen boundaries.
- Palette: 16x16 attribute quadrant choices round-trip through editor state,
  `.nam` bytes, and emulator render.
- Auth: gallery deletion requires owner or teacher.
- Auth: feedback handled-state requires teacher.
- Audio: uploaded songs with unsupported FamiStudio features produce a clear
  Studio warning.
- Accounts: SQLite busy/save burst test with several concurrent clients.

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
