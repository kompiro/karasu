// Guard for TPL-2421 checklist item 1: every deploy kind has a row in the hue
// table of `docs/spec/style.md` (Rule 2) and of its Japanese twin.
//
// The closed set is `REFERENCE_DATA.deployUnitKinds`, which the Reference
// panel and the parser sync tests already hold to the deploy keywords. The
// table's kind column must equal that set in both languages, so a new deploy
// kind without a row fails, and so does a row left behind for a removed kind.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { REFERENCE_DATA } from "./reference-data.js";

const specDir = resolve(__dirname, "../../../../docs/spec");

/**
 * The kinds in the first column of the hue table under `heading`: the first
 * Markdown table after the heading, whose header row's second cell is the hue.
 */
function hueTableKinds(file: string, heading: string, hueHeader: string): string[] {
  const lines = readFileSync(resolve(specDir, file), "utf8").split("\n");
  const start = lines.findIndex((l) => l.startsWith(heading));
  expect(start, `${file} has the heading "${heading}"`).toBeGreaterThanOrEqual(0);
  const header = lines.findIndex(
    (l, i) => i > start && l.startsWith("|") && l.split("|")[2]?.trim() === hueHeader,
  );
  expect(header, `${file} has a hue table under "${heading}"`).toBeGreaterThan(start);
  const kinds: string[] = [];
  for (let i = header + 2; i < lines.length && lines[i].startsWith("|"); i++) {
    const [, kindCell, hueCell] = lines[i].split("|").map((c) => c.trim());
    const kind = /^`([^`]+)`$/.exec(kindCell)?.[1];
    expect(kind, `${file} row "${lines[i]}" names a kind in backticks`).toBeDefined();
    expect(hueCell, `${file} row for ${kind} names a hue`).not.toBe("");
    kinds.push(kind!);
  }
  return kinds;
}

const DEPLOY_KINDS = REFERENCE_DATA.deployUnitKinds.map((k) => k.kind);

describe("deploy kind hue table ↔ deploy kinds (TPL-2421)", () => {
  it.each([
    ["style.md", "### Rule 2", "Hue"],
    ["style.ja.md", "### 規則 2", "色相"],
  ])("%s lists exactly the deploy kinds", (file, heading, hueHeader) => {
    const kinds = hueTableKinds(file, heading, hueHeader);
    expect(new Set(kinds).size, `${file} has no duplicate rows`).toBe(kinds.length);
    expect([...kinds].sort()).toEqual([...DEPLOY_KINDS].sort());
  });
});
