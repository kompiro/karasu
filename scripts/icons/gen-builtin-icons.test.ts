import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { readBuiltinIconSources, regenerate } from "./gen-builtin-icons.ts";

const repoRoot = resolve(import.meta.dirname, "../..");

describe("built-in icon codegen (#2802)", () => {
  it("the committed module is up to date (run `pnpm gen:icons` if this fails)", () => {
    // Same call the lefthook hook makes, so the test and the hook cannot
    // disagree about what "stale" means.
    expect(regenerate({ root: repoRoot, check: true }).stale).toEqual([]);
  });

  it("reads every manifest entry, in order, with non-empty SVG", () => {
    const sources = readBuiltinIconSources(repoRoot);
    expect(sources.length).toBeGreaterThanOrEqual(30);
    for (const s of sources) {
      expect(s.svg).toMatch(/^<svg\b/);
      expect(s.svg).toContain("</svg>");
    }
  });

  it("names exactly the icons the manifest names, in manifest order", () => {
    const manifest = JSON.parse(
      readFileSync(resolve(repoRoot, "packages/core/icons/icons.json"), "utf8"),
    ) as { icons: { name: string }[] };
    expect(readBuiltinIconSources(repoRoot).map((s) => s.name)).toEqual(
      manifest.icons.map((e) => e.name),
    );
  });
});
