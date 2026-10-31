import { existsSync, readdirSync, readFileSync } from "node:fs";
import { matchesGlob, resolve } from "node:path";
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
const BUDGET_GLOB = "packages/*/src/**/*.{ts,tsx,mts,cts}";

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
  (o) => o.files.length === 1 && o.files[0] === BUDGET_GLOB && "max-lines" in o.rules,
);
const budget =
  budgetIndex < 0
    ? undefined
    : (config.overrides[budgetIndex].rules["max-lines"] as MaxLinesRule)[1].max;

// Every other override that sets `max-lines`, under any key oxlint reads as
// that rule (`eslint/max-lines` too), is a pin, whatever its shape. A pin
// written with a glob, several files, another key or another severity is then
// rejected rather than skipped.
const pins = config.overrides.flatMap((o, index) =>
  index === budgetIndex
    ? []
    : Object.entries(o.rules)
        .filter(([key]) => /(?:^|\/)max-lines$/.test(key))
        .map(([key, value]) => ({ files: o.files, key, value, index })),
);

// Counted the way oxlint's `max-lines` counts: a trailing newline does not
// start another line.
function countLines(path: string): number {
  const text = readFileSync(resolve(REPO_ROOT, path), "utf8");
  const lines = text.split("\n").length;
  return text.endsWith("\n") ? lines - 1 : lines;
}

// The files the budget override applies to: its glob minus its `excludeFiles`,
// and minus `*.d.ts`, which the top-level `ignorePatterns` keeps oxlint from
// visiting at all.
function budgetedSources(): string[] {
  const excluded = budgetIndex < 0 ? [] : (config.overrides[budgetIndex].excludeFiles ?? []);
  return readdirSync(resolve(REPO_ROOT, "packages"), { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() && existsSync(resolve(REPO_ROOT, "packages", entry.name, "src")),
    )
    .flatMap((entry) =>
      readdirSync(resolve(REPO_ROOT, "packages", entry.name, "src"), { recursive: true })
        .map((path) => `packages/${entry.name}/src/${String(path)}`)
        .filter(
          (path) =>
            matchesGlob(path, BUDGET_GLOB) &&
            !path.endsWith(".d.ts") &&
            !path.includes("node_modules") &&
            !excluded.some((glob) => matchesGlob(path, glob)),
        ),
    );
}

// Directives that switch `max-lines` off for the whole file: a block or line
// `eslint-disable` / `oxlint-disable` (not `-line` / `-next-line`) whose rule
// list is empty (every rule) or names `max-lines`. The list may span lines and
// ends at a `--` description. The scan reads raw text, not comments, so a
// directive inside a string or one undone by `eslint-enable` is flagged too:
// deliberately conservative, since a false alarm costs a reword and a miss
// costs the budget.
const DISABLE_DIRECTIVE =
  /\/\*\s*(?:eslint|oxlint)-disable(?![-\w])([\s\S]*?)\*\/|\/\/\s*(?:eslint|oxlint)-disable(?![-\w])([^\n]*)/g;

function disablesMaxLines(text: string): boolean {
  return [...text.matchAll(DISABLE_DIRECTIVE)].some((match) => {
    const rules = (match[1] ?? match[2])
      .split("--")[0]
      .split(/[\s,]+/)
      .filter(Boolean);
    return rules.length === 0 || rules.some((rule) => /(?:^|\/)max-lines$/.test(rule));
  });
}

describe("source line budget in .oxlintrc.json", () => {
  it(`has one default budget for ${BUDGET_GLOB}, declared before the pins so the pins override it`, () => {
    expect(
      budgetIndex,
      `no override with files ["${BUDGET_GLOB}"] sets max-lines`,
    ).toBeGreaterThanOrEqual(0);
    expect(pins.length).toBeGreaterThan(0);
    for (const pin of pins) expect(pin.index).toBeGreaterThan(budgetIndex);
  });

  it.each(pins)("pins $files at its current size", ({ files, key, value }) => {
    expect(files, "a pin names exactly one file, without a glob").toHaveLength(1);
    const [path] = files;
    expect(path, "a pin names exactly one file, without a glob").not.toMatch(/[*?{[]/);
    expect(key, `the pin for ${path} is written as "max-lines"`).toBe("max-lines");
    expect(value, `the pin for ${path} is ["error", { "max": <lines> }]`).toEqual([
      "error",
      { max: expect.any(Number) },
    ]);
    const max = (value as MaxLinesRule)[1].max;
    expect(existsSync(resolve(REPO_ROOT, path)), `${path} no longer exists: remove its pin`).toBe(
      true,
    );
    const lines = countLines(path);
    expect(
      lines,
      `${path} is within the default budget of ${budget} lines: remove its pin`,
    ).toBeGreaterThan(budget ?? Number.POSITIVE_INFINITY);
    expect(
      max,
      `${path} has ${lines} lines but is pinned at ${max}: set the pin to ${lines} in this PR`,
    ).toBe(lines);
  });

  it("is not switched off by a disable comment in a source file", () => {
    const disabled = budgetedSources().filter((path) =>
      disablesMaxLines(readFileSync(resolve(REPO_ROOT, path), "utf8")),
    );
    expect(
      disabled,
      "move code out of the file, or raise its pin in .oxlintrc.json with the reason in the PR description",
    ).toEqual([]);
  });
});
