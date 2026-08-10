import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { analyzeKrsFences, analyzeKrsFencesIn, DEFAULT_DOC_ROOTS } from "./krs-fences.ts";

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

  it("accepts the same block once it declares itself", () => {
    const doc = md("```krs fragment", 'service Payment "Payment Service" [external]', "```");
    expect(analyzeKrsFencesIn("docs/spec/tags-annotations.md", doc)).toEqual([]);
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

  it("returns nothing when a configured root does not exist", () => {
    expect(analyzeKrsFences(REPO_ROOT, ["docs/no-such-dir"])).toEqual([]);
  });
});
