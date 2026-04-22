# Pupil feedback — small cross-page feature plan

A tiny, self-contained feature that lets pupils leave feedback from
any of the four editor pages without adding anything to the already
crowded header toolbar.

References:

- [index.html](tools/tile_editor_web/index.html) — Backgrounds page,
  has the tabbed help dialog at `#help-dialog` / `.help-tabs`
  (lines 1175-1280).
- [sprites.html](tools/tile_editor_web/sprites.html) — Sprites page,
  same tabbed help-dialog layout (lines 2059-2174).
- [behaviour.html](tools/tile_editor_web/behaviour.html) — Behaviour
  page, single-panel help dialog at lines 442-462.
- [code.html](tools/tile_editor_web/code.html) — Code page,
  single-panel help dialog at lines 459-488.
- [playground_server.py](tools/playground_server.py) — the only
  back-end; Handler class at line 1438, `do_POST` handles `/play`
  only today at line 1534.

---

## Problem & goal

Pupils occasionally spot bugs, have feature ideas, or just want to
tell us their reaction.  Right now the only way to tell us is face
to face in lesson.  That:

- loses detail (they forget by next lesson),
- relies on pupils being confident enough to say it out loud, and
- makes it hard to collect the "small papercut" feedback that never
  rises to the level of *please mention this in class*.

We also can't keep adding things to the top toolbar — Projects,
Undo, Redo, Save-all, Load-all, Clear, Recover, Auto-download,
Export, Import, `?`… adding a 💬 Feedback button would push the
toolbar beyond a sensible width on 1366-pixel laptop screens.

Goal: a way for pupils to leave short, categorised feedback from any
of the four editor pages, with zero added header buttons, in under
three clicks, that lands in a file I can read on the server.

## Scope summary

- **In:** a Feedback tab inside the existing Help dialog on pages
  that have a tabbed help (index, sprites); the same form in a
  small section of the plain help dialog on pages that do not
  (behaviour, code); a `/feedback` POST endpoint on the playground
  server that appends JSONL to `feedback.jsonl`; a small success
  toast.
- **Out (this round):** authenticated identity, email notifications
  to the teacher, admin read-back UI, moderation, including the
  pupil's full project state in the submission, attachments /
  screenshots, per-pupil dashboards.  Flagged in *Deferred* below.

---

## Existing scaffold (do not rebuild)

- `.help-tabs` / `.help-tab` / `.help-tab-panel` on index.html and
  sprites.html already handle show/hide via one tiny click handler
  (index.html:3810-3818) — adding a tab means one extra `<button>`
  and one extra `<div class="help-tab-panel">`.
- `setStatus('saved', '● …')` already exists on index.html and
  sprites.html and animates the status pill.  Good enough as a
  success cue on those two pages; behaviour/code can fall back to a
  plain banner inside the form.
- `dialog` element + `showModal()` is already the pattern used for
  help, recovery, confirm, preview — no new dialog library needed.
- The Handler class already does JSON POST (`/play`), CORS headers,
  and content-length parsing.  Adding `/feedback` is ~15 lines.

---

## Where it lives — UI placement

**Pages with tabbed help (index, sprites).**

One new tab appended after *Tips / FAQ*:

```html
<button type="button" class="help-tab" data-tab="feedback">💬 Feedback</button>
```

with a matching `<div class="help-tab-panel" data-panel="feedback"
hidden>` that contains an empty `<div class="feedback-form-host">`.
A shared `feedback.js` (see *Client module* below) populates the
host lazily the first time the tab is clicked.

The existing tab click-handler (index.html:3810-3818) already works
for the new tab with no changes — it just toggles `.active` /
`hidden` based on `data-tab` / `data-panel` string equality.

**Pages with single-panel help (behaviour, code).**

A new `<details class="feedback-block">` is appended to the help
dialog just before the `.dialog-actions` row:

```html
<details class="feedback-block">
  <summary>💬 Leave feedback on this page</summary>
  <div class="feedback-form-host"></div>
</details>
```

