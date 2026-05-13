import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: __dirname,
  resolve: {
    alias: [
      {
        find: /^@karasu-tools\/core\/icons\/(.*)/,
        replacement: path.resolve(__dirname, "../core/icons/$1"),
      },
      {
        find: "@karasu-tools/core",
        replacement: path.resolve(__dirname, "../core/src/index.ts"),
      },
      {
        find: /^@\/(.*)/,
        replacement: path.resolve(__dirname, "src") + "/$1",
      },
    ],
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["**/node_modules/**", "**/.worktrees/**", "**/dist/**"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: ["src/**/*.test.ts", "src/vite-env.d.ts", "src/main.tsx"],
      reporter: ["text", "html"],
      reportsDirectory: "./coverage",
    },
  },
});
