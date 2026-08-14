import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import {
  analyzeKrsFences,
  analyzeKrsFencesIn,
  deprecationCodesIn,
  measureKrsFenceCoverage,
  DECLARATION_KEYWORDS,
  DEFAULT_DOC_ROOTS,
} from "./krs-fences.ts";
import { LOGICAL_KEYWORDS, DEPLOY_KEYWORDS } from "../../packages/core/src/parser/parser.ts";

const REPO_ROOT = resolve(__dirname, "..", "..");

function md(...lines: string[]): string {
  return lines.join("\n");
}

describe("analyzeKrsFencesIn", () => {
  it("accepts a ```krs block the parser understands", () => {
    const doc = md("```krs", "system S {", "  service Svc {}", "}", "```");
    expect(analyzeKrsFencesIn("x.md", doc)).toEqual([]);
  });

  it("reports a ```krs block that no longer parses, with its diagnostic codes", () => {
    // The AT-0006 AC-1.2 line that started Issue #2047.
    const doc = md(
      "```krs",
      "system S {",
      "  service Svc { domain D { usecase U {",
      '    resource DB "DB" [table]',
      "  } } }",
      "}",
      "```",
    );

    const findings = analyzeKrsFencesIn("docs/acceptance/0006.md", doc);
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("krs-fence-parse-error");
    expect(findings[0].line).toBe(1);
    expect(findings[0].detail).toContain("unexpected-token-in-block");
  });

  it("does not parse a fence marked as an excerpt", () => {
    const doc = md(
      "```krs fragment",
      "usecase PlaceOrder {",
      "  resource OrderDB.Orders",
      "}",
      "```",
    );
    expect(analyzeKrsFencesIn("x.md", doc)).toEqual([]);
  });

  it("accepts a fence marked invalid while it still fails to parse", () => {
    const doc = md("```krs invalid", 'user Customer [human] { description "top level" }', "```");
    expect(analyzeKrsFencesIn("x.md", doc)).toEqual([]);
  });

  it("reports a fence marked invalid that the parser started accepting", () => {
    const doc = md("```krs invalid", "system S {", "  service Svc {}", "}", "```");

    const findings = analyzeKrsFencesIn("x.md", doc);
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("krs-fence-unexpectedly-valid");
  });

  it("reports an unrecognized marker rather than silently skipping it", () => {
    const doc = md("```krs pseudo", "not really krs at all", "```");

    const findings = analyzeKrsFencesIn("x.md", doc);
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("krs-fence-unknown-marker");
    expect(findings[0].detail).toContain("fragment");
  });

  it("ignores fences in other languages, including .krs.style", () => {
    const doc = md(
      "```krs.style",
      "resource[table] { shape: cylinder; }",
      "```",
      "```bash",
      "karasu render index.krs",
      "```",
    );
    expect(analyzeKrsFencesIn("x.md", doc)).toEqual([]);
  });

  it("points at the opening fence line of the offending block", () => {
    const doc = md(
      "# AT-9999",
      "",
      "```krs",
      "system S { service Svc {} }",
      "```",
      "",
      "```krs",
      "service {",
      "```",
    );

    const findings = analyzeKrsFencesIn("x.md", doc);
    expect(findings.map((f) => f.line)).toEqual([7]);
  });
});

// Both snippets Issue #2415 was opened over sat in bare fences, so a guard
// that only looked at ```krs-tagged blocks would have left them exactly as
// invisible as before.
describe("analyzeKrsFencesIn — bare fences holding `.krs`", () => {
  it("reports a bare fence that declares a node with a concrete id", () => {
    // docs/spec/tags-annotations.md as it stood in #2415: an inline-label form
    // the parser has never accepted, in a fence nothing was checking.
    const doc = md("```", 'service Payment "Payment Service" [external]', "```");

    const findings = analyzeKrsFencesIn("docs/spec/tags-annotations.md", doc);
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("krs-fence-untagged");
    expect(findings[0].line).toBe(1);
  });

  it("leaves pseudo-grammar productions bare — a placeholder is not an id", () => {
    const doc = md(
      "```",
      "user <id> [<human|ai>] {",
      "  label <string>",
      "}",
      "```",
      "```",
      "<kind> <id> [<tags>]",
      "```",
    );
    expect(analyzeKrsFencesIn("docs/spec/syntax.md", doc)).toEqual([]);
  });

  it("leaves prose that merely opens with a keyword alone", () => {
    // docs/guide/01-service-team-design.md has an ASCII outline whose first
    // line reads "domain dependencies (§1)".
    const doc = md("```", "domain dependencies (§1)", "service boundaries (§2)", "```");
    expect(analyzeKrsFencesIn("docs/guide/01-service-team-design.md", doc)).toEqual([]);
  });

  it("leaves non-krs fences that name a directory tree or a shell session", () => {
    const doc = md(
      "```",
      "system",
      "├─ service",
      "└─ domain",
      "```",
      "```",
      "$ karasu render index.krs",
      "```",
    );
    expect(analyzeKrsFencesIn("docs/concepts.md", doc)).toEqual([]);
  });

  it("reports a bare fence made only of edges, with no declaration to match", () => {
    // docs/spec/syntax.md demonstrates the `#<id>` edge suffix exactly this way.
    const doc = md("```", 'ECommerce -> Payment "Process payment" #criticalWrite', "```");

    const findings = analyzeKrsFencesIn("docs/spec/syntax.md", doc);
    expect(findings.map((f) => f.kind)).toEqual(["krs-fence-untagged"]);
  });

  it("accepts the same block once it declares itself", () => {
    const doc = md("```krs fragment", 'service Payment "Payment Service" [external]', "```");
    expect(analyzeKrsFencesIn("docs/spec/tags-annotations.md", doc)).toEqual([]);
  });
});

