// The gallery viewer (#2997): a separate build of `viewer.html` into
// `dist-viewer/`. The app's own build (`vite.config.ts`) takes only
// `index.html` into `dist/`, which is what Pages deploys, so the viewer is
// never part of the app's output. `src/viewer/build-config.test.ts` guards both.
import { defineConfig, mergeConfig } from "vite";
import base from "./vite.config";

const VIEWER_ASSET_DIR = "assets";

export default mergeConfig(
  base,
  defineConfig({
    // `public/` holds the app's Pages routing (`_redirects`, `_routes.json`)
    // and files the viewer never references; nest serves only the bundle.
    publicDir: false,
    build: {
      outDir: "dist-viewer",
      emptyOutDir: true,
      minify: true,
      sourcemap: false,
      rollupOptions: {
        input: "viewer.html",
        // The page nest serves is cached for up to ten minutes, and a
        // redeploy replaces the whole asset set. With hashed names a cached
        // page would ask for an entry the new deploy no longer has and show
        // nothing (#2998). Stable names make it load the current bundle;
        // the static assets are revalidated on every load, so they are never
        // stale. The chunks the entry imports keep their hashes: only the
        // entry that ships with them names them.
        output: {
          entryFileNames: `${VIEWER_ASSET_DIR}/viewer.js`,
          assetFileNames: (asset) =>
            asset.names.some((name) => name.endsWith(".css"))
              ? `${VIEWER_ASSET_DIR}/viewer.css`
              : `${VIEWER_ASSET_DIR}/[name]-[hash][extname]`,
        },
      },
    },
  }),
);
