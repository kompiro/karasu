import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// `adr-validate.yml` runs the required `Validate` check on the paths it lists,
// and `adr-validate-skip.yml` reports a no-op `Validate` on every other PR via
// the same list as `paths-ignore:`. When the lists drift, a PR on the missing
// path either gets no `Validate` at all (the required check hangs pending) or
// only the no-op one (the check is skipped where it matters, TPL-1725). The
// generator-upgrade paths added in Issue #3416 (`package.json`,
// `pnpm-lock.yaml`) are exactly the kind a later edit could drop from one side.

const ROOT = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, ".github/workflows", path), "utf-8");

/** The entries of each `<key>:` list in a workflow, in file order. */
function lists(yaml: string, key: "paths" | "paths-ignore"): string[][] {
  const out: string[][] = [];
  const lines = yaml.split("\n");
  for (const [i, line] of lines.entries()) {
    if (line.trim() !== `${key}:`) continue;
    const entries: string[] = [];
    for (const next of lines.slice(i + 1)) {
      const m = /^\s+-\s+"?([^"]+?)"?\s*$/.exec(next);
      if (!m) break;
      entries.push(m[1]);
    }
    out.push(entries);
  }
  return out;
}

describe("adr-validate paths", () => {
  const validate = lists(read("adr-validate.yml"), "paths");
  const skip = lists(read("adr-validate-skip.yml"), "paths-ignore");

  it("has one paths list for pull_request and one for push, and they agree", () => {
    expect(validate).toHaveLength(2);
    expect(validate[1]).toEqual(validate[0]);
  });

  it("is mirrored by the skip workflow's paths-ignore", () => {
    expect(skip).toHaveLength(1);
    expect([...skip[0]].sort()).toEqual([...validate[0]].sort());
  });

  it("covers the generator, its check and its config", () => {
    expect(validate[0]).toEqual(
      expect.arrayContaining([
        "docs/adr/**",
        "adr.config.json",
        "scripts/adr/**",
        "package.json",
        "pnpm-lock.yaml",
      ]),
    );
  });
});