Same `feedback-form-host` div → same `feedback.js` can populate it.
`<details>` is closed by default so it doesn't dominate the help
dialog, and opens in-place with no extra dialog plumbing.

**Rationale for this layout.**

- Zero new header buttons → toolbar stays the width it is.
- The `?` button is already muscle memory for pupils when they get
  stuck — which is the exact moment we most want feedback.
- The form is lazily built, so pages with tabs don't pay any DOM
  cost for pupils who never open the Feedback tab.

## Form fields

- **Category** (required) — three radio buttons with an emoji
  label each, no text until the pupil hovers:
  - `✨ Add a feature`
  - `🐛 Something is broken`
  - `💭 General comment`
- **Message** (required) — multi-line textarea, ~5 rows, 1-500
  chars.  Character count shown live next to the Send button
  ("32 / 500").
- **Name** (optional) — single-line input, placeholder *"(optional,
  helps me ask you about it later)"*.
- **Send** button — disabled until category + non-empty message.
  POSTs to `/feedback`, on success clears the form and shows a
  two-second *"Thanks — sent!"* inline message inside the help
  dialog (so it stays visible even after the dialog closes).

All strings are in British English to match the rest of the UI
(*behaviour*, *colour*, *autosave*).

## Server endpoint

New handler in the existing `Handler.do_POST` at
[playground_server.py:1534](tools/playground_server.py#L1534),
sibling to the existing `/play` branch.

Request JSON:

```json
{
  "category":    "feature" | "broken" | "general",
  "message":     "string, 1-500 chars",
  "name":        "string, optional, <= 80 chars",
  "page":        "index" | "sprites" | "behaviour" | "code",
  "projectName": "string, optional, <= 80 chars",
  "userAgent":   "captured server-side, not client-side"
}
```

Response JSON:

```json
{ "ok": true }
```

or on validation failure:

```json
{ "ok": false, "error": "message required" }
```

Server validation (cheap, defensive):

- category ∈ the three literal values above
- message length in `[1, 500]`
- name length `<= 80`, projectName length `<= 80`, page `<= 20`
- content-length `<= 4096` (loose cap)

On success, append one JSON object per line to
`ROOT / "feedback.jsonl"`:

```json
{"ts":"2026-04-22T14:37:04Z","ip":"…","category":"broken",
 "message":"palette jumps after undo","name":"Sam","page":"sprites",
 "projectName":"my-zelda","userAgent":"Mozilla/…"}
```

- `ts` is ISO-8601 UTC, generated server-side.
- `ip` is the client's remote address (already known to the
  handler).  Kept because we want to see if one pupil repeatedly
  reports the same thing — not for identification beyond that.
- The file is opened in append mode with a single `write()` per
  line.  Concurrent posts from two tabs race at most two lines;
  acceptable for this scale.

No DB, no auth, no rate-limiting.  The server is pupil-lab only
(localhost / LAN), so this is proportionate.

## Client module — tools/tile_editor_web/feedback.js

New file, plain ES2020, no build step (to match
`tour.js` / `storage.js`).

Exports on `window.Feedback`:

```js
window.Feedback = {
  mountInto(hostEl, { page, getProjectName }) { … }
};
```

- Idempotent: calling `mountInto()` twice on the same host is a
  no-op.
- `page` is a short string literal each HTML file passes
  (`"index"`, `"sprites"`, `"behaviour"`, `"code"`).
- `getProjectName` is an optional callback so each page can return
  its own idea of a project name (e.g. index/sprites use
  `state.currentProjectName`; behaviour/code can return `""`).
- On success: clears the message textarea, leaves category + name
  as-is (so a pupil reporting three bugs doesn't have to re-pick
  the category each time), shows an inline *"Thanks — sent!"*
  green banner for ~3 seconds.
- On network / validation failure: inline red banner
  *"Couldn't send — check your connection and try again."*  Form
  content is preserved.

