import { defineConfig } from "vitest/config";

// Explicit project list so vitest does not auto-discover test files in
// `.worktrees/` / `.claude/worktrees/` (git worktrees) or other unintended
// locations. Vitest 4 dropped the standalone `vitest.workspace.ts` file, so
// this list has to live in the root config under `test.projects`.
//
// Keep in sync with the per-package `test` scripts wired into the root
// `pnpm test`. Packages without a vitest config (i18n) are referenced by
// directory; packages with no vitest suite at all (e2e, vscode-e2e) are
// intentionally absent — they run under Playwright / ExTester.
export default defineConfig({
  test: {
    projects: [
      "packages/core/vitest.config.ts",
      "packages/i18n",
      "packages/app/vitest.config.ts",
      "packages/cli/vitest.config.ts",
      "packages/lsp/vitest.config.ts",
      "packages/vscode/vitest.config.ts",
      "packages/docs-site/vitest.config.ts",
      "scripts/vitest.config.ts",
    ],
  },
});
