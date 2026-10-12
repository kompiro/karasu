// ---------------------------------------------------------------------------
// Model-level warnings: the findings a model raises on its own, whichever
// surface draws it. Lives below both `compile/` and `renderer/` so the
// per-view compile, the diff pipelines and the bundled all-views builder all
// reach the same builders (TPL-219, #2879, #3097).
// ---------------------------------------------------------------------------

import type { KrsFile, Diagnostic } from "../types/ast.js";
import type { StyleSheet, ResolvedStyleWarning } from "../types/style.js";
import type { Warning } from "../types/warnings.js";
import { validateStyleValues } from "../style/value-validator.js";
import { analyze } from "./warnings.js";

/**
 * The warnings a model raises on its own, independent of which view is drawn:
 * the resolver's `analyze()` findings plus the value-level validation of every
 * user style sheet. `sheets[0]` is the builtin theme and is trusted, not
 * validated.
 *
 * One builder for every surface that reports a model's warnings — the per-view
 * compile and the diff pipelines (#2879) — so a check added to one reaches the
 * other (TPL-219).
 */
export function collectModelWarnings(krsFile: KrsFile, sheets: StyleSheet[]): Warning[] {
  const systemSheetCount = 1; // only builtin counts as system for conflict detection
  const warnings = analyze(krsFile, sheets, systemSheetCount);

  // Phase 3 value-level validator. Translate the validator's parser-shaped
  // Diagnostics into Warnings so the App's WarningPanel displays them next to
  // the existing `style-column-invalid-value` entry. LSP / CLI invoke
  // `validateStyleValues` directly, so this translation is only for the
  // App / compile-pipeline path.
  for (let i = 1; i < sheets.length; i++) {
    for (const d of validateStyleValues(sheets[i])) {
      const w = diagnosticToWarning(d);
      if (w) warnings.push(w);
    }
  }
  return warnings;
}

/**
 * Translate a parser-shaped Diagnostic from `validateStyleValues` into
 * the matching `Warning` so the App's WarningPanel displays it next to
 * existing style warnings. Returns `null` for diagnostic codes that are
 * not value-level validator output (defensive — the validator only
 * emits the codes handled below).
 */
function diagnosticToWarning(d: Diagnostic): Warning | null {
  // The validator anchors every diagnostic on the value it read; keep that
  // position so the warning panel and `karasu render` point at the sheet's
  // line the way the LSP and `karasu lint-style` already do (#2802).
  //
  // Only when the sheet was named, though. A sheet handed to `compile()` as a
  // string has a path for neither document, so a position on it would be read
  // against the `.krs` — the misreading #2715 removed, and the same reason
  // `unplacedStyleDiagnostics` strips that sheet's parse positions. Sheets
  // that come through the ImportResolver carry their file and keep it.
  const loc = d.loc?.file !== undefined ? { loc: d.loc } : {};
  switch (d.code) {
    case "style-invalid-enum-value":
      return { kind: "style-invalid-enum-value", params: d.params, ...loc };
    case "style-invalid-hex-color":
      return { kind: "style-invalid-hex-color", params: d.params, ...loc };
    case "style-missing-length-unit":
      return { kind: "style-missing-length-unit", params: d.params, ...loc };
    case "style-invalid-length-unit":
      return { kind: "style-invalid-length-unit", params: d.params, ...loc };
    case "style-out-of-range":
      return { kind: "style-out-of-range", params: d.params, ...loc };
    case "style-unknown-property":
      return { kind: "style-unknown-property", params: d.params, ...loc };
    case "style-unknown-icon":
      return { kind: "style-unknown-icon", params: d.params, ...loc };
    default:
      return null;
  }
}

/**
 * Widen a style resolver warning into the canonical `Warning` shape. The
 * resolver emits a narrow structural projection to stay decoupled from the
 * `Warning` union; every surface that resolves styles reports through here.
 */
export function resolvedStyleWarningToWarning(w: ResolvedStyleWarning): Warning {
  switch (w.kind) {
    case "style-column-invalid-value":
      return {
        kind: "style-column-invalid-value",
        params: { nodeId: w.nodeId, value: w.value },
      };
    case "style-column-ignored-non-system-view":
      return {
        kind: "style-column-ignored-non-system-view",
        params: { nodeId: w.nodeId, viewType: w.viewType },
      };
    case "style-grid-columns-invalid-value":
      return {
        kind: "style-grid-columns-invalid-value",
        params: { nodeId: w.nodeId, value: w.value },
      };
    default: {
      // Exhaustiveness guard — adding a new ResolvedStyleWarning variant
      // without updating this switch will fail the build.
      const _exhaustive: never = w;
      throw new Error(`Unhandled ResolvedStyleWarning kind: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
