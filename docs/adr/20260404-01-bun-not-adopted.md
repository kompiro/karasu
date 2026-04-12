# ADR-20260404-01: Do not migrate to Bun

## Status

Rejected

## Context

Issue #45 proposed investigating a migration from the current npm + Node.js + Vitest stack to Bun, motivated by:

- **TypeScript native execution** — Bun runs `.ts` files directly without a build step.
- **Faster test execution** — Bun's built-in test runner starts up faster than Vitest.
- **All-in-one toolchain** — Bun bundles package manager, runtime, and test runner.

`packages/core` already points `main` to `./src/index.ts`, making it a natural candidate. Investigation revealed that the benefits do not outweigh the migration costs given the current project shape.

## Decision

Do not migrate to Bun. Retain npm workspaces + Node.js + Vitest.

## Reasons

### 1. Vite and React dependency in `packages/app`

`packages/app` uses Vite as its bundler and React as its UI framework. Vite itself runs on Node.js and is tightly integrated with the npm ecosystem. Replacing the runtime for `packages/core` while keeping Vite for `packages/app` would create a split toolchain — adding complexity without a clear benefit.

### 2. VSCode extension compatibility

`packages/vscode` and `packages/lsp` are designed for the VS Code extension host, which runs Node.js. Extension packaging (`vsce`) and the Language Server Protocol libraries (`vscode-languageserver`, `vscode-languageclient`) target Node.js explicitly. Running these under Bun would require validation of every native binding and lifecycle hook.

### 3. Test suite is already fast enough

The Vitest test suite for `packages/core` completes in under 300 ms (as of ADR writing). The performance headroom Bun would provide is not a practical bottleneck.

### 4. Claude Code hooks already cover lint and format

Pre-push quality checks (lint, format, typecheck, knip) run via Claude Code hooks backed by oxlint and oxfmt — not Bun's toolchain. Introducing Bun would require re-validating or duplicating these integrations.

### 5. npm workspaces monorepo structure is established

The monorepo cross-package resolution (`@karasu/core`, `@karasu/lsp`) relies on npm workspaces symlinks. Bun's workspace implementation is broadly compatible, but subtle differences in resolution order and lifecycle scripts have caused issues in mixed-runtime monorepos. Migration risk is non-trivial.

## Consequences

- No action required. The current stack (npm + Node.js + Vitest) remains in place.
- If Bun's compatibility with Vite, VSCode extension tooling, and npm workspace edge cases significantly improves in a future version, this decision can be revisited.

## Re-evaluation triggers

- Bun reaches stable support for Vite plugin execution and VSCode extension packaging.
- Test suite execution time becomes a measurable bottleneck (e.g., exceeds 30 s in CI).
- The project drops `packages/app` (Vite) or `packages/vscode` and the toolchain constraint is lifted.
