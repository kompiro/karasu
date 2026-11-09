import type { WarningKind } from "@karasu-tools/core";

/**
 * How each resolver warning behaves in the LSP's single-document context, where
 * `analyze()` runs on one `.krs` file with no stylesheet and no imports
 * (TPL-1522). The app and the CLI run it over the import-merged model with the
 * project's sheets, so any kind whose input differs between the two can report
 * differently. This table is the ledger of that split.
 *
 * It is a `Record` over `WarningKind` whose entries require both axes and a
 * reason, so a new kind fails typecheck until its side on each axis is written
 * down. Which side is right stays a judgment; the table forces the judgment to
 * be recorded. `single-document-context.test.ts` holds the `suppressed` and
 * `fires-on-imported-target` entries to fixtures.
 *
 * `sheets` — what the missing stylesheets do to the kind:
 * - `independent`: the kind reads no stylesheet.
 * - `dependent`: it reports on a sheet's content, so it cannot fire here.
 * - `suppressed`: a sheet can silence it, so here it fires unsuppressed.
 *   `annotation-possible-typo` was the first such kind (#1522) and left this
 *   table when it became a parser error in `.krs language v2.0` (#2677).
 * - `not-analyzed`: `analyze()` never emits it; it comes from validating or
 *   resolving a sheet, outside this loop.
 *
 * `imports` — what the missing imports do to the kind:
 * - `local`: it reads only what the document itself declares.
 * - `under-reports`: it needs several declarations to meet, so with some of
 *   them in another file it stays silent. It can miss, never false-positive.
 * - `fires-on-imported-target`: it reports a reference whose target may be
 *   declared in an imported file, so here it fires on a target that exists.
 *   Unless `singleDocument` is `suppressed`, that false positive reaches the
 *   editor today.
 *
 * `singleDocument: "suppressed"` drops the kind in the LSP. `computeDiagnostics`
 * filters on it.
 */
export interface SingleDocumentSide {
  sheets: "independent" | "dependent" | "suppressed" | "not-analyzed";
  imports: "local" | "under-reports" | "fires-on-imported-target";
  singleDocument?: "suppressed";
  why: string;
}

const LOCAL = (why: string): SingleDocumentSide => ({
  sheets: "independent",
  imports: "local",
  why,
});

const UNDER = (why: string): SingleDocumentSide => ({
  sheets: "independent",
  imports: "under-reports",
  why,
});

/** Fires in the LSP today when the target sits in an imported file. */
const FIRES = (why: string): SingleDocumentSide => ({
  sheets: "independent",
  imports: "fires-on-imported-target",
  why: `${why} Fires in the LSP today when the target is declared in an imported file.`,
});

const UNASSIGNED = FIRES(
  "Reports a top-level node no team owns; the owns line may be in an imported organization.",
);

const STYLE_VALUE: SingleDocumentSide = {
  sheets: "not-analyzed",
  imports: "local",
  why: "Reported on the .krs.style document by validateStyleValues, as a parser-shaped diagnostic.",
};

const SHEET_CONTENT: SingleDocumentSide = {
  sheets: "dependent",
  imports: "local",
  why:
    "Reports on the content of a stylesheet. The document being edited is a .krs file, so " +
    "there is nothing to say about it; the app and the CLI, which hold the sheets, show it.",
};

