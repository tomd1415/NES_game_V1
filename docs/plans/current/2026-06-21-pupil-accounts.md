# Pupil accounts + cross-device project save (T4.2) — design doc — 2026-06-21

> **Scope.** The dedicated design doc Tier 4.2 always said it needed
> ("own plan doc required"), now anchored by the user's concrete requirement:
> pupils can create an account that **stores nothing but a username (never a real
> name) and a password**, purely so they can save their work and resume it from
> home. Settles the design decisions with recommendations + flags the genuine
> forks; sequences the build. **No code yet** — this is the plan.
>
> Supersedes the T4.2 stubs in
> [`2026-06-18-next-phase-master-plan.md`](2026-06-18-next-phase-master-plan.md)
> (parked Tier 4) and
> [`2026-04-26-fixes-and-features.md`](2026-04-26-fixes-and-features.md) §T4.2,
> and answers pupil feedback **item 24** (login that saves work between computers
> + lets pupils remove their own gallery posts).

## 1. Goal & the hard requirement
A pupil can **create their own account** and **sign in from any computer** (school
or home) to **save and reload their projects**. The account exists only to
*identify whose work is whose* — nothing more.

**Data-minimisation principle (the headline constraint):** the **only personal
datum stored is a self-chosen username that must not be a real name.** No email,
no real name, no class/form, no analytics, no tracking. The **password is stored
only as a salted hash**, never in plaintext.

For honesty about what *must* also exist (none of it personal): the pupil's
**project content** (the very thing being saved), and minimal **operational
metadata** — a row id, created/updated timestamps, and a byte size — used to list
and sync projects. That is the whole footprint. A breach would expose a
pseudonymous username + a password *hash* + game data: ~nothing identifying. The
real residual risk is **password reuse**, which is exactly why we hash properly
even though the accounts are "low value".

## 2. Why this is now tractable (what already exists)
- The playground server (`tools/playground_server.py`) is **Python stdlib**
  (`http.server.SimpleHTTPRequestHandler`, threaded via `ThreadingMixIn`;
  `do_GET`/`do_POST`), and already imports `secrets`, `hashlib`, `json`,
  `pathlib`, `threading`. **No new dependencies needed.**
- Phase 4.2 **gallery** already does file-based persistence under `tools/gallery/`
  with a `threading.Lock`, size caps, and a pseudonymous **`handle`** field — and
  carries the exact wart this fixes: *"No auth on /gallery/remove"*. Accounts make
  gallery posts ownable.
- The editor's `storage.js` already keeps a **multi-project catalog** in
  `localStorage` (each project has an id + `current`/`snap`/`backup`/`meta`
  keys). Per-user server storage maps onto that structure cleanly; the account
  layer is **additive sync on top of localStorage**, not a rewrite.

## 3. Decisions (recommendations — forks flagged ⚠)
- **D1 — Storage backend: SQLite** (`tools/accounts.db`, stdlib `sqlite3`).
  Accounts need atomic **username uniqueness**, indexed lookups, and
  concurrent-safe writes — better served by SQLite than the gallery's loose-JSON
  + lock pattern. One file, fits the single-server LXC deployment. Schema sketch:
  - `users(id, username UNIQUE COLLATE NOCASE, pw_hash, pw_algo, created_at)`
  - `projects(id, user_id, name, blob, size, updated_at)`
  - `sessions(token, user_id, created_at, expires_at)`
  (created_at/updated_at/size are operational, not personal.)
