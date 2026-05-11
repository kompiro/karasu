import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  collectFlakies,
  renderAnnotations,
  renderSummary,
  runMain,
  type FlakyTest,
} from "./playwright-flaky-summary.ts";

interface FakeSuite {
  title?: string;
  suites?: FakeSuite[];
  specs?: unknown[];
}

function makeReport(
  specs: Array<{
    file: string;
    line?: number;
    specTitle: string;
    suiteTitles?: string[];
    testTitle: string;
    results: Array<"passed" | "failed" | "timedOut" | "skipped">;
  }>,
): { suites: FakeSuite[] } {
  const root: FakeSuite[] = [{ specs: [] }];
  for (const s of specs) {
    let target: FakeSuite = root[0];
    for (const t of s.suiteTitles ?? []) {
      const arr = (target.suites ??= []);
      let next = arr.find((x) => x.title === t);
      if (!next) {
        next = { title: t, specs: [] };
        arr.push(next);
      }
      target = next;
    }
    const specsArr = (target.specs ??= []);
    specsArr.push({
      title: s.specTitle,
      file: s.file,
      line: s.line,
      tests: [
        {
          title: s.testTitle,
          results: s.results.map((status, i) => ({ status, retry: i })),
        },
      ],
    });
  }
  return { suites: root };
}

describe("collectFlakies", () => {
  it("returns empty when nothing failed even once", () => {
    const report = makeReport([
      {
        file: "tests/a.spec.ts",
        specTitle: "a",
        testTitle: "passes",
        results: ["passed"],
      },
    ]);
    expect(collectFlakies(report as unknown as Parameters<typeof collectFlakies>[0])).toEqual([]);
  });

  it("returns empty for tests that failed on every attempt (those are real failures, surfaced separately)", () => {
    const report = makeReport([
      {
        file: "tests/a.spec.ts",
        specTitle: "a",
        testTitle: "still failing",
        results: ["failed", "failed"],
      },
    ]);
    expect(collectFlakies(report as unknown as Parameters<typeof collectFlakies>[0])).toEqual([]);
  });

  it("flags a test that failed then passed on retry", () => {
    const report = makeReport([
      {
        file: "tests/flaky.spec.ts",
        line: 42,
        specTitle: "spec",
        suiteTitles: ["chromium", "outer"],
        testTitle: "retry-pass case",
        results: ["failed", "passed"],
      },
    ]);
    expect(collectFlakies(report as unknown as Parameters<typeof collectFlakies>[0])).toEqual<
      FlakyTest[]
    >([
      {
        file: "tests/flaky.spec.ts",
        line: 42,
        title: "chromium › outer › spec › retry-pass case",
        attempts: 2,
      },
    ]);
  });

  it("flags timedOut → passed as flaky", () => {
    const report = makeReport([
      {
        file: "tests/timeout.spec.ts",
        specTitle: "s",
        testTitle: "timed out then passed",
        results: ["timedOut", "passed"],
      },
    ]);
    expect(
      collectFlakies(report as unknown as Parameters<typeof collectFlakies>[0]).map((f) => f.title),
    ).toEqual(["s › timed out then passed"]);
  });

  it("ignores skipped tests", () => {
    const report = makeReport([
      {
        file: "tests/skip.spec.ts",
        specTitle: "s",
        testTitle: "skipped",
        results: ["skipped"],
      },
    ]);
    expect(collectFlakies(report as unknown as Parameters<typeof collectFlakies>[0])).toEqual([]);
  });

  it("handles missing suites array gracefully", () => {
    expect(collectFlakies({})).toEqual([]);
  });
});

