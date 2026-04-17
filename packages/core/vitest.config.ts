import { defineConfig } from "vitest/config";

export default defineConfig({
  root: __dirname,
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/.worktrees/**", "**/dist/**"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/types/**", "src/fs/project.ts", "src/fs/types.ts"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
      reporter: ["text", "html"],
      reportsDirectory: "./coverage",
    },
  },
});
