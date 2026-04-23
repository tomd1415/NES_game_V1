# Menu reorganisation — Plan B (grouped toolbar)

A single-row header split into four visually distinct groups with
thin dividers between them.  The pattern matches the browser's own
menu bar (File / Edit / View / Window) so pupils already know the
idiom from everyday software.

Sources / targets:

- [index.html](tools/tile_editor_web/index.html) — Backgrounds page,
  ~11 action items in the toolbar today (lines 916-965).
- [sprites.html](tools/tile_editor_web/sprites.html) — Sprites page,
  ~10 items (lines 1620-1664).
- [behaviour.html](tools/tile_editor_web/behaviour.html) — Behaviour
  page, 6 items (lines 338-365).
- [code.html](tools/tile_editor_web/code.html) — Code page, 10 items
  (lines 325-363).
- Each page has its own inline `<style>` block (no shared
  stylesheet) — CSS changes have to be made in all four.

---

## Problem & goal

The toolbar wraps onto two rows on 1366×768 laptop screens (the
classroom standard) because every action lives at the top level.
Categories are mixed together: *save / open / recover* sit next to
*undo / redo* sit next to *play* sit next to *auto-download
backups* (a preference, not an action).  The four pages also differ
in inconsistent ways — Play exists on two, Recover on two, Export
on two, Clear means three different things.

Goal: a one-row toolbar whose four groups are immediately
recognisable on every page, with the most-used items visible and
the rare ones one click away.

## Scope summary

- **In:** HTML restructure in all four editor pages, CSS for the
  new groups and dividers, a widened File ▾ dropdown that absorbs
  today's Projects ▾, Save, Open, Recover, Import, Export and
  auto-download, a tiny save-status dot replacing the 130-px pill,
  a Mode ▾ dropdown on code.html that bundles Guided/Advanced +
  C/Asm, a Code tools ▾ dropdown that hides Snippets / Symbols /
  Restore, a project-name Rename row inside File ▾ replacing the
  standalone input.
- **Out:** any behaviour change.  Every button keeps its existing
  `id` so the existing click handlers, keyboard shortcuts and
  tests continue to work.  No changes to saved projects, lessons,
  snippets, or the Play pipeline.  No migration.

---

## Target layout (all four pages)

```
┌─── page identity ───┐  ┌─── actions ──────────────────────────────────────────────────┐
[🎮 Title] [tabs …]    │  ●  [📁 projname ▾] │ ↶  ↷  [Clear …] │ [page tools …] │ [▶ Play]  [?]
                       │  └──── File ───────┘ └──── Edit ─────┘ └──── Page ────┘ └── Run ─┘
```

Groups are `<div class="tb-group">` blocks.  Between groups the
header uses a thin vertical divider (`border-left` on each group
after the first), giving unambiguous visual grouping without
browser menu-bar hover behaviour or any JS.

## File ▾ — unified dropdown (replaces Projects ▾)

One `<details id="file-menu">` per page.  Summary shows
`📁 <active-project-name> ▾` — identical to today's Projects ▾, so
pupils' click target doesn't move.  Body contains, top to bottom:

1. **Projects list** (existing `.projects-list` — switch project).
2. **Rename this project** — a small `<input>` + tick button.
   Replaces the standalone `#project-name` field in the header.
3. **+ New project…**, **⎘ Duplicate**, **🗑 Delete** (existing
   btn-project-new / -duplicate / -delete moved in).
4. Divider.
5. **💾 Save all my work** / **📂 Open saved work** (existing
   btn-save-all / btn-load-all moved in).
6. **♻ Recover from snapshot…** (existing btn-recover moved in) —
   index.html + sprites.html only; not on behaviour/code (no
   recovery dialog today).
7. Divider (only if the page has the items below).
8. **🌐 Import background…** / **🌐 Import sprites…** (existing
   btn-import moved in) — index.html + sprites.html only.
9. **📤 Export as…** — existing export-menu buttons rendered
   inline (JSON / text / chr / nam / pal / all on index; JSON /
   inc / h on sprites) — index.html + sprites.html only.
10. Divider.
11. **☐ auto-download backups every 5 min** (existing
    auto-download label moved in) — index.html only.

This means File ▾ has a consistent *order* across pages, with the
later sections simply absent on pages that don't have them.  Pupils
building muscle memory on one page transfer most of it to the
others.

## Edit group — three items max

- **↶ Undo** (existing btn-undo, unchanged).
- **↷ Redo** (existing btn-redo, unchanged).
- **Clear X** — one per page, different label + id:
  - index.html:     **🗑 Clear project** (existing btn-new).
  - sprites.html:   **🗑 Clear project** (existing btn-new).
  - behaviour.html: **🗑 Clear map** (existing btn-clear-all).
  - code.html:      **↻ Restore default** (existing btn-restore).