describe("renderSummary", () => {
  it("returns the success message when no flakies", () => {
    const out = renderSummary([]);
    expect(out).toContain("No retry-pass");
    expect(out).toContain("✅");
  });

  it("renders a markdown table when flakies exist", () => {
    const out = renderSummary([
      { file: "tests/a.spec.ts", line: 10, title: "outer › passes on retry", attempts: 2 },
      { file: "tests/b.spec.ts", title: "noisy", attempts: 2 },
    ]);
    expect(out).toContain("**2**");
    expect(out).toContain("tests/a.spec.ts:10");
    expect(out).toContain("passes on retry");
    expect(out).toContain("tests/b.spec.ts");
    expect(out).toContain("TPL-20260510-14");
  });

  it("uses the singular form when exactly one flaky test", () => {
    const out = renderSummary([{ file: "tests/a.spec.ts", title: "only one", attempts: 2 }]);
    expect(out).toContain("**1** retry-pass (flaky) test in this run");
  });
});

describe("renderAnnotations", () => {
  it("emits a ::warning:: per flaky with file/line when available", () => {
    const annotations = renderAnnotations([
      { file: "tests/a.spec.ts", line: 7, title: "x", attempts: 2 },
      { file: "tests/b.spec.ts", title: "y", attempts: 3 },
    ]);
    expect(annotations[0]).toBe(
      "::warning file=tests/a.spec.ts,line=7::Flaky (passed on retry, 2 attempts): x",
    );
    expect(annotations[1]).toBe(
      "::warning file=tests/b.spec.ts::Flaky (passed on retry, 3 attempts): y",
    );
  });
});

describe("runMain", () => {
  it("skips with a message when the report is missing", () => {
    const lines: string[] = [];
    const code = runMain({
      reportPath: "/nonexistent/results.json",
      summaryPath: undefined,
      stdout: (l) => lines.push(l),
    });
    expect(code).toBe(0);
    expect(lines.join("\n")).toContain("report not found");
  });

  it("writes the summary to GITHUB_STEP_SUMMARY when set", () => {
    const dir = mkdtempSync(join(tmpdir(), "flaky-summary-"));
    const reportPath = join(dir, "results.json");
    const summaryPath = join(dir, "step-summary.md");
    const report = makeReport([
      {
        file: "tests/flaky.spec.ts",
        line: 1,
        specTitle: "spec",
        testTitle: "flaky one",
        results: ["failed", "passed"],
      },
    ]);
    writeFileSync(reportPath, JSON.stringify(report));
    writeFileSync(summaryPath, ""); // pre-create — runMain appends
    const lines: string[] = [];
    const code = runMain({ reportPath, summaryPath, stdout: (l) => lines.push(l) });
    expect(code).toBe(0);
    const written = readFileSync(summaryPath, "utf8");
    expect(written).toContain("flaky one");
    // Annotation is on stdout, not in the summary file.
    expect(lines.some((l) => l.startsWith("::warning"))).toBe(true);
  });

  it("returns 0 even when many flakies are present (informative-only)", () => {
    const dir = mkdtempSync(join(tmpdir(), "flaky-summary-"));
    const reportPath = join(dir, "results.json");
    const report = makeReport([
      {
        file: "tests/a.spec.ts",
        specTitle: "a",
        testTitle: "1",
        results: ["failed", "passed"],
      },
      {
        file: "tests/b.spec.ts",
        specTitle: "b",
        testTitle: "2",
        results: ["timedOut", "passed"],
      },
    ]);
    writeFileSync(reportPath, JSON.stringify(report));
    const code = runMain({
      reportPath,
      summaryPath: undefined,
      stdout: () => {},
    });
    expect(code).toBe(0);
  });

  it("handles a malformed JSON report without crashing", () => {
    const dir = mkdtempSync(join(tmpdir(), "flaky-summary-"));
    const reportPath = join(dir, "results.json");
    writeFileSync(reportPath, "{ not valid json");
    const lines: string[] = [];
    const code = runMain({ reportPath, summaryPath: undefined, stdout: (l) => lines.push(l) });
    expect(code).toBe(0);
    expect(lines.join("\n")).toContain("failed to parse");
  });
});
