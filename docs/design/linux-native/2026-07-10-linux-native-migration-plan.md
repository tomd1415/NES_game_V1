# Native Linux application assessment and dual-target implementation plan

**Status:** proposed architecture and delivery plan

**Assessment date:** 2026-07-10

**Codebase baseline:** engine v62

**Target:** add a genuine Linux desktop application alongside the supported web application

## Executive conclusion

Turning NES Studio into a native Linux application is feasible, but it is not a
packaging exercise. The ROM engine and much of the build backend can be reused;
the interface is a substantial native rewrite.

The recommended target is:

- Python 3 with PySide6 / Qt 6 Widgets for the desktop client.
- QPainter, QImage, custom widgets and QGraphicsView for the live NES screen,
  world editor, tile editor and sprite editor.
- A transport-independent Python core extracted from
  [playground_server.py](../../../tools/playground_server.py).
- Direct build-service calls with no required localhost HTTP server.
- Qt's QJSEngine as a narrow compatibility runtime for the existing,
  versioned Builder code generator. It evaluates trusted bundled scripts; it
  does not render HTML and does not require Qt WebEngine, Chromium, Node or a
  WebView.
- SQLite plus atomic JSON import/export in XDG-standard user directories.
- Optional, user-installed FCEUX as the first supported native Play path.
  Build and ROM export must still work when no emulator is installed. A later
  out-of-process emulator can provide in-window Play and headless preview
  capture.
- The current browser application retained as a supported product with its own
  release, test and deployment path. It is also the initial behavioral oracle
  for native parity work.

This choice minimizes changes to the most sensitive part of the product: the
project-to-ROM contract. It also provides a genuinely native interface with
native menus, dialogs, accessibility, keyboard handling and desktop
integration.

A strict zero-JavaScript interpretation is possible, but it would require
rewriting the 2,751-line Builder emitter and finding a new way to preserve 62
historical engine generators. The recommended interpretation of “not a web
app” is therefore:

- no HTML or CSS presentation;
- no DOM, Canvas, localStorage or browser lifecycle;
- no WebView, Chromium, WebKit or browser window;
- no required HTTP listener;
- trusted JavaScript is permitted only as an internal deterministic codegen
  implementation detail.

## What “native” means for this project

The native release should satisfy all of these conditions:

1. The visible interface is composed from Qt widgets and Qt-painted surfaces.
2. Starting the app does not start a browser, WebView or localhost server.
3. A project can be opened, edited, compiled and exported with networking
   disabled.
4. Installed resources are read-only; every mutable file is written to an XDG
   user directory.
5. Build and emulator processes are launched with argument arrays and managed
   by the application.
6. The app works under both Wayland and X11.
7. Keyboard-only use, screen-reader names and high-contrast/text-scale modes
   are release criteria rather than follow-up polish.
8. Classroom accounts and gallery publishing, if retained, are optional
   network services. Their existence does not make the editor a web app.

These conditions apply to the native artifact only. They do not deprecate or
constrain the separately supported browser application.