- **D2 — Password hashing: `hashlib.scrypt`** (stdlib; PBKDF2-HMAC-SHA256 is the
  fallback if scrypt's memory cost is awkward on the host). Per-user random salt;
  store the algo + params in `pw_algo` so cost can be upgraded later and old
  hashes re-hashed on next login. Plaintext is never stored or logged. Minimum
  length ~6–8 chars, **no complexity nagging** (these are kids — encourage a
  memorable passphrase instead).
- **D3 — Username is not a real name.** Enforced softly: a clear "don't use your
  real name — pick a nickname" prompt at signup, plus a server-side reject of
  obviously-real-name patterns where cheap (e.g. "firstname surname"/"firstname.surname").
  Cannot be perfectly enforced; the *minimisation* is the protection — even if a
  pupil ignores advice, only a username exists. Usernames are
  case-insensitively unique, length-bounded, charset-restricted (no profanity
  filter in v1; flag if wanted).
- **D4 — Sessions:** opaque random token (`secrets.token_urlsafe`) in the
  `sessions` table; cookie `session=<token>; HttpOnly; Secure; SameSite=Lax`.
  Expiry long enough for "next week at home" (e.g. **30 days**, sliding). Logout
  deletes the row. (`Secure` assumes the public instance is HTTPS via the
  reverse proxy — confirm.)
- **D5 — ⚠ Signup gate on a public server.** spritemaker.co.uk is internet-
  facing, so *open* self-signup invites junk accounts. **Recommended: a class
  "join code"** the teacher shares — pupils still create their own accounts
  (honours the request) but must enter the code; rotatable, teacher/admin-set, no
  PII. Alternatives: pure-open signup + rate-limit + a cap (simplest, fine if the
  instance is effectively private); or teacher-provisioned usernames (rejected —
  the user wants pupils to self-create).
- **D6 — ⚠ Password recovery (the critical gap).** With no email, a forgotten
  password = lost work. **Recommended: (a) teacher/admin reset** — a minimal admin
  role (a server-side admin secret in env, *not* a pupil account) that can set a
  pupil a temporary password; **plus (b) an optional one-time recovery code**
  shown once at signup for the pupil to write down. Both avoid storing any PII.
- **D7 — ⚠ Sync model: manual Save / Load (v1).** Explicit "Save to my account"
  / "Load from my account" buttons, last-write-wins per project keyed on
  `updated_at`, with a **warning when the server copy is newer than the local
  one** (edited at school, then opened at home). Predictable, no silent clobber.
  Silent auto-sync is a later enhancement. localStorage stays the live working
  copy (offline-friendly, no perf regression).
- **D8 — ⚠ Multiple named projects per account: yes.** Maps to the existing
  multi-project catalog; pupils already make several games. (Alternative: one
  slot per account — simpler but worse fit; not recommended.)
- **D9 — Gallery ownership (answers item 24).** Authenticated posts become
  **owned** → a pupil can remove *their own* posts when signed in. Keep the
  account-less **per-browser nonce** path (feedback sub-piece 1) so anonymous
  posting/removal still works. Additive to the existing gallery, not a rewrite.
- **D10 — Lifecycle / erasure.** A teacher/admin can **delete an account + all its
  projects** (end-of-year cleanup / right to erasure). Optional inactivity expiry.
  No analytics ever.

## 4. Build phases
- **P1 — Backend foundation.** SQLite schema; scrypt hashing; `POST /auth/signup`,
  `POST /auth/login`, `POST /auth/logout`; session cookies; rate-limiting on
  signup/login (per-IP, in-memory token bucket). No editor UI yet. Headless test
  covers signup → login → wrong-password reject → duplicate-username reject →
  session expiry.
- **P2 — Per-user project storage.** Authenticated `GET /me/projects`,
  `GET /me/projects/{id}`, `PUT /me/projects/{id}` (push a project blob, size-
  capped like the gallery), `DELETE /me/projects/{id}`. Headless test for the
  round-trip + auth enforcement (no session → 401).
- **P3 — Editor UI.** A small sign-in / create-account panel (in the project
  menu or a top bar) + "Save to my account" / "My projects" wired into
  `storage.js`. Local autosave unchanged.
- **P4 — Recovery + signup gate.** Teacher-admin reset (+ optional recovery code);
  the D5 join-code on signup.
- **P5 — Gallery ownership.** Link posts to accounts; authenticated removal; keep
  the anonymous nonce path.
- **P6 — Lifecycle & polish.** Teacher delete-account, expiry, accessibility,
  error states (offline, server down → graceful "couldn't reach your account,
  your work is still saved on this computer").

## 5. Verification & invariants
- **This does not touch the engine or codegen**, so the **byte-identical ROM /
  golden-hash invariant is untouched** — call this out so it's clear the account
  work carries no risk to the ROM pipeline.
- Server endpoints get a **headless test** in the existing harness style (a
  `tools/builder-tests/accounts.mjs` driving the live server, or a Python test):
  signup/login/logout, wrong-password + duplicate-username rejection, session
  expiry, project save/load round-trip, auth-required endpoints reject without a
  session, rate-limit trips.
- Security review checklist: no plaintext passwords in DB/logs; cookies
  `HttpOnly`+`Secure`+`SameSite`; constant-time hash compare; size caps on blobs;
  per-IP rate limits; admin secret only in env; SQL via parameterised queries.

## 6. Open decisions for the user (before P1)
1. **D5 signup gate** — class join-code (recommended for the public instance) vs
   pure-open signup vs teacher-provisioned?
2. **D6 recovery** — teacher-reset only, or also a pupil recovery code (recommended: both)?
3. **D7 sync** — manual Save/Load buttons (recommended v1) vs auto-sync?
4. **D8 projects-per-account** — many (recommended) vs one?
5. Is the public instance behind **HTTPS** (needed for `Secure` cookies)?

## 7. Dependencies & sequencing
Independent of the racer / metatiles / codegen arcs — it's server + editor infra,
not engine work, so it can proceed in parallel and never disturbs the ROM
invariant. Natural pairing: feedback sub-piece 1 (anonymous per-browser nonce for
gallery deletion) can land first/independently (Tier 2-sized) and is reused by D9.
