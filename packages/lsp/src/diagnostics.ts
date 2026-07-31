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
  // applies to `.krs` documents only. Style sheets are not available in the
  // single-document LSP context, which cuts both ways: style-dependent
  // warnings (`style-conflict`, `legend-ref-unresolved`) simply do not fire
  // here, and style-*suppressed* hints fire without their suppression —
  // `annotation-possible-typo` still flags a near-builtin name even when the
  // user defined a stylesheet annotation selector for it (the app, which has
  // the sheets, stays silent). Accepted asymmetry: the hint is info-register
  // and the intentional-name case is rare (#1522). New style-coupled
  // diagnostics must decide and record their side of this split here
  // (TPL-1522).
  if (!isStyleDocument && !("rules" in parseResult.value)) {
    for (const w of analyze(parseResult.value, [])) {
      // `unresolved-edge-endpoint` is import-coupled, not style-coupled: it only
      // means "this id exists nowhere in the *merged* model" (§S6). The LSP
      // analyzes a single document with imports unresolved, so a routine
      // cross-file edge (the canonical system-reopen pattern) would false-positive
      // here. Suppress it in the single-document context; the App / CLI run
      // `analyze()` over the import-merged file where it is accurate
      // (TPL-1522 — new import/style-coupled diagnostics record their side).
      if (w.kind === "unresolved-edge-endpoint") continue;
      // `edge-endpoint-not-at-scope` is import-coupled too, but is *not*
      // suppressed (TPL-1522 — recording its side, #2075). It fires only when
      // the endpoint id resolves *within this document* and sits outside the
      // declaring block's peers; an endpoint that lives in another file does
      // not resolve here, so it falls through to `unresolved-edge-endpoint`
      // above and is dropped with it. Single-document context can therefore
      // only under-report, never false-positive — same property as
      // `shared-infra-fan-in` below.
      // `shared-infra-fan-in` is *not* suppressed (TPL-1522 — recording
      // its side): it benefits from the import-merge (cross-file sharing is only
      // seen in the App / CLI), but in the single-document context it can only
      // *under-report* — it fires only when both the store and ≥2 referencing
      // services are present in this one document, so it never false-positives.
      // Same property as `domain-dispersal`, which is likewise left to fire.
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
