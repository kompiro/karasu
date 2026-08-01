import { defineConfig } from "vitest/config";

export default defineConfig({
  root: __dirname,
  test: {
    include: ["scripts/**/*.test.ts"],
  },
});
