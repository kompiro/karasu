import { Diagnostic, DiagnosticSeverity } from "vscode-languageserver/node";
import {
  Parser,
  StyleParser,
  formatDiagnostic,
  formatWarning,
  warningSeverity,
  analyze,
  validateStyleValues,
} from "@karasu-tools/core";

/** Core positions are 1-based; LSP positions are 0-based. */
function toLspPosition(line: number, column: number) {
  // Clamp to 0 to guard against synthetic EOF tokens (line: 0, column: 0).
  return {
    line: Math.max(0, line - 1),
    character: Math.max(0, column - 1),
  };
}

const DOC_START = { line: 0, character: 0 };

/**
 * Parse + (for style docs) value validation + (for `.krs` docs) resolver
 * warnings, mapped to LSP `Diagnostic[]`.
 *
 * Kept as a pure function — no `connection` dependency — so `validateDocument`
 * stays a thin wrapper and tests can assert the mapping directly.
 */
export function computeDiagnostics(text: string, isStyleDocument: boolean): Diagnostic[] {
  const parseResult = isStyleDocument ? StyleParser.parse(text) : Parser.parse(text);

  // Style documents go through an extra value-level validation pass. The
  // validator returns parser-shaped diagnostics with `loc` already filled in
  // so they merge cleanly with parse diagnostics.
  const parserDiagnostics =
    isStyleDocument && "rules" in parseResult.value
      ? [...parseResult.diagnostics, ...validateStyleValues(parseResult.value)]
      : parseResult.diagnostics;

  const diagnostics: Diagnostic[] = parserDiagnostics.map((d) => ({
    severity:
      d.severity === "error"
        ? DiagnosticSeverity.Error
        : d.severity === "info"
          ? DiagnosticSeverity.Information
          : DiagnosticSeverity.Warning,
    range: {
      start: d.loc ? toLspPosition(d.loc.start.line, d.loc.start.column) : DOC_START,
      end: d.loc ? toLspPosition(d.loc.end.line, d.loc.end.column) : DOC_START,
    },
    message: formatDiagnostic(d),
    source: "karasu",
  }));

  // Resolver-level warnings (domain-dispersal, unassigned-*, cyclic-dependency,
  // …) are produced by `analyze()`, not by the parser. Surface them too so the
  // editor matches the in-app preview (ADR-20260514-02 — the info register is
  // intended for App / LSP / CLI alike). `analyze()` needs a `KrsFile`, so this
  // applies to `.krs` documents only. Style sheets are not available in the
  // single-document LSP context: style-dependent warnings (`style-conflict`,
  // `legend-ref-unresolved`) simply do not fire here.
  if (!isStyleDocument && !("rules" in parseResult.value)) {
    for (const w of analyze(parseResult.value, [])) {
      diagnostics.push({
        severity:
          warningSeverity(w.kind) === "info"
            ? DiagnosticSeverity.Information
            : DiagnosticSeverity.Warning,
        range: {
          start: w.loc ? toLspPosition(w.loc.start.line, w.loc.start.column) : DOC_START,
          end: w.loc ? toLspPosition(w.loc.end.line, w.loc.end.column) : DOC_START,
        },
        message: formatWarning(w).message,
        source: "karasu",
      });
    }
  }

  return diagnostics;
}
