# Design and product architecture documents

This folder holds the design documentation for the browser editor's
**complete UI/UX redesign** and for additional product architecture, including
the native Linux application. The browser and native applications are
supported sibling products.

It is the counterpart to [`plans/`](../plans/): plans track *what work
we execute and when*; this folder holds the *design intent* behind that
work — the vision, principles, wireframes, component specs, and
decisions the implementation is measured against.

## Start here

**[`phased-plan.md`](phased-plan.md)** is the roadmap — the sequenced,
shippable plan for the redesign. It links the three docs that give it its
"why" and "what":

| Doc | What it holds |
| --- | ------------- |
| [`phased-plan.md`](phased-plan.md) | **The roadmap.** Phase 0–4, mapped to the handover's P0/P1/P2, grounded in the current `tools/tile_editor_web/` code. Read this to know *what happens in what order*. |
| [`design-principles.md`](design-principles.md) | The approved direction & the NES constraints the tool must always enforce — the tie-breaker when a decision is unclear. |
| [`ui-architecture.md`](ui-architecture.md) | The unified-workspace IA: mode rail, contextual dock, the central "TV", quest log; how the old seven pages map to the new modes. |
| [`target-data-model.md`](target-data-model.md) | The tile-first data model + an honest gap analysis: what the current build already stores correctly vs. the real gaps. |
| [`feature-parity.md`](feature-parity.md) | **The parity yardstick.** Everything the current seven pages do (from a 2026-07-05 code audit), page by page — no page retires until its checklist is covered. |
| [`engine-versioning.md`](engine-versioning.md) | **The NES-engine versioning system.** How every ROM/project is stamped with an engine version, how each engine is snapshotted for rollback, and how the site falls back to the engine a game was authored for. **Read before changing the ROM-building engine.** |
| [`quest-tutorials.md`](quest-tutorials.md) | **Quest tutorial plan.** Side-by-side, accessible tutorials for each Studio game style, including pupil wording, checks, starter kits, illustrations, audio, and large-text support. |

### Native Linux application

The
[native Linux application plan](linux-native/2026-07-10-linux-native-migration-plan.md)
defines the second, native product target. The browser application remains
supported; both teams work from `main` and share project, engine and ROM
contracts. Repository ownership and review rules are in
[`CONTRIBUTING.md`](../../CONTRIBUTING.md).

### Decisions (ADR-style, under `decisions/`)

| Doc | What it holds |
| --- | ------------- |
| [`decisions/2026-07-10-native-linux-dual-target.md`](decisions/2026-07-10-native-linux-dual-target.md) | **Native Linux = a second sibling product over frozen JSON/ROM contracts.** Records the load-bearing decisions (dual-target, extract the Python build core, PySide6, the provisional QJSEngine codegen bet) and the alternatives rejected. Companion to the [native migration plan](linux-native/2026-07-10-linux-native-migration-plan.md). |
| [`decisions/2026-07-05-data-model-audit.md`](decisions/2026-07-05-data-model-audit.md) | Data-model gap tickets DM-1..DM-5 and their status. |
| [`decisions/2026-07-05-engine-items-feasibility.md`](decisions/2026-07-05-engine-items-feasibility.md) | Feasibility + golden-ROM risk of each Phase-4 engine item; recommends per-door as the lowest-risk. |
| [`decisions/2026-07-05-deliberate-parity-drops.md`](decisions/2026-07-05-deliberate-parity-drops.md) | Old-page affordances deliberately dropped/deferred and where each landed. |

### Source material (incoming design documents)

| File | What it is |
| ---- | ---------- |
| `NES Studio - Design Handover.dc.html` | The **direction document**. Its §3–§5 define what "correct" means. Authoritative on intent. |
| `SpriteMaker Studio.dc.html` | The interactive **prototype**. Approved for *look & UX only*; its data model and several mechanics are deliberately simplified/wrong — do not extend it. |
| `notes.md` | The reviewer's questions about the prototype; each is answered in [`phased-plan.md`](phased-plan.md). |

### Supporting folders

| File / area | What it's for |
| ----------- | ------------- |
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

Redesign work happens on the **`redesign/ui-ux`** branch. The design
direction is captured and the phased plan is drafted (2026-07-05).
**Implementation has begun: Phase 0 (the Studio shell) is largely
landed** — `tools/tile_editor_web/studio.html` boots game-first, renders
LIVE, plays via the real cc65 pipeline, and is covered by a Playwright
suite (`tools/studio-tests/`). See the "Phase 0 — landed so far" section
in [`phased-plan.md`](phased-plan.md) for what is done and what remains,
plus the sequence and open questions for the team.
