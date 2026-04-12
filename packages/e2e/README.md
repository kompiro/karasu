# @karasu-tools/e2e

Playwright-based end-to-end tests for karasu. Automates the subset of acceptance
tests (`docs/acceptance/`) whose steps are deterministic and whose expectations
can be verified via DOM state or downloaded artifacts.

## Philosophy

See `docs/design/e2e-automation-with-ai-visual-review.md` and ADR
`20260412-05-playwright-with-ai-visual-review.md` for the full rationale.
Key points:

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

The E2E job runs **only when a pull request carries the `e2e` label**.
See `.github/workflows/e2e.yml`. Artifacts (traces, screenshots, HTML report)
are uploaded with a retention of 14 days.

## Adding a new test

1. Start from a deterministic AT in `docs/acceptance/` — anything whose
   expectations require visual judgment stays in the human QA flow.
2. Place the spec under `tests/` with a filename matching the AT
   (e.g. `at-0030-svg-export.spec.ts`).
3. Prefer role-based selectors (`getByRole`) over brittle CSS selectors.
4. Keep assertions about file output or DOM state — avoid pixel snapshots.