Each HTML file adds:

```html
<script src="feedback.js"></script>
```

and wires it once at the bottom of its page script:

```js
Feedback.mountInto(
  document.querySelector('.feedback-form-host'),
  { page: 'sprites', getProjectName: () => state.currentProjectName }
);
```

On tabbed pages the mount happens on first click of the tab (so
the form isn't built for pupils who never open it); on
behaviour/code it happens when the help dialog is first opened.

## Files to modify / add

- **New:** `tools/tile_editor_web/feedback.js` (~150 lines
  including styles injected via a `<style>` tag so we don't touch
  the four HTML `<style>` blocks).
- **New:** `feedback.jsonl` (implicit — created on first submission,
  `.gitignore`d).
- `tools/playground_server.py` — `do_POST` gets a `/feedback`
  branch; new `_feedback()` method (~40 lines incl. validation).
- `tools/tile_editor_web/index.html` — one extra tab button,
  one extra tab panel, one extra `<script>` tag, one mount call.
- `tools/tile_editor_web/sprites.html` — same four edits.
- `tools/tile_editor_web/behaviour.html` — `<details>` block inside
  help dialog, one `<script>` tag, one mount call.
- `tools/tile_editor_web/code.html` — same three edits as behaviour.
- `.gitignore` — add `feedback.jsonl`.
- `changelog-implemented.md` — new entry summarising what shipped.

## Privacy notes

- Submissions go to a file on the teacher's own machine.  They
  never leave localhost / the classroom LAN.
- The optional name field is explicitly optional and labelled as
  such.
- **Include-my-project checkbox.**  Default off.  When ticked,
  the pupil's full editor state (tiles, palettes, backgrounds,
  sprites, behaviour map, code) is attached to the submission
  under the `project` key.  The checkbox label makes it clear
  what is being sent: *"Include my project so the teacher can see
  what I was doing (sends your tiles, palette and background to
  the teacher)."*  Server body cap is raised to 1 MB to fit
  typical project snapshots (~30-100 kB).
- IP address is captured because the server already knows it — but
  since this is a LAN, it'll typically be `192.168.x.y`.  If we
  ever ran this on a public host, we'd drop IP capture.

## Deferred / out of scope

- **Teacher-facing read-back UI.**  For now I just open
  `feedback.jsonl` in a text editor.  A simple `/feedback/list`
  GET + a one-page viewer is a 20-minute follow-up if it's
  needed.
- **Email notifications.**  Trivial to add via `smtplib` later; not
  needed while I check the file manually.
- **Screenshots / attachments.**  The browser already has the
  editor canvases — could capture them on submit — but again,
  privacy step, and not worth it until a pupil actually asks.
- **Rate limiting.**  One pupil spamming 1000 submissions doesn't
  break anything; JSONL is append-only and text editors handle
  multi-MB files.  Revisit if someone proves it's a problem.
- **Per-pupil identity.**  No login, no cookies.  If we want
  proper per-pupil tracking later, we already set a `project_id`
  in localStorage — that could be echoed back in the submission.

## Risks

- **Pupils submitting nonsense.**  Expected, acceptable, easy to
  skim past in a JSONL file.
- **Concurrent writes racing.**  Two tabs submitting at the same
  moment could in principle interleave bytes.  A module-level
  `threading.Lock` serialises the append so each record lands as
  one contiguous JSONL line regardless of size.

## Acceptance criteria

- From index.html, sprites.html, behaviour.html, or code.html, a
  pupil can open `?`, find the feedback form in under two clicks,
  pick a category, type a message, hit Send, and see a *Thanks —
  sent!* banner.
- The submission appears as one new line in `feedback.jsonl` with
  the expected fields.
- The header toolbar on every page is visually unchanged.
- Empty message → Send stays disabled.  Missing category → Send
  stays disabled.
- Server rejects oversize or malformed POSTs with a 400 and a
  clear `error` field.
