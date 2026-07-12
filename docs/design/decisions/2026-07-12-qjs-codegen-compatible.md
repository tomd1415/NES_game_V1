# QJSEngine code-generation compatibility gate

**Status:** accepted — proceed with the native Qt architecture.

The Phase-3 spike compared the Builder's generated C byte-for-byte under a
fresh PySide6 `QJSEngine` and Node's `vm` reference runtime.

- Live sources and every immutable engine snapshot from v1 through v63 pass.
- Each evaluation uses a fresh isolate and repeated runs are deterministic.
- Hostile dialogue/project strings, Unicode, quotes, backslashes, template-like
  text and HTML closing tags produce identical output.
- JavaScript filename, line, stack and console messages are captured.
- Only scripts below the configured trusted bundled-resource root execute.
- The only compatibility globals currently required are immutable per-isolate
  shims for `globalThis`, `window`, `self` and `console`.
- The application does not require QtWebEngine. Node remains a development
  differential oracle and is not required by the native runtime.

Evidence is executable through:

```sh
nes-studio-codegen-check --root . --project project.json --all-snapshots --json
native/.venv/bin/pytest native/tests/contract/test_codegen_differential.py
```

The recorded per-version hashes are in
`native/tests/contract/qjs-compatibility-v1-v63.json`.
