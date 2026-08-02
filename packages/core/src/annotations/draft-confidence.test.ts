import { describe, expect, it } from "vitest";
import { compile } from "../index.js";
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

describe("@draft end to end", () => {
  const metadataFor = (krs: string, id: string) => {
    const result = compile(krs, { diagramType: "system" });
    // `CompileResult` is a union; the org variant carries no nodeMetadata.
    if (!("nodeMetadata" in result)) throw new Error("expected a system compile result");
    return result.nodeMetadata.get(id);
  };

  it("reaches NodeMetadata from real source", () => {
    const meta = metadataFor(
      `system S {
  service Guessed @draft(confidence: "low") {}
}
`,
      "Guessed",
    );
    expect(meta?.draft).toEqual({
      confidence: { kind: "machine", level: "low", rank: 0, raw: "low" },
    });
  });

  it("marks a bare @draft without inventing a level", () => {
    expect(metadataFor(`system S {\n  service Bare @draft {}\n}\n`, "Bare")?.draft).toEqual({});
  });

  it("leaves an unmarked node undefined", () => {
    expect(metadataFor(`system S {\n  service Plain {}\n}\n`, "Plain")?.draft).toBeUndefined();
  });

  it("does not mark a child that merely sits inside a draft parent", () => {
    // Whether the badge is inherited for rendering is a style-cascade
    // question; the metadata reports what the node itself asserts, so a
    // consumer counting unreviewed statements does not double-count a
    // subtree. Pinned because the two can drift apart silently.
    const krs = `system S {
  service Parent @draft {
    domain Child {}
  }
}
`;
    expect(metadataFor(krs, "Parent")?.draft).toEqual({});
    expect(metadataFor(krs, "Child")?.draft).toBeUndefined();
  });

  it("keeps an unknown level as written, all the way through", () => {
    const meta = metadataFor(
      `system S {\n  service Odd @draft(confidence: "we argued about this one") {}\n}\n`,
      "Odd",
    );
    expect(meta?.draft?.confidence).toEqual({
      kind: "opaque",
      raw: "we argued about this one",
    });
  });

  it("renders the draft badge in preference to another annotation on the same node", () => {
    // A node renders one badge. `@draft` is ordered last in REFERENCE_DATA so
    // it wins the cascade tie: it is the mark that changes how a reader should
    // treat everything else on the node, so it is the one that must survive.
    const svg = compile(`system S {\n  service Both @deprecated @draft {}\n}\n`, {
      diagramType: "system",
    }).svg;
    expect(svg).toContain(">Draft</text>");
    expect(svg).not.toContain(">Deprecated</text>");
  });

  it("does not warn about @draft or its confidence parameter", () => {
    const result = compile(`system S {\n  service Guessed @draft(confidence: "high") {}\n}\n`, {
      diagramType: "system",
    });
    expect(result.diagnostics.filter((d) => d.code.startsWith("annotation-"))).toEqual([]);
  });
});
