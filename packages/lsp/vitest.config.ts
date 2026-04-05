import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: "@karasu/core",
        replacement: path.resolve(__dirname, "../core/src/index.ts"),
      },
    ],
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