Electron, Tauri, Qt WebEngine and GTK WebKit are intentionally excluded. They
would create an installable desktop shell quickly, but the interface would
still be HTML/CSS/JavaScript rendered by a browser engine. Electron's own
[process-model documentation](https://www.electronjs.org/docs/latest/tutorial/process-model)
describes its renderer as web content inside a Chromium-style architecture.

## Product and repository development strategy

The web and native applications should be permanent sibling products in this
repository. This is a dual-target implementation, not a cutover from one UI to
another:

- [tools/tile_editor_web](../../../tools/tile_editor_web/) remains the web
  application and continues to receive fixes and product improvements;
- `native/` contains the PySide6 application and has its own entry point,
  dependency metadata, tests and release artifacts;
- shared project schemas, engines, build behavior and deterministic fixtures
  remain repository-level contracts used by both targets;
- the extracted Python build core exposes an HTTP adapter for the web app and
  a direct in-process adapter for the native app;
- neither target may silently change the shared JSON or ROM contract for the
  other target.

Use `main` as the integration branch for both products. Develop the native app
through short-lived, reviewable branches such as
`chore/linux-native-baseline-v62`, `refactor/shared-build-core` and
`feat/native-shell`; merge each completed slice back to `main`. Do not maintain
a permanent native branch, because it would allow shared engines, fixtures and
build behavior to drift. A Git worktree is useful when both applications need
to be open at once, but it should still use ordinary short-lived branches.

### Team topology and decision rights

Two groups can develop the products concurrently when ownership follows the
code boundaries:

| Area | Primary responsibility | Required cross-team involvement |
| --- | --- | --- |
| Web UI, browser storage and Playwright product tests | Web team | Native review only when a shared contract or service interface changes |
| Native UI, XDG persistence and Linux packaging | Native Linux team | Web review only when a shared contract or service interface changes |
| Extracted build core, project schema, engines and cross-target fixtures | Joint | At least one reviewer from each team |
| Product scope, deliberate parity differences and release policy | Product owner | Teams provide evidence and recommendations; product owner decides |

The repository owner/product owner, GitHub `@tomd1415`, has final authority on
product direction, shared-contract exceptions, security/data/licensing policy
and release readiness. Routine implementation decisions remain with the owning
team inside an approved scope. When teams disagree on a lasting or expensive
choice, record the options, evidence and recommendations in an ADR; the product
owner selects the outcome. This prevents an unresolved disagreement from
turning into permanent branch or product divergence.

The day-to-day branch, review, testing and release rules are defined in
[CONTRIBUTING.md](../../../CONTRIBUTING.md). The initial
[CODEOWNERS](../../../.github/CODEOWNERS) file requires the product owner's
review on governance and high-impact shared paths. Add resolvable web/native
GitHub team handles when those teams are created. CODEOWNERS enforcement also
requires the corresponding branch-protection settings on the hosting service.

CI should have explicit web, shared-contract and native jobs. A change to a
shared schema, engine or build component must run both targets' relevant test
suites. Web-only and native-only changes run their own UI suites plus the
shared contract tests. Releases may use independent versions and schedules,
provided each records the shared engine/schema compatibility range it ships.

## Current codebase assessment

### Scale and shape

The present application contains:

| Area | Current size / evidence | Native implication |
| --- | --- | --- |
| Python build and HTTP backend | [playground_server.py](../../../tools/playground_server.py), 4,421 lines | Extract and reuse the build/codegen functions; retain HTTP for the web app and use direct calls as the native UI boundary. |
| Accounts and cloud-project store | [accounts.py](../../../tools/accounts.py), 444 lines | Reusable transport-neutral SQLite service; not required for ordinary local projects. |
| Non-vendored browser JavaScript | 14,069 lines under [tile_editor_web](../../../tools/tile_editor_web/) | Keep it maintained for the web target. Pure algorithms may be retained or ported for native; native DOM, storage, orchestration and rendering require separate implementations. |
| HTML pages | 22,501 lines across eight pages | Keep the web surfaces supported. Do not port page-for-page; express their capabilities through the unified native Studio information architecture. |
| Engine history | 62 snapshots, approximately 34 MB, under [tools/engines](../../../tools/engines/) | Share and preserve the compatibility data across both targets; do not rewrite every historical generator. |
| Builder/ROM tests | 101 top-level .mjs files and about 14,615 lines | Preserve as the permanent project-to-ROM safety net for both products. |
| Studio browser tests | 22 specs, 111 discovered Playwright tests | Keep them as the permanent web regression suite and behavioral specifications; add native UI tests rather than replacing them. |

The npm project is not the application build. [package.json](../../../package.json)
explicitly describes itself as the Playwright/browser test harness. There is no
native application build system, desktop entry, AppStream metadata, MIME type,
release pipeline or application version today.

### Current runtime flow

~~~text
studio.html + studio-*.js
        |
        +-- mutable JSON project state
        |      +-- Canvas 2D live authoring preview
        |      +-- localStorage current/snapshots/backups
        |      +-- DOM-generated mode docks and dialogs
        |
        +-- PlayPipeline
               +-- fortify state / derive players and scene
               +-- BuilderAssembler + BuilderModules -> custom main.c
               +-- POST /play
                        |
                        +-- Python CHR/NAM/palette/scene/code emitters
                        +-- clone Step_Playground into a temporary directory
                        +-- make -> cc65 -> ca65 -> ld65
                        +-- ROM bytes
                               +-- jsnes in browser, or
                               +-- external FCEUX
~~~

The modern entry point is
[studio.html](../../../tools/tile_editor_web/studio.html), whose ordered script
graph is near lines 564–598. [studio.js](../../../tools/tile_editor_web/studio.js)
owns the shared mutable state, save timers, undo/redo, rendering dispatch,
imports, exports, publishing and Play orchestration.

The server is several systems in one file:

- project-to-ROM encoders and generated-source emitters;
- temporary build workspace management;
- static-file and documentation serving;
- lesson/snippet/audio resource APIs;
- accounts, sessions and cloud projects;
- feedback and gallery storage;
- HTTP, cookies, CSRF and process startup.

The useful seam is the JSON project model plus the project-to-ROM build
contract, not the HTTP route.

### What can be reused

#### Reuse with minimal behavioral change

- The C and 6502 engine under
  [Step_Playground](../../../steps/Step_Playground/).
- Engine snapshots and manifests under
  [tools/engines](../../../tools/engines/).
- Python CHR, NAM, palette, metatile, scene, collision, behavior, world and
  project include generation in
  [playground_server.py](../../../tools/playground_server.py).
- Isolated temporary builds and the bounded compile-concurrency idea.
- The canonical project JSON shape documented in
  [project-state-schema.md](../../reference/project-state-schema.md).
- The tile-first model documented in
  [target-data-model.md](../target-data-model.md).
- The transport-neutral account/project store in
  [accounts.py](../../../tools/accounts.py).
- The deterministic Builder assembler and module emitters:
  [builder-assembler.js](../../../tools/tile_editor_web/builder-assembler.js)
  and
  [builder-modules.js](../../../tools/tile_editor_web/builder-modules.js).
- The pure validator rules in
  [builder-validators.js](../../../tools/tile_editor_web/builder-validators.js).
- The existing Node/jsnes ROM tests as independent output oracles.

#### Reuse after extracting browser-independent algorithms

- Metatile migration, promotion, expansion and deletion from
  [metatiles.js](../../../tools/tile_editor_web/metatiles.js).
- Palette, tile and metasprite calculations from
  [sprite-render.js](../../../tools/tile_editor_web/sprite-render.js).
- WORLD paint/fill/selection/attribute algorithms from
  [studio-world.js](../../../tools/tile_editor_web/studio-world.js).
- CHARS/TILES drawing, transforms, tile-reference rewrites and animation
  calculations from the corresponding Studio mode modules.
- Play request derivation from
  [play-pipeline.js](../../../tools/tile_editor_web/play-pipeline.js).
- The starter states from
  [studio-starter.js](../../../tools/tile_editor_web/studio-starter.js).
  Prefer generating canonical JSON starter fixtures from the existing code
  rather than manually retyping its large pixel arrays in Python.

#### Rewrite

- All HTML/CSS/DOM UI.
- Browser Canvas and pointer-event glue.
- Browser navigation and modal construction.
- localStorage persistence and quota handling.
- FileReader, Blob URL and anchor-based import/export.
- CodeMirror.
- jsnes Canvas/Web Audio/input orchestration.
- Playwright UI automation as the long-term native UI test layer.
- Cookie-specific account UI and browser CSRF assumptions.

## Scope warning: Studio is not yet the whole legacy product

The repository has a unified Studio and a set of mature legacy pages. The
mapping is documented in
[feature-parity.md](../feature-parity.md):

| Legacy surface | Native destination |
| --- | --- |
| Backgrounds | WORLD + TILES + PALS |
| Sprites | CHARS + TILES + PALS |
| Builder | STYLE/RULES + WORLD entity placement + app chrome |
| Behaviour | WORLD tile types + RULES reactions |
| Audio | SOUND |
| Code | CODE |
| Gallery | native Home/Gallery screen |

A native port of only the controls visible in the current Studio would lose
features that still exist only or more completely in the old pages. Before
implementation, the team must select one of two explicit targets:

1. **Recommended:** the union of current Studio plus the legacy parity
   checklist. This takes longer but preserves the classroom product.
2. Current Studio only, with every omitted legacy feature recorded as a
   deliberate parity drop in a decision document.

Do not create eight native copies of the old pages. Use the approved single
workspace in [ui-architecture.md](../ui-architecture.md), while treating the
legacy pages and [feature-parity.md](../feature-parity.md) as the test oracle.

## Recommended native architecture

~~~text
┌──────────────────────────── Native Qt application ────────────────────────────┐
│                                                                              │
│  Qt Widgets UI                                                               │
│  ├── Main window / mode rail / dock / TV / quest panel                       │
│  ├── WORLD, CHARS, TILES, PALS, STYLE, RULES, SOUND, CODE                    │
│  └── Gallery, project manager, diagnostics, settings                         │
│                  │                                                           │
│                  ▼                                                           │
│  ProjectSession + command layer                                              │
│  ├── canonical JSON-compatible model                                         │
│  ├── migrations + schema/semantic validation                                 │
│  ├── QUndoStack commands                                                     │
│  └── change notifications                                                    │
│          │                    │                         │                      │
│          ▼                    ▼                         ▼                      │
│  LocalProjectRepository  BuildService              RemoteClassroomApi        │
│  ├── SQLite             ├── immutable state copy    ├── accounts/cloud saves │
│  ├── XDG paths          ├── BuildRequestFactory     ├── gallery/feedback     │
│  ├── snapshots          ├── EngineRegistry          └── optional/TLS         │
│  └── QSaveFile exports  ├── QJSEngine codegen                               │
│                         ├── Python ROM emitters                               │
│                         └── isolated cc65 build                               │
│                                      │                                       │
│                                      ▼                                       │
│                                  ROM artifact                                │
│                                  ├── export                                  │
│                                  ├── optional FCEUX (first Play path)         │
│                                  └── emulator helper (later)                  │
└──────────────────────────────────────────────────────────────────────────────┘
~~~

### Proposed repository layout

The existing top-level src directory is NES C/assembly source, so the desktop
application should not reuse that name.

~~~text
native/
  pyproject.toml
  src/
    nes_studio/
      __main__.py
      application.py
      core/
        model.py
        migrations.py
        validation.py
        starters.py
        metatiles.py
        codegen_runtime.py
        build_request.py
        build_service.py
        engine_registry.py
        toolchain.py
        resources.py
      persistence/
        project_repository.py
        schema.sql
        import_export.py
      ui/
        main_window.py
        session.py
        commands.py
        modes/
          world.py
          chars.py
          tiles.py
          pals.py
          style.py
          rules.py
          sound.py
          code.py
        widgets/
          nes_canvas.py
          tile_grid.py
          sprite_editor.py
          quest_panel.py
          build_log.py
      integrations/
        fceux.py
        classroom_api.py
        emulator_helper.py
  tests/
    unit/
    contract/
    ui/
packaging/
  linux/
    icons/
    io.github.nesstudio.NESStudio.desktop
    io.github.nesstudio.NESStudio.metainfo.xml
    mime/
~~~

The exact reverse-DNS application ID should be confirmed before shipping. Once
published, it becomes part of settings paths, desktop activation and package
metadata and should not be changed casually.

### Core interfaces

Keep the UI dependent on small interfaces instead of concrete files or HTTP:

~~~text
ProjectRepository
  list_projects()
  create(document)
  load(project_id)
  save(project_id, document)
  snapshot(project_id, reason)
  restore(project_id, snapshot_id)

BuildService
  build(project_document, target_engine, cancellation_token) -> BuildResult

CodegenRuntime
  assemble(project_document, engine_bundle) -> GeneratedMain
  validate(project_document, engine_bundle) -> list[Problem]

Emulator
  play(rom_path)
  stop()
  capabilities()

ClassroomApi
  authenticate(...)
  list_remote_projects()
  upload_project(...)
  list_gallery()
  publish(...)
~~~

The native UI must never know where engine source files live, how cc65 is
invoked, or whether a remote service uses HTTP.

## Why PySide6 / Qt 6 Widgets

PySide6 fits this repository better than the main alternatives:

| Option | Assessment |
| --- | --- |
| **PySide6 / Qt Widgets** | Recommended. Reuses Python build logic, provides strong custom drawing, models/views, dialogs, process APIs, undo, accessibility and a standalone QJSEngine. Qt's [QJSEngine](https://doc.qt.io/qt-6/qjsengine.html) evaluates JavaScript without a WebView. |
| GTK4 / PyGObject | Viable and more GNOME-specific, but portable packaging is less self-contained and there is no equally direct fit for the 62 JavaScript generator snapshots. |
| Rust plus egui/iced/Slint | Good long-term binary/performance characteristics, but would rewrite or sidecar both the Python build core and much browser domain logic. Highest parity risk. |
| Native UI over the existing localhost server | Useful only as a short transition. It retains ports, HTTP/base64, process lifecycle and source-tree path assumptions. |
| Electron/Tauri/WebView | Fastest wrapper, but remains a web UI and fails the stated requirement. |

Qt's
[Graphics View framework](https://doc.qt.io/qtforpython-6/overviews/qtwidgets-graphicsview.html)
supports coordinate mapping, transformations, drag/drop and interactive items,
which closely match the world and sprite editors. PySide6 is officially
available under LGPLv3/GPLv3 or commercial terms; packaging must comply with the
chosen terms. This repository is MIT-licensed and open source, so dynamic Qt
libraries plus complete notices/source-offer compliance are a practical route,
but the release still needs a license review.

### Browser-to-Qt mapping

| Current implementation | Native implementation |
| --- | --- |
| studio.html shell | QMainWindow, QSplitter, QListView, QStackedWidget and dock/side panels |
| Canvas 2D | QImage plus QPainter in a custom QWidget; QGraphicsView where zoom/pan/items are useful |
| DOM-generated lists/cards | QAbstractListModel/QAbstractTableModel plus delegates and ordinary widgets |
| pointer events | mouse, tablet, wheel, drag/drop and key event handlers |
| full-state undo arrays | QUndoStack with small command objects |
| setTimeout/setInterval | QTimer |
| localStorage | SQLite project repository |
| FileReader/Blob/download links | QFileDialog plus QSaveFile |
| CSS themes | application QPalette plus scoped QSS; retain NES-palette and high-contrast themes |
| CodeMirror | QPlainTextEdit, QSyntaxHighlighter, QCompleter and protected guided ranges |
| fetch /play | BuildService on a worker thread |
| jsnes modal | capability-gated external FCEUX first; native emulator helper later |
| browser accessibility tree | Qt accessible names, descriptions, focus order, shortcuts and AT-SPI validation |

Use nearest-neighbor scaling everywhere that NES pixels are enlarged. Keep the
canonical authoring surfaces at 256×240 or exact tile multiples, then scale for
display without smoothing.

Custom-painted editors need more than a label on the outer widget. Each editor
must expose a semantic grid/cell model through a custom QAccessible interface
or a synchronized structured editing view. Assistive technology must be able to
discover the current cell, coordinates, value/palette/type, selection and
available edit actions, and must receive change notifications as the cursor or
content moves.

## Project model and migration rules

### Preserve the JSON contract

The native app should load and save the same project document used today. Do
not introduce a native-only project schema during the UI rewrite.

Important rules from
[project-state-schema.md](../../reference/project-state-schema.md):

- state.version, state.engineVersion and state.builder.version are independent
  counters.
- The current storage layer serializes the whole object without filtering.
- Unknown and legacy fields therefore need to round-trip unchanged.
- Migrations are additive and currently vary across several pages.
- Invalid current Studio state is only minimally validated.

Use a ProjectDocument wrapper around a raw dictionary rather than serializing
only Python dataclass fields. Typed accessors can provide safety while an
unknown_fields map, or the untouched raw document, preserves forward and
legacy compatibility.

### Centralize migration and validation

Create one Python migration pipeline:

1. Parse JSON without mutating the source bytes.
2. Record the original schema and engine stamps.
3. Add missing fields idempotently.
4. Re-wrap legacy tiles/background fields only after validating the source.
5. Preserve unknown fields.
6. Run structural validation.
7. Run semantic Builder validators.
8. Return warnings separately from fatal errors.

Fixture every historical shape already described in the schema reference:

- single legacy tiles pool;
- top-level nametable/dimensions;
- builder fields before version 1;
- animations before attack assignment;
- behavior slot-6 relocation;
- projects with and without engineVersion;
- valid future/unknown fields;
- truncated and malformed files.

Do not silently discard an invalid project. Put it in recovery mode, preserve
the original bytes and show an actionable error.

### Generate starter fixtures

The current starter generator has large, proven art and configuration tables.
Before replacing it:

1. Run the existing generator for platformer, SMB, top-down, runner, racer,
   tutorial and scratch starters.
2. Save canonical JSON fixtures as native resources.
3. Add a test that the current JavaScript factory still produces identical
   normalized fixtures.
4. Let native project creation clone a fixture, allocate a new identity/name
   and stamp the current application/engine metadata.

This is lower risk than manually translating hundreds of lines of pixel data.

## Persistence and filesystem design

Use QStandardPaths, which maps application data/config/state/cache to the
platform's standard user locations, rather than hard-coding home-directory
paths. On Linux this should result in an arrangement like:

~~~text
$XDG_DATA_HOME/nes-studio/
  projects.sqlite3
  local-gallery/

$XDG_CONFIG_HOME/nes-studio/
  settings.ini

$XDG_STATE_HOME/nes-studio/
  logs/
  crash-recovery/

$XDG_CACHE_HOME/nes-studio/
  builds/
  previews/
  play-latest.nes
~~~

Qt documents these locations through
[QStandardPaths](https://doc.qt.io/qtforpython-6/PySide6/QtCore/QStandardPaths.html).
Use [QSaveFile](https://doc.qt.io/qtforpython-6.10/PySide6/QtCore/QSaveFile.html)
for full-document exports so a failed write cannot replace a valid file with a
partial one.

### Suggested local schema

~~~sql
projects(
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  document_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  engine_version INTEGER,
  revision INTEGER NOT NULL
)

snapshots(
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  document_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
)
~~~

Keep settings outside project JSON. Large generated ROMs and preview images are
cache/artifact files, not database blobs.

### Single-instance and write-conflict policy

Use one writer process per user-data root for the first release:

- acquire an application lock before opening the repository;
- use a local IPC endpoint so a second launch can forward open-file arguments,
  raise the existing window and exit;
- allow multiple project windows only inside that one process;
- enable SQLite foreign keys, WAL, a bounded busy timeout and explicit
  transactions;
- increment projects.revision on every save and update with a matching expected
  revision;
- if an unexpected second writer or recovery tool changed the row, preserve
  both documents by creating a conflict copy instead of applying last-write
  wins.

Test a stale revision even if the normal single-instance lock should prevent
it. The database remains recoverable when the lock/IPC state is stale after a
crash.

### Progress-safety invariants

The native implementation must preserve or improve the current behavior:

- debounce current-state saves after edits;
- snapshot every 30 seconds only when content changed;
- make a backup every five minutes;
- snapshot before Play, import, recovery, engine upgrade, reset and destructive
  project operations;
- snapshot the current state before restoring an older one;
- save synchronously or await a flush before project switch and shutdown;
- keep undo/redo separate from persisted snapshots;
- deduplicate identical snapshots by content hash;
- recover the last good current document after a simulated crash or disk-full
  write.

The current implementation actually caps history at four snapshots and two
backups in [storage.js](../../../tools/tile_editor_web/storage.js), despite
older documentation mentioning other counts. Choose and document a new native
retention policy explicitly instead of inheriting that drift.

### Cross-client data portability

A current full-project JSON export contains one project state only. It does not
contain the localStorage project catalog or Time Machine history. Support both:

1. **Single-project import:** export each desired project from the browser and
   open or drag each JSON file into the native app. When replacing the current
   native project, snapshot that current state as before_import. When importing
   as a new project, preserve the source file and create an imported_baseline
   snapshot instead; there is no pre-import native state to snapshot.
2. **Recommended interoperability bundle:** add an “Export all projects”
   command to the browser app as an ongoing portability feature. The versioned
   bundle should contain the catalog, every current document, available
   snapshots/backups, reason/time metadata and checksums. The native importer
   validates it, reports skipped or corrupt entries and imports atomically or
   into a recoverable staging area. Note that this is *net-new web-team scope
   created by the native effort* and a shared-contract addition (a new bundle
   format): schedule it with the web team and register it under the
   shared-contract rules rather than treating it as a native-only assumption.

Native project JSON exports must remain importable by the web app. If the
native application later exports the multi-project bundle, the browser must
either import the same versioned format or clearly reject unsupported bundle
versions without affecting existing data. Add round-trip tests in both
directions; data portability is a continuing product contract, not a one-time
migration facility.

If the batch exporter is not delivered, portability guidance must state clearly
that each project needs a separate export and browser Time Machine history will
not migrate.

Do not automatically scrape Chrome/Firefox localStorage databases. Browser
profile locations, schemas, permissions and multi-profile behavior are not
stable enough for a reliable classroom migration.

## Build core and engine compatibility

### Extract the Python core before building the full UI

The build functions must move out of the HTTP/server module into a package that
has:

- no module-level database creation;
- no dependency on a repository checkout as the writable directory;
- explicit resource, engine, toolchain and workspace paths;
- typed request/result/error objects;
- no HTTP, cookie or base64 concepts;
- deterministic logging;
- cancellation support;
- tests callable without a GUI.

Keep playground_server.py as the maintained HTTP adapter over the new core for
the web application. The native application uses the same core directly. Both
adapters need permanent contract tests so a core change cannot break one target
while passing on the other.

### Compiler input is a security boundary

Project state can contain custom C, custom 6502 assembly and uploaded audio
assembly. Those inputs can request includes/incbins, generate excessive output
or consume CPU, memory, processes and disk. A temporary directory and
argument-array subprocess call prevent races/injection into the shell, but they
do not sandbox compiler input.

Define two build profiles:

- **Trusted local:** runs with the desktop user's privileges because the user
  is compiling their own code. It still gets time, output-size and workspace
  limits plus reliable cancellation/cleanup.
- **Untrusted classroom service:** runs as a dedicated unprivileged identity
  inside a real OS sandbox/container. Mount only the selected immutable engine
  bundle and an empty workspace, deny network and host-home access, set
  CPU/wall-clock/memory/process/file-size/log limits, strip the environment,
  keep account/gallery/secrets outside the sandbox and destroy the workspace
  after every result.

Do not expose the direct trusted-local profile through a multi-user server.
Add adversarial fixtures for absolute/parent includes, incbin, fork/process
attempts, huge source/log output, infinite compilation and disk exhaustion.

### Never build from the live mutable document

The existing HTTP request naturally creates a detached project object when JSON
is parsed. Direct native calls remove that safety. Current build generation
mutates state while expanding metatiles and injecting racer frames.

BuildService must therefore:

1. serialize/deep-copy the ProjectDocument;
2. migrate and validate the detached copy;
3. run all fortification/codegen against the copy;
4. return artifacts and metadata only;
5. never write generated fields back into the live editor state unless an
   explicit migration/update command does so.

A contract test should hash the live project before and after every build path
and assert equality.

### Preserve the JavaScript generator with QJSEngine

The snapshot script identifies BuilderAssembler and BuilderModules as part of
the versioned ROM engine. They are deterministic string transformers and have
no DOM, localStorage, fetch, navigator or location dependency.

The bridge should:

1. Create a fresh QJSEngine in the build worker thread.
2. Define window as the JavaScript global object.
3. expose a minimal console that captures warnings/errors;
4. set NES_TARGET_ENGINE to the selected version;
5. evaluate that engine bundle's builder-assembler.js first;
6. evaluate builder-modules.js second;
7. transfer state as JSON, not as a live Python object;
8. call BuilderAssembler.assemble with the selected C template;
9. return the generated source and captured diagnostics;
10. destroy the engine after the build.

Only scripts shipped inside a verified engine bundle may be evaluated. Never
evaluate project-supplied JavaScript.

Before committing to the bridge, run a spike across all 62 snapshots:

- each assembler/module pair parses;
- default Builder state can be constructed or supplied;
- representative projects assemble;
- generated source matches the Node implementation byte-for-byte;
- failures identify the engine version and file;
- repeated builds do not leak global state;
- a malformed/untrusted project cannot inject executable text into the bridge.

If a historical script requires a tiny environment shim, keep the shim in the
native compatibility layer. Never edit an immutable snapshot.

### Port PlayPipeline orchestration, not its browser transport

The Builder generator is only one part of Play. Port the non-UI parts of
[play-pipeline.js](../../../tools/tile_editor_web/play-pipeline.js) into a
BuildRequestFactory:

- state fortification and stub-player rules;
- builder-tree initialization;
- player 1/player 2 derivation;
- scene-instance derivation;
- custom C versus custom ASM selection;
- audio song/SFX packaging;
- target engine;
- source and project metadata.

Freeze browser request JSON fixtures first, then require the Python factory to
produce equivalent normalized requests.

### Fix engine selection while extracting

There is an existing compatibility limitation:

- targetEngine is clamped and returned as provenance;
- the current server still builds largely from live sources;
- the engine snapshot script explicitly notes that Python server codegen is not
  snapshotted.

The native EngineRegistry should select:

- the matching Builder JS and C template;
- the matching Step_Playground source/resource tree;
- a compatible Python codegen version.

For v1–v62, Python generator history was not frozen, so exact historical
reconstruction cannot be honestly promised from the snapshots alone. Record
that as a legacy limitation. Starting with the extracted native/build-core
baseline:

1. include Python codegen in the engine bundle manifest;
2. checksum every resource;
3. treat released bundles as immutable;
4. build the project's selected engine exactly, or surface an explicit
   fallback/upgrade decision;
5. never silently claim a historical engine build while using current static
   sources.

### Toolchain discovery

The current Makefile hard-codes /usr/share/cc65/lib/nes.lib. Replace that
assumption with a Toolchain object containing:

- make;
- cc65;
- ca65;
- ld65;
- nes.lib;
- FamiStudio engine directory;
- optional FCEUX.

At first run and in a Diagnostics screen:

1. find executables;
2. record their versions;
3. locate and validate nes.lib;
4. verify the engine/resource hashes;
5. verify XDG directories are writable;
6. compile a tiny smoke ROM;
7. report corrective actions without crashing the app.

Pass absolute command overrides to make. Keep subprocess calls as argument
arrays and do not use a shell.

### Background work and cancellation

Builds must not block Qt's GUI thread. Use a worker QObject/QThread or
QRunnable/QThreadPool, which Qt documents as its reusable task mechanism. The
worker should emit:

- stage changes;
- structured diagnostics;
- appended build-log lines;
- completion artifact;
- cancellation;
- failure with a stable error code.

Use Popen/process groups rather than an uncancelable subprocess.run for the
final native path. On cancellation or shutdown, terminate the owned process
group and remove its temporary workspace.

## Emulator strategy

### First native release

Use two distinct concepts:

- **Live authoring preview:** a native QImage/QPainter render of project tiles,
  palettes, sprites, grids and overlays.
- **Play:** build a ROM, place it in the XDG cache, and launch user-installed
  FCEUX through a managed QProcess/subprocess.

This is already conceptually supported by run_play's native mode and is a
genuine native workflow. It avoids making emulator integration block the
editor port.

Required first-release behavior:

- detect FCEUX and show a clear capability state;
- export ROM even when FCEUX is absent;
- launch the exact newly built artifact, never a stale source-tree ROM;
- surface launch failures;
- show keyboard/controller mappings;
- retain the latest build log and artifact metadata;
- clean old cached ROMs by policy.

### Full in-window parity

The browser app uses jsnes for:

- in-window Play;
- audio and keyboard input;
- pause/reset/mute/fullscreen;
- two-player input;
- stepping 60 frames to capture gallery preview PNGs;
- headless test inspection.

For native parity, add a separate emulator helper process with a narrow IPC
contract:

~~~text
load ROM
start / pause / reset / stop
controller 1 and 2 button state
video frame stream
audio sample stream
step N frames headlessly
capture PNG
capabilities/version
~~~

Keeping the core in another process isolates emulator crashes and makes license
boundaries clearer. A libretro-compatible NES core is one possible
implementation, but select it only after a license and redistribution review.
Do not link a GPL emulator into the MIT application without confirming the
combined-work implications.

Until the helper exists, native gallery publishing must make a deliberate
choice:

- defer publishing;
- ask the optional classroom service to generate the preview; or
- document a temporary static-editor preview as an explicit parity drop.

Do not silently replace the current 60-frame game preview with a different
image.

## Detailed implementation plan

Each phase below ends in a usable, testable boundary. Do not start the bulk UI
port until the first four phases prove the contracts.

### Phase 0 — freeze scope and create a durable baseline

**Goal:** know exactly what “same product” means before changing architecture.

Work:

1. Decide whether the target is the full Studio/legacy union or current Studio
   only.
2. Copy [feature-parity.md](../feature-parity.md) into an executable native
   parity matrix with one row per capability, owner mode, test and disposition.
3. Export representative project fixtures:
   - blank/scratch;
   - platformer;
   - SMB;
   - top-down;
   - auto-runner;
   - racer;
   - two-player variants;
   - multi-screen and multi-background;
   - metatiles;
   - dialogue/audio;
   - custom C;
   - custom ASM;
   - legacy schema examples.
4. Capture for each fixture:
   - input project JSON hash;
   - Play request JSON;
   - generated main.c/main.s and generated include hashes;
   - ROM SHA-256 for the deterministic C path;
   - behavioral result for C versus ASM where bytes intentionally differ;
   - rendered/reference observations.
5. Run the existing test suites.
6. Regenerate and record the nine FCEUX C/ASM comparisons for engine v62.

Important existing evidence gap:

- The local, ignored file test-results/comparision_results.txt records SMB
  timing/flicker, inaccessible doors, racer sensitivity/camera and two-player
  runner concerns.
- test-results and fceux-validation are ignored by git.
- the later local comparison ROMs predate engine v62 and v57 changed SMB frame
  pacing.

Create a small committed results manifest containing commit SHA, engine,
toolchain/emulator versions, ROM hashes, deterministic input sequence,
expected/actual observation and pass/fail. Large ROMs and screenshots can
remain CI artifacts.

**Exit gate:**

- current suites are green or every failure is documented;
- the v62 manual comparison has a durable result;
- every parity row is preserve, improve, defer or deliberately drop;
- baseline fixtures and hashes are committed.

### Phase 1 — native skeleton and release identity

**Goal:** boot a real Qt application without touching project behavior.

Work:

1. Add native/pyproject.toml with a pinned supported Python/PySide6 range.
2. Create QApplication, application ID, organization/name and version.
3. Add a minimal QMainWindow with File, Edit, View, Build and Help actions.
4. Establish a ResourceLocator for installed versus source-tree resources.
5. Establish QStandardPaths locations and test mode.
6. Add structured logging and a Diagnostics window.
7. Add icons, desktop entry and AppStream/MIME metadata stubs.
8. Add unit-test and Qt UI-test runners.
9. Ensure QtWebEngine is not a dependency or packaged module.

The current workspace does not have PySide6 installed, so development setup
must install it in an isolated environment or use a reproducible container.

**Exit gate:**

- app starts on X11 and Wayland;
- no listener/browser/WebView starts;
- all paths are shown correctly in Diagnostics;
- app starts from a read-only resource copy;
- package metadata validates syntactically.

### Phase 2 — extract a side-effect-free Python build core

**Goal:** build a ROM without HTTP and without importing server-side globals.

Work:

1. Move encoders and generated-source emitters into core modules without
   changing output.
2. Move temporary workspace/build logic into BuildService.
3. Inject ROOT/resources/engine/toolchain/output paths.
4. Remove module-import creation of AccountStore from the core.
5. Convert exceptions into structured GenerationError, BuildError,
   ToolchainError and Cancelled results.
6. Preserve temp-directory isolation and bounded concurrency.
7. Make playground_server.py call the extracted service.
8. Add direct-core versus HTTP contract tests.
9. Assert that input project JSON is unchanged after every path.
10. Introduce explicit trusted-local and sandboxed-remote build profiles with
    resource/output limits.

Do this in small moves: CHR/NAM/palette, scene/collision/world, workspace/build,
then run_play orchestration.

**Exit gate:**

- the browser server still passes its build suites;
- direct core and /play produce byte-identical artifacts for deterministic C
  fixtures;
- ASM paths satisfy existing behavioral equivalence tests;
- importing the core creates no DB, listener or writable file;
- build works with a read-only source/resource tree.

### Phase 3 — prove the QJSEngine compatibility bridge

**Goal:** preserve current and historical Builder output without a browser.

Work:

1. Implement CodegenRuntime behind a small interface.
2. Load current assembler/modules/template in a fresh QJSEngine.
3. Compare generated source with Node across all representative fixtures.
4. Iterate every v1–v62 snapshot and record support.
5. Capture console output and JavaScript exception stack/file/version.
6. Test hostile strings in project names/dialogue/custom fields.
7. Verify only trusted bundled scripts execute.
8. Add a command-line contract tool so codegen can be tested without the GUI.
9. Decide the policy for any historical snapshot that cannot run.

**Exit gate:**

- current engine generated source is byte-identical to Node;
- each snapshot is pass/fail/accounted-for;
- no QtWebEngine or Node runtime is needed by the application;
- repeated/canceled builds leave no cross-project generator state.

If this spike fails broadly, stop and choose between a bundled Node codegen
worker or a fully funded Python rewrite. Do not proceed on an unproven
assumption.

### Phase 4 — canonical native model, migrations and starter fixtures

**Goal:** make project manipulation independent of the UI toolkit.

Work:

1. Implement ProjectDocument with unknown-field round-trip.
2. Port and consolidate migrations.
3. Implement structural and semantic validation.
4. Generate and adopt canonical starter JSON fixtures.
5. Port metatile and tile-reference algorithms with differential tests.
6. Port BuildRequestFactory from PlayPipeline.
7. Add immutable ProjectSnapshot for builds.
8. Add engine upgrade/downgrade metadata rules.
9. Add JSON import/export CLI tests.

**Exit gate:**

- all historical/invalid/future-field fixtures behave as specified;
- JSON export/import is lossless after normalization;
- starter fixtures match the browser generator;
- build request fixtures match the browser;
- model and build tests run with no QApplication.

### Phase 5 — native local projects, autosave and Time Machine

**Goal:** provide safe native persistence before exposing editing tools.

Work:

1. Implement the SQLite repository and migrations.
2. Implement create/list/open/rename/duplicate/delete.
3. Add debounced current saves.
4. Add reason-tagged, content-deduplicated snapshots/backups.
5. Add snapshot-before-restore/import/Play/reset/engine-change.
6. Add atomic file import/export with QFileDialog/QSaveFile.
7. Add crash and disk-full recovery tests.
8. Add a storage manager and retention settings.
9. Add browser-exported project import.
10. Enforce single-instance ownership with local IPC for second-launch/open
    requests.
11. Use transactional revision checks and create conflict copies on a stale
    write.
12. Add the versioned all-project/history interoperability-bundle importer.
13. Add native-to-web and web-to-native JSON round-trip contract tests.

**Exit gate:**

- force-kill during save does not corrupt the last good project;
- project switch/shutdown flushes pending edits;
- restore snapshots current state first;
- duplicate/delete behavior matches the parity matrix;
- second launches reuse the existing writer and stale revisions never
  overwrite silently;
- single-project and all-project bundle migration report exactly what history
  was imported, and native JSON remains importable by the web application;
- no data is written outside the test XDG tree.

### Phase 6 — shell and first vertical native editor slice

**Goal:** prove the full native interaction pattern with WORLD before cloning
it across every mode.

Work:

1. Build the approved four-region shell:
   - mode rail;
   - contextual dock;
   - central TV;
   - quest/needs-attention panel;
   - header with project, Play, save state, Time Machine and expertise level.
2. Implement ProjectSession change signals and QUndoStack.
3. Implement a 256×240 native authoring renderer.
4. Implement exact coordinate mapping at integer and fractional display scales.
5. Implement WORLD basic stamp, erase, palette and behavior tools.
6. Implement undo/redo, keyboard shortcuts, focus and accessible names.
7. Add screenshot and data-state UI tests.
8. Connect direct build/export and capability-gated external FCEUX for this
   vertical slice.

**Exit gate:**

- open starter -> paint -> undo -> autosave -> build -> export works; launch
  also works when FCEUX is installed and otherwise presents an actionable
  disabled state;
- preview pixels match the browser renderer for fixtures;
- no smoothing or off-by-one coordinate errors at tested scaling factors;
- keyboard-only interaction completes the slice, and AT-SPI exposes the
  selected cell's coordinates/value plus editing actions;
- build never blocks the UI thread.

### Phase 7 — complete WORLD and port the other authoring modes

Port in dependency order. Each row is a separate deliverable with its own
parity gate.

| Slice | Required scope |
| --- | --- |
| WORLD complete | Multiple backgrounds, dimensions, scrolling viewport, all paint/select/fill/copy tools, behavior map, entities, per-instance settings, metatile promote/revert/library/edit, grids, coordinates and preview. |
| PALS | Backdrop, four BG/four sprite palettes, locked color zero semantics, master 64-color picker, usage readouts. |
| TILES | Both 256-tile banks, pixel tools, transforms, copy/paste, names, usage, reserved dialogue glyphs, drag-swap and full reference rewrite. |
| CHARS | Sprite CRUD/roles/dimensions, shared-tile conflict choices, per-cell OAM attributes, paint/shape/marquee tools, minimap, animations, tags and assignments. |
| STYLE | Game type and style-specific options with progressive disclosure. |
| RULES | Full Builder module tree/configuration, reactions matrix, 29+ validators, Fix/Show-me navigation and reset. |

Implementation pattern for every mutating operation:

1. domain command validates intent;
2. command captures the smallest reversible diff;
3. model changes once;
4. views receive change notifications;
5. repository save is scheduled;
6. validator/quest state recomputes;
7. undo restores the exact previous data.

Do not copy DOM construction logic line-for-line. Extract the behavior and
re-express it with Qt models, widgets and commands.

**Exit gate per mode:**

- every assigned parity row has a native automated test;
- project JSON remains browser-compatible;
- output preview and/or generated ROM fixtures are unchanged;
- undo, autosave, keyboard, focus and high contrast pass;
- custom-painted grids expose semantic cells, cursor/selection changes and
  actions through AT-SPI or an equivalent structured view;
- web behavior and its regression coverage remain supported when the native
  screen reaches parity.

### Phase 8 — native CODE and SOUND workflows

**Goal:** implement native equivalents of the two browser-specific specialist
editors without removing their web versions.

CODE work:

- QPlainTextEdit-based C and 6502 assembly editor;
- separate C/ASM buffers;
- line numbers and syntax highlighting;
- Ctrl+Space completion from generated symbols;
- guided protected regions versus full Advanced editing;
- lesson/snippet library loaded from packaged resources;
- restore default with pre-restore snapshot;
- build diagnostics mapped to source lines;
- explicit ejected/return-to-Builder state.

SOUND work:

- native file chooser and drag/drop for .s/.asm;
- song/default/remove behavior;
- SFX pack and slot listing;
- packaged starter audio;
- size/budget display;
- build/play through the shared BuildService;
- clear validation when uploads contain incompatible exports.

**Exit gate:**

- code and audio fixtures build identically to the browser path;
- guided mode cannot edit protected ranges through typing, paste, undo or
  programmatic actions;
- compiler errors select the correct line;
- project import/export retains both language buffers and audio assets.

### Phase 9 — tutorials, inclusive chrome and optional classroom services

**Goal:** restore product-level workflows after the local editor is stable.

Tutorial/accessibility:

- port self-ticking quests as data, not hard-coded widget traversal;
- map validator destinations to native mode/item identifiers instead of HTML
  filenames;
- retain Beginner/Maker/Advanced disclosure;
- add semantic accessible names/descriptions and predictable focus order;
- implement custom QAccessible grid/cell semantics, state-change notifications
  and an accessible alternative view where a painted surface cannot expose a
  complete interaction;
- support text scaling and a high-contrast NES-palette theme;
- test reduced animation if motion is retained;
- retain help and no-tracking/storage notices where relevant.

Classroom services:

- keep ordinary local use account-free;
- define a native API with explicit bearer/session-token handling rather than
  depending on browser cookies;
- use TLS for remote servers;
- store credentials/tokens using an appropriate desktop secret service where
  available;
- retain username-only/no-real-name data minimization;
- implement cloud open as an additive local copy;
- preserve gallery ownership and teacher moderation;
- never ship the admin secret in the client.

The existing server may remain as the classroom service, but it should be
refactored to expose a documented native-client API separately from static
site concerns. Every build submitted by a pupil must use the untrusted-remote
sandbox profile; the service process and account/gallery data must never share
that sandbox.

**Exit gate:**

- local app remains fully usable offline;
- network failures never block local save/build;
- accessibility smoke passes with Orca/AT-SPI and keyboard only, including
  announcing editor cell coordinates, values, selection and edit results;
- account ownership/auth tests cover pupil, anonymous and teacher cases;
- adversarial custom C/ASM/audio cannot read service files, reach the network
  or exceed the configured build limits;
- tutorial checks are model-driven and stable across layout changes.

### Phase 10 — optional native emulator helper

**Goal:** add embedded/headless emulator capabilities to the native target
without coupling either product UI to an emulator implementation.

Work:

1. Select a core and complete license/security review.
2. Define versioned IPC.
3. Implement process supervision and crash recovery.
4. Stream 256×240 frames to QImage/texture without smoothing.
5. stream audio with bounded buffering;
6. implement two controllers, hot-plug, pause/reset/mute/fullscreen;
7. implement deterministic frame stepping and PNG capture;
8. reuse the helper for native ROM behavior tests.

**Exit gate:**

- in-window play covers the current control union;
- helper crash cannot corrupt the project or app;
- 60-frame preview capture is deterministic;
- emulator/version/input metadata is recorded in test artifacts;
- license obligations are included in the release.

This phase can be deferred without blocking a native editor if
capability-gated external FCEUX is an accepted first-release experience.

### Phase 11 — packaging, CI and pilot release

**Goal:** install and run the application on clean classroom machines.

Packaging order:

1. developer/source installation;
2. AppImage or standalone bundle for pilot testing;
3. .deb for managed Debian/Ubuntu machines;
4. Flatpak only after the toolchain/emulator is self-contained.

Flatpak is not the first target because host cc65/FCEUX execution conflicts
with a useful sandbox. Bundling the complete toolchain and emulator helper
removes that problem later.

Release contents:

- Python runtime/application;
- only required Qt modules/plugins, explicitly excluding QtWebEngine;
- application resources and starter fixtures;
- selected engine bundles/manifests;
- desktop file, icon, AppStream and MIME metadata;
- licenses/notices and SBOM;
- toolchain, if the portability decision is to bundle it;
- package/app version independent of engine version.

CI jobs:

| Job | Purpose |
| --- | --- |
| rom-regression | Existing Builder suite, engine snapshot check and asm-lab |
| web-ui | Permanent Playwright Chromium regression suite for the supported web product; retain traces/screenshots |
| cross-target-contract | Bidirectional JSON/bundle portability plus HTTP/direct-core and browser/native build contracts |
| native-unit | Model, migrations, persistence, codegen bridge and build core |
| native-ui-x11 | Qt interaction tests under Xvfb |
| native-ui-wayland | Qt interaction tests under a headless Wayland compositor |
| package-smoke | Install artifact in clean VM/container, run diagnostics/build/export |
| sandbox-adversarial | Prove remote custom C/ASM/audio cannot escape resource limits or access host/service data |
| cycle-accurate | Versioned FCEUX input scripts/manual comparison evidence |
| release | hashes, signatures, AppStream validation, SBOM, notices and reports |

**Exit gate:**

- clean-machine install, launch, build, export and uninstall pass; Play is
  additionally tested in profiles where FCEUX or the emulator helper is
  installed;
- read-only installed resources pass;
- no undeclared host write paths;
- package launches under Wayland and X11;
- x86_64 is supported; aarch64 is either supported or explicitly deferred;
- release artifact contains no Chromium/WebEngine;
- app can complete its core workflow with networking disabled.

### Phase 12 — dual-target launch and ongoing operation

**Goal:** release and maintain the native application without reducing support
for the web application.

Work:

1. Pilot the native application with teachers and pupils for at least one real
   classroom cycle.
2. Compare bug/error/save-recovery reports across the native and web releases.
3. Close the native release parity matrix while keeping target-specific
   capabilities explicit.
4. Ship bidirectional project and bundle import/export guidance.
5. Define independent web/native versioning, packaging and support policies.
6. Put cross-target behavior in the shared core where practical; keep genuine
   UI-specific behavior in its owning target with contract coverage.
7. Keep the browser pages and Playwright suite maintained as product code and
   regression coverage.
8. Require shared schema, engine and build changes to pass web, native and
   cross-target contract jobs before merge.
9. Record compatibility ranges so users know which web release, native
   release, project schema and engine versions interoperate.

**Exit gate:**

- every native release parity row is closed with evidence or a recorded
  decision;
- no unresolved data-loss issue exists in either target's interoperability
  path;
- native and web build output meet the shared ROM/behavior contracts;
- both applications support their documented ordinary workflows;
- web, native and cross-target CI jobs are required and green;
- support, rollback and cross-client data-transfer procedures are documented;
- either application can be released without forcing the other to release.

## Testing strategy

### Existing commands to keep green

~~~bash
npm ci
npm run test:builder
npm run test:e2e
node scripts/snapshot-engine.mjs --check
(cd asm-lab && ./run-all.sh)
make -C steps/Step_Playground clean all
~~~

The full suites can modify build/test artifacts, so CI should run them in a
clean worktree or container and finish by checking for unexpected changes.

### New native test layers

1. **Model unit tests**
   - commands, undo/redo, migrations, validation, tile/reference operations.
2. **Differential contract tests**
   - browser/Node versus QJSEngine source;
   - HTTP versus direct Python core;
   - browser request factory versus Python request factory;
   - browser renderer versus native pixel buffer for fixtures;
   - web-to-native and native-to-web project JSON round trips;
   - versioned multi-project bundle acceptance/rejection in both targets.
3. **Persistence fault tests**
   - crash, truncated write, full disk simulation, corrupt DB, retention,
     concurrent/second-instance behavior.
4. **Qt UI tests**
   - interactions through stable object/accessibility IDs;
   - keyboard-only flows;
   - scaling, focus, dialogs, drag/drop and screenshots;
   - Orca/AT-SPI inspection and actions for custom-painted grid cells.
5. **ROM behavior tests**
   - keep jsnes-based PPU/OAM/CHR tests as an independent oracle;
   - add versioned FCEUX/emulator-helper input recordings;
   - compare ASM and C at matched game progress, not blindly at the same frame.
6. **Package tests**
   - install, diagnostics, compile, external tool discovery, export, offline
     start, read-only resources and clean uninstall.
7. **Sandbox adversarial tests**
   - custom C/ASM/audio include and incbin path escapes;
   - network, process, CPU, memory, workspace, file-size and log-output limits;
   - proof that account/gallery/config data is outside the compiler sandbox.

### Minimum release test matrix

| Dimension | Required |
| --- | --- |
| Display | Wayland and X11 |
| Scale | 100%, 125/150% fractional environment, 200% |
| Input | mouse, keyboard-only, two-player keyboard; controller if supported |
| Accessibility | Orca/AT-SPI over chrome and semantic cells/actions in painted editors |
| Filesystem | normal, read-only resources, unavailable export target, disk full |
| Toolchain | complete, missing FCEUX, missing cc65, wrong nes.lib |
| Project | current, legacy, future unknown fields, corrupt, large audio/multi-screen |
| Network | offline, service unavailable, slow/error response |
| Remote build | path escape, no network, resource exhaustion and secret-isolation attempts |
| Lifecycle | second launch, shutdown during save/build, crash recovery |

## Packaging decisions

### System dependencies versus bundled toolchain

Two viable first-release profiles:

| Profile | Advantages | Costs |
| --- | --- | --- |
| Managed .deb using system make/cc65 and recommended FCEUX | Small, straightforward for controlled Debian/Ubuntu fleets | Distro/version/path variation; Play unavailable until an emulator is installed |
| AppImage/standalone with pinned make/cc65/nes.lib | Predictable build output and easier classroom rollout | Larger artifact; license/notices/SBOM work; separate architectures |

Recommended pilot:

- bundle Python/Qt/application/engine resources;
- bundle a pinned cc65 toolchain if reproducible redistribution is practical;
- treat FCEUX as optional/system-provided until the emulator helper exists;
- also provide a .deb for managed machines, with FCEUX as a recommended rather
  than mandatory dependency unless that release profile explicitly promises
  Play out of the box.

The build must pass explicit CC, AS, LD, NESLIB and FAMISTUDIO_DIR values. Do
not depend on /usr/share/cc65/lib/nes.lib.

### Engine snapshot footprint

The current engine directory is approximately 34 MB before Python and Qt.
Choose one policy explicitly:

1. bundle all snapshots for maximum offline compatibility;
2. bundle supported/recent snapshots and download older checksummed bundles on
   demand; or
3. support only a declared range and provide a conversion tool.

Because classroom/offline use is central, bundling all supported snapshots is
the safest behavior, but remember that v1–v62 lack complete historical Python
codegen snapshots.

### Licensing

Update [NOTICE.md](../../../NOTICE.md) and release material for:

- PySide6/Qt and its LGPLv3/GPLv3 or commercial choice;
- any bundled cc65 binaries/libraries;
- FCEUX if redistributed;
- an emulator helper/core;
- current jsnes/CodeMirror as dependencies of the separately distributed web
  application;
- FamiStudio sound-engine files.

Use dynamic Qt libraries and exclude unused/GPL-only modules unless the chosen
application license permits them. Qt for Python's
[official overview](https://doc.qt.io/qtforpython-6/) and Qt's
[LGPL obligations guidance](https://www.qt.io/development/open-source-lgpl-obligations)
should be reviewed during packaging, not after the pilot.

## Risks and mitigations

| Risk | Why it matters here | Mitigation |
| --- | --- | --- |
| Silent feature loss | Seven mature pages still exceed current Studio in places | Native parity matrix; implement by capability, not by copying screen appearance |
| ROM drift | Client JS and Python jointly determine output | Frozen requests/sources/ROMs; differential tests; keep Node/ROM oracle |
| QJSEngine incompatibility | Historical scripts were tested under browser/Node globals | Phase-3 spike across all snapshots; minimal immutable shims; fallback decision before UI port |
| Historical engine promise is incomplete | Python server codegen was not snapshotted | State limitation; bundle Python codegen from new baseline onward; never mislabel builds |
| Live project mutation during build | HTTP currently hides mutating generators behind JSON copy | Immutable/deep-copied BuildSnapshot plus pre/post hash assertion |
| Untrusted compiler input | Pupil custom C/ASM/audio can attempt host reads or resource exhaustion | Separate local/remote profiles; remote OS sandbox, no network, read-only inputs and hard limits |
| Data loss | Browser app has mature autosave/recovery behavior | Persistence before editing UI; atomic writes; fault-injection gates |
| Multi-instance lost updates | SQLite serializes statements but does not prevent logical last-writer-wins | Single writer/IPC, transaction revision checks and conflict copies |
| Incomplete cross-client portability | One-project JSON omits the catalog and Time Machine history | Versioned export-all bundle, bidirectional round-trip tests, or explicit per-project/history-loss guidance |
| UI rewrite underestimation | Tens of thousands of browser lines and many classroom details | Vertical slice, mode-by-mode gates, union parity scope, avoid page-for-page duplication |
| Pixel/render mismatch | NES editors require exact coordinates and nearest scaling | Canonical buffers, integer coordinates, differential pixel fixtures, scaling matrix |
| Painted editor is opaque to screen readers | An accessible name on the canvas does not expose its cells or actions | Custom QAccessible grid/cell model or synchronized structured view plus Orca tests |
| UI freezes | cc65 builds and codegen are blocking work | Worker thread/process, progress and cancellation |
| Toolchain portability | Makefile assumes distro paths | Toolchain discovery/injection; diagnostics; bundled option |
| Emulator scope/licensing | jsnes is browser-specific; FCEUX is GPL | External FCEUX first; helper process later; legal review before choosing core |
| Qt package size/licensing | PySide6 bundles Qt binaries and has LGPL obligations | Exclude unused/WebEngine modules; dynamic linking; notices/source compliance; SBOM |
| Split web/native development | Two supported UIs can drift over time | One extracted core, required cross-target contracts, explicit compatibility ranges and permanent web/native CI jobs |
| Existing engine defects blamed on port | Manual comparison already lists open behavior concerns | v62 baseline and separate engine-bug ledger before native changes |

## Indicative effort

These are planning ranges for one experienced engineer working mostly
full-time. They exclude product-design changes, legal review, classroom pilot
calendar time and major engine bug fixes.

| Milestone | Indicative effort |
| --- | --- |
| Baseline, native skeleton, Python-core extraction and QJSEngine proof | 6–10 person-weeks |
| Local-project MVP with shell, WORLD vertical slice, direct build and capability-gated external FCEUX | a further 6–9 person-weeks |
| Full authoring-mode parity including CODE/SOUND and inclusive chrome | a further 12–20 person-weeks |
| Accounts/gallery hardening and full packaging/CI | a further 4–8 person-weeks |
| Embedded emulator helper | optional additional 4–8+ person-weeks |

That puts a credible full-parity native release in the multi-month category,
roughly 28–47 person-weeks before optional embedded emulation. A smaller Studio
only MVP can arrive sooner, but its omitted features must be explicit.

Treat these ranges as a floor, not a target, and read them with three caveats:

- They assume a single engineer. Running two teams (web and native) adds
  cross-review and coordination overhead that this number does not include.
- The custom-painted-editor accessibility work (a per-mode `QAccessible`
  grid/cell model with AT-SPI change notifications for WORLD, CHARS and TILES)
  is the highest-variance line item. It is folded into "full authoring-mode
  parity" above but is genuinely hard and rarely done well; budget it as its
  own risk-weighted slice rather than assuming it is absorbed by the mode ports.
- The embedded emulator and any bundled-toolchain licensing review are excluded.

Re-estimate after Phases 0–3. Those phases reveal the two largest unknowns:
actual parity scope and QJSEngine/historical-engine compatibility.

## Recommended first four pull requests

### PR 1 — Baseline and decision records

- native-definition ADR — started in
  [`../decisions/2026-07-10-native-linux-dual-target.md`](../decisions/2026-07-10-native-linux-dual-target.md);
  extend it with the Phase-0 scope decision (full union vs. Studio-only);
- parity matrix;
- representative project/request/source/ROM fixtures;
- durable v62 FCEUX comparison manifest;
- app ID/version/package decisions.

### PR 2 — Python core extraction

- encoders/build service moved without output changes;
- resource/toolchain injection;
- server adapter preserved;
- direct versus HTTP build contracts.

### PR 3 — QJSEngine spike

- isolated codegen runtime;
- all-snapshot compatibility report;
- Node differential fixtures;
- explicit go/no-go decision.

### PR 4 — Native shell vertical slice

- PySide6 application skeleton;
- XDG repository;
- starter import;
- native TV/WORLD basic editing;
- undo/autosave;
- direct build/export and capability-gated external FCEUX.

These PRs create evidence and a working end-to-end slice before committing to
the long mode-porting phase.

## Definition of done

The first native release and dual-target foundation are complete only when:

- [ ] the native application requires no browser, WebView, HTML/CSS UI or
      localhost server;
- [ ] no QtWebEngine/Chromium component ships in the native artifact;
- [ ] local edit/build/export works offline;
- [ ] all mutable data uses XDG locations;
- [ ] installed resources may be read-only;
- [ ] project JSON round-trips with unknown fields preserved;
- [ ] web-exported projects import safely into native and native-exported JSON
      imports safely into web;
- [ ] native build output meets frozen source/ROM/behavior contracts;
- [ ] every retained feature-parity row has evidence;
- [ ] autosave, snapshots, restore-before-current-snapshot and crash recovery
      pass fault tests;
- [ ] builds run off the UI thread and can be canceled;
- [ ] missing toolchain/FCEUX states are actionable; build/export works without
      FCEUX;
- [ ] second launch forwards to the single writer, and stale revisions produce
      conflict copies rather than silent overwrites;
- [ ] single-project and batch cross-client transfer account explicitly for
      project history;
- [ ] any enabled remote build path sandboxes untrusted C/ASM/audio with no
      network/host-data access and hard resource limits;
- [ ] Wayland, X11, fractional scaling, keyboard-only and Orca/AT-SPI smoke
      pass, including semantic access to painted editor cells/actions;
- [ ] desktop/AppStream/MIME metadata validate;
- [ ] package notices, source obligations, SBOM and hashes are present;
- [ ] a real classroom pilot has completed with a documented rollback path;
- [ ] the web application and Playwright suite remain supported and green;
- [ ] shared schema, engine and build changes are gated by web, native and
      cross-target CI jobs;
- [ ] web and native releases declare compatibility ranges and can ship on
      independent schedules.

## Final recommendation

Proceed as a staged addition of a second, native product target:

1. preserve the JSON and ROM contracts;
2. extract the Python build core;
3. prove QJSEngine can preserve versioned Builder generation;
4. establish native persistence and one complete vertical slice;
5. port modes against the parity matrix;
6. package and pilot the native app while continuing to maintain and release
   the web app.

The architecture should optimize for behavioral preservation, not maximum
source-language purity. A Qt Widgets UI plus Python core and a narrow trusted
QJSEngine compatibility layer produces a genuine native Linux application
while retaining the hardest-won parts of this repository. The web and native
interfaces should remain sibling products backed by shared project, engine and
ROM contracts rather than successive versions where one replaces the other.
