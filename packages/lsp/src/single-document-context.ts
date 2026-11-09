import type { WarningKind } from "@karasu-tools/core";

/**
 * How each resolver warning behaves in the LSP's single-document context, where
 * `analyze()` runs on one `.krs` file with no stylesheet and no imports
 * (TPL-1522). The app and the CLI run it over the import-merged model with the
 * project's sheets, so any kind whose input differs between the two can report
 * differently. This table is the ledger of that split.
 *
 * It is a `Record` over `WarningKind`, so a new kind fails typecheck until its
 * side is written down. Which side is right stays a judgment; the table forces
 * the judgment to be recorded, next to its reason.
 *
 * `sheets` — what the missing stylesheets do to the kind:
 * - `independent`: the kind reads no stylesheet.
 * - `dependent`: it reports on a sheet's content, so it cannot fire here.
 * - `suppressed`: a sheet can silence it, so here it fires unsuppressed.
 *   No kind is on this side since `annotation-possible-typo` became a parser
 *   error in `.krs language v2.0` (#1522, #2677).
 * - `not-analyzed`: `analyze()` never emits it; it comes from validating or
 *   resolving a sheet, which the LSP does on the `.krs.style` document itself.
 *
 * `singleDocument: "suppressed"` drops the kind in the LSP because the missing
 * imports would make it false-positive. `computeDiagnostics` filters on it.
 */
export interface SingleDocumentSide {
  sheets: "independent" | "dependent" | "suppressed" | "not-analyzed";
  singleDocument?: "suppressed";
  /** Why, for every entry that is not plainly sheet-independent and unfiltered. */
  why?: string;
}

const INDEPENDENT: SingleDocumentSide = { sheets: "independent" };

const STYLE_VALUE: SingleDocumentSide = {
  sheets: "not-analyzed",
  why: "Reported on the .krs.style document by validateStyleValues, as a parser-shaped diagnostic.",
};

const SHEET_CONTENT: SingleDocumentSide = {
  sheets: "dependent",
  why:
    "Reports on the content of a stylesheet. The document being edited is a .krs file, so " +
    "there is nothing to say about it; the app and the CLI, which hold the sheets, show it.",
};

export const SINGLE_DOCUMENT_CONTEXT: Record<WarningKind, SingleDocumentSide> = {
  "domain-dispersal": {
    sheets: "independent",
    why: "Import-coupled but only under-reports: it fires when every service is in this document.",
  },
  "shared-infra-fan-in": {
    sheets: "independent",
    why:
      "Import-coupled but only under-reports: it fires only when the store and two or more " +
      "referencing services are in this one document, so it never false-positives.",
  },
  "cross-domain-store-access": INDEPENDENT,
  "style-conflict": {
    sheets: "dependent",
    why: "Compares rules across the author's sheets, which the LSP does not have.",
  },
  "missing-runtime": INDEPENDENT,
  "missing-realizes": INDEPENDENT,
  "unresolved-realizes": INDEPENDENT,
  "invalid-owns": {
    sheets: "independent",
    why:
      "Import-coupled, not filtered: since #2410 it names a kind only for an id that resolves " +
      "in the model it was handed, so a target in another file resolves to nothing here. The " +
      "existence check (owns-target-not-found) is a parser diagnostic that declines while the " +
      "file has imports (reference-validation.ts, #2082).",
  },
  "unassigned-domain": INDEPENDENT,
  "unassigned-service": INDEPENDENT,
  "unassigned-client": INDEPENDENT,
  "unresolved-handles": INDEPENDENT,
  "unassigned-database": INDEPENDENT,
  "unassigned-queue": INDEPENDENT,
  "unassigned-storage": INDEPENDENT,
  "unassigned-resource": INDEPENDENT,
  "cross-system-ref-implicit-external": INDEPENDENT,
  "cross-system-ref-unresolved": INDEPENDENT,
  "unresolved-edge-endpoint": {
    sheets: "independent",
    singleDocument: "suppressed",
    why:
      "Import-coupled: it means the id exists nowhere in the merged model (spec S6). With " +
      "imports unresolved, a routine cross-file edge (the system-reopen pattern) would " +
      "false-positive, so the LSP drops it.",
  },
  "edge-endpoint-not-at-scope": {
    sheets: "independent",
    why:
      "Import-coupled but only under-reports (#2075): it fires only for an endpoint that " +
      "resolves in this document. One in another file falls through to " +
      "unresolved-edge-endpoint and is dropped with it.",
  },
  "edge-target-ambiguous": INDEPENDENT,
  "cyclic-dependency": INDEPENDENT,
  "delivers-target-not-client": INDEPENDENT,
  "client-capability-duplicate": INDEPENDENT,
  "tag-not-builtin": INDEPENDENT,
  "tag-not-applicable": INDEPENDENT,
  "annotation-not-builtin": INDEPENDENT,
  "style-tag-selector-not-builtin": SHEET_CONTENT,
  "style-annotation-selector-not-builtin": SHEET_CONTENT,
  "facet-not-declared": INDEPENDENT,
  "entity-anchor-collision": INDEPENDENT,
  "legend-ref-unresolved": {
    sheets: "dependent",
    why: "Resolves a legend entry against the selectors of the author's sheets.",
  },
  "style-column-ignored-non-system-view": {
    sheets: "not-analyzed",
    why:
      "The style resolver reports it while drawing a deploy or org view. The LSP draws " +
      "nothing, so it is the app's and the CLI's to show.",
  },
  "style-invalid-enum-value": STYLE_VALUE,
  "style-invalid-hex-color": STYLE_VALUE,
  "style-missing-length-unit": STYLE_VALUE,
  "style-invalid-length-unit": STYLE_VALUE,
  "style-out-of-range": STYLE_VALUE,
  "style-unknown-property": STYLE_VALUE,
  "style-unknown-icon": STYLE_VALUE,
};
