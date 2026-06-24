import { describe, it, expect } from "vitest";
import {
  analyzeFile,
  analyzeLinkage,
  analyzeRepo,
  hasTokenOverlap,
  slugTokens,
  type SpecDocRef,
  type SpecLookup,
} from "./coverage.ts";

describe("analyzeFile", () => {
  it("recognizes a fully-canonical AT file", () => {
    const md = [
      "# AT-0099: example",
      "## 受け入れ条件",
      "### AC-1",
      "- [x] something works",
      "> ✅ Automated — `packages/e2e/tests/at-0099.spec.ts` › `something works`",
      "",
      "- [ ] something manual",
    ].join("\n");

    const r = analyzeFile("docs/acceptance/0099.md", md);
    expect(r.hasCanonicalMarker).toBe(true);
    expect(r.findings).toEqual([]);
  });

  it("recognizes the partial-automation variant", () => {
    const md = [
      "- [x] mostly works",
      "> 🟡 Partially automated — `packages/e2e/tests/at-0099.spec.ts` › `case A` (visual is manual)",
    ].join("\n");

    const r = analyzeFile("x.md", md);
    expect(r.hasCanonicalMarker).toBe(true);
    expect(r.findings).toEqual([]);
  });

  it("flags `Verified by` metadata", () => {
    const md = ["- [x] something works", '  - **Verified by**: `it("something works")`'].join("\n");

    const r = analyzeFile("x.md", md);
    expect(r.findings.find((f) => f.kind === "verified-by-metadata")).toBeDefined();
  });

  it("flags `## Automated Checks` section grouping", () => {
    const md = ["## Automated Checks", "- works", "## Manual Verification", "- looks fine"].join(
      "\n",
    );

    const r = analyzeFile("x.md", md);
    const sections = r.findings.filter((f) => f.kind === "section-grouping");
    expect(sections).toHaveLength(2);
  });

  it("does not flag `## Manual Verification Checklist` / `Steps` post-impl review sections", () => {
    const md = [
      "## Manual Verification Checklist",
      "- step 1",
      "## Manual Verification Steps",
      "- step a",
    ].join("\n");

    const r = analyzeFile("x.md", md);
    const sections = r.findings.filter((f) => f.kind === "section-grouping");
    expect(sections).toEqual([]);
  });

  it("flags `[x]` without a following canonical blockquote", () => {
    const md = ["- [x] something works", "", "- [ ] manual thing"].join("\n");

    const r = analyzeFile("x.md", md);
    const checked = r.findings.find((f) => f.kind === "checked-without-blockquote");
    expect(checked).toBeDefined();
    expect(r.hasCanonicalMarker).toBe(false);
  });

  it("does not flag `[x]` followed by a blockquote separated by blank lines", () => {
    const md = [
      "- [x] something works",
      "",
      "> ✅ Automated — `packages/e2e/tests/at-0099.spec.ts` › `something works`",
    ].join("\n");

    const r = analyzeFile("x.md", md);
    expect(r.findings.find((f) => f.kind === "checked-without-blockquote")).toBeUndefined();
    expect(r.hasCanonicalMarker).toBe(true);
  });

  it("does not look past the next checkbox or heading when scanning for blockquotes", () => {
    const md = ["- [x] first", "- [ ] second"].join("\n");

    const r = analyzeFile("x.md", md);
    expect(r.findings.find((f) => f.kind === "checked-without-blockquote")).toBeDefined();
  });

  it("accepts the suite-wide shorthand covering a run of [x] bullets", () => {
    const md = [
      "### AC-1",
      "",
      "> ✅ Automated by `packages/cli/src/render.test.ts` (suite-wide)",
      "",
      "- [x] first",
      "- [x] second",
      "- [x] third",
    ].join("\n");

    const r = analyzeFile("x.md", md);
    expect(r.hasCanonicalMarker).toBe(true);
    expect(r.findings).toEqual([]);
  });

  it("ends suite-wide scope at the next markdown heading", () => {
    const md = [
      "### AC-1",
      "> ✅ Automated by `packages/cli/src/render.test.ts` (suite-wide)",
      "- [x] covered by suite",
      "### AC-2",
      "- [x] not covered",
    ].join("\n");

    const r = analyzeFile("x.md", md);
    const offending = r.findings.find((f) => f.kind === "checked-without-blockquote");
    expect(offending).toBeDefined();
    expect(offending && "bullet" in offending && offending.bullet).toContain("not covered");
  });

  it("flags `[ ]` mixed under a suite-wide marker", () => {
    const md = [
      "### AC-1",
      "> ✅ Automated by `packages/cli/src/render.test.ts` (suite-wide)",
      "- [x] covered",
      "- [ ] manual mixed in",
    ].join("\n");

    const r = analyzeFile("x.md", md);
    const offending = r.findings.find((f) => f.kind === "unchecked-under-suite-wide");
    expect(offending).toBeDefined();
    expect(offending && "bullet" in offending && offending.bullet).toContain("manual mixed in");
  });

  it("does not treat `Automated by` without `(suite-wide)` as a suite-wide marker", () => {
    const md = [
      "### AC-1",
      "> ✅ Automated by `packages/cli/src/render.test.ts`",
      "- [x] needs its own per-bullet marker",
    ].join("\n");

    const r = analyzeFile("x.md", md);
    // The header line still matches CANONICAL_BLOCKQUOTE (Automated\b),
    // but suite-wide scope must NOT be activated, so the bullet below
    // must rely on a *following* canonical blockquote — which there is
    // none of, so the `[x]` is flagged.
    const offending = r.findings.find((f) => f.kind === "checked-without-blockquote");
    expect(offending).toBeDefined();
  });

  it("accepts slash-separated multi-test names in a per-bullet blockquote", () => {
    const md = [
      "- [x] reads, lists, and exists",
      "> ✅ Automated — `packages/cli/src/render.test.ts` › `readFile` / `readDir` / `exists true` / `exists false`",
    ].join("\n");

    const r = analyzeFile("x.md", md);
    expect(r.hasCanonicalMarker).toBe(true);
    expect(r.findings).toEqual([]);
  });

  it("extracts AT id from filename prefix", () => {
    const r = analyzeFile("docs/acceptance/0042-foo.md", "");
    expect(r.atId).toBe("0042");
  });
});

