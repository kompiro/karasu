---
type: acceptance-test
issue: "#1363"
feature: "Publish @karasu-tools/core as a public v0.x package"
date: 2026-06-16
---

# AT-1363: @karasu-tools/core is a publishable v0.x package

## Overview

`@karasu-tools/core` is turned into a publishable v0.x npm library: `private`
is dropped, `exports` point published consumers at the built `dist/` (types +
ESM), and a `development` export condition (with root tsconfig
`customConditions: ["development"]`) keeps the workspace resolving TS source so
`pnpm typecheck` stays build-independent. The actual publish and the
`@karasu-tools` npm org reservation are launch-gated (#1317); this AT covers the
"publishable state" only.

## AC-1: typecheck stays build-independent (automated in CI)

**Steps:**
1. On a clean checkout (no `packages/core/dist`), run `pnpm -r run typecheck`.

**Expected:** all packages (core / app / cli / lsp) typecheck green **without**
building core first — the `development` condition resolves `@karasu-tools/core`
to `src/` for `tsc`.

## AC-2: the built package ships dist + icons, not src (manual)

**Steps:**
1. `pnpm --filter @karasu-tools/core run build` → `packages/core/dist/` contains
   `index.js` + `index.d.ts`.
2. `cd packages/core && npm pack --dry-run` (or `pnpm pack`).

**Expected:** the tarball includes `dist/**`, `icons/**`, `package.json`,
`README.md`, `LICENSE`, and **does not** include `src/`. `main` →
`dist/index.js`, `types` → `dist/index.d.ts`.

## AC-3: a published consumer resolves dist (manual)

**Steps:**
1. From outside the workspace (no `development` condition), import
   `@karasu-tools/core` and call `compile("system S {}")`.

**Expected:** resolution lands on `dist/index.js` / `dist/index.d.ts`; `compile`
returns a structured result. (In-repo, Vite/vitest/esbuild aliases and the
`development` condition continue to resolve `src/`.)

## AC-4: changeset tracks core (automated)

**Steps:**
1. `@karasu-tools/core` is removed from `.changeset/config.json` `ignore`.
2. A changeset entry bumping `@karasu-tools/core` exists.

**Expected:** `pnpm changeset status` includes `@karasu-tools/core`; the CLI
(`karasu`) keeps bundling core's source (no dependency switch).
