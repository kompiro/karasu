import type { SourceRange } from "./tokens.js";

export type WarningKind =
  | "domain-dispersal"
  | "style-conflict"
  | "missing-runtime"
  | "missing-realizes"
  | "unresolved-realizes"
  | "invalid-owns"
  | "unassigned-domain"
  | "unassigned-service"
  | "unassigned-client"
  | "unresolved-handles"
  | "unassigned-database"
  | "unassigned-queue"
  | "unassigned-storage"
  | "unassigned-usecase"
  | "cross-system-ref-implicit-external"
  | "cross-system-ref-unresolved"
  | "cyclic-dependency"
  | "delivers-target-not-client"
  | "client-capability-duplicate"
  | "annotation-possible-typo"
  | "legend-ref-unresolved"
  | "style-column-invalid-value"
  | "style-column-ignored-non-system-view"
  | "style-invalid-enum-value"
  | "style-invalid-hex-color"
  | "style-missing-length-unit"
  | "style-invalid-length-unit"
  | "style-out-of-range"
  | "style-unknown-property";

/**
 * Per-kind params shape. Each entry carries only the structured data needed
 * to re-render the warning message in any language; producers never build
 * user-visible strings.
 *
 * Consumers that need a localized string call `renderWarning(w, t)` from
 * `@karasu-tools/i18n`; the structured `Warning` stays language-neutral.
 */
export interface WarningParamsByKind {
  "domain-dispersal": { domainId: string; services: string[] };
  "style-conflict": { selector: string; sheetIndices: number[] };
  "missing-runtime": { nodeId: string };
  "missing-realizes": { nodeId: string };
  "unresolved-realizes": {
    /** id of the deploy node that declared `realizes` */
    deployNodeId: string;
    /** id of the surrounding deploy block */
    deployBlockId: string;
    /** the target id that could not be resolved to any service / domain */
    target: string;
  };
  "invalid-owns": { teamId: string; ownedId: string };
  "unassigned-domain": { domainId: string; label?: string };
  "unassigned-service": { serviceId: string; label?: string };
  "unassigned-client": { clientId: string; label?: string };
  "unresolved-handles": {
    /** id of the node that declared `handles` */
    nodeId: string;
    /** kind of the declaring node ("client" or "service") */
    nodeKind: "client" | "service";
    /** the domain id that could not be resolved through the expose rule */
    domainId: string;
  };
  "unassigned-database": { databaseId: string; label?: string };
  "unassigned-queue": { queueId: string; label?: string };
  "unassigned-storage": { storageId: string; label?: string };
  "unassigned-usecase": { usecaseId: string };
  "cross-system-ref-implicit-external": {
    ref: string;
    sourceSystemId: string;
    sourceNodeId: string;
    targetSystemId: string;
  };
  "cross-system-ref-unresolved": { ref: string };
  "cyclic-dependency": { cyclePath: string[] };
  "delivers-target-not-client": { serviceId: string; targetId: string };
  /**
   * A `client` declared the same `capability <name>` more than once. The
   * second declaration is a programming mistake (no false positives), so
   * we surface it as a warning rather than silently accepting the
   * duplicate.
   */
  "client-capability-duplicate": { clientId: string; name: string };
  /**
   * An annotation name is not one of the built-ins but is within a small
   * edit distance of one (e.g. `@depracated`). Annotation names are an
   * open set (docs/spec/tags-annotations.md § Annotation names are an
   * open set), so unknown names are never an error — this hint only fires
   * on near-misses of a built-in, where a typo is the likely intent.
   * Names that appear in a stylesheet annotation selector are treated as
   * intentional and never hinted.
   */
  "annotation-possible-typo": {
    /** id of the node carrying the suspicious annotation */
    nodeId: string;
    /** the annotation name as written, without the `@` sigil */
    annotation: string;
    /** the closest built-in annotation name, without the `@` sigil */
    suggestion: string;
  };
  /**
   * A `ref` entry inside a `legend` block points at a target
   * (annotation / tag / class / id / type) that does not match anything
   * in the file's nodes or style rules. The renderer skips the entry;
   * the warning surfaces the broken reference so the author can fix it.
   */
  "legend-ref-unresolved": {
    /** "@deprecated" / "[external]" / ".legacy" / "#NodeId" / "service" */
    target: string;
    /** Optional title of the legend block, for context in the message. */
    legendTitle?: string;
  };
  /**
   * A `.krs.style` rule declared `column: <foo>` with a value that is not
   * one of `left` / `center` / `right`. The resolver discards the
   * declaration; the surface is informational so the author can fix the
   * typo.
   */
  "style-column-invalid-value": {
    /** id of the node whose hint was rejected */
    nodeId: string;
    /** The invalid value as written in the source. */
    value: string;
  };
  /**
   * A `column` hint was resolved for a node, but the current view is not
   * `system`. Layout hints only apply to system view; the renderer
   * surfaces this so authors who target a deploy / org node by id are
   * not silently surprised.
   */
  "style-column-ignored-non-system-view": {
    nodeId: string;
    /** "deploy" or "org" */
    viewType: "deploy" | "org";
  };
  /**
   * Value-level diagnostics produced by `validateStyleValues` (Phase 3).
   * Surfaced in the App's WarningPanel via the compile pipeline; the
   * LSP path emits the same checks as parser-level Diagnostics in
   * `validateDocument`.
   */
  "style-invalid-enum-value": { property: string; value: string; allowed: string[] };
  "style-invalid-hex-color": { property: string; value: string };
  "style-missing-length-unit": { property: string; value: string; allowedUnits: string[] };
  "style-invalid-length-unit": {
    property: string;
    value: string;
    unit: string;
    allowedUnits: string[];
  };
  "style-out-of-range": { property: string; value: number; min?: number; max?: number };
  "style-unknown-property": { property: string };
}

