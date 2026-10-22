import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import webviewConfig from "../../../vite.vscode-webview.config";

const APP_ROOT = path.resolve(__dirname, "../../..");
const REPO_ROOT = path.resolve(APP_ROOT, "../..");

type Plugin = { name: string };

// The extension writes the webview page itself and names the script and the
// stylesheet in it (#3312), so the build's file names and shape are a contract
// with `packages/vscode`, checked here without building.
describe("VS Code webview build (#3312)", () => {
  const output = webviewConfig.build?.rollupOptions?.output;
  if (!output || Array.isArray(output)) throw new Error("expected a single output");

  it("builds the webview entry script, into a directory outside the app's dist/", () => {
    expect(webviewConfig.build?.rollupOptions?.input).toBe("src/viewer/vscode/main.tsx");
    const outDir = path.resolve(APP_ROOT, webviewConfig.build?.outDir ?? "");
    expect(path.relative(path.resolve(APP_ROOT, "dist"), outDir).startsWith("..")).toBe(true);
  });

  it("names the script and the stylesheet the extension's page loads, without a hash", () => {
    expect(output.entryFileNames).toBe("assets/viewer.js");
    const assetName = output.assetFileNames as (asset: { names: string[] }) => string;
    expect(assetName({ names: ["main.css"] })).toBe("assets/viewer.css");
  });

  it("emits one script, so the CSP names exactly one", () => {
    expect(output.codeSplitting).toBe(false);
  });

  it("resolves its assets against the script's own URL, not the webview origin root", () => {
    expect(webviewConfig.base).toBe("./");
  });

  it("fails the build when Monaco is bundled (the webview never shows the editor)", () => {
    const names = ((webviewConfig.plugins ?? []) as Plugin[]).flat().map((p) => p?.name);
    expect(names).toContain("karasu-serve-reject-monaco");
  });

  it("does not copy the app's public/", () => {
    expect(webviewConfig.publicDir).toBe(false);
  });

  it("is minified and carries no sourcemaps (TPL-1681)", () => {
    expect(webviewConfig.build?.minify).toBe(true);
    expect(webviewConfig.build?.sourcemap).toBe(false);
  });

  it("the build output is gitignored and skipped by oxlint", () => {
    const outDir = webviewConfig.build?.outDir;
    const gitignore = readFileSync(path.join(REPO_ROOT, ".gitignore"), "utf8").split("\n");
    expect(gitignore).toContain(`${outDir}/`);
    const oxlint = JSON.parse(readFileSync(path.join(REPO_ROOT, ".oxlintrc.json"), "utf8")) as {
      ignorePatterns: string[];
    };
    expect(oxlint.ignorePatterns).toContain(outDir);
  });

  // The webview CSP has no font-src or style-src for the network (#2996
  // decision 2); the app's web fonts live in web-fonts.css.
  it("the entry does not import web-fonts.css", () => {
    const entry = readFileSync(path.join(APP_ROOT, "src/viewer/vscode/main.tsx"), "utf8");
    expect(entry).not.toContain("web-fonts.css");
  });
});
