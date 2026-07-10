# Contract tests

This directory holds executable cross-target policies and will grow to cover
differential fixtures and tests for:

- the approved full Studio-plus-legacy parity scope and capability ownership;

- project JSON round trips;
- HTTP versus direct-core build results;
- Node versus QJSEngine Builder output;
- generated source, ROM hashes and behavior.

The parity policy begins in Phase 0. Build and code-generation differential
work begins with Phases 2–3 of the native implementation plan.

The Phase-0 starter corpus is reproducibly generated with:

```bash
node native/tests/contract/generate_phase0_starters.mjs
```

Large canonical JSON/request/source files are stored as deterministic gzip;
their manifest hashes cover the uncompressed canonical bytes. ROMs remain raw
so independent NES tooling can consume them directly.
