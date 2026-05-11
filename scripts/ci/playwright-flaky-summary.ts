// Surface Playwright retry-pass (flaky) tests in CI.
//
// Closes the TPL-20260510-13 / GT13-2 gap (#1271): Playwright is configured
// with `retries: 1` in CI, so a test that fails on attempt 0 and passes on
// attempt 1 is reported as `flaky` in Playwright's run summary but does not
// fail the job. That is the exact failure mode #976 described — retry-pass
// hides flakes — and there is no per-PR signal today.
//
// This script reads the Playwright JSON report, walks its suite tree, and
// emits two surfaces:
//   - `::warning::` annotation per flaky test (visible inline on the Actions
//     run and in the PR checks UI)
//   - A markdown table appended to `$GITHUB_STEP_SUMMARY` so the count is
//     prominent on the workflow run page
//
// Informative-only by design — exits 0 regardless of flaky count. A future
// follow-up (per #1271 acceptance "optional threshold") can flip this to a
// non-zero exit once the baseline is established.

import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

interface PlaywrightTestResult {
  status: "passed" | "failed" | "timedOut" | "skipped" | "interrupted";
  retry: number;
  duration?: number;
}

interface PlaywrightTest {
  title: string;
  expectedStatus?: string;
  results: PlaywrightTestResult[];
}

interface PlaywrightSpec {
  title: string;
  file?: string;
  line?: number;
  tests: PlaywrightTest[];
}

interface PlaywrightSuite {
  title?: string;
  file?: string;
  suites?: PlaywrightSuite[];
  specs?: PlaywrightSpec[];
}

interface PlaywrightReport {
  suites?: PlaywrightSuite[];
}

export interface FlakyTest {
  file: string;
  title: string;
  line?: number;
  attempts: number;
}

/**
 * A test is flaky when at least one early attempt failed/timed-out but a
 * later attempt passed, and the final outcome is `passed`. This matches the
 * intent of Playwright's `flaky` outcome without depending on a derived
 * field that some JSON-reporter versions omit.
 */
function isFlaky(test: PlaywrightTest): boolean {
  if (test.results.length < 2) return false;
  const last = test.results[test.results.length - 1];
  if (last.status !== "passed") return false;
  return test.results.slice(0, -1).some((r) => r.status === "failed" || r.status === "timedOut");
}

export function collectFlakies(report: PlaywrightReport): FlakyTest[] {
  const out: FlakyTest[] = [];
  const walk = (suite: PlaywrightSuite, ancestors: string[]) => {
    const title = suite.title ?? "";
    const ancestry = title ? [...ancestors, title] : ancestors;
    for (const spec of suite.specs ?? []) {
      const file = spec.file ?? suite.file ?? "<unknown>";
      for (const test of spec.tests) {
        if (!isFlaky(test)) continue;
        const fullTitle = [...ancestry, spec.title, test.title]
          .filter((s) => s && s.length > 0)
          .join(" › ");
        out.push({
          file,
          title: fullTitle,
          line: spec.line,
          attempts: test.results.length,
        });
      }
    }
    for (const child of suite.suites ?? []) walk(child, ancestry);
  };
  for (const top of report.suites ?? []) walk(top, []);
  return out;
}

export function renderSummary(flakies: FlakyTest[]): string {
  if (flakies.length === 0) {
    return "## Playwright flaky-pass summary\n\nNo retry-pass (flaky) tests detected. ✅\n";
  }
  const rows = flakies
    .map((f) => {
      const where = f.line !== undefined ? `${f.file}:${f.line}` : f.file;
      return `| \`${where}\` | ${f.title} | ${f.attempts} |`;
    })
    .join("\n");
  return [
    "## Playwright flaky-pass summary",
    "",
    `⚠ **${flakies.length}** retry-pass (flaky) test${flakies.length === 1 ? "" : "s"} in this run. Each is a TPL-20260510-14 ("wait for stable state") candidate.`,
    "",
    "| Location | Test | Attempts |",
    "|---|---|---|",
    rows,
    "",
  ].join("\n");
}

export function renderAnnotations(flakies: FlakyTest[]): string[] {
  return flakies.map((f) => {
    const fileFlag = f.line !== undefined ? `file=${f.file},line=${f.line}` : `file=${f.file}`;
    const msg = `Flaky (passed on retry, ${f.attempts} attempts): ${f.title}`;
    return `::warning ${fileFlag}::${msg}`;
  });
}

interface MainArgs {
  reportPath: string;
  summaryPath: string | undefined;
  stdout: (line: string) => void;
}

export function runMain(args: MainArgs): number {
  if (!existsSync(args.reportPath)) {
    args.stdout(`playwright-flaky-summary: report not found at ${args.reportPath}; skipping`);
    return 0;
  }
  let report: PlaywrightReport;
  try {
    report = JSON.parse(readFileSync(args.reportPath, "utf8")) as PlaywrightReport;
  } catch (err) {
    args.stdout(`playwright-flaky-summary: failed to parse ${args.reportPath}: ${String(err)}`);
    return 0;
  }
  const flakies = collectFlakies(report);
  const summary = renderSummary(flakies);
  args.stdout(summary);
  for (const ann of renderAnnotations(flakies)) args.stdout(ann);
  if (args.summaryPath) {
    appendFileSync(args.summaryPath, summary);
  }
  return 0;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const reportPath = resolve(
    process.cwd(),
    process.env.PLAYWRIGHT_JSON_REPORT ?? "packages/e2e/playwright-report/results.json",
  );
  const exit = runMain({
    reportPath,
    summaryPath: process.env.GITHUB_STEP_SUMMARY,
    stdout: (line) => process.stdout.write(line + "\n"),
  });
  process.exit(exit);
}
