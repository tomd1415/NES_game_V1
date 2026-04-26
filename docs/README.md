# Documentation map

This directory holds every Markdown file in the project except the
top-level [`README.md`](../README.md), [`NOTICE.md`](../NOTICE.md),
and [`LICENSE`](../LICENSE).  It's organised so that finding *what
we're working on now* is easy without losing the chronological trail
of how we got here.

## Where things live

| Folder | What's in it |
| ------ | ------------ |
| [`guides/`](guides/) | Pupil-, teacher- and developer-facing reference docs. These change less often than plans and tend to grow in place. |
| [`plans/current/`](plans/current/) | Active plan(s) the project is currently executing against. Should be a small number of files at any time. |
| [`plans/archive/`](plans/archive/) | Superseded plans, named `YYYY-MM-DD-<slug>.md` so they sort chronologically. Old code/comment cross-references that point here are still meaningful — please don't delete or rename them. |
| [`feedback/`](feedback/) | Pupil and teacher bug reports / feature requests, plus broader feedback summaries. The [running bugs list](feedback/recently-observed-bugs.md) feeds the next plan. |
| [`changelog/`](changelog/) | What shipped, when. The [changelog-implemented](changelog/changelog-implemented.md) is a single growing file with one section per shipped change, newest at the bottom. |

## What to read first

- **New to the project?**  Start with the project-root
  [README](../README.md), then
  [`guides/PUPIL_GUIDE.md`](guides/PUPIL_GUIDE.md) for the editor
  walkthrough.
- **Picking up active work?**
  [`plans/current/2026-04-26-fixes-and-features.md`](plans/current/2026-04-26-fixes-and-features.md)
  is the live plan; it lists open items in tiered order and links
  back to the bugs/feedback that motivated each one.
- **Looking for context on a past decision?**  Walk
  [`plans/archive/`](plans/archive/) — the chronological filenames
  let you scan quickly, and most of the recent entries
  cross-reference each other.
- **Adding a feature?**  Append a line to
  [`changelog/changelog-implemented.md`](changelog/changelog-implemented.md)
  when it ships, and link the planning entry it came from.
- **Pupil reported a bug?**  Append to
  [`feedback/recently-observed-bugs.md`](feedback/recently-observed-bugs.md)
  *first*, then add (or link) it under the matching tier in the
  current plan.

## File-name conventions

- **Plans** in `plans/current/` and `plans/archive/` are
  `YYYY-MM-DD-<slug>.md` so the filesystem sort is also a timeline.
- **Guides** keep their historic UPPER_CASE names
  (`PUPIL_GUIDE.md`, `BUILDER_GUIDE.md`, …) because they're
  referenced from the editor UI and from external lesson material.
  Don't rename without sweeping every reference.
- **Feedback** files use lower-case kebab-case
  (`recently-observed-bugs.md`, `pupil-ideas.md`).  Older files
  with mixed conventions (`PUPIL_FEEDBACK.md`) are kept as-is
  because the convention shift wasn't worth the rename churn.

## Inventory at the time of the reorg (2026-04-26)

A snapshot for anyone landing here cold.  Each row shows where the
file *moved to* in the reorg; if you're chasing a code comment that
references the old name, this is your lookup table.

### Guides (now in `docs/guides/`)

| Old path | New path |
| -------- | -------- |
| `PUPIL_GUIDE.md` | `docs/guides/PUPIL_GUIDE.md` |
| `TEACHER_GUIDE.md` | `docs/guides/TEACHER_GUIDE.md` |
| `BUILDER_GUIDE.md` | `docs/guides/BUILDER_GUIDE.md` |
| `AUDIO_GUIDE.md` | `docs/guides/AUDIO_GUIDE.md` |
| `assets/pupil/TILE_EDITOR_GUIDE.md` | `docs/guides/TILE_EDITOR_GUIDE.md` |
| `ASEPRITE_WORKFLOW.md` | `docs/guides/ASEPRITE_WORKFLOW.md` |
| `DEBUGGING_FCEUX.md` | `docs/guides/DEBUGGING_FCEUX.md` |
| `slides/` | `docs/guides/slides/` |

### Plans — archived (now in `docs/plans/archive/`)

| Old path | New path |
| -------- | -------- |
| `IMPLEMENTATION_PLAN.md` | `docs/plans/archive/2026-04-20-implementation.md` |
| `changelog-planned.md` | `docs/plans/archive/2026-04-13-changelog-planned.md` |
| `sprint8-plan.md` | `docs/plans/archive/2026-04-20-sprint8.md` |
| `sprint9-plan.md` | `docs/plans/archive/2026-04-20-sprint9.md` |
| `sprint10-plan.md` | `docs/plans/archive/2026-04-21-sprint10.md` |
| `sprint11-plan.md` | `docs/plans/archive/2026-04-21-sprint11.md` |
| `menu-plan.md` | `docs/plans/archive/2026-04-22-menu.md` |
| `feedback-viewer-plan.md` | `docs/plans/archive/2026-04-23-feedback-viewer.md` |
| `feedback-plan.md` | `docs/plans/archive/2026-04-23-feedback.md` |
| `builder-plan.md` | `docs/plans/archive/2026-04-23-builder.md` |
| `builder-plan-player2.md` | `docs/plans/archive/2026-04-23-builder-player2.md` |
| `builder-plan-phase-b-finale.md` | `docs/plans/archive/2026-04-24-builder-phase-b-finale.md` |
| `builder-plan-phase-b-plus.md` | `docs/plans/archive/2026-04-24-builder-phase-b-plus.md` |
| `plan-batches.md` | `docs/plans/archive/2026-04-24-plan-batches.md` |
| `next-steps-plan.md` | `docs/plans/archive/2026-04-26-next-steps.md` |
| `audio-plan.md` | `docs/plans/archive/2026-04-26-audio.md` |

### Plans — current (now in `docs/plans/current/`)

| New path | What it tracks |
| -------- | -------------- |
| `docs/plans/current/2026-04-26-fixes-and-features.md` | The post-Phase-4 plan: fixes the 27 outstanding pupil-reported items in tiered order. |

### Feedback / changelog (now in `docs/feedback/` and `docs/changelog/`)

| Old path | New path |
| -------- | -------- |
| `recenly_observed_bugs.md` | `docs/feedback/recently-observed-bugs.md` (typo fix) |
| `pupil_ideas.md` | `docs/feedback/pupil-ideas.md` |
| `PUPIL_FEEDBACK.md` | `docs/feedback/PUPIL_FEEDBACK.md` |
| `changelog-implemented.md` | `docs/changelog/changelog-implemented.md` |

## Known broken cross-links after the reorg

The reorg moved ~30 files.  Most cross-references are intra-
folder (e.g. one guide linking to another guide both in
`docs/guides/`) and still resolve.  A handful of inter-folder
links inside *archived* plans now point at the old root paths;
because those plans are historical, we deliberately did not
chase every one.  If you're walking back through them and hit a
broken link, the table above is the lookup.

Code-side references (HTML / JS / Python comments) were updated
in-place during the reorg.
