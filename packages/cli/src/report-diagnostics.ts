import { warningSeverity } from "@karasu-tools/core";
import type { Diagnostic, Warning } from "@karasu-tools/core";
import { formatDiagnostic, formatWarning } from "./i18n.js";
import { diagLocFormatter } from "./compile-system-view.js";

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
  const errors = diagnostics.filter((d) => d.severity === "error");
  const diagWarnings = diagnostics.filter((d) => d.severity === "warning");
  const diagInfos = diagnostics.filter((d) => d.severity === "info");

  const locOf = diagLocFormatter(filePath);
  function printDiagnostics(prefix: string, list: Diagnostic[]): void {
    for (const d of list) {
      process.stderr.write(`${prefix}: ${locOf(d)}: ${formatDiagnostic(d)}\n`);
    }
  }

  const severityGroups: [string, Diagnostic[]][] = [
    ["Error", errors],
    ["Warning", diagWarnings],
    // Info-severity parser diagnostics (e.g. duplicate-owner-assignment) honour
    // their register with an `Info:` prefix — mirroring the info-warning loop
    // below — instead of being dropped (ADR-1566 / ADR-1386).
    ["Info", diagInfos],
  ];
  for (const [prefix, list] of severityGroups) {
    printDiagnostics(prefix, list);
  }
  for (const w of warnings) {
    // Honour the warning's register: info-severity kinds (e.g.
    // domain-dispersal) print as `Info:`, not `Warning:` — see
    // ADR-1386.
    const prefix = warningSeverity(w.kind) === "info" ? "Info" : "Warning";
    // A warning that carries a position prints it the way the diagnostics
    // above do (#2802). The spec's location table names the surface, not the
    // channel, so dropping a `loc` here reported a style sheet's line number
    // to nobody. A warning without one keeps the bare message rather than
    // borrowing the entry's path, which would name a file it did not mean.
    const where = w.loc ? `${locOf(w)}: ` : "";
    process.stderr.write(`${prefix}: ${where}${formatWarning(w).message}\n`);
  }

  return errors.length;
}
