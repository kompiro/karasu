/* eslint-disable no-console -- build assertion script; stderr reporting is the whole job */
import { statSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Fails the vscode build if the preview bundle is not in `out/webview/`. The
// panel loads it from there through `asWebviewUri`, and the .vsix ships only
// `out/`; a build that skipped `scripts/stage-webview.ts` would show a blank
// preview once installed (#3312, TPL-1024 dev vs packaged parity).

for (const name of ["viewer.js", "viewer.css"]) {
  const file = fileURLToPath(new URL(`../out/webview/${name}`, import.meta.url));
  let size;
  try {
    size = statSync(file).size;
  } catch {
    console.error(
      `[vscode build] ${file} is missing.\n` +
        "The build script must run `tsx scripts/stage-webview.ts` after the app's " +
        "`build:vscode-webview`. Without it the installed .vsix shows a blank preview.",
    );
    process.exit(1);
  }
  if (size === 0) {
    console.error(`[vscode build] ${file} is empty — the preview bundle is broken.`);
    process.exit(1);
  }
}
