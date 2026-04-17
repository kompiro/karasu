import { defineWorkspace } from "vitest/config";

// Explicit project list so vitest does not auto-discover configs in
// `.worktrees/` (git worktrees) or other unintended locations.
export default defineWorkspace([
  "packages/core/vitest.config.ts",
  "packages/app/vitest.config.ts",
  "packages/cli/vitest.config.ts",
  "packages/lsp/vitest.config.ts",
]);