Keeping existing ids means the existing click handlers / confirm
dialogs keep working with no JS changes.

## Page tools group — only where needed

- **index.html**, **sprites.html**, **behaviour.html:** empty.
  The group disappears (no divider, no space).
- **code.html:** three items:
  1. **🎓 Mode ▾** — new dropdown.  Body contains the two
     existing mode-toggle `<span>`s (Guided/Advanced + C/Asm).
     The summary shows `🎓 Guided · C` (or whichever pair is
     active) and updates whenever either sub-toggle flips.  The
     existing buttons (`btn-mode-guided`, `btn-mode-advanced`,
     `btn-lang-c`, `btn-lang-asm`) keep their ids and event
     handlers.
  2. **📚 Lesson chip** — unchanged (btn-lesson-chip).  Active
     label *"Platform intro"* etc. stays visible — pupils need to
     see which lesson is loaded.
  3. **🧰 Code tools ▾** — new dropdown containing
     **🧩 Snippets…** / **⌨ Symbols…** — two items pupils use
     occasionally but that aren't needed at a glance.

## Run group — rightmost, consistent placement

- **Run on: [browser|native]** — code.html only (existing
  `#pg-runon`, moved next to Play so the select/target/go trio
  reads left-to-right).
- **▶ Play in NES** — sprites.html + code.html (existing btn-play).
- **?** — all pages (existing btn-help).

## Save-status — 130-px pill → 20-px dot

Today's pill reads *"● Loading…"* / *"● Saved just now"* / *"⚠ Save
failed — click"* and lives in a fixed `min-width: 130px` container.
That's ~140 px of real estate for text that most of the time says
the same thing.

Change: keep the element and its class swaps (`saved` / `saving` /
`error`) but shrink to a fixed `width: 20px` coloured dot with the
full message moved into its `title` attribute (so hover / long-press
shows the text).  One-line CSS change per page.  The existing
`setStatus(cls, text)` call sites need one tiny tweak: set the
element's `title` in addition to its `textContent`, so hovering
shows the current message.  Error state also keeps the error text
visible — the pill widens only when the class is `error`.

## Group dividers — CSS

Add to every page's `<style>` block (replacing / extending
`.app-header .toolbar` rules):

```css
.app-header .toolbar { gap: 4px; }
.tb-group { display: flex; align-items: center; gap: 6px; }
.tb-group + .tb-group {
  margin-left: 6px; padding-left: 10px;
  border-left: 1px solid var(--border);
}
.tb-group:empty { display: none; }  /* pages with no page-tools group */
```

## Files touched

Edits only — no new files.

- `tools/tile_editor_web/index.html` — header restructured; File ▾
  absorbs Projects + Save + Open + Clear-project-moved-to-Edit-group +
  Recover + auto-download + Import + Export; save-status shrinks.
- `tools/tile_editor_web/sprites.html` — same pattern.
- `tools/tile_editor_web/behaviour.html` — same pattern (subset —
  no Recover / Import / Export / auto-download).
- `tools/tile_editor_web/code.html` — same pattern plus Mode ▾ and
  Code tools ▾ dropdowns consolidating 5 code-specific items into
  3.
- `changelog-implemented.md` — entry summarising the reorganisation.

## Rollback / safety

- Every button keeps its existing `id` and event handler — the
  change is pure DOM *location* + CSS.  Reverting is a single
  `git revert` if pupils don't like it.
- Keyboard shortcuts (Ctrl+Z/Y/S, `?`, etc.) are unchanged.
- Saved projects and the `state` schema are unchanged — no
  migration needed.
- The `project-name` input still exists inside File ▾ with the
  same id, so code that reads `document.getElementById('project-name').value`
  keeps working.

## Verification

- `node --check` clean on any inline `<script>` bodies.
- Open each page in the browser, confirm: File ▾ contains every
  item it used to contain in the toolbar; Undo/Redo/Clear work;
  Play still runs; `?` opens help; Save / Open round-trip a
  project; the save-status dot changes colour when I edit + save.
- Header stays on one row at 1366 px on each page.
- No JS errors in the console on load.

## Deferred / out of scope

- **Plan D's command palette.** Separate follow-up if/when the
  toolbar outgrows even the File ▾ dropdown.
- **Proper icon-only Undo/Redo buttons.** Left with their short
  emoji labels; tooltip is already on them.
- **Mobile / narrow-screen responsive header.** The layout
  already fits 1366 px; tablet/phone reflow is a separate
  sprint if it ever matters.
