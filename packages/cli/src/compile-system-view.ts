import { resolve } from "node:path";
import { compileProject, type Diagnostic, type SystemCompileResult } from "@karasu-tools/core";
import { formatDiagnostic } from "./i18n.js";
import { NodeFileSystemProvider } from "./node-fs.js";

/**
 * Format a diagnostic's source location for CLI stderr output:
 * `<filePath>:<line>:<column>` (1-based) when the diagnostic carries a
 * `loc`, otherwise just `filePath`. Shared by every command that prints
 * `Diagnostic[]` to stderr (matrix / coverage / subtree via
 * {@link compileSystemViewOrExit}, and render directly).
 */
export function formatDiagLoc(filePath: string, d: Diagnostic): string {
  return d.loc ? `${filePath}:${d.loc.start.line + 1}:${d.loc.start.column + 1}` : filePath;
}

/**
 * Resolve `filePath` to an absolute path and verify it exists, exiting with
 * the shared `Error: File not found: <file>` message otherwise. Returns
 * `undefined` (after writing stderr and calling `process.exit(1)`) so
 * callers can `return` immediately — mirroring real process termination
 * even when `process.exit` is mocked (e.g. in tests).
 *
 * Shared first step of matrix / coverage / subtree's "compile system view
 * or exit" prologue — split out from {@link compileSystemViewOrExit}
 * because matrix and coverage run their own `--format`/`--infra`/
 * `--threshold` validation *between* the exists check and the compile
 * step, and that relative ordering must stay byte-identical.
 */
export async function resolveKrsFileOrExit(
  filePath: string,
): Promise<{ absolutePath: string; fs: NodeFileSystemProvider } | undefined> {
  const absolutePath = resolve(filePath);
  const fs = new NodeFileSystemProvider();

  if (!(await fs.exists(absolutePath))) {
    process.stderr.write(`Error: File not found: ${filePath}\n`);
    process.exit(1);
    return undefined;
  }

  return { absolutePath, fs };
}

/**
 * Compile `absolutePath` as a system view or exit(1): guards that the
 * project is actually a system view (`Error: <commandName> requires a
 * system view`), then prints every error-severity diagnostic
 * (`Error: <loc>: <message>`) and exits if there were any. Returns
 * `undefined` in either exit case so callers can `return` immediately —
 * see {@link resolveKrsFileOrExit} for why. Second half of the shared
 * "compile system view or exit" prologue used by matrix / coverage /
 * subtree.
 */
export async function compileSystemViewOrExit(
  fs: NodeFileSystemProvider,
  absolutePath: string,
  filePath: string,
  commandName: string,
): Promise<SystemCompileResult | undefined> {
  const result = await compileProject(absolutePath, fs, { diagramType: "system" });
  if (result.diagramType !== "system") {
    process.stderr.write(`Error: ${commandName} requires a system view\n`);
    process.exit(1);
    return undefined;
  }

  const errors = result.diagnostics.filter((d) => d.severity === "error");
  for (const d of errors) {
    process.stderr.write(`Error: ${formatDiagLoc(filePath, d)}: ${formatDiagnostic(d)}\n`);
  }
  if (errors.length > 0) {
    process.exit(1);
    return undefined;
  }

  return result;
}
