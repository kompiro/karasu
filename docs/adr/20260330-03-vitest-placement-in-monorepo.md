# ADR-0015: vitest Placement in Monorepo — Workspace Delegation over Root Install

## Status

Accepted

## Context

The root `package.json` contained `"test": "vitest run"`, but `vitest` was only installed in `packages/core` and `packages/app` as a `devDependency`. Running `npm test` from the repository root therefore failed with a "vitest not found" error.

Each package already has its own `vitest.config.ts` with package-specific settings:

- `packages/core` — `include: ["src/**/*.test.ts"]`, coverage thresholds (lines/functions/branches/statements ≥ 80/80/75/80)
- `packages/app` — `include: ["src/**/*.test.ts", "src/**/*.test.tsx"]`, jsdom environment implied by React component tests

Two options were considered to fix the broken root `test` script.

## Decision

**Delegate `test` to each workspace** rather than installing `vitest` at the repository root.

```json
"test": "npm run test --workspace=packages/core && npm run test --workspace=packages/app"
```

This mirrors the existing `test:coverage` script, which already uses the same workspace-delegation pattern.

## Alternatives Considered

**Install `vitest` in root `devDependencies` and keep `"test": "vitest run"`**

Running `vitest run` from the root without a root-level `vitest.config.ts` falls back to vitest's default test discovery. This means:

- Each package's `vitest.config.ts` is ignored — coverage thresholds, `include` globs, and environment settings (e.g. jsdom for `packages/app`) are not applied.
- Coverage reports from both packages would be merged into a single output directory, losing per-package granularity.
- A root `vitest.config.ts` could be added to compensate, but this would duplicate configuration already maintained in each package.

Rejected because it undermines the per-package configuration already in place.

## Consequences

**Positive:**

- Each package runs under its own `vitest.config.ts`; coverage thresholds and environment settings are preserved.
- The root `test` script is consistent with the existing `test:coverage` script pattern.
- No new dependency is introduced at the root level.

**Negative:**

- The two workspaces run sequentially; the second suite starts only after the first completes. This is acceptable given the current test volume (core: ~390 tests, app: ~118 tests, combined wall time < 10 s).
- Adding a third package with tests requires a manual update to the root `test` script.
