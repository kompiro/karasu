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

/** The entry `index.html` loads, and the one the serve build loads instead (#3138). */
export const APP_ENTRY = "/src/main.tsx";
export const SERVE_ENTRY = "/src/serve-main.tsx";

/**
 * Point `index.html` at the serve entry, which leaves Monaco out. The page
 * keeps its name, so the CLI still serves it as `index.html`.
 */
export function swapInServeEntry(): Plugin {
  return {
    name: "karasu-serve-entry",
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        const tag = `src="${APP_ENTRY}"`;
        if (!html.includes(tag)) {
          throw new Error(
            `index.html no longer loads ${APP_ENTRY}; point the serve build at ${SERVE_ENTRY} another way`,
          );
        }
        return html.replace(tag, `src="${SERVE_ENTRY}"`);
      },
    },
  };
}

/** Whether a module id belongs to the `monaco-editor` package. */
export function isMonacoModule(id: string): boolean {
  return /[\\/]node_modules[\\/]monaco-editor[\\/]/.test(id);
}

/**
 * Fail the build when a `monaco-editor` module is bundled. Serve mode never
 * shows the editor, and Monaco is most of the app build: one import of it
 * outside `monaco-setup.ts` would put it back into the npm package unseen.
 * The VS Code webview build (#3312) reuses it under its own name.
 */
export function rejectMonaco(buildName = "the karasu serve build"): Plugin {
  return {
    name: "karasu-serve-reject-monaco",
    generateBundle() {
      const bundled = [...this.getModuleIds()].filter(isMonacoModule);
      if (bundled.length > 0) {
        this.error(
          `${buildName} bundles monaco-editor (${bundled.length} modules, e.g. ${bundled[0]}). Only main.tsx may import monaco-setup.`,
        );
      }
    },
  };
}

export default mergeConfig(
  base,
  defineConfig({
    publicDir: false,
    plugins: [swapInServeEntry(), rejectMonaco(), copyServePublicFiles()],
    build: {
      outDir: "dist-serve",
      emptyOutDir: true,
      minify: true,
      sourcemap: false,
    },
  }),
);
