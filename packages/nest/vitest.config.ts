import { defineConfig } from "vitest/config";

// Every package with a vitest suite owns a config pinned to `root: __dirname`,
// so its meaning does not follow the cwd it is loaded from. See the root
// `vitest.config.ts` and `scripts/lint/vitest-projects-sync.ts`.
export default defineConfig({
  root: __dirname,
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
