import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Guards the npm publish surface for the `karasu` CLI (Issue #1681).
//
// The published artifact is a single esbuild bundle (`dist/index.js`) plus the
// preview app `karasu serve` hands to the browser (`dist/app/`, #3017). The
// `files` field must pin exactly those — NOT a whole-directory `["dist"]`
// glob, which would also pack any stray `tsc` emit (`*.test.js` / `*.d.ts` /
// `*.map`) that lands in the gitignored `dist/`. `dist/app/` is a directory,
// but one `scripts/stage-app.ts` empties and refills on every pack, so the
// tarball stays deterministic regardless of `dist/` hygiene.
//
// See ADR-1681, #3017 and TPL-1681 (publishable
// tarball completeness / exclusion). `pnpm test:pack` checks the tarball itself.
const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
) as { files: string[]; bin: Record<string, string>; scripts: Record<string, string> };

describe("karasu CLI publish surface", () => {
  it("ships only the bundle, the preview app and the third-party notices", () => {
    expect(pkg.files).toEqual(["dist/index.js", "dist/app/", "THIRD_PARTY_NOTICES.md"]);
  });

  it("stages the preview app on every pack (#3017)", () => {
    expect(pkg.scripts.prepack).toContain("build:app");
    expect(pkg.scripts["build:app"]).toContain("build:serve");
    expect(pkg.scripts["build:app"]).toContain("scripts/stage-app.ts");
  });

  it("never falls back to a whole-directory `dist` glob", () => {
    // A bare "dist" (or "dist/") would pack test artifacts; assert it can't sneak back.
    expect(pkg.files).not.toContain("dist");
    expect(pkg.files).not.toContain("dist/");
  });

  it("points the bin at the bundle that `files` ships", () => {
    expect(pkg.bin.karasu).toBe("./dist/index.js");
    // The bin target, with its leading "./" stripped, must be one of the packed files.
    expect(pkg.files).toContain(pkg.bin.karasu.replace(/^\.\//, ""));
  });
});