describe("slugTokens / hasTokenOverlap", () => {
  it("drops short tokens and pure-numeric tokens", () => {
    expect(slugTokens("at-0046-system-id-in-viewpath")).toEqual(["system", "viewpath"]);
    expect(slugTokens("project-management-opfs")).toEqual(["project", "management", "opfs"]);
  });

  it("returns empty for slugs that have no signal-bearing tokens", () => {
    expect(slugTokens("0042")).toEqual([]);
    expect(slugTokens("a-b-c")).toEqual([]); // all under 3 chars
  });

  it("hasTokenOverlap is case-insensitive substring match", () => {
    expect(hasTokenOverlap("at-0007-Deployment-Diagram.spec.ts", ["diagram"])).toBe(true);
    expect(hasTokenOverlap("at-0046-system-id-in-viewpath.spec.ts", ["database", "queue"])).toBe(
      false,
    );
  });

  it("rejects the AT-0046 collision (database-queue-storage ↮ system-id-in-viewpath)", () => {
    const tokens = slugTokens("database-queue-storage-parser");
    expect(hasTokenOverlap("at-0046-system-id-in-viewpath.spec.ts", tokens)).toBe(false);
  });

  it("drops generic stoplist tokens (diagram, view, test, spec, ...)", () => {
    expect(slugTokens("organization-diagram")).toEqual(["organization"]);
    expect(slugTokens("deployment-diagram")).toEqual(["deployment"]);
    // Previously the AT-0007 organization-vs-deployment pair shared
    // "diagram" and slipped through the overlap check. With the stoplist
    // dropping "diagram", the collision is now correctly rejected:
    expect(
      hasTokenOverlap("at-0007-deployment-diagram.spec.ts", slugTokens("organization-diagram")),
    ).toBe(false);
  });
});

