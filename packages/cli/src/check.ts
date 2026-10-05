import { buildAllViewsSvgProject } from "@karasu-tools/core";
import { resolveKrsFileOrExit } from "./compile-system-view.js";
import { reportDiagnostics } from "./report-diagnostics.js";

/**
 * `karasu check <file>` — validate a `.krs` project and write nothing (#2911).
 *
 * Runs the same compile as a default `karasu render` (every view, imports
 * resolved) and discards the output. Some error-severity diagnostics are only
 * produced while a view is compiled (edge id uniqueness, layout-time checks),
 * so a parse-only pass would pass files `render` rejects; sharing the pipeline
 * is what makes "`check` passes" mean "`render` succeeds".
 *
 * Exit status: 1 when any error-severity diagnostic exists, 0 otherwise.
 * Warnings and infos are printed but never change the exit status.
 */
export async function check(filePath: string): Promise<void> {
  const resolved = await resolveKrsFileOrExit(filePath);
  if (!resolved) return;
  const { absolutePath, fs } = resolved;

  const result = await buildAllViewsSvgProject(absolutePath, fs);
  if (reportDiagnostics(filePath, result.diagnostics, result.warnings) > 0) {
    process.exit(1);
  }
}
