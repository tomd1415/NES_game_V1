# Feedback viewer — small teacher-facing page

A one-page `GET /feedback` that renders everything submitted via the
in-editor feedback form, with a "✓ handled" toggle so items can be
marked off without editing `feedback.jsonl` by hand.

Flagged as a 20-minute follow-up in
[feedback-plan.md](feedback-plan.md) — this plan pins down the shape.

## Target

- Browse to `http://localhost:8765/feedback` → dark-themed single page,
  newest first.
- Each card shows:
  - Category chip (✨/🐛/💭).
  - Pupil name (or *"anonymous"* in muted text).
  - Project name + page (*sprites*, *code*, …).
  - Timestamp (UTC from the JSONL).
  - Message (line-wrapped `<pre>` so newlines survive).
  - Optional `<details>` *"📎 project snapshot (X KB)"* with a `<pre>`
    of pretty-printed JSON — only rendered when the submission
    included the pupil's project.
  - `✓ handled` checkbox in the top-right.
- "Show handled" toggle at the top of the page (default off). Hidden
  items are counted but not rendered.
- No auth, no search, no pagination. LAN-only teacher tool — if we
  ever see >100 entries this can grow, but not today.

## New endpoints on playground_server.py

### `GET /feedback`

Reads `feedback.jsonl` and `feedback-handled.json`, renders HTML
server-side, writes it to the response. No JS framework — one small
inline `<script>` wires the checkboxes to the POST below.

### `POST /feedback/handled`

Body: `{"index": N, "handled": true|false}`.
Persists `feedback-handled.json` under a module-level lock. Returns
`{"ok": true}` or a 400 on bad input.

## Record identity

Line number in `feedback.jsonl`, 1-indexed. Simplest stable id as long
as nothing deletes lines — and nothing does. `feedback-handled.json`
stores:

```json
{ "handled": [1, 3, 7] }
```

## Files touched

- `tools/playground_server.py` — two route branches (`GET /feedback`,
  `POST /feedback/handled`) and three helpers (load records, load
  handled-set, save handled-set).
- `.gitignore` — add `feedback-handled.json` (same reason as
  `feedback.jsonl`: local teacher state, not source).
- `changelog-implemented.md` — short entry summarising what shipped.

## Out of scope (deferred)

- **Delete / redact records.** Editing the JSONL in a text editor is
  fine for the rare nonsense entry. A delete endpoint would need to
  think about line-number drift in the handled set — not worth it yet.
- **Search / filter by category or pupil.** If the list grows past a
  screenful and the teacher actually wants this, a 10-line JS filter
  is a trivial follow-up.
- **Per-handled-item notes.** Would require a richer data structure;
  out of scope for a *"did I read it?"* toggle.
