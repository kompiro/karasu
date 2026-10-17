// Surface Playwright retry-pass (flaky) tests in CI.
//
// Closes the TPL-976 / GT13-2 gap (#1271): Playwright is configured
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
//
// The same report also carries per-test durations, so the step summary gets a
// second table: run wall time, p95 per test, the slowest spec files, and any
// OPFS-handle errors (`createWritable` / `AbortError`). That is what the
// `workers` measurement of #3041 reads, and it stays in place so a later change
// to the suite or its parallelism is read the same way, without a second
// parser of `results.json`.

import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

interface PlaywrightError {
  message?: string;
  stack?: string;
}

// A captured stdout/stderr chunk: `text` for a string, base64 `buffer` for a Buffer.
interface PlaywrightStdio {
  text?: string;
  buffer?: string;
}

interface PlaywrightTestResult {
  status: "passed" | "failed" | "timedOut" | "skipped" | "interrupted";
  retry: number;
  duration?: number;
  startTime?: string;
  errors?: PlaywrightError[];
  stdout?: PlaywrightStdio[];
  stderr?: PlaywrightStdio[];
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
  config?: { workers?: number };
  stats?: { startTime?: string; duration?: number };
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

type Visit = (spec: PlaywrightSpec, file: string, fullTitle: string) => void;

function walkSpecs(report: PlaywrightReport, visit: Visit): void {
  const walk = (suite: PlaywrightSuite, ancestors: string[]) => {
    const title = suite.title ?? "";
    const ancestry = title ? [...ancestors, title] : ancestors;
    for (const spec of suite.specs ?? []) {
      const file = spec.file ?? suite.file ?? "<unknown>";
      for (const test of spec.tests) {
        const fullTitle = [...ancestry, spec.title, test.title]
          .filter((s) => s && s.length > 0)
          .join(" › ");
        visit({ ...spec, tests: [test] }, file, fullTitle);
      }
    }
    for (const child of suite.suites ?? []) walk(child, ancestry);
  };
  for (const top of report.suites ?? []) walk(top, []);
}

export function collectFlakies(report: PlaywrightReport): FlakyTest[] {
  const out: FlakyTest[] = [];
  walkSpecs(report, (spec, file, title) => {
    const test = spec.tests[0];
    if (!isFlaky(test)) return;
    out.push({ file, title, line: spec.line, attempts: test.results.length });
  });
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
    `⚠ **${flakies.length}** retry-pass (flaky) test${flakies.length === 1 ? "" : "s"} in this run. Each is a TPL-1171 ("wait for stable state") candidate.`,
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

// --- Timings (#3041) --------------------------------------------------------

export interface TestTiming {
  file: string;
  title: string;
  line?: number;
  durationMs: number;
  /** Epoch ms; absent when the reporter omitted `startTime`. */
  startMs?: number;
}

export interface SpecTiming {
  file: string;
  tests: number;
  /** Sum of the file's test durations: its cost whatever the worker count. */
  totalMs: number;
  /** First start to last end. Shorter than `totalMs` when its tests ran on several workers. */
  wallMs?: number;
}

export interface OpfsError {
  file: string;
  title: string;
  line?: number;
  excerpt: string;
}

export interface TimingSummary {
  workers?: number;
  runWallMs?: number;
  tests: number;
  p95Ms: number;
  slowestTest?: TestTiming;
  specs: SpecTiming[];
  opfsErrors: OpfsError[];
}

// The OPFS-handle failure that made at-0050 `serial` (see its header). Matched
// in error messages and captured stdout/stderr, so a test that logged it and
// still passed is counted too.
const OPFS_ERROR_PATTERN = /createWritable|AbortError/;

const stdioText = (chunk: PlaywrightStdio): string =>
  chunk.text ??
  (chunk.buffer !== undefined ? Buffer.from(chunk.buffer, "base64").toString("utf8") : "");

/** Nearest-rank percentile of an ascending array; 0 for an empty one. */
export function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const rank = Math.ceil((p / 100) * sortedAsc.length);
  return sortedAsc[Math.min(sortedAsc.length, Math.max(1, rank)) - 1];
}

export function collectTimings(report: PlaywrightReport): {
  tests: TestTiming[];
  opfsErrors: OpfsError[];
} {
  const tests: TestTiming[] = [];
  const opfsErrors: OpfsError[] = [];
  walkSpecs(report, (spec, file, title) => {
    for (const result of spec.tests[0].results) {
      if (result.status !== "skipped" && result.duration !== undefined) {
        const startMs = result.startTime ? Date.parse(result.startTime) : Number.NaN;
        tests.push({
          file,
          title,
          line: spec.line,
          durationMs: result.duration,
          startMs: Number.isNaN(startMs) ? undefined : startMs,
        });
      }
      const texts = [
        ...(result.errors ?? []).flatMap((e) => [e.message ?? "", e.stack ?? ""]),
        ...(result.stdout ?? []).map(stdioText),
        ...(result.stderr ?? []).map(stdioText),
      ];
      const hit = texts.flatMap((t) => t.split("\n")).find((l) => OPFS_ERROR_PATTERN.test(l));
      if (hit !== undefined) {
        opfsErrors.push({ file, title, line: spec.line, excerpt: hit.trim().slice(0, 200) });
      }
    }
  });
  return { tests, opfsErrors };
}

export function summarizeTimings(report: PlaywrightReport): TimingSummary {
  const { tests, opfsErrors } = collectTimings(report);
  const byFile = new Map<string, TestTiming[]>();
  for (const t of tests) {
    const list = byFile.get(t.file) ?? [];
    list.push(t);
    byFile.set(t.file, list);
  }
  const specs: SpecTiming[] = [...byFile].map(([file, list]) => {
    const totalMs = list.reduce((sum, t) => sum + t.durationMs, 0);
    const timed = list.filter((t) => t.startMs !== undefined);
    const wallMs =
      timed.length === list.length
        ? Math.max(...timed.map((t) => t.startMs! + t.durationMs)) -
          Math.min(...timed.map((t) => t.startMs!))
        : undefined;
    return { file, tests: list.length, totalMs, wallMs };
  });
  specs.sort((a, b) => b.totalMs - a.totalMs || a.file.localeCompare(b.file));
  const durations = tests.map((t) => t.durationMs).sort((a, b) => a - b);
  const slowestTest = tests.reduce<TestTiming | undefined>(
    (max, t) => (max === undefined || t.durationMs > max.durationMs ? t : max),
    undefined,
  );
  return {
    workers: report.config?.workers,
    runWallMs: report.stats?.duration,
    tests: tests.length,
    p95Ms: percentile(durations, 95),
    slowestTest,
    specs,
    opfsErrors,
  };
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

export function renderTimingSummary(summary: TimingSummary, topN = 10): string {
  const lines = [
    "## Playwright timings",
    "",
    `- Workers: ${summary.workers ?? "unknown"}`,
    `- Run wall time: ${summary.runWallMs !== undefined ? seconds(summary.runWallMs) : "unknown"}`,
    `- Tests timed: ${summary.tests}`,
    `- p95 per test: ${seconds(summary.p95Ms)}`,
  ];
  if (summary.slowestTest) {
    const t = summary.slowestTest;
    const where = t.line !== undefined ? `${t.file}:${t.line}` : t.file;
    lines.push(`- Slowest test: ${seconds(t.durationMs)} \`${where}\` ${t.title}`);
  }
  lines.push(
    `- OPFS-handle errors (\`createWritable\` / \`AbortError\`): ${summary.opfsErrors.length}`,
    "",
  );
  if (summary.specs.length > 0) {
    lines.push(
      `### Slowest spec files (top ${Math.min(topN, summary.specs.length)} of ${summary.specs.length})`,
      "",
      "Σ is the sum of the file's test durations; wall is first start to last end.",
      "",
      "| Spec | Tests | Σ | Wall |",
      "|---|---:|---:|---:|",
      ...summary.specs
        .slice(0, topN)
        .map(
          (s) =>
            `| \`${s.file}\` | ${s.tests} | ${seconds(s.totalMs)} | ${s.wallMs !== undefined ? seconds(s.wallMs) : "—"} |`,
        ),
      "",
    );
  }
  if (summary.opfsErrors.length > 0) {
    lines.push(
      "### OPFS-handle errors",
      "",
      "| Location | Test | Excerpt |",
      "|---|---|---|",
      ...summary.opfsErrors.map((e) => {
        const where = e.line !== undefined ? `${e.file}:${e.line}` : e.file;
        return `| \`${where}\` | ${e.title} | ${e.excerpt.replaceAll("|", "\\|")} |`;
      }),
      "",
    );
  }
  return lines.join("\n");
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
  const summary = renderSummary(flakies) + "\n" + renderTimingSummary(summarizeTimings(report));
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
