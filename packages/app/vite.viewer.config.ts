// The gallery viewer (#2997): a separate build of `viewer.html` into
// `dist-viewer/`. The app's own build (`vite.config.ts`) takes only
// `index.html` into `dist/`, which is what Pages deploys, so the viewer is
// never part of the app's output. `src/viewer/build-config.test.ts` guards both.
import { defineConfig, mergeConfig } from "vite";
import base from "./vite.config";

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
      rollupOptions: { input: "viewer.html" },
    },
  }),
);
