import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@karasu\/core\/icons\/(.*)/,
        replacement: path.resolve(__dirname, "../core/icons/$1"),
      },
      {
        find: "@karasu/core",
        replacement: path.resolve(__dirname, "../core/src/index.ts"),
      },
    ],
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: ["src/**/*.test.ts", "src/vite-env.d.ts", "src/main.tsx"],
      reporter: ["text", "html"],
      reportsDirectory: "./coverage",
    },
  },
});
