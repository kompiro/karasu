import { diagnosticIdOf, warningSeverity } from "@karasu-tools/core";
import type { Diagnostic, Warning } from "@karasu-tools/core";
import { diagnosticParts, warningParts, type DiagnosticParts } from "./i18n.js";
import { diagLocator, type DiagLocation } from "./compile-system-view.js";

/** One catalog diagnostic, ready to print as a line or as JSON. */
interface ReportEntry {
  parts: DiagnosticParts;
  id: string;
  code: string;
  severity: "error" | "warning" | "info";
  /** Absent for a `Warning` without a position: the line names no file. */
  location: DiagLocation | undefined;
  params: unknown;
}

/**
 * A compile's diagnostics and warnings in the order `render` and `check` print
 * them: errors, then the parser's warnings and infos, then the resolver's
 * warnings. The text and the JSON read this one list, so they cannot disagree
 * on order or content (#3654).
 */
function collectEntries(
  filePath: string,
  diagnostics: Diagnostic[],
  warnings: Warning[],
  entryLabel: string = filePath,
): ReportEntry[] {
  const locate = diagLocator(filePath, entryLabel);
  const entries: ReportEntry[] = [];

  // Info-severity parser diagnostics (e.g. duplicate-owner-assignment) honour
  // their register with an `Info` prefix — mirroring the info warnings below —
  // instead of being dropped (ADR-1566 / ADR-1386).
  const severityGroups = [
    ["Error", "error"],
    ["Warning", "warning"],
    ["Info", "info"],
  ] as const;
  for (const [word, severity] of severityGroups) {
    for (const d of diagnostics.filter((x) => x.severity === severity)) {
      entries.push({
        parts: diagnosticParts(word, d),
        id: diagnosticIdOf(d.code),
        code: d.code,
        severity,
        location: locate(d),
        params: d.params,
      });
    }
  }
  entries.push(...warningEntries(locate, warnings));
  return entries;
}

function warningEntries(
  locate: (d: { loc?: Diagnostic["loc"] }) => DiagLocation,
  warnings: Warning[],
): ReportEntry[] {
  return warnings.map((w) => {
    // Honour the warning's register: info-severity kinds (e.g.
    // domain-dispersal) print as `Info`, not `Warning` — see ADR-1386.
    const severity = warningSeverity(w.kind);
    return {
      parts: warningParts(severity === "info" ? "Info" : "Warning", w),
      id: diagnosticIdOf(w.kind),
      code: w.kind,
      severity,
      // A warning that carries a position prints it the way the diagnostics
      // do (#2802). The spec's location table names the surface, not the
      // channel, so dropping a `loc` here reported a style sheet's line number
      // to nobody. A warning without one keeps the bare message rather than
      // borrowing the entry's path, which would name a file it did not mean.
      location: w.loc ? locate(w) : undefined,
      params: w.params,
    };
  });
}

function printEntries(entries: ReportEntry[]): void {
  for (const { parts, location } of entries) {
    const where =
      location === undefined
        ? ""
        : location.line === undefined
          ? `${location.file}: `
          : `${location.file}:${location.line}:${location.column}: `;
    process.stderr.write(`${parts.tag}: ${where}${parts.message}\n`);
  }
}

/**
 * Print a compile's diagnostics and warnings to stderr and return how many are
 * error-severity. Shared by `render` and `check` so the two commands report the
 * same findings in the same format and agree on what fails (#2911).
 */
export function reportDiagnostics(
  filePath: string,
  diagnostics: Diagnostic[],
  warnings: Warning[],
): number {
  printEntries(collectEntries(filePath, diagnostics, warnings));
  return diagnostics.filter((d) => d.severity === "error").length;
}

/**
 * Print a compile's warnings to stderr in the format `reportDiagnostics` uses.
 * Exported for `karasu diff`, which keeps its own diagnostic format (it
 * compiles two inputs) but reports the after model's warnings the way
 * `render` does (#2879).
 *
 * `entryLabel` names the entry when it is not a file the user typed (a stdin
 * side of the diff); see `diagLocFormatter`.
 */
export function reportWarnings(
  filePath: string,
  warnings: Warning[],
  entryLabel: string = filePath,
): void {
  printEntries(warningEntries(diagLocator(filePath, entryLabel), warnings));
}

/** The version of {@link diagnosticsJson}'s shape. Bump it when a field is removed or changes meaning. */
const DIAGNOSTICS_JSON_SCHEMA_VERSION = 1;

/**
 * `karasu check --format json`: the same findings as {@link reportDiagnostics},
 * as one JSON document for tools (#3654). `code` and `params` do not depend on
 * the locale; `message` and `details` do. `file` / `line` / `column` appear
 * exactly when the text line shows them.
 */
export function diagnosticsJson(
  filePath: string,
  diagnostics: Diagnostic[],
  warnings: Warning[],
): string {
  const entries = collectEntries(filePath, diagnostics, warnings);
  const report = {
    schemaVersion: DIAGNOSTICS_JSON_SCHEMA_VERSION,
    errorCount: diagnostics.filter((d) => d.severity === "error").length,
    diagnostics: entries.map((e) => ({
      id: e.id,
      code: e.code,
      severity: e.severity,
      ...(e.location && { file: e.location.file }),
      ...(e.location?.line !== undefined && { line: e.location.line, column: e.location.column }),
      params: e.params,
      message: e.parts.message,
      details: e.parts.details,
    })),
  };
  return JSON.stringify(report, null, 2) + "\n";
}
