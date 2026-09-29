// Spike #2993: a separate build of the viewer entry, output to dist-viewer/.
import { defineConfig, mergeConfig } from "vite";
import base from "./vite.config";

export default mergeConfig(
  base,
  defineConfig({
    build: {
      outDir: "dist-viewer",
      emptyOutDir: true,
      minify: true,
      sourcemap: false,
      rollupOptions: { input: "viewer.html" },
    },
  }),
);
