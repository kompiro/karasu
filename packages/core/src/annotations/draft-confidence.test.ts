import { describe, expect, it } from "vitest";
import { getDraftState, interpretConfidence } from "./draft-confidence.js";

describe("interpretConfidence", () => {
  it.each([
    ["low", 0],
    ["medium", 1],
    ["high", 2],
  ])("reads %s as a machine-usable level ranked %i", (raw, rank) => {
    expect(interpretConfidence(raw)).toEqual({ kind: "machine", level: raw, rank, raw });
  });

  it("ranks low first, so ascending order puts the least trustworthy at the top", () => {
    const ranks = ["high", "low", "medium"].map((raw) => interpretConfidence(raw));
    expect(
      [...ranks]
        .sort((a, b) => (a.kind === "machine" && b.kind === "machine" ? a.rank - b.rank : 0))
        .map((c) => c.raw),
    ).toEqual(["low", "medium", "high"]);
  });

  it("normalises case and whitespace rather than splitting the scale", () => {
    // "Low" from a generator and "low" from a human mean the same thing.
    expect(interpretConfidence("  LOW ")).toMatchObject({ kind: "machine", level: "low" });
    // The raw value is preserved exactly for display.
    expect(interpretConfidence("  LOW ").raw).toBe("  LOW ");
  });

  it("keeps an unknown value verbatim instead of erroring", () => {
    // A reviewer's note is a legitimate value; rejecting it pushes people
    // back to comments, where nothing can read it.
    expect(interpretConfidence("we argued about this one")).toEqual({
      kind: "opaque",
      raw: "we argued about this one",
    });
  });

  it.each(["lowish", "very high", "0.3", ""])("does not treat %o as a level", (raw) => {
    expect(interpretConfidence(raw).kind).toBe("opaque");
  });
});

describe("getDraftState", () => {
  it("reports a bare @draft as a draft with no level", () => {
    // The mark is the point; the level is an optional refinement, so this must
    // not default to a level nobody wrote.
    expect(getDraftState(["draft"], undefined)).toEqual({});
  });

  it("reads the level when the annotation carries one", () => {
    expect(getDraftState(["draft"], { draft: { confidence: "low" } })).toEqual({
      confidence: { kind: "machine", level: "low", rank: 0, raw: "low" },
    });
  });

  it("returns undefined for a node that is not a draft", () => {
    expect(getDraftState(["deprecated"], undefined)).toBeUndefined();
    expect(getDraftState([], { draft: { confidence: "low" } })).toBeUndefined();
    expect(getDraftState(undefined, undefined)).toBeUndefined();
  });

  it("ignores another annotation's params", () => {
    expect(getDraftState(["draft"], { deprecated: { until: "2026-Q3" } })).toEqual({});
  });
});
