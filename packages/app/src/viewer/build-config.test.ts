import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import appConfig from "../../vite.config";
import viewerConfig from "../../vite.viewer.config";

const APP_ROOT = path.resolve(__dirname, "../..");
const REPO_ROOT = path.resolve(APP_ROOT, "../..");

// The viewer is served by nest only. The app's Pages output must not carry it
// (#2997), and its build output must stay out of git and out of the lint scan.
describe("viewer build stays separate from the app's Pages output (#2997)", () => {
  it("the app build takes only index.html into dist/", () => {
    // No explicit input means Vite's default, index.html alone.
    expect(appConfig.build?.rollupOptions?.input).toBeUndefined();
    expect(appConfig.build?.outDir ?? "dist").toBe("dist");
  });

  it("the viewer build takes only viewer.html, into a directory outside dist/", () => {
    expect(viewerConfig.build?.rollupOptions?.input).toBe("viewer.html");
    const outDir = path.resolve(APP_ROOT, viewerConfig.build?.outDir ?? "");
    const appOutDir = path.resolve(APP_ROOT, "dist");
    expect(path.relative(appOutDir, outDir).startsWith("..")).toBe(true);
  });

  it("the viewer build does not copy the app's public/ (Pages routing files)", () => {
    expect(viewerConfig.publicDir).toBe(false);
  });

  it("the viewer build output is gitignored and skipped by oxlint", () => {
    const outDir = viewerConfig.build?.outDir;
    const gitignore = readFileSync(path.join(REPO_ROOT, ".gitignore"), "utf8").split("\n");
    expect(gitignore).toContain(`${outDir}/`);
    const oxlint = JSON.parse(readFileSync(path.join(REPO_ROOT, ".oxlintrc.json"), "utf8")) as {
      ignorePatterns: string[];
    };
    expect(oxlint.ignorePatterns).toContain(outDir);
  });
});

// The viewer makes no network requests (#2997). Its only stylesheet is
// `styles/index.css` and what that imports; the app's web fonts live apart
// in `web-fonts.css`, which only the app's `main.tsx` imports.
describe("viewer stylesheets load nothing from the network (#2997)", () => {
  const stylesDir = path.join(APP_ROOT, "src/styles");
  const cssFiles = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? cssFiles(path.join(dir, entry.name))
        : entry.name.endsWith(".css")
          ? [path.join(dir, entry.name)]
          : [],
    );

  it("no stylesheet but web-fonts.css references an absolute URL", () => {
    const offenders = cssFiles(stylesDir)
      .filter((file) => path.basename(file) !== "web-fonts.css")
      .filter((file) => /url\(\s*["']?(https?:)?\/\//.test(readFileSync(file, "utf8")));
    expect(offenders.map((file) => path.relative(stylesDir, file))).toEqual([]);
  });

  it("the viewer entry does not import web-fonts.css", () => {
    const entry = readFileSync(path.join(APP_ROOT, "src/viewer/main.tsx"), "utf8");
    expect(entry).not.toContain("web-fonts.css");
  });
});
