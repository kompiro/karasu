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
    // `src/i18n.ts` binds the CLI translator once, at module load, from the
    // ambient POSIX locale variables. Suites that assert on CLI output
    // (render.e2e.test.ts, lint-style.test.ts) therefore assert against
    // whatever catalog the developer's shell selects. Pin the highest-
    // precedence variable so the expected strings are the English ones on
    // every machine — without this, a contributor exporting LANG,
    // LC_MESSAGES or LC_ALL as ja_JP gets a red suite on a clean checkout
    // (#2536). `resolveCliLocale` itself is tested by injecting an env
    // object, so it is unaffected by this pin.
    env: { LC_ALL: "C" },
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
