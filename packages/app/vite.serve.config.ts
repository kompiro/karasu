// The `karasu serve` build (#3017): the app as the `karasu` npm package ships
// it. `packages/cli` stages `dist-serve/` into its own `dist/app/` at pack
// time, so what lands in the tarball is decided here, not by the Pages build
// (`vite.config.ts`), which keeps its unminified output and sourcemaps.
// `src/serve-build-config.test.ts` guards this file.
import { readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig, mergeConfig, type Plugin } from "vite";
import base from "./vite.config";

/**
 * The files from `public/` that `index.html` references, copied by name.
 * The rest of `public/` serves Pages only: its routing (`_redirects`,
 * `_routes.json`), the OGP image, and the fonts `functions/render.ts` draws
 * PNGs with.
 */
export const SERVE_PUBLIC_FILES = ["favicon.svg"] as const;

function copyServePublicFiles(): Plugin {
  return {
    name: "karasu-serve-public-files",
    generateBundle() {
      for (const fileName of SERVE_PUBLIC_FILES) {
        this.emitFile({
          type: "asset",
          fileName,
          source: readFileSync(path.resolve(__dirname, "public", fileName)),
        });
      }
    },
  };
}

export default mergeConfig(
  base,
  defineConfig({
    publicDir: false,
    plugins: [copyServePublicFiles()],
    build: {
      outDir: "dist-serve",
      emptyOutDir: true,
      minify: true,
      sourcemap: false,
    },
  }),
);
