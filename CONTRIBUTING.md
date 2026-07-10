# Contributing to NES Studio

NES Studio is developed as two supported product targets in one repository:

- the browser application under `tools/tile_editor_web/`;
- the native Linux application under `native/` once its skeleton is added.

Both targets share project formats, NES engines, ROM-generation behavior and
selected services. This guide defines how the web and native teams can work in
parallel without allowing those contracts to drift.

The detailed native architecture and delivery sequence are in the
[native Linux implementation plan](docs/design/linux-native/2026-07-10-linux-native-migration-plan.md).

## Decision authority

The repository owner and product owner, GitHub `@tomd1415`, is the final
decision-maker. Teams should make routine implementation decisions within an
approved scope, but the product owner has the final decision on:

- product scope, priorities and user-facing behavior;
- deliberate parity drops or incompatible web/native behavior;
- project-schema, engine, ROM-contract and migration-policy changes;
- security, pupil-data, licensing and distribution policy;
- release readiness, supported compatibility ranges and exceptions to gates;
- unresolved cross-team technical or scheduling trade-offs.

Final authority does not require the product owner to design every solution or
review every routine line change. Each team owns implementation quality in its
area. When a decision needs escalation, document the options, evidence,
trade-offs and team recommendations; the product owner selects the outcome.
Record lasting or expensive decisions in `docs/design/decisions/` or the
relevant design document.

## Ownership boundaries

| Area | Primary team | Review expectations |
| --- | --- | --- |
| `tools/tile_editor_web/` and `tools/studio-tests/` | Web team | Web-team review; shared-contract review when project/build behavior changes |
| `native/` and `packaging/linux/` | Native Linux team | Native-team review; shared-contract review when project/build behavior changes |
| Extracted build core and future `shared/` modules | Joint | One reviewer from each team and product-owner approval |
| `tools/engines/`, `steps/Step_Playground/` and ROM generators | Joint | One reviewer from each team, engine workflow, and product-owner approval |
| Project schema, migrations and cross-target fixtures | Joint | One reviewer from each team and product-owner approval |
| Web HTTP adapter | Web team | Web-team review; native review if the shared service interface changes |
| Native direct-core adapter | Native team | Native-team review; web review if the shared service interface changes |
| Product direction, parity policy and release decisions | Product owner | Team recommendations followed by product-owner decision |

Until GitHub team handles are created, ownership is role-based in this guide.
The checked-in `.github/CODEOWNERS` names the product owner only for shared and
high-impact paths. Add real web/native team handles there when they exist; do
not add placeholder handles that GitHub cannot resolve.

## Branch and integration model

Use `main` as the integration branch for both products. Do not create permanent
`web` and `native` development branches.

Create short-lived branches from an up-to-date `main`, for example:

```text
fix/web-project-import
feat/web-tile-usage
chore/linux-native-baseline-v62
feat/native-project-browser
refactor/shared-build-core
engine/v63-description
```

Merge small, complete slices regularly. A Git worktree or separate clone is
fine for local convenience, but it does not change the branch model. Dependent
pull requests may be stacked temporarily; rebase their bases onto `main` as
prerequisites merge.

Avoid combining unrelated web, native and engine work in one pull request.
Cross-target refactors are the exception and should be explicitly labelled as
shared changes.

## Pull-request review rules

| Change type | Required review |
| --- | --- |
| Web implementation only | Web team |
| Native implementation only | Native team |
| Documentation local to one target | Owning team |
| Shared core or adapter interface | Web team, native team and product owner |
| Project schema or migration | Web team, native team and product owner |
| Engine or ROM-output behavior | Web team, native team and product owner |
| Parity drop, compatibility exception or release gate exception | Product owner after both teams can comment |
| Governance, security, pupil data or licensing | Product owner plus relevant specialist review |

The product owner may delegate approval for a defined category, but the
delegation and its limits should be recorded. Silence is not approval for a
breaking shared-contract change.

## Shared-contract rules

Treat these as versioned interfaces between products:

- project JSON and migration behavior;
- engine version and engine-bundle contents;
- build-request and build-result structures;
- generated source and ROM behavior;
- import/export and multi-project bundle formats;
- identifiers referenced by tutorials, validation and navigation.

A shared-contract change must include:

1. an impact statement for both targets;
2. compatible readers or a versioned migration path;
3. web/native fixtures and round-trip tests where applicable;
4. engine snapshot/version updates when ROM output changes;
5. documentation of the supported compatibility range;
6. approval under the review matrix above.

Read [engine-versioning.md](docs/design/engine-versioning.md) and
[tools/engines/README.md](tools/engines/README.md) before changing ROM output.

During extraction of the shared build core, `tools/playground_server.py` is a
cross-team hotspot. Coordinate changes there until the transport-independent
core, maintained web HTTP adapter and native direct adapter are separated and
covered by contract tests.

## Test expectations

Run tests in proportion to the changed surface:

- web UI: `npm run test:e2e`;
- Builder/ROM behavior: `npm run test:builder`;
- engine snapshots: `node scripts/snapshot-engine.mjs --check`;
- native unit/UI/package suites: use the commands added with `native/`;
- shared changes: relevant web, native and cross-target contract suites.

If a required suite cannot run, state why in the pull request and provide the
best available evidence. Only the product owner can accept a release or shared
compatibility exception; accepting an exception should create a tracked
follow-up.

CI should eventually expose separate `web-ui`, `native-unit`, `native-ui`,
`rom-regression`, `cross-target-contract` and packaging jobs. Do not weaken one
target's required checks merely because a change originated in the other team.

## Release model

The web and native applications may release independently. Each release should
record:

- application version;
- supported project-schema range;
- included/supported engine range;
- import/export compatibility notes;
- known target-specific parity differences;
- required toolchain or emulator versions.

Neither application replaces the other. Removing web functionality or support
requires a new explicit product-owner decision; native parity alone is not
authorization to retire a web feature.
