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

## Marketplace screenshots

`capture-screenshots.mjs` is an on-demand generator (Issue #1671) — **not** a
regression test. It drives the real extension via ExTester and saves full-window
PNGs of the preview's three faces (System / Deploy / Org) to
`packages/vscode/images/screenshots/`. The System shot doubles as the
editor ↔ preview workflow image embedded in `packages/vscode/README.md`.

**Generate via CI (recommended).** ExTester needs an x86_64 chromedriver
(`chrome-for-testing` ships no linux-arm64 build), so the capture cannot run on
Apple-silicon / ARM machines — the browser launch crashes with `SIGTRAP`. Run
the **VS Code Screenshots** workflow (`.github/workflows/vscode-screenshots.yml`,
`workflow_dispatch`) from the Actions tab; it captures on ubuntu-latest and
uploads the PNGs as the `vscode-marketplace-screenshots` artifact.

**Generate locally** (only on x86_64 Linux with a display / xvfb):

```sh
xvfb-run -a pnpm --filter @karasu-tools/vscode-e2e run capture:screenshots
```

The capture spec lives at `tests/capture/screenshots.capture.ts`. It is kept
out of the `*.test.ts` glob on purpose so it never runs in the gated
`vscode-webview-e2e` suite (see `.claude/rules/vscode-webview-tests.md` rule 2:
each extra spawn of the `File: Open File...` simple-dialog raises xvfb flake
risk). The runner points its own glob at `out/capture/*.capture.js`.

Either way, **review the PNGs by eye** before committing — they ship on a public
Marketplace listing. Download the CI artifact (or use the locally generated
files), commit them under `packages/vscode/images/screenshots/`, bump
`packages/vscode/package.json` `version`, and re-publish via `vscode-release.yml`
so the refreshed README + images appear on the listing.

## Adding tests

Tests live under `tests/suite/` and follow Mocha's BDD style
(`describe` / `it`). They run inside the extension host, so the `vscode` API is
available directly.

This package's smoke test only verifies extension activation. AT-0037ff are
added incrementally as separate `*.test.ts` files in `tests/suite/`.

> **Mocha shares the extension host across spec files.** A test that depends
> on the extension being inactive at startup must run before any other spec
> opens a `.krs` document. Place such a test in a numerically-first file
> (e.g. `00-activation.test.ts`); `mocha.sort: true` in `.vscode-test.mjs`
> guarantees deterministic file ordering. Tests that simply need the
> extension to be active can call `await ext.activate()` themselves and
> assert `isActive === true` afterwards.

> **Cursor positioning helper.** Use `findUniqueIdentifier(doc, name)` from
> `_helpers.ts` rather than calling `text.indexOf(name)` directly. The
> helper asserts the identifier appears exactly once in the fixture so that
> a fixture edit (adding a comment, renaming a sibling node, etc.) cannot
> silently change which occurrence the test targets.

> **Lint note.** The repo-level `oxlint` config has a per-directory override
> for this package's tests so that `node:assert` calls (`assert.ok(...)`,
> `assert.strictEqual(...)`) satisfy the `jest/expect-expect` rule. Without
> this override, oxlint would flag every Mocha `it` block as having no
> assertions because it only recognises `expect(...)` by default. If you add
> a different assertion style, extend `assertFunctionNames` in
> `.oxlintrc.json` accordingly.
