import { defineConfig } from "vitest/config";

// Explicit project list so vitest does not auto-discover configs in
// `.worktrees/` (git worktrees) or other unintended locations.
export default defineConfig({
  test: {
    projects: [
      "packages/core/vitest.config.ts",
      "packages/app/vitest.config.ts",
      "packages/cli/vitest.config.ts",
      "packages/lsp/vitest.config.ts",
      "scripts/vitest.config.ts",
    ],
  },
});
