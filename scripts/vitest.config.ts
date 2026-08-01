import { defineConfig } from "vitest/config";

// `root` is pinned so this config behaves identically whether it is loaded as
// a project of the root `vitest.config.ts` (root defaults to this directory)
// or via `vitest run --config scripts/vitest.config.ts` (root would otherwise
// default to the cwd).
export default defineConfig({
  root: __dirname,
  test: {
    name: "scripts",
    include: ["**/*.test.ts"],
  },
});
