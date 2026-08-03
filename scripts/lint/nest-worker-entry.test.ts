/**
 * `main` has to keep pointing at the entry, not at the barrel.
 *
 * `packages/nest/src/worker.ts` exists because a Workers entry may export
 * only a default handler and bindable classes, while `index.ts` is the
 * package barrel and exports constants. Pointing `main` back at the barrel is
 * a one-word change that reads as tidying up, and its consequence is that the
 * Worker stops starting: workerd fails with `Incorrect type for map entry`
 * before any request is served.
 *
 * The check lives here rather than in `packages/nest` because that package
 * compiles with `types: []` on purpose and cannot read a file.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "../..");

describe("the nest Worker entry", () => {
  it("is what wrangler.toml points at", () => {
    const config = readFileSync(join(root, "packages/nest/wrangler.toml"), "utf8");
    expect(config).toMatch(/^main = "src\/worker\.ts"$/m);
  });

  it("is a module whose exports the runtime will accept", () => {
    // Read rather than imported: this file runs in Node, and the entry pulls
    // in Workers globals. The rule is textual anyway -- a named export of
    // anything but a class is what breaks startup.
    const source = readFileSync(join(root, "packages/nest/src/worker.ts"), "utf8");
    const named = [...source.matchAll(/^export (?!default)(\w+)/gm)].map((match) => match[1]);
    expect(named.filter((keyword) => keyword !== "class")).toEqual([]);
    expect(source).toContain("export default {");
  });
});
