import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { DiagramType } from "@karasu-tools/core";
import { optimize } from "svgo";
import { render } from "./render.js";

/**
 * `karasu render` output survives an `svgo` optimization pass.
 *
 * svgo is the default last step of almost every SVG pipeline — committing a
 * diagram to a repo, embedding it in a docs site, shipping it in a README. If
 * karasu's output cannot take that pass without losing what makes it a karasu
 * diagram, the file is only usable unoptimized, and nobody finds out until a
 * downstream build quietly strips something.
 *
 * Two claims, and the second is the one that matters:
 *
 *  1. it optimizes — the pass completes and the output is smaller;
 *  2. it stays *ours* — every `data-node-id` / `data-edge-*` anchor survives,
 *     the output re-parses, and the deep-link ids the permalink contract is
 *     built on (`docs/spec/permalink.md`) are still there.
 *
 * svgo is a devDependency here only: this asserts compatibility with a
 * downstream tool, it does not put svgo in the shipped CLI.
 */

const REPO_ROOT = resolve(__dirname, "../../..");
const EC_SYSTEM_KRS = join(REPO_ROOT, "examples/ja/ec-platform/01-system.krs");
const ORG_KRS = join(REPO_ROOT, "examples/ja/org/system.krs");
const DEPLOY_KRS = join(REPO_ROOT, "examples/ja/ec-platform/06-deploy/deploy.krs");

/** Every `data-*` anchor value in the document, by attribute name. */
function anchors(svg: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const [, name, value] of svg.matchAll(/(data-(?:node-id|edge-from|edge-to))="([^"]*)"/g)) {
    const bucket = out.get(name) ?? new Set<string>();
    bucket.add(value);
    out.set(name, bucket);
  }
  return out;
}

describe("karasu render output through the svgo pipeline", () => {
  let tmpDir: string;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "karasu-svgo-"));
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    // `render` writes the SVG to stdout when no --output is given; the tests
    // below always use --output, so stdout is silenced only to keep the
    // reporter clean.
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    // The deploy fixture legitimately reports unresolved `realizes` targets;
    // they are not this test's subject, so keep them out of the reporter.
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    stdoutSpy.mockRestore();
    exitSpy.mockRestore();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  async function renderToString(
    krsPath: string,
    options: { view?: DiagramType } = {},
  ): Promise<string> {
    const outPath = join(tmpDir, "out.svg");
    await render(krsPath, { ...options, output: outPath });
    return readFileSync(outPath, "utf8");
  }

  const VIEW_CASES: { view: DiagramType; krsPath: string }[] = [
    { view: "system", krsPath: EC_SYSTEM_KRS },
    { view: "org", krsPath: ORG_KRS },
    { view: "deploy", krsPath: DEPLOY_KRS },
  ];

  it.each(VIEW_CASES)(
    "$view view: svgo shrinks the output and it re-parses",
    async ({ view, krsPath }) => {
      const svg = await renderToString(krsPath, { view });

      const optimized = optimize(svg, { multipass: true }).data;

      expect(optimized.length).toBeLessThan(svg.length);
      expect(optimized).toMatch(/^<svg[\s>]/);

      // Re-running the pass proves the output is parseable svgo input, i.e. the
      // first pass did not emit something only it could read.
      expect(() => optimize(optimized, { multipass: true })).not.toThrow();
    },
  );

  it("keeps every node and edge anchor through the pass", async () => {
    const svg = await renderToString(EC_SYSTEM_KRS, { view: "system" });
    const optimized = optimize(svg, { multipass: true }).data;

    const before = anchors(svg);
    const after = anchors(optimized);

    // The fixture has to actually carry anchors, or this test proves nothing.
    expect(before.get("data-node-id")?.size ?? 0).toBeGreaterThan(0);
    expect(before.get("data-edge-from")?.size ?? 0).toBeGreaterThan(0);

    for (const [name, values] of before) {
      // Every anchor value present before the pass is present after it.
      expect({ [name]: Array.from(after.get(name) ?? []).sort() }).toEqual({
        [name]: Array.from(values).sort(),
      });
    }
  });

  it("keeps the bundled all-views output navigable (ids and <style> intact)", async () => {
    // The bundled output is the fragile case: its tab switching is pure CSS
    // `:target` against element ids, so an id-mangling or style-dropping pass
    // would leave a file that renders but no longer navigates (AT-0041).
    const svg = await renderToString(EC_SYSTEM_KRS);
    const optimized = optimize(svg, { multipass: true }).data;

    const ids = (input: string) =>
      new Set(Array.from(input.matchAll(/\sid="([^"]+)"/g), (m) => m[1]));
    const before = ids(svg);
    expect(before.size).toBeGreaterThan(0);

    const after = ids(optimized);
    // Compare as sets so a dropped id shows up in the diff by name.
    expect(
      Array.from(after)
        .filter((id) => before.has(id))
        .sort(),
    ).toEqual(Array.from(before).sort());

    // `:target` rules live in an embedded stylesheet — losing it silently
    // disables tab navigation.
    expect(svg).toContain("<style");
    expect(optimized).toContain("<style");
    expect(optimized).toContain(":target");
  });
});
