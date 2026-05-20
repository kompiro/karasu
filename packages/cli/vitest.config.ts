import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: __dirname,
  resolve: {
    alias: [
      {
        find: "@karasu-tools/core",
        replacement: path.resolve(__dirname, "../core/src/index.ts"),
      },
      {
        find: "@karasu-tools/i18n",
        replacement: path.resolve(__dirname, "../i18n/src/index.ts"),
      },
    ],
  },
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/.worktrees/**", "**/dist/**"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
      // The translate adapters (a large, heavily-covered chunk) moved to
      // @karasu-tools/core; their coverage now counts toward core, not the
      // CLI. The functions / branches thresholds are recalibrated to the
      // CLI's post-move profile — lines / statements are unaffected.
      thresholds: {
        lines: 80,
        functions: 72,
        branches: 66,
        statements: 80,
      },
      reporter: ["text", "html"],
      reportsDirectory: "./coverage",
    },
  },
});