// A fence nested in a numbered step is indented, which is how most AT records
// present their input. Anchoring at column 0 made 23 of them invisible — two
// of which did not parse — while the guard reported "ok".
describe("analyzeKrsFencesIn — indented fences", () => {
  it("parses a ```krs block nested in a list item, dedented", () => {
    const doc = md(
      "1. Open a `.krs` file containing:",
      "   ```krs",
      "   system S {",
      "     service Svc {}",
      "   }",
      "   ```",
      "2. Press F12",
    );
    expect(analyzeKrsFencesIn("docs/acceptance/0037.md", doc)).toEqual([]);
  });

  it("reports an indented block that does not parse", () => {
    const doc = md(
      "1. Replace `index.krs` content with:",
      "   ```krs",
      "   organization Corp {",
      "     team alpha {}",
      "     team alpha {}",
      "   }",
      "   ```",
    );

    const findings = analyzeKrsFencesIn("docs/acceptance/0007.md", doc);
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("krs-fence-parse-error");
    expect(findings[0].detail).toContain("duplicate-team-id");
  });

  it("reports an indented bare fence holding `.krs`", () => {
    const doc = md("1. Type:", "   ```", "   system S {", "     service Svc {}", "   }", "   ```");

    const findings = analyzeKrsFencesIn("docs/acceptance/0037.md", doc);
    expect(findings.map((f) => f.kind)).toEqual(["krs-fence-untagged"]);
  });

  it("keeps indentation deeper than the fence's own", () => {
    // If the body were dedented to the first non-space column instead of the
    // fence's indent, the nested `service` would lose its offset and a real
    // indentation-sensitive read of the snippet would differ from the file.
    const doc = md("  ```krs", "  system S {", "      service Deep {}", "  }", "  ```");
    expect(analyzeKrsFencesIn("x.md", doc)).toEqual([]);
  });
});

describe("analyzeKrsFences over the real corpus", () => {
  it("every krs snippet in the docs corpus parses (or declares itself fragment / invalid)", () => {
    expect(analyzeKrsFences(REPO_ROOT).map((f) => `${f.file}:${f.line} ${f.detail}`)).toEqual([]);
  });

  it("covers the spec, guide, acceptance and concepts docs", () => {
    expect(DEFAULT_DOC_ROOTS).toEqual([
      "docs/acceptance",
      "docs/spec",
      "docs/guide",
      "docs/concepts.md",
      "docs/concepts.ja.md",
    ]);
  });

  // A guard that reports "ok" because a root moved and it read nothing is
  // worse than no guard. `analyzeKrsFences` cannot tell those apart on its
  // own, so the floor lives here.
  it("actually parses the corpus rather than reading nothing", () => {
    const coverage = measureKrsFenceCoverage(REPO_ROOT);
    expect(coverage.files).toBeGreaterThan(250);
    expect(coverage.parsed).toBeGreaterThan(280);
  });

  it("returns nothing when a configured root does not exist", () => {
    expect(analyzeKrsFences(REPO_ROOT, ["docs/no-such-dir"])).toEqual([]);
  });
});

// The corpus emits no deprecation-class diagnostic today (#2208 retired the
// last one), so the classifier is exercised with synthesized diagnostics rather
// than through a snippet — otherwise this guard would go untested until the
// next deprecation ships, which is when it has to already work.
describe("deprecationCodesIn", () => {
  it("picks deprecation-class warnings and drops duplicates", () => {
    expect(
      deprecationCodesIn([
        { severity: "warning", code: "some-form-deprecated" },
        { severity: "warning", code: "some-form-deprecated" },
        { severity: "warning", code: "owns-target-not-found" },
      ]),
    ).toEqual(["some-form-deprecated"]);
  });

  it("ignores errors and infos, which the error path and the reader already cover", () => {
    expect(
      deprecationCodesIn([
        { severity: "error", code: "positional-label-removed" },
        { severity: "info", code: "some-form-deprecated" },
      ]),
    ).toEqual([]);
  });

  it("reports nothing for the current corpus", () => {
    // Turning the check on was free precisely because this is empty; if a new
    // deprecation lands, the fences teaching it fail here rather than at its
    // removal release.
    expect(
      analyzeKrsFences(REPO_ROOT).filter((f) => f.kind === "krs-fence-deprecated-form"),
    ).toEqual([]);
  });
});

// A hand-copied keyword list would silently stop recognizing whichever kind
// was added last, and a bare fence declaring only that kind would go back to
// being invisible (TPL-1720).
describe("DECLARATION_KEYWORDS tracks the parser", () => {
  it("covers every logical and deploy block keyword the parser accepts", () => {
    const declared = new Set(DECLARATION_KEYWORDS);
    expect([...LOGICAL_KEYWORDS].filter((k) => !declared.has(k))).toEqual([]);
    expect([...DEPLOY_KEYWORDS].filter((k) => !declared.has(k))).toEqual([]);
  });

  it("adds the block keywords that live outside those two sets", () => {
    const declared = new Set(DECLARATION_KEYWORDS);
    for (const k of ["deploy", "organization", "team", "member", "facet", "boundary"]) {
      expect(declared.has(k)).toBe(true);
    }
  });
});
