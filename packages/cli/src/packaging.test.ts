import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Guards the npm publish surface for the `karasu` CLI (Issue #1681).
//
// The published artifact is a single esbuild bundle (`dist/index.js`). The
// `files` field must pin exactly that bundle — NOT a whole-directory `["dist"]`
// glob, which would also pack any stray `tsc` emit (`*.test.js` / `*.d.ts` /
// `*.map`) that lands in the gitignored `dist/`. Keeping this list precise makes
// the tarball deterministic regardless of `dist/` hygiene.
//
// See docs/adr/<...>-cli-pack-only-bundle.md and TPL-20260618-02 (publishable
// tarball completeness / exclusion).
const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
) as { files: string[]; bin: Record<string, string> };

describe("karasu CLI publish surface", () => {
  it("ships only the bundle and the third-party notices", () => {
    expect(pkg.files).toEqual(["dist/index.js", "THIRD_PARTY_NOTICES.md"]);
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