/**
 * A discriminated union over `kind`. Destructuring by `kind` narrows `params`
 * to the right shape automatically, so consumers get full type safety for
 * each warning variant.
 *
 * Prior shape carried `message: string` + `details: string[]` — both removed
 * as part of the Phase B refactor. See `docs/design/i18n-support.md`.
 */
export type Warning = {
  [K in WarningKind]: {
    kind: K;
    params: WarningParamsByKind[K];
    loc?: SourceRange;
  };
}[WarningKind];

/**
 * Visual register of a Warning. Most kinds render as `warning`; style-school
 * smell detections (per ADR-20260514-02 / TPL-20260514-08) render as `info`
 * — the configuration is a structural fact, not a defect karasu prescribes
 * fixing. The mapping is keyed by `kind` so producers do not need to set
 * severity explicitly.
 */
export type WarningSeverity = "warning" | "info";

const INFO_WARNING_KINDS: ReadonlySet<WarningKind> = new Set<WarningKind>([
  "domain-dispersal",
  // Pre-existing informational kinds: the UI already rendered these with
  // the ℹ icon via the old `WARNING_ICONS` map; preserve that register.
  "missing-runtime",
  "missing-realizes",
  // Low-confidence hint: annotation names are an open set, so a near-miss
  // of a built-in is only *probably* a typo — never a defect karasu can
  // assert (#1499).
  "annotation-possible-typo",
]);

export function warningSeverity(kind: WarningKind): WarningSeverity {
  return INFO_WARNING_KINDS.has(kind) ? "info" : "warning";
}

/**
 * A `Warning` rendered to display strings. Produced by the i18n renderer
 * (`renderWarning` in `@karasu-tools/i18n`) — the structured `Warning`
 * itself stays language-neutral. Defined here so every renderer consumer
 * (app, lsp, cli) shares one type.
 */
export interface FormattedWarning {
  message: string;
  details: string[];
}
