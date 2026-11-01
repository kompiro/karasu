import { describe, expect, it } from "vitest";
import {
  compareOutputs,
  countKeys,
  countSucceeded,
  type Outcome,
  type SideOutput,
} from "./compare.ts";

const ok = (output: string, diagnostics: string[] = []): Outcome => ({
  ok: true,
  output,
  diagnostics,
});
const failed = (error: string): Outcome => ({ ok: false, error });

describe("compareOutputs", () => {
  it("finds nothing when every outcome is equal", () => {
    const side: SideOutput = { a: ok("1", ["warning x"]), b: ok("2") };
    expect(compareOutputs(side, { ...side })).toEqual([]);
  });

  // AT-0068, AT-0069 and AT-1580 import files a fence cannot resolve on its
  // own; they fail on both sides alike, and that is not a difference.
  it("counts two identical failures as equal", () => {
    expect(compareOutputs({ a: failed("Error: boom") }, { a: failed("Error: boom") })).toEqual([]);
  });

  it("reports failures that differ", () => {
    expect(compareOutputs({ a: failed("Error: one") }, { a: failed("Error: two") })).toEqual([
      { key: "a", reason: "failed differently: Error: two" },
    ]);
  });

  it("reports a failure on one side only", () => {
    expect(compareOutputs({ a: ok("1") }, { a: failed("TypeError: x") })).toEqual([
      { key: "a", reason: "failed at HEAD: TypeError: x" },
    ]);
    expect(compareOutputs({ a: failed("SyntaxError: y") }, { a: ok("1") })).toEqual([
      { key: "a", reason: "failed at the merge base: SyntaxError: y" },
    ]);
  });

  it("reports a different output", () => {
    expect(compareOutputs({ a: ok("1") }, { a: ok("2") })).toEqual([
      { key: "a", reason: "output" },
    ]);
  });

  // A parser refactor can keep every picture and still change a warning.
  it("reports diagnostics that differ while the output is equal", () => {
    expect(compareOutputs({ a: ok("1", ["w1", "w2"]) }, { a: ok("1", ["w1", "w3"]) })).toEqual([
      { key: "a", reason: "diagnostics: w2 became w3" },
    ]);
    expect(compareOutputs({ a: ok("1", ["w1"]) }, { a: ok("1", ["w1", "w2"]) })).toEqual([
      { key: "a", reason: "diagnostics: HEAD adds w2" },
    ]);
    expect(compareOutputs({ a: ok("1", ["w1", "w2"]) }, { a: ok("1", ["w1"]) })).toEqual([
      { key: "a", reason: "diagnostics: HEAD lacks w2" },
    ]);
  });

  // A refactor that stops producing a view (a system no longer enumerated)
  // differs as much as one that draws it differently.
  it("reports an output only one side produced", () => {
    expect(compareOutputs({ a: ok("1"), b: ok("2") }, { a: ok("1"), c: ok("3") })).toEqual([
      { key: "b", reason: "only at the merge base" },
      { key: "c", reason: "only at HEAD" },
    ]);
  });

  it("lists the differences by key", () => {
    const keys = compareOutputs({ z: ok("1"), a: ok("1") }, { z: ok("2"), a: ok("2") }).map(
      (d) => d.key,
    );
    expect(keys).toEqual(["a", "z"]);
  });
});

describe("countKeys", () => {
  it("counts the union of both sides once", () => {
    expect(countKeys({ a: ok("1"), b: ok("1") }, { b: ok("1"), c: ok("1") })).toBe(3);
  });
});

describe("countSucceeded", () => {
  it("counts only the keys that succeeded on both sides", () => {
    const base: SideOutput = { a: ok("1"), b: failed("E"), c: ok("1"), d: ok("1") };
    const head: SideOutput = { a: ok("2"), b: failed("E"), c: failed("E") };
    expect(countSucceeded(base, head)).toBe(1);
  });
});
