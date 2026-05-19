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
  },
});
