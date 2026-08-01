import { defineConfig } from "vitest/config";

// Every package with a vitest suite owns a config. Without one, `vitest run`
// inside this package walks up to the root `vitest.config.ts` and resolves its
// `projects` entries against this directory, so the root config must never be
// reachable from a package cwd.
export default defineConfig({
  root: __dirname,
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
