# @karasu-tools/e2e

Playwright-based end-to-end tests for karasu. Automates the subset of acceptance
tests (`docs/acceptance/`) whose steps are deterministic and whose expectations
can be verified via DOM state or downloaded artifacts.

## Philosophy

See [ADR-529](../../docs/adr/529-playwright-with-ai-visual-review.md) for the
full rationale (its design doc was folded into the ADR). Key points:

- This layer **supplements**, and does not replace, manual QA (`/qa`).
- Screenshots captured here are meant to be reviewed by an AI collaborator
  (Claude) semantically — there is **no** pixel-baseline comparison.
- Layout-quality ATs (e.g. `barycenter-layer-ordering`) remain out of scope.

## Running locally

```bash
# from repo root
pnpm --filter @karasu-tools/e2e install-browsers   # one-time
pnpm --filter @karasu-tools/e2e test
```

Playwright boots `@karasu-tools/app` via `vite` automatically (see
`playwright.config.ts` — `webServer`). Override the port with `PLAYWRIGHT_PORT`.

## Running in CI

`Playwright` is a Required status check ([ADR-1866](../../docs/adr/1866-e2e-required-status-check.md)).
Two workflows report it:

- `.github/workflows/e2e.yml` runs the suite on pull requests whose changed
  files match its `paths` (`packages/app/**`, `packages/core/**`,
  `packages/e2e/**`, the lockfile, the root `package.json`, the workflow
  itself; [ADR-1729](../../docs/adr/1729-e2e-path-filter-trigger.md)). Draft
  PRs are skipped until `ready_for_review`
  ([ADR-2643](../../docs/adr/2643-stacked-pr-workflow.md)).
- `.github/workflows/e2e-skip.yml` is the paired stub: on PRs that match none
  of those paths it reports the same `Playwright` context and exits 0, so the
  Required check never stays pending. Its `paths-ignore` list mirrors
  `e2e.yml`'s `paths` and the two must be edited together.

The CI run builds the app (`vite build && vite preview`) and runs with
`workers: 1` and `retries: 0` (see `playwright.config.ts`). Artifacts (traces,
screenshots, HTML report) are uploaded with a retention of 14 days.

`.github/workflows/e2e-nightly.yml` runs the same suite against `main` every
day at 21:00 UTC and opens or closes the `ci: nightly-e2e` tracker Issue from
the suite's verdict. It can also be dispatched by hand:

```bash
gh workflow run e2e-nightly.yml                 # plain re-run; tracker follows the verdict
gh workflow run e2e-nightly.yml -f workers=2    # measurement run; tracker left untouched
```

Each dispatched run gets its own concurrency slot, so back-to-back dispatches
do not cancel each other.

## Linking specs to acceptance tests

Every `tests/at-*.spec.ts` must be cited by full path from at least one
`docs/acceptance/*.md`, and every cited path must exist
(`pnpm at:check-coverage --strict`; the marker format is in
`.claude/rules/acceptance.md`). The check runs in lefthook's pre-push hook and
in `.github/workflows/at-check-coverage.yml`, both of which fire on changes
under `tests/`.

Shared helpers live in `fixtures/` and are documented in
[`fixtures/README.md`](fixtures/README.md). Prefer extending a fixture over
redefining a helper inside a spec.

## Adding a new test

1. Start from a deterministic AT in `docs/acceptance/` — anything whose
   expectations require visual judgment stays in the human QA flow.
2. Place the spec under `tests/` with a filename matching the AT
   (e.g. `at-0030-svg-export.spec.ts`).
3. Prefer role-based selectors (`getByRole`) over brittle CSS selectors.
4. Keep assertions about file output or DOM state — avoid pixel snapshots.

## Handling flaky tests

When a test is judged flaky (definition and procedure in
[ADR-1008](../../docs/adr/1008-flaky-e2e-fixme-and-issue.md)):

1. Mark the test `test.fixme(...)` in the same commit that observed the flake,
   with a comment of the form
   `// Tracked in #<issue> — flake surfaced by #<pr>. <one-line summary>.`
2. File a tracking Issue (labels `test`, `bug`) capturing the failing test
   path, the assertion text, the CI run link, your hypothesis, and acceptance
   criteria (≥5 consecutive PR-gated runs green at the project's current
   `retries` setting before re-enabling).
3. Continue the original PR. The PR description should call out
   `test.fixme`'d <test name> — tracked in #N`.

`test.skip` is **not** the right tool — it conflates intentional skips with
flake-driven ones. `test.fixme` shows up as `[fixme]` in the Playwright report
so it stays visible until resolved.

**This applies whether the flake was found by a human or by an AI agent
investigating an E2E failure.** Do not retry-mask, do not silently delete —
fixme + Issue is the only path.
