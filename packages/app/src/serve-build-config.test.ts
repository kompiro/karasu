import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import serveConfig, { SERVE_PUBLIC_FILES } from "../vite.serve.config";

const APP_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(APP_ROOT, "../..");

// The `karasu` npm package ships this build (#3017). What it carries is
// decided here; the tarball contents are checked by the CLI's `test:pack`.
describe("serve build for the karasu npm package (#3017)", () => {
  it("is minified and carries no sourcemaps (TPL-1681)", () => {
    expect(serveConfig.build?.minify).toBe(true);
    expect(serveConfig.build?.sourcemap).toBe(false);
  });

  it("writes outside the Pages output", () => {
    const outDir = path.resolve(APP_ROOT, serveConfig.build?.outDir ?? "");
    const appOutDir = path.resolve(APP_ROOT, "dist");
    expect(path.relative(appOutDir, outDir).startsWith("..")).toBe(true);
  });

  it("does not copy public/, whose routing files, OGP image and fonts serve Pages only", () => {
    expect(serveConfig.publicDir).toBe(false);
  });

  it("copies exactly the public files index.html references", () => {
    const html = readFileSync(path.join(APP_ROOT, "index.html"), "utf8");
    const referenced = [...html.matchAll(/(?:href|src)="\/([^"/]+)"/g)]
      .map((match) => match[1] as string)
      .filter((file) => existsSync(path.join(APP_ROOT, "public", file)));
    expect([...SERVE_PUBLIC_FILES].sort()).toEqual(referenced.sort());
  });

  it("the build output is gitignored and skipped by oxlint", () => {
    const outDir = serveConfig.build?.outDir;
    const gitignore = readFileSync(path.join(REPO_ROOT, ".gitignore"), "utf8").split("\n");
    expect(gitignore).toContain(`${outDir}/`);
    const oxlint = JSON.parse(readFileSync(path.join(REPO_ROOT, ".oxlintrc.json"), "utf8")) as {
      ignorePatterns: string[];
    };
    expect(oxlint.ignorePatterns).toContain(outDir);
  });
});
