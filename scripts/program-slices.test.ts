import { describe, expect, it } from "vitest";
import { checkParent, sliceTableRefs } from "./program-slices.ts";

const parent = (body: string, subs: number[]) => ({
  number: 999,
  title: "parent",
  body,
  subs: subs.map((number) => ({ number, state: "open" as const, title: `slice ${number}` })),
});

describe("sliceTableRefs", () => {
  it("returns null when the section is absent — a missing table is not an empty one", () => {
    expect(sliceTableRefs("## Scope\n\nsomething about #123")).toBeNull();
  });

  it("collects the issue numbers referenced inside the section", () => {
    const body = ["## Slice status", "", "| A (#11) | ... |", "| B (#22) | ... |"].join("\n");
    expect(sliceTableRefs(body)).toEqual([11, 22]);
  });

  it("stops at the next heading so later sections do not count as slices", () => {
    const body = ["## Slice status", "", "| A (#11) |", "", "## Notes", "", "see #999"].join("\n");
    expect(sliceTableRefs(body)).toEqual([11]);
  });

  it("ignores issue references that appear before the section", () => {
    const body = ["Refs #7 and #8.", "", "## Slice status", "", "| A (#11) |"].join("\n");
    expect(sliceTableRefs(body)).toEqual([11]);
  });
});

describe("checkParent", () => {
  it("passes when every sub-issue appears in the table", () => {
    const body = "## Slice status\n\n| A (#11) |\n| B (#22) |";
    expect(checkParent(parent(body, [11, 22]))).toEqual([]);
  });

  it("reports the missing section once, without also listing every slice", () => {
    const problems = checkParent(parent("## Scope\n\nno table here", [11, 22]));
    expect(problems).toHaveLength(1);
    expect(problems[0].message).toContain('no "## Slice status" section');
  });

  it("names each sub-issue the table forgot", () => {
    const problems = checkParent(parent("## Slice status\n\n| A (#11) |", [11, 22, 33]));
    expect(problems.map((p) => p.message)).toEqual([
      expect.stringContaining("#22"),
      expect.stringContaining("#33"),
    ]);
  });

  it("tolerates a table that mentions issues which are not sub-issues (design links, follow-ups)", () => {
    const body = "## Slice status\n\n| A (#11) | see #4242 |";
    expect(checkParent(parent(body, [11]))).toEqual([]);
  });
});
