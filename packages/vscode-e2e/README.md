# @karasu-tools/vscode-e2e

VS Code extension host smoke tests for the karasu extension. Provides the
harness used by AT-0037ff (LSP features, Cmd/Ctrl+Click hint, detail panel,
cross-diagram navigation).

See `docs/design/vscode-extension-host-harness.md` (and the resulting ADR) for
the design rationale.

## Local run

```sh
pnpm --filter @karasu-tools/vscode-e2e test
```

`pretest` builds `@karasu-tools/lsp` and `karasu-vscode` first, then the test
suite is compiled to `out/` and `vscode-test` launches a headless VS Code with
`fixtures/workspace/` opened.

On Linux without a display, wrap the command:

```sh
xvfb-run -a pnpm --filter @karasu-tools/vscode-e2e test
```

VS Code's Electron build needs the usual GUI/system libraries
(`libnss3`, `libgbm1`, `libgtk-3-0`, `libasound2t64`, `libxss1`,
`libxkbfile1`, `libsecret-1-0`, `xvfb`). The CI workflow installs them
explicitly; on a bare dev container you may need to do the same.

The first run downloads VS Code (~200 MB) into
`packages/vscode-e2e/.vscode-test/`.

## CI

`.github/workflows/vscode-e2e.yml` runs this suite on PRs labelled
`vscode-e2e`. The VS Code download is cached at `~/.vscode-test/` keyed on the
workflow file hash.

## Adding tests

Tests live under `tests/suite/` and follow Mocha's BDD style
(`describe` / `it`). They run inside the extension host, so the `vscode` API is
available directly.

This package's smoke test only verifies extension activation. AT-0037ff are
added incrementally as separate `*.test.ts` files in `tests/suite/`.

> **Lint note.** The repo-level `oxlint` config has a per-directory override
> for this package's tests so that `node:assert` calls (`assert.ok(...)`,
> `assert.strictEqual(...)`) satisfy the `jest/expect-expect` rule. Without
> this override, oxlint would flag every Mocha `it` block as having no
> assertions because it only recognises `expect(...)` by default. If you add
> a different assertion style, extend `assertFunctionNames` in
> `.oxlintrc.json` accordingly.
