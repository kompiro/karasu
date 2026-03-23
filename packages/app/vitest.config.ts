import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: ["src/**/*.test.ts", "src/vite-env.d.ts", "src/main.tsx"],
      reporter: ["text", "html"],
      reportsDirectory: "./coverage",
    },
  },
});
