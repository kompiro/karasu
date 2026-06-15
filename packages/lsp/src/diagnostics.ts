import { Diagnostic, DiagnosticSeverity } from "vscode-languageserver/node";
import {
  Parser,
  StyleParser,
  warningSeverity,
  analyze,
  validateStyleValues,
} from "@karasu-tools/core";
import {
  renderDiagnostic,
  renderWarning,
  translate,
  type Locale,
  type TranslateFn,
} from "@karasu-tools/i18n";

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
 *
 * `locale` controls the language of diagnostic / warning messages; the
 * server resolves it once from the `initialize` request. It defaults to
 * English so non-LSP callers and tests need not pass it.
 */
export function computeDiagnostics(
  text: string,
  isStyleDocument: boolean,
  locale: Locale = "en",
): Diagnostic[] {
  // Bind the locale-aware translator once per pass. `renderDiagnostic` /
  // `renderWarning` are pure formatters shared with the app and CLI.
  const t = ((key: Parameters<TranslateFn>[0], params?: unknown) =>
    translate(locale, key, params)) as TranslateFn;

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
    message: renderDiagnostic(d, t),
    source: "karasu",
  }));

  // Resolver-level warnings (domain-dispersal, unassigned-*, cyclic-dependency,
  // …) are produced by `analyze()`, not by the parser. Surface them too so the
  // editor matches the in-app preview (ADR-20260514-02 — the info register is
  // intended for App / LSP / CLI alike). `analyze()` needs a `KrsFile`, so this
  // applies to `.krs` documents only. Style sheets are not available in the
  // single-document LSP context, which cuts both ways: style-dependent
  // warnings (`style-conflict`, `legend-ref-unresolved`) simply do not fire
  // here, and style-*suppressed* hints fire without their suppression —
  // `annotation-possible-typo` still flags a near-builtin name even when the
  // user defined a stylesheet annotation selector for it (the app, which has
  // the sheets, stays silent). Accepted asymmetry: the hint is info-register
  // and the intentional-name case is rare (#1522). New style-coupled
  // diagnostics must decide and record their side of this split here
  // (TPL-20260612-01).
  if (!isStyleDocument && !("rules" in parseResult.value)) {
    for (const w of analyze(parseResult.value, [])) {
      // `unresolved-edge-endpoint` is import-coupled, not style-coupled: it only
      // means "this id exists nowhere in the *merged* model" (§S6). The LSP
      // analyzes a single document with imports unresolved, so a routine
      // cross-file edge (the canonical system-reopen pattern) would false-positive
      // here. Suppress it in the single-document context; the App / CLI run
      // `analyze()` over the import-merged file where it is accurate
      // (TPL-20260612-01 — new import/style-coupled diagnostics record their side).
      if (w.kind === "unresolved-edge-endpoint") continue;
      // `shared-infra-fan-in` is *not* suppressed (TPL-20260612-01 — recording
      // its side): it benefits from the import-merge (cross-file sharing is only
      // seen in the App / CLI), but in the single-document context it can only
      // *under-report* — it fires only when both the store and ≥2 referencing
      // services are present in this one document, so it never false-positives.
      // Same property as `domain-dispersal`, which is likewise left to fire.
      diagnostics.push({
        severity:
          warningSeverity(w.kind) === "info"
            ? DiagnosticSeverity.Information
            : DiagnosticSeverity.Warning,
        range: {
          start: w.loc ? toLspPosition(w.loc.start.line, w.loc.start.column) : DOC_START,
          end: w.loc ? toLspPosition(w.loc.end.line, w.loc.end.column) : DOC_START,
        },
        message: renderWarning(w, t).message,
        source: "karasu",
      });
    }
  }

  return diagnostics;
}