describe("analyzeRepo cross-reference", () => {
  it("flags AT files with no marker when a matching spec exists", async () => {
    const fakeSpecs: SpecLookup = {
      findSpecsForAtId(id) {
        return id === "0042" ? ["packages/e2e/tests/at-0042-foo.spec.ts"] : [];
      },
    };

    // Use a temp-like approach: write to a real temp dir so the existing
    // file-walking code runs unchanged.
    const { mkdtempSync, mkdirSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const root = mkdtempSync(join(tmpdir(), "at-coverage-"));
    mkdirSync(join(root, "docs/acceptance"), { recursive: true });
    writeFileSync(
      join(root, "docs/acceptance/0042-foo.md"),
      ["# AT-0042", "- [ ] manual"].join("\n"),
    );
    writeFileSync(
      join(root, "docs/acceptance/0099-already.md"),
      [
        "# AT-0099",
        "- [x] works",
        "> ✅ Automated — `packages/e2e/tests/at-0099.spec.ts` › `works`",
      ].join("\n"),
    );

    const report = analyzeRepo({ repoRoot: root, specLookup: fakeSpecs });

    const cross = report.crossRefFindings;
    expect(cross).toHaveLength(1);
    expect(cross[0]).toMatchObject({
      kind: "missing-marker-with-spec",
      file: "docs/acceptance/0042-foo.md",
      specPaths: ["packages/e2e/tests/at-0042-foo.spec.ts"],
    });
  });
});

describe("analyzeLinkage (exact e2e guards)", () => {
  const exists = (paths: string[]) => (p: string) => paths.includes(p);

  it("passes when every at-spec is named in a doc and every ref resolves", () => {
    const specs = ["packages/e2e/tests/at-0099-foo.spec.ts"];
    const refs: SpecDocRef[] = [
      { file: "docs/acceptance/0099-foo.md", specPath: "packages/e2e/tests/at-0099-foo.spec.ts" },
    ];
    expect(analyzeLinkage(specs, refs, exists(specs))).toEqual({
      orphanSpecs: [],
      staleSpecRefs: [],
    });
  });

  it("flags an at-spec that no AT doc names (orphan)", () => {
    const specs = [
      "packages/e2e/tests/at-0099-foo.spec.ts",
      "packages/e2e/tests/at-0100-bar.spec.ts",
    ];
    const refs: SpecDocRef[] = [
      { file: "docs/acceptance/0099-foo.md", specPath: "packages/e2e/tests/at-0099-foo.spec.ts" },
    ];
    expect(analyzeLinkage(specs, refs, exists(specs)).orphanSpecs).toEqual([
      "packages/e2e/tests/at-0100-bar.spec.ts",
    ]);
  });

  it("flags a doc reference to a spec that does not exist (stale ref)", () => {
    const specs = ["packages/e2e/tests/at-0099-foo.spec.ts"];
    const refs: SpecDocRef[] = [
      { file: "docs/acceptance/0099-foo.md", specPath: "packages/e2e/tests/at-0099-foo.spec.ts" },
      // slug drift: doc still cites the old filename after a rename
      {
        file: "docs/acceptance/0033-drill-down.md",
        specPath: "packages/e2e/tests/at-0033-drilldown.spec.ts",
      },
    ];
    expect(analyzeLinkage(specs, refs, exists(specs)).staleSpecRefs).toEqual([
      {
        file: "docs/acceptance/0033-drill-down.md",
        specPath: "packages/e2e/tests/at-0033-drilldown.spec.ts",
      },
    ]);
  });

  it("deduplicates repeated stale references to the same path in the same doc", () => {
    const refs: SpecDocRef[] = [
      { file: "docs/acceptance/0099.md", specPath: "packages/e2e/tests/at-0099-gone.spec.ts" },
      { file: "docs/acceptance/0099.md", specPath: "packages/e2e/tests/at-0099-gone.spec.ts" },
    ];
    expect(analyzeLinkage([], refs, () => false).staleSpecRefs).toHaveLength(1);
  });

  it("integrates with analyzeRepo over a temp repo (orphan + stale)", async () => {
    const { mkdtempSync, mkdirSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const root = mkdtempSync(join(tmpdir(), "at-linkage-"));
    mkdirSync(join(root, "docs/acceptance"), { recursive: true });
    mkdirSync(join(root, "packages/e2e/tests"), { recursive: true });

    // linked spec — named in its doc → no finding
    writeFileSync(join(root, "packages/e2e/tests/at-0099-foo.spec.ts"), "");
    writeFileSync(
      join(root, "docs/acceptance/0099-foo.md"),
      [
        "# AT-0099",
        "- [x] works",
        "> ✅ Automated by `packages/e2e/tests/at-0099-foo.spec.ts` (suite-wide)",
      ].join("\n"),
    );
    // orphan spec — exists on disk but no doc names it
    writeFileSync(join(root, "packages/e2e/tests/at-0100-orphan.spec.ts"), "");
    // smoke spec — must be ignored by the orphan guard
    writeFileSync(join(root, "packages/e2e/tests/opfs.smoke.spec.ts"), "");
    // stale ref — doc cites a spec that does not exist
    writeFileSync(
      join(root, "docs/acceptance/0033-drill-down.md"),
      [
        "# AT-0033",
        "> ✅ Automated by `packages/e2e/tests/at-0033-drilldown.spec.ts` (suite-wide)",
      ].join("\n"),
    );

    const { linkage } = analyzeRepo({ repoRoot: root });
    expect(linkage.orphanSpecs).toEqual(["packages/e2e/tests/at-0100-orphan.spec.ts"]);
    expect(linkage.staleSpecRefs).toEqual([
      {
        file: "docs/acceptance/0033-drill-down.md",
        specPath: "packages/e2e/tests/at-0033-drilldown.spec.ts",
      },
    ]);
  });
});
