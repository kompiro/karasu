import { Diagnostic, DiagnosticSeverity } from "vscode-languageserver/node";
import {
  Parser,
  StyleParser,
  warningSeverity,
  analyze,
  validateStyleValues,
  type DiagnosticSeverity as CoreSeverity,
} from "@karasu-tools/core";
import { renderDiagnostic, renderWarning, bindTranslate, type Locale } from "@karasu-tools/i18n";
import { toLspRange, type LspRange, type SourceRangeLike } from "./lsp-position.js";
import { SINGLE_DOCUMENT_CONTEXT } from "./single-document-context.js";

const DOC_START = { line: 0, character: 0 };

/** Map a core severity to the LSP `DiagnosticSeverity` enum. */
function toSeverity(sev: CoreSeverity): DiagnosticSeverity {
  return sev === "error"
    ? DiagnosticSeverity.Error
    : sev === "info"
      ? DiagnosticSeverity.Information
      : DiagnosticSeverity.Warning;
}

/** Convert an optional core source range to an LSP range, anchoring loc-less
 * diagnostics at the start of the document. */
function locToRange(loc: SourceRangeLike | undefined): LspRange {
  return loc ? toLspRange(loc) : { start: DOC_START, end: DOC_START };
}

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
  const t = bindTranslate(locale);

  const parseResult = isStyleDocument ? StyleParser.parse(text) : Parser.parse(text);

  // Style documents go through an extra value-level validation pass. The
  // validator returns parser-shaped diagnostics with `loc` already filled in
  // so they merge cleanly with parse diagnostics.
  const parserDiagnostics =
    isStyleDocument && "rules" in parseResult.value
      ? [...parseResult.diagnostics, ...validateStyleValues(parseResult.value)]
      : parseResult.diagnostics;

  const diagnostics: Diagnostic[] = parserDiagnostics.map((d) => ({
    severity: toSeverity(d.severity),
    range: locToRange(d.loc),
    message: renderDiagnostic(d, t),
    source: "karasu",
  }));

  // Resolver-level warnings (domain-dispersal, unassigned-*, cyclic-dependency,
  // …) are produced by `analyze()`, not by the parser. Surface them too so the
  // editor matches the in-app preview (ADR-1386 — the info register is
  // intended for App / LSP / CLI alike). `analyze()` needs a `KrsFile`, so this
  // applies to `.krs` documents only, and runs with no stylesheet and no
  // imports. What that does to each kind, and which kinds are dropped here, is
  // recorded per kind in `SINGLE_DOCUMENT_CONTEXT` (TPL-1522).
  if (!isStyleDocument && !("rules" in parseResult.value)) {
    for (const w of analyze(parseResult.value, [])) {
      if (SINGLE_DOCUMENT_CONTEXT[w.kind].singleDocument === "suppressed") continue;
      diagnostics.push({
        severity: toSeverity(warningSeverity(w.kind)),
        range: locToRange(w.loc),
        message: renderWarning(w, t).message,
        source: "karasu",
      });
    }
  }

  return diagnostics;
}
