import { describe, expect, it } from "vitest";
import type { ComparisonResult } from "./compare.ts";
import { decide, LISTED, readResult, summarize, titleType } from "./verdict.ts";

const result = (keys: string[] = []): ComparisonResult => ({
  version: 1,
  baseSha: "a".repeat(40),
  headSha: "b".repeat(40),
  compared: 100,
  succeeded: 100,
  differences: keys.map((key) => ({ key, reason: "output" })),
});

describe("titleType", () => {
  it.each([
    ["refactor: split the parser", "refactor"],
    ["refactor(core): split the parser", "refactor"],
    ["refactor!: drop an export", "refactor"],
    ["refactor(core)!: drop an export", "refactor"],
    ["  refactor(core): leading space", "refactor"],
    ["Refactor(core): capitalized", "refactor"],
    ["feat(core): refactor the parser", "feat"],
    ["fix: a refactor gone wrong", "fix"],
  ])("reads %j as %j", (title, type) => {
    expect(titleType(title)).toBe(type);
  });

  it.each(["Refactor the parser", "refactor the parser", ""])("finds no type in %j", (title) => {
    expect(titleType(title)).toBeNull();
  });
});

describe("decide", () => {
  it.each([
    ["refactor(core): x", result(), "equal", "success"],
    ["refactor(core): x", result(["render a :: system"]), "different", "failure"],
    ["refactor(core): x", null, "incomparable", "failure"],
    ["feat(core): x", result(), "equal", "success"],
    ["feat(core): x", result(["render a :: system"]), "different", "success"],
    ["fix(core): x", null, "incomparable", "success"],
  ] as const)("%j with %j is %s and %s", (title, comparison, status, conclusion) => {
    expect(decide(title, comparison)).toMatchObject({ status, conclusion });
  });

  it("counts every difference and lists the first ones", () => {
    const keys = Array.from({ length: LISTED + 5 }, (_, i) => `k${i}`);
    const verdict = decide("feat: x", result(keys));
    expect(verdict.differences).toBe(LISTED + 5);
    expect(verdict.keys).toEqual(keys.slice(0, LISTED));
  });

  it("does not list anything for an incomparable run", () => {
    expect(decide("feat: x", null)).toEqual({
      version: 1,
      status: "incomparable",
      refactor: false,
      differences: 0,
      keys: [],
      conclusion: "success",
    });
  });
});

describe("readResult", () => {
  it("reads what run.ts writes", () => {
    expect(readResult(JSON.stringify(result(["x"])))).toEqual(result(["x"]));
    expect(readResult(JSON.stringify({ ...result(), succeeded: 90 }))).not.toBeNull();
  });

  // Any of these means the comparison did not finish the way run.ts finishes
  // it; for a refactor that has to fail, never read as "nothing differs".
  it.each([
    ["no file", null],
    ["not JSON", "{"],
    ["another version", JSON.stringify({ ...result(), version: 2 })],
    ["nothing compared", JSON.stringify({ ...result(), compared: 0 })],
    ["no success count", JSON.stringify({ ...result(), succeeded: undefined })],
    // Every output failing alike on both sides is a broken environment, not
    // an equivalent refactor.
    ["nothing succeeded", JSON.stringify({ ...result(), succeeded: 0 })],
    ["too few succeeded", JSON.stringify({ ...result(), succeeded: 89 })],
    ["differences missing", JSON.stringify({ ...result(), differences: undefined })],
    ["a malformed difference", JSON.stringify({ ...result(), differences: [{ key: 1 }] })],
  ])("returns null for %s", (_label, text) => {
    expect(readResult(text)).toBeNull();
  });
});

describe("summarize", () => {
  it("keeps a key with a pipe or a backtick inside its table cell", () => {
    const comparison = result(["render a|b `c` :: system"]);
    const summary = summarize(decide("refactor: x", comparison), comparison);
    expect(summary).toContain("| render a\\|b 'c' :: system | output |");
    expect(summary).toContain("so the check fails");
  });

  it("says a refactor fails when the comparison did not finish", () => {
    expect(summarize(decide("refactor: x", null), null)).toContain("the check fails");
  });
});
