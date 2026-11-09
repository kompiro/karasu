import { buildAllViewsSvgProject } from "@karasu-tools/core";
import { resolveKrsFileOrExit } from "./compile-system-view.js";
import { diagnosticsJson, reportDiagnostics } from "./report-diagnostics.js";

export interface CheckOptions {
  format?: string;
}

/**
 * `karasu check <file>` — validate a `.krs` project and write nothing (#2911).
 *
 * Runs the same compile as a default `karasu render` (every view, imports
 * resolved) and discards the output. Some error-severity diagnostics are only
 * produced while a view is compiled (edge id uniqueness, layout-time checks),
 * so a parse-only pass would pass files `render` rejects; sharing the pipeline
 * is what makes "`check` passes" mean "`render` succeeds".
 *
 * `--format json` prints the findings as one JSON document on stdout instead of
 * lines on stderr (#3654). A failure outside the catalog (no such file) prints
 * no JSON, so a consumer that cannot parse stdout knows the check did not run.
 *
 * Exit status: 1 when any error-severity diagnostic exists, 0 otherwise.
 * Warnings and infos are printed but never change the exit status.
 */
export async function check(filePath: string, options: CheckOptions = {}): Promise<void> {
  const format = options.format ?? "text";
  if (format !== "text" && format !== "json") {
    process.stderr.write(`Error: unknown --format "${format}" (expected text | json)\n`);
    process.exit(1);
    return;
  }

  const resolved = await resolveKrsFileOrExit(filePath);
  if (!resolved) return;
  const { absolutePath, displayPath, fs } = resolved;

  const result = await buildAllViewsSvgProject(absolutePath, fs);
  if (format === "json") {
    process.stdout.write(diagnosticsJson(displayPath, result.diagnostics, result.warnings));
    // exitCode rather than exit(): stdout may be a pipe still draining.
    if (result.diagnostics.some((d) => d.severity === "error")) process.exitCode = 1;
    return;
  }
  if (reportDiagnostics(displayPath, result.diagnostics, result.warnings) > 0) {
    process.exit(1);
  }
}
