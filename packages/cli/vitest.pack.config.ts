import { defineConfig } from "vitest/config";

// `pnpm test:pack` (#3017): runs `karasu serve` from a packed tarball. It packs
// through the real `prepack`, which builds the preview app, so it stays out of
// the default `vitest.config.ts` suite and runs as its own CI step.
export default defineConfig({
  root: import.meta.dirname,
  test: {
    include: ["pack/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 300_000,
  },
});
