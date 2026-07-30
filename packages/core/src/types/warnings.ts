import type { SourceRange } from "./tokens.js";

export type WarningKind =
  | "domain-dispersal"
  | "shared-infra-fan-in"
  | "cross-domain-store-access"
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
  | "unassigned-resource"
  | "cross-system-ref-implicit-external"
  | "cross-system-ref-unresolved"
  | "unresolved-edge-endpoint"
  | "edge-endpoint-not-at-scope"
  | "cyclic-dependency"
  | "delivers-target-not-client"
  | "client-capability-duplicate"
  | "annotation-possible-typo"
  | "tag-not-builtin"
  | "annotation-not-builtin"
  | "entity-anchor-collision"
  | "legend-ref-unresolved"
  | "style-column-invalid-value"
  | "style-column-ignored-non-system-view"
  | "style-grid-columns-invalid-value"
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
  /**
   * Two or more services have a resolved `resource` dependency on the same
   * `database` / `queue` / `storage` node within one system scope. This is
   * the actual "shared store / Database-per-Service smell" fan-in signal —
   * keyed on real sharing, independent of how many files declared the store
   * (cf. `infra-redeclared-across-files`, which keys on declaration
   * redundancy). `[external]` stores are excluded: the smell is about owning
   * a store, not depending on a managed third-party one. Info-register per
   * ADR-1386 (fact, not a defect).
   */
  "shared-infra-fan-in": {
    /** id of the shared infra node (e.g. "OrderDB") */
    infraId: string;
    /** kind of the shared infra node */
    infraKind: "database" | "queue" | "storage";
    /** ids of the services that depend on it (≥ 2) */
    services: string[];
  };
  /**
   * A `usecase` in one `domain` reads/writes an infra leaf (`table` /
   * `queue-item` / `bucket`) whose owning domain is a *different* domain.
   * Ownership is derived from the logical layer: a leaf is owned by every
   * `domain` whose `entity` maps it via `table <InfraId>.<subId>`
   * (ADR-1870). The store is keyed at **leaf granularity**
   * (`infraId.tableId`), not the whole `database`, because sibling tables in
   * one store can belong to different domains. Fires when the accessing domain
   * is not in the owner set — so a single-owner reach-in and a third domain
   * touching a co-owned table are both caught, while the owners of a co-owned
   * table are exempt. `[external]` / `[index]` stores are excluded (symmetric
   * with `shared-infra-fan-in`). Info-register per ADR-1386 (a
   * boundary-crossing *fact* some schools call a smell, not a defect). Paired
   * with but orthogonal to `shared-infra-fan-in` (service-count sharing vs
   * ownership-boundary crossing) — the two fire independently. See
   * `docs/adr/1819-domain-store-ownership-diagnostic.md`.
   */
  "cross-domain-store-access": {
    /** id of the domain whose usecase performs the access */
    accessingDomain: string;
    /** ids of the domains that own the leaf (≥ 1; > 1 when co-owned), sorted */
    owningDomains: string[];
    /** id of the infra block the leaf lives in (e.g. "OrderDB") */
    infraId: string;
    /** kind of that infra block */
    infraKind: "database" | "queue" | "storage";
    /** id of the accessed leaf sub-resource (e.g. "orders") */
    tableId: string;
    /** aggregated CRUD direction of the crossing access(es) */
    mode: "read" | "write" | "readwrite";
  };
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
  "unassigned-resource": { resourceId: string };
  "cross-system-ref-implicit-external": {
    ref: string;
    sourceSystemId: string;
    sourceNodeId: string;
    targetSystemId: string;
  };
  "cross-system-ref-unresolved": { ref: string };
  /**
   * An authored edge references a node id that exists nowhere in the merged
   * model. The edge is dropped during view extraction (the resolved endpoint
   * node is preserved — see §S6 / TPL-2170); this warning surfaces the
   * silent drop. Cross-system dotted refs (`Sys.Svc`) are excluded — those are
   * handled by `cross-system-ref-*`.
   */
  "unresolved-edge-endpoint": { from: string; to: string; unresolvedId: string };
  /**
   * An authored edge names an endpoint that exists in the merged model but is
   * not a peer at the scope where the edge is declared, so the edge is dropped
   * from every view (#2075). The canonical form anchors the edge at its source
   * block (`domain A { -> B }`) or, for a cross-domain entity relation, names
   * the target qualified (`OtherDomain.Entity`).
   *
   * An endpoint is *at scope* when it is in `peers(container)`:
   *
   * - container is a `system` → the union of the children of every `system`
   *   block declared with that id (S3 reopen keeps them separate AST nodes
   *   within one file), plus the top-level orphan services / domains / clients
   *   that the root view splices in;
   * - otherwise → the container's own id (the self-anchored source) plus its
   *   siblings.
   *
   * Two endpoints are skipped rather than reported: a dotted ref (`Sys.Svc` /
   * `Domain.Entity`, owned by `cross-system-ref-*` and the entity view) and an
   * id that resolves nowhere (owned by `unresolved-edge-endpoint`). One
   * exemption: a `domain`-anchored edge to another `domain` renders as a
   * derived implicit service edge, at any nesting distance.
   *
   * Warning register per ADR-1386: an edge the author wrote is silently absent
   * from every diagram, which is a defect rather than a style-school fact.
   */
  "edge-endpoint-not-at-scope": {
    from: string;
    to: string;
    /** the endpoint (`from` or `to`) that is not at scope */
    endpointId: string;
    /** kind of the node `endpointId` resolves to */
    endpointKind: string;
    /** id of the node that contains the endpoint, if any */
    ownerId?: string;
    /** kind of that containing node */
    ownerKind?: string;
    /** id of the block the edge is declared in */
    scopeId: string;
    /** kind of that block */
    scopeKind: string;
  };
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
   * edit distance of one (e.g. `@depracated`). Unknown names still parse
   * in v1.x (docs/spec/tags-annotations.md § Non-builtin annotation names
   * are deprecated (v1.x)) — this hint only fires on near-misses of a
   * built-in, where a typo is the likely intent. Names that appear in a
   * stylesheet annotation selector are treated as intentional and never
   * hinted. The unconditional deprecation itself is
   * `annotation-not-builtin`.
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
   * A tag name is outside the tool vocabulary (builtin tags plus the
   * system-assigned tags of docs/spec/tags-annotations.md § System-assigned
   * tags). v1.x accepts the name unchanged (ADR-1314 freeze) but deprecates
   * it: syntax v2.0 keeps only tool-owned tag vocabulary, with membership /
   * model-specific labeling moving to `facet` (#2065 Part B) and new
   * archetypes going through builtin-addition requests. Deliberately has no
   * suppression condition — a style selector or legend ref proves intent,
   * but intent does not change the v2.0 outcome (docs/design/tags-and-facets.md
   * Part A). Warning register: resolves the TPL-1503 fourth state
   * into state (2), "warned as unknown".
   */
  "tag-not-builtin": {
    /** id of the node carrying the tag, or `"<from> -> <to>"` for an edge */
    nodeId: string;
    /** the tag name as written, without the `[...]` brackets */
    tag: string;
  };
  /**
   * An annotation name is outside the builtin lifecycle vocabulary. Same
   * deprecation contract as `tag-not-builtin`: accepted in v1.x, tool
   * vocabulary only in v2.0, no suppression condition. Subsumes the
   * `annotation-possible-typo` hint for the near-miss case; both coexist
   * during v1.x and are consolidated in v2.0.
   */
  "annotation-not-builtin": {
    /** id of the node (or `team`) carrying the annotation */
    nodeId: string;
    /** the annotation name as written, without the `@` sigil */
    annotation: string;
  };
  /**
   * Two addressable targets in the `entity` deep-link namespace share one id.
   * That namespace is model-wide {all domain ids} ∪ {all entity ids}: a
   * `#krs-entity-<id>` anchor opens a domain's entity view (domain id) or
   * focuses an entity (entity id). When an entity id collides with another
   * entity id (under a different domain) or with a domain id, the anchor
   * resolves ambiguously and the bundled static SVG emits duplicate DOM ids,
   * silently breaking CSS `:target`. Warning register: the model still renders
   * and resolves — only deep-link addressability degrades (warn-don't-error).
   * `domain Billing` + a root `entity Billing` is a natural naming clash, so
   * this is a warning, not an error. See `docs/adr/1870-domain-entity-modeling.md`.
   */
  "entity-anchor-collision": {
    /** The id claimed by more than one target in the entity anchor namespace. */
    id: string;
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
   * A `grid-columns` hint resolved to something that is not a positive
   * integer (e.g. `grid-columns: 0`, `grid-columns: 2.5`). The hint is
   * dropped and the layout auto-balances instead.
   */
  "style-grid-columns-invalid-value": {
    /** id of the node whose hint was rejected */
    nodeId: string;
    /** The invalid value as written in the source. */
    value: string;
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
 * smell detections (per ADR-1386 / TPL-1386) render as `info`
 * — the configuration is a structural fact, not a defect karasu prescribes
 * fixing. The mapping is keyed by `kind` so producers do not need to set
 * severity explicitly.
 */
export type WarningSeverity = "warning" | "info";

const INFO_WARNING_KINDS: ReadonlySet<WarningKind> = new Set<WarningKind>([
  "domain-dispersal",
  // Shared-store fan-in is a style-school smell (Database-per-Service), not a
  // defect karasu prescribes fixing — same register as domain-dispersal
  // (ADR-1386 / TPL-1386).
  "shared-infra-fan-in",
  // Cross-domain store access is a boundary-crossing fact some schools call a
  // smell (legitimate under shared kernel / migrations) — same register.
  "cross-domain-store-access",
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
