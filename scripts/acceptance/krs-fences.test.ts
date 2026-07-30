import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { analyzeKrsFences, analyzeKrsFencesIn } from "./krs-fences.ts";

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
      "```",
      "<kind> <id> [<tags>]",
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

describe("analyzeKrsFences over the real corpus", () => {
  it("every krs snippet in docs/acceptance parses (or declares itself fragment / invalid)", () => {
    expect(analyzeKrsFences(REPO_ROOT).map((f) => `${f.file}:${f.line} ${f.detail}`)).toEqual([]);
  });

  it("returns nothing when the AT directory does not exist", () => {
    expect(analyzeKrsFences(REPO_ROOT, "docs/no-such-dir")).toEqual([]);
  });
});
