import { defineConfig } from "vitest/config";

// Every package with a vitest suite owns a config pinned to `root: __dirname`,
// so its meaning does not follow the cwd it is loaded from. See the root
// `vitest.config.ts` and `scripts/lint/vitest-projects-sync.ts`.
export default defineConfig({
  root: __dirname,
  resolve: {
    // resvg's `.wasm` is bundled by wrangler and cannot be loaded by vitest.
    // See `src/testing/resvg-wasm-stub.ts`.
    alias: {
      "@resvg/resvg-wasm/index_bg.wasm": `${__dirname}/src/testing/resvg-wasm-stub.ts`,
    },
  },
  test: {
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
