import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Every package with a vitest suite owns a config pinned to `root: __dirname`,
// so its meaning does not follow the cwd it is loaded from. See the root
// `vitest.config.ts` and `scripts/lint/vitest-projects-sync.ts`.
export default defineConfig({
  root: __dirname,
  resolve: {
    alias: {
      // wrangler supplies this at bundle time and vitest cannot resolve it,
      // so a test that loads the Workers entry would fail at import -- and
      // loading the entry is the only way to check its export shape, which is
      // what workerd rejects on. See `src/testing/cloudflare-workers.ts`.
      "cloudflare:workers": fileURLToPath(
        new URL("./src/testing/cloudflare-workers.ts", import.meta.url),
      ),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
