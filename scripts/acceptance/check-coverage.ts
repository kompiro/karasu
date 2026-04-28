/* eslint-disable no-console -- CLI entry point; stdout/stderr reporting is the whole job */
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { analyzeRepo, summarize, type Finding, type RepoReport } from "./coverage.ts";

interface CliOptions {
  strict: boolean;
  json: boolean;
  repoRoot: string;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    strict: false,
    json: false,
    repoRoot: process.cwd(),
  };
  for (const arg of argv.slice(2)) {
    if (arg === "--strict") opts.strict = true;
    else if (arg === "--json") opts.json = true;
    else if (arg.startsWith("--root=")) opts.repoRoot = resolve(arg.slice("--root=".length));
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return opts;
}

function describeFinding(f: Finding): string {
  switch (f.kind) {
    case "verified-by-metadata":
      return `${f.file}:${f.line} — "Verified by" metadata: ${f.snippet}`;
    case "section-grouping":
      return `${f.file}:${f.line} — section grouping: "${f.heading}"`;
    case "checked-without-blockquote":
      return `${f.file}:${f.line} — [x] without canonical blockquote: ${f.bullet}`;
    case "missing-marker-with-spec":
      return `${f.file} — no automation marker, but spec(s) exist: ${f.specPaths.join(", ")}`;
  }
}

function reportText(report: RepoReport): string {
  const lines: string[] = [];
  const summary = summarize(report);

  lines.push(`Scanned ${summary.scanned} AT file(s).`);
  lines.push(
    `  ✓ ${summary.withCanonical} with canonical marker, ${summary.nonConforming} non-conforming, ${summary.missingMarkerWithSpec} missing marker despite a matching spec.`,
  );

  const nonConforming = report.reports.flatMap((r) => r.findings);
  if (nonConforming.length > 0) {
    lines.push("");
    lines.push("Non-conforming markers:");
    for (const f of nonConforming) lines.push(`  ⚠ ${describeFinding(f)}`);
  }

  if (report.crossRefFindings.length > 0) {
    lines.push("");
    lines.push(
      "Missing markers despite a matching spec (cross-ref is heuristic — verify each manually):",
    );
    for (const f of report.crossRefFindings) lines.push(`  ⚠ ${describeFinding(f)}`);
  }

  if (summary.totalFindings === 0) {
    lines.push("");
    lines.push("All AT files conform to the canonical marker convention.");
  }

  return lines.join("\n");
}

function main(argv: string[]): number {
  const opts = parseArgs(argv);
  const report = analyzeRepo({ repoRoot: opts.repoRoot });
  const summary = summarize(report);

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          summary,
          nonConforming: report.reports.flatMap((r) => r.findings),
          missingMarkerWithSpec: report.crossRefFindings,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(reportText(report));
  }

  return opts.strict && summary.totalFindings > 0 ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit(main(process.argv));
}

export { main, parseArgs, reportText };
