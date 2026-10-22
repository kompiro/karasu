// The VS Code preview (#3312, slice B of #2996): the viewer built for the
// extension's webview into `dist-vscode-webview/`, which the extension stages
// into `out/webview/` and ships in the `.vsix`. The extension writes the page
// itself (the CSP needs its nonce and `asWebviewUri`), so the entry is the
// script, not an HTML file. `src/viewer/vscode/build-config.test.ts` guards it.
import { defineConfig, mergeConfig } from "vite";
import base from "./vite.config";
import { rejectMonaco } from "./vite.serve.config";

const WEBVIEW_ASSET_DIR = "assets";

export default mergeConfig(
  base,
  defineConfig({
    // Asset URLs resolve against the script's own `vscode-webview://` URL;
    // an absolute `/assets/…` would point at the webview's origin root.
    base: "./",
    publicDir: false,
    // The webview never shows the editor, and Monaco would add most of the
    // app build to the `.vsix`.
    plugins: [rejectMonaco("the VS Code webview build")],
    build: {
      outDir: "dist-vscode-webview",
      emptyOutDir: true,
      minify: true,
      sourcemap: false,
      // A script entry gets no HTML to inject a preload polyfill into.
      modulePreload: false,
      rollupOptions: {
        input: "src/viewer/vscode/main.tsx",
        // The extension names the two files in the page it writes, so they
        // carry no hash, and everything else is inlined: one script under
        // `script-src` and one stylesheet under `style-src`.
        output: {
          inlineDynamicImports: true,
          entryFileNames: `${WEBVIEW_ASSET_DIR}/viewer.js`,
          assetFileNames: (asset) =>
            asset.names.some((name) => name.endsWith(".css"))
              ? `${WEBVIEW_ASSET_DIR}/viewer.css`
              : `${WEBVIEW_ASSET_DIR}/[name]-[hash][extname]`,
        },
      },
    },
  }),
);