export const SINGLE_DOCUMENT_CONTEXT: Record<WarningKind, SingleDocumentSide> = {
  "domain-dispersal": UNDER(
    "Fires only when every service carrying the domain is in this document.",
  ),
  "shared-infra-fan-in": UNDER(
    "Fires only when the store and two or more referencing services are in this one document.",
  ),
  "cross-domain-store-access": UNDER(
    "Needs the usecase, the leaf and the entity mapping that gives the leaf an owner to meet.",
  ),
  "style-conflict": {
    sheets: "dependent",
    imports: "local",
    why: "Compares rules across the author's sheets, which the LSP does not have.",
  },
  "missing-runtime": LOCAL("Looks at a deploy node's own properties."),
  "missing-realizes": LOCAL("Looks at a deploy node's own properties."),
  "unresolved-realizes": FIRES("Reports a realizes target that resolves to no node."),
  "invalid-owns": UNDER(
    "Since #2410 it names a kind only for an id that resolves in the model it was handed, so a " +
      "target in another file resolves to nothing here. The existence check " +
      "(owns-target-not-found) is a parser diagnostic that declines while the file has imports " +
      "(reference-validation.ts, #2082).",
  ),
  "unassigned-domain": UNASSIGNED,
  "unassigned-service": UNASSIGNED,
  "unassigned-client": UNASSIGNED,
  "unresolved-handles": FIRES("Reports a handles target that resolves to no node."),
  "unassigned-database": UNASSIGNED,
  "unassigned-queue": UNASSIGNED,
  "unassigned-storage": UNASSIGNED,
  "unassigned-resource": FIRES(
    "Reports a bare resource id that resolves to no store or entity; the store may be imported.",
  ),
  "cross-system-ref-implicit-external": UNDER(
    "Fires only when the target system resolves within this document.",
  ),
  "cross-system-ref-unresolved": FIRES(
    "Reports a dotted endpoint (Billing.Api) that resolves nowhere in the model it was handed.",
  ),
  "unresolved-edge-endpoint": {
    sheets: "independent",
    imports: "fires-on-imported-target",
    singleDocument: "suppressed",
    why:
      "It means the id exists nowhere in the merged model (spec S6). With imports unresolved, a " +
      "routine cross-file edge (the system-reopen pattern) would false-positive, so the LSP " +
      "drops it.",
  },
  "edge-endpoint-not-at-scope": UNDER(
    "Fires only for an endpoint that resolves in this document (#2075). One in another file " +
      "falls through to unresolved-edge-endpoint and is dropped with it.",
  ),
  "edge-target-ambiguous": UNDER("Needs every candidate for the endpoint in this document."),
  "cyclic-dependency": UNDER("Needs every edge of the cycle in this document."),
  "delivers-target-not-client": FIRES(
    "Reports a delivers target that is not a client in the model it was handed.",
  ),
  "client-capability-duplicate": LOCAL("Compares a client's own capability lines."),
  "tag-not-builtin": LOCAL("Checks a tag written on a node against the builtin list."),
  "tag-not-applicable": LOCAL("Checks a tag against the kind of the node it is written on."),
  "annotation-not-builtin": LOCAL("Checks an annotation against the builtin list."),
  "style-tag-selector-not-builtin": SHEET_CONTENT,
  "style-annotation-selector-not-builtin": SHEET_CONTENT,
  "facet-not-declared": FIRES("Reports a facets reference that names no declared facet block."),
  "entity-anchor-collision": UNDER("Needs both colliding entities in this document."),
  "legend-ref-unresolved": {
    sheets: "suppressed",
    imports: "fires-on-imported-target",
    why:
      "A ref resolves when a node uses its target or a style rule selects it. With no sheet, a " +
      "ref only a stylesheet selects (ref @planned) fires here though the app is silent, and a " +
      "target used only in an imported file fires too. Both reach the editor today.",
  },
  "style-column-ignored-non-system-view": {
    sheets: "not-analyzed",
    imports: "local",
    why:
      "The style resolver reports it while drawing a deploy or org view. The LSP draws nothing, " +
      "so it is the app's and the CLI's to show.",
  },
  "style-invalid-enum-value": STYLE_VALUE,
  "style-invalid-hex-color": STYLE_VALUE,
  "style-missing-length-unit": STYLE_VALUE,
  "style-invalid-length-unit": STYLE_VALUE,
  "style-out-of-range": STYLE_VALUE,
  "style-unknown-property": STYLE_VALUE,
  "style-unknown-icon": STYLE_VALUE,
};
