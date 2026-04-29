import type { SourceRange } from "./tokens.js";

export type WarningKind =
  | "domain-dispersal"
  | "style-conflict"
  | "missing-runtime"
  | "missing-realizes"
  | "unresolved-realizes"
  | "invalid-owns"
  | "deprecated-team-property"
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
  | "legend-ref-unresolved"
  | "style-column-invalid-value"
  | "style-column-ignored-non-system-view";

/**
 * Per-kind params shape. Each entry carries only the structured data needed
 * to re-render the warning message in any language; producers never build
 * user-visible strings.
 *
 * Consumers that need a localized string should call `formatWarning(w)` (the
 * temporary compat bridge) or `t(\`warning.\${w.kind}\`, w.params)` once the
 * app's `useTranslation` infrastructure covers warning keys (Phase D).
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
  "deprecated-team-property": { nodeId: string; ownerTeamId: string };
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
