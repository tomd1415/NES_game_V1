# Design documents — UI/UX redesign

This folder holds the design documentation for the **complete UI/UX
redesign** of the playground editor (Backgrounds / Sprites / Behaviour /
Builder / Code pages and their shared chrome).

It is the counterpart to [`plans/`](../plans/): plans track *what work
we execute and when*; this folder holds the *design intent* behind that
work — the vision, principles, wireframes, component specs, and
decisions the implementation is measured against.

## What lives here

| File / area | What it's for |
| ----------- | ------------- |
| Incoming design documents | Drop the new redesign docs here as they arrive. |
| `decisions/` | One file per notable design decision (ADR-style), if/when we need to record trade-offs. |
| `assets/` | Static design assets referenced by the docs (mockup exports, diagrams). Keep source-of-truth files small and self-contained where possible. |

## Conventions

- **File names** are lower-case kebab-case, matching the rest of
  `docs/` outside `guides/` — e.g. `design-vision.md`,
  `component-inventory.md`, `nav-and-chrome.md`.
- **Dated documents** (proposals, review notes) may use the
  `YYYY-MM-DD-<slug>.md` prefix like plans do, so they sort as a
  timeline.
- **One concern per file.** Prefer several focused documents over one
  sprawling one; link between them.
- **Cross-link to the work.** When a design doc drives a plan item,
  link the plan entry in
  [`plans/current/`](../plans/current/) and link back here from the
  plan.

## Status

Redesign work happens on the **`redesign/ui-ux`** branch. This folder
was created empty and ready to receive the incoming design documents.
