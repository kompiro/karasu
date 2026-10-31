import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The ratchet half of the source line budget (#3344).
 *
 * `.oxlintrc.json` gives every `packages/*\/src` source a `max-lines` budget,
 * and pins each file that was already over it at its size. oxlint stops a
 * pinned file from growing past its pin; it cannot notice a pin left above a
 * file that shrank. A stale pin is headroom the file can grow back into, which
 * is how `layout.ts` regrew 60% after the #2512 split. This test keeps every
 * pin equal to its file's current size, so lowering the pin happens in the
 * same PR as the shrink.
 */

const REPO_ROOT = resolve(import.meta.dirname, "../..");

type MaxLinesRule = ["error", { max: number }];
type Override = {
  files: string[];
  excludeFiles?: string[];
  rules: Record<string, unknown>;
};

const config = JSON.parse(readFileSync(resolve(REPO_ROOT, ".oxlintrc.json"), "utf8")) as {
  overrides: Override[];
};

const budgetIndex = config.overrides.findIndex(
  (o) => o.files.some((f) => f.includes("*")) && "max-lines" in o.rules,
);
const budget = (config.overrides[budgetIndex].rules["max-lines"] as MaxLinesRule)[1].max;

const pins = config.overrides.flatMap((o, index) =>
  o.files.length === 1 && !o.files[0].includes("*") && "max-lines" in o.rules
    ? [{ path: o.files[0], max: (o.rules["max-lines"] as MaxLinesRule)[1].max, index }]
    : [],
);

// Counted the way oxlint's `max-lines` counts: a trailing newline does not
// start another line.
function countLines(path: string): number {
  const text = readFileSync(resolve(REPO_ROOT, path), "utf8");
  const lines = text.split("\n").length;
  return text.endsWith("\n") ? lines - 1 : lines;
}

describe("source line budget in .oxlintrc.json", () => {
  it("has one default budget, declared before the pins so the pins override it", () => {
    expect(budgetIndex).toBeGreaterThanOrEqual(0);
    expect(pins.length).toBeGreaterThan(0);
    for (const pin of pins) expect(pin.index).toBeGreaterThan(budgetIndex);
  });

  it.each(pins)("pins $path at its current size", ({ path, max }) => {
    expect(existsSync(resolve(REPO_ROOT, path)), `${path} no longer exists: remove its pin`).toBe(
      true,
    );
    const lines = countLines(path);
    expect(
      lines,
      `${path} is within the default budget of ${budget} lines: remove its pin`,
    ).toBeGreaterThan(budget);
    expect(
      max,
      `${path} has ${lines} lines but is pinned at ${max}: set the pin to ${lines} in this PR`,
    ).toBe(lines);
  });
});
