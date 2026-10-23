/**
 * Stage the preview the webview loads (#3312).
 *
 *   tsx scripts/stage-webview.ts   (run by `pnpm run build`)
 *
 * Copies the bundle `packages/app`'s `build:vscode-webview` produced into
 * `out/webview/`, which `preview-panel.ts` serves through `asWebviewUri` and
 * the `.vsix` ships with the rest of `out/`. The directory is emptied first,
 * so the extension carries exactly the current build (TPL-1681).
 */
import { cpSync, existsSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { WEBVIEW_DIR, WEBVIEW_SCRIPT, WEBVIEW_STYLESHEET } from "../src/webview-assets.ts";

const EXTENSION_ROOT = resolve(import.meta.dirname, "..");
export const WEBVIEW_BUILD_DIR = resolve(EXTENSION_ROOT, "../app/dist-vscode-webview/assets");
export const STAGED_WEBVIEW_DIR = join(EXTENSION_ROOT, ...WEBVIEW_DIR);

/** Replace `outDir` with the webview bundle in `buildDir`. */
export function stageWebview(buildDir: string, outDir: string): void {
  for (const file of [WEBVIEW_SCRIPT, WEBVIEW_STYLESHEET]) {
    if (!existsSync(join(buildDir, file))) {
      throw new Error(
        `No ${file} in ${buildDir}. Run \`pnpm --filter @karasu-tools/app run build:vscode-webview\` first.`,
      );
    }
  }
  rmSync(outDir, { recursive: true, force: true });
  cpSync(buildDir, outDir, { recursive: true });
}

// Only run when invoked directly (not when imported by tests).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  stageWebview(WEBVIEW_BUILD_DIR, STAGED_WEBVIEW_DIR);
  process.stdout.write(`Staged the preview webview into ${STAGED_WEBVIEW_DIR}\n`);
}
