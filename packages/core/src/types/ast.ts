import type { SourceRange } from "./tokens.js";
import type { ResourceOperation } from "../spec/operations.js";

export type { ResourceOperation } from "../spec/operations.js";

export type LogicalNodeKind =
  | "system"
  | "service"
  | "domain"
  | "usecase"
  | "resource"
  | "user"
  | "client"
  | "database"
  | "queue"
  | "storage"
  | "table"
  | "queue-item"
  | "bucket";

export type EdgeKind = "sync" | "async";

export type DeployNodeKind =
  | "war"
  | "jar"
  | "oci"
  | "lambda"
  | "function"
  | "assets"
  | "job"
  | "artifact";

// ─── 共通 ─────────────────────────────────────────

export interface LinkEntry {
  url: string;
  label?: string;
  loc: SourceRange;
}

export interface BaseNodeFields {
  id: string;
  label?: string;
  tags: string[];
  annotations: string[];
  children: KrsNode[];
  edges: KrsEdge[];
  loc: SourceRange;
}

export interface CommonProperties {
  description?: string;
  links: LinkEntry[];
}

// ─── 種別ごとの型 ──────────────────────────────────

export interface SystemNode extends BaseNodeFields {
  kind: "system";
  properties: CommonProperties;
}

export interface ServiceNode extends BaseNodeFields {
  kind: "service";
  properties: CommonProperties & {
    /**
     * Domain ids this service exposes to its callers.
     *
     * Self-owned domains (declared as `domain D { ... }` children) do not
     * need to appear here — ownership is implicit. `handles` is for
     * **re-exporting** a domain that lives elsewhere (BFF / gateway
     * passthrough). The validator confirms each entry resolves through a
     * one-hop expose rule: at least one outgoing communication edge target
     * must itself expose the named domain.
     */
    handles?: string[];
    /**
     * Client ids this service ships (BFF / SSR pattern). The renderer synthesizes
     * a tagged `delivers` edge for each entry; the property itself is the source of
     * truth for round-tripping.
     */
    delivers?: string[];
  };
}

export interface DomainNode extends BaseNodeFields {
  kind: "domain";
  properties: CommonProperties;
}

export interface UsecaseNode extends BaseNodeFields {
  kind: "usecase";
  properties: CommonProperties;
}

export interface ResourceNode extends BaseNodeFields {
  kind: "resource";
  properties: CommonProperties & {
    /**
     * CRUD-style operations this usecase performs on the resource. Each
     * entry carries the raw verb the author wrote and, when they used the
     * decoration syntax (`verb:c[,c]`), the CRUD verbs they mapped it to.
     *
     * Recognized bare verbs are `create` / `read` / `update` / `delete`.
     * Unknown bare verbs (`list`, `search`, `execute`, …) parse and raise
     * an `unknown-resource-operation` warning unless they carry decoration
     * (e.g. `list:read`). Omission of `operations` keeps current behavior
     * (no diagnostic, opaque dependency).
     */
    operations?: ResourceOperation[];
  };
  /**
   * Set when the resource uses dot-notation reference syntax (e.g. `resource OrderDB.C`).
   * `parent` is the infra node id (e.g. "OrderDB"), `child` is the sub-resource id (e.g. "C").
   * When undefined, the resource is an inline declaration (may trigger an "unassigned-resource" warning).
   */
  ref?: { parent: string; child: string };
  /**
   * Optional author-supplied identifier for the synthesized usecase->resource
   * edge, written as `resource <ref> #<id> { ... }`. Propagates to the
   * generated KrsEdge as `authorId`. Used by the canonical-id pass and the
   * `edge#<id>` style selector. See `docs/design/edge-id-selector.md`.
   */
  authorId?: string;
}

// ─── インフラリソース（system 直下） ───────────────────

export interface TableNode extends BaseNodeFields {
  kind: "table";
  properties: CommonProperties;
}

export interface QueueItemNode extends BaseNodeFields {
  kind: "queue-item";
  properties: CommonProperties;
}

export interface BucketNode extends BaseNodeFields {
  kind: "bucket";
  properties: CommonProperties;
}

export interface DatabaseNode extends BaseNodeFields {
  kind: "database";
  properties: CommonProperties;
}

export interface QueueGroupNode extends BaseNodeFields {
  kind: "queue";
  properties: CommonProperties;
}

export interface StorageNode extends BaseNodeFields {
  kind: "storage";
  properties: CommonProperties;
}

export interface UserNode extends BaseNodeFields {
  kind: "user";
  properties: CommonProperties & {
    role?: string;
  };
}

/**
 * Storage kinds whitelisted for `client { resource <kind> "<name>" }`.
 * Cookie / credential storage and device capabilities are intentionally
 * excluded — see Issues #834 / #837.
 */
export const CLIENT_RESOURCE_KINDS = [
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "opfs",
  "file",
  "keychain",
] as const;

export type ClientResourceKind = (typeof CLIENT_RESOURCE_KINDS)[number];

export interface ClientResource {
  storageKind: ClientResourceKind;
  name: string;
  loc: SourceRange;
}

/**
 * Device / browser capability declared on a client (camera, geolocation,
 * notification, etc.). Identifier set is intentionally open — see
 * `docs/design/client-capability-modeling.md`. Recommended names live in
 * `docs/spec/tags-annotations.md`.
 */
export interface ClientCapability {
  name: string;
  label?: string;
  description?: string;
  loc: SourceRange;
}

export interface ClientNode extends BaseNodeFields {
  kind: "client";
  properties: CommonProperties & {
    resources: ClientResource[];
    capabilities: ClientCapability[];
    /**
     * Domain ids this client surfaces to the user. Resolved through the
     * one-hop expose rule: at least one outgoing communication edge target
     * (a `service` it talks to) must expose the named domain (own it as a
     * child, or re-export it via its own `handles`).
     */
    handles?: string[];
  };
}

// ─── Union ─────────────────────────────────────────

export type KrsNode =
  | SystemNode
  | ServiceNode
  | DomainNode
  | UsecaseNode
  | ResourceNode
  | UserNode
  | ClientNode
  | DatabaseNode
  | QueueGroupNode
  | StorageNode
  | TableNode
  | QueueItemNode
  | BucketNode;

// ─── エッジ（変更なし） ────────────────────────────

export interface KrsEdge {
  from: string;
  to: string;
  label?: string;
  kind: EdgeKind;
  tags: string[];
  cyclic?: boolean;
  loc: SourceRange;
  /**
   * Author-supplied identifier from `from -> to "label" #<id>` (or, for
   * synthesized usecase->resource edges, from `resource <ref> #<id>`).
   * See `docs/design/edge-id-selector.md`.
   */
  authorId?: string;
  /**
   * Derived identifier for `edge#<id>` style selectors. Set by the
   * canonical-id pass that runs after view extraction:
   *   - `authorId` if present
   *   - else `<from><arrow><to>` (arrow follows `kind`: `->` for sync,
   *     `-->` for async)
   *   - left undefined when the base form collides with another edge and
   *     no author ID disambiguates them (a warning is emitted instead)
   */
  canonicalId?: string;
  /**
   * True when `label` is machine-generated (the `W`/`R` markers on
   * synthesized usecase→resource edges, the `N domain edges` count on
   * aggregated implicit edges) rather than authored in `.krs`. Synthetic
   * labels are still drawn on the canvas, but the renderer omits them from
   * `data-edge-label`, which carries authored label text only.
   */
  syntheticLabel?: boolean;
}

// ─── 階層型 ──────────────────────────────────────

/** Structural interface satisfied by KrsNode (via BaseNodeFields), TeamNode, and MemberNode. */
export interface HierarchyNode {
  id: string;
  label?: string;
  children: HierarchyNode[];
}

// ─── 組織図 ────────────────────────────────────────

export interface MemberNode {
  kind: "member";
  id: string;
  label?: string;
  properties: CommonProperties & {
    slack?: string;
    github?: string;
  };
  children: [];
  loc: SourceRange;
}

export type OrgNode = TeamNode | MemberNode;

export interface TeamNode {
  kind: "team";
  id: string;
  label?: string;
  properties: CommonProperties & {
    owns: string[];
  };
  children: OrgNode[];
  loc: SourceRange;
}

export interface OrganizationBlock {
  id: string;
  label?: string;
  properties: CommonProperties;
  teams: TeamNode[];
  loc: SourceRange;
}

// ─── 物理図（変更なし） ────────────────────────────

export interface DeployNodeProperties {
  runtime?: string;
  realizes?: string[];
  schedule?: string;
  image?: string;
  type?: string;
}

export interface DeployNode {
  kind: DeployNodeKind;
  id: string;
  label?: string;
  properties: DeployNodeProperties;
  loc: SourceRange;
}

export interface DeployBlock {
  id: string;
  label?: string;
  nodes: DeployNode[];
  loc: SourceRange;
}

// ─── ファイル ──────────────────────────────────────

/**
 * One named import entry, represented as an array of path segments.
 *
 * - Bare id `Foo` parses to `["Foo"]` (resolved by the existing
 *   single-id lookup against `system` ids, direct system children,
 *   top-level services, and deploy nodes).
 * - Path id `A.B.C` parses to `["A", "B", "C"]` and is walked by the
 *   resolver one segment at a time through each parent's `children`
 *   array (id-only matching, no kind whitelist). See ADR / Issue #927.
 *
 * Note: path resolution and validation (file existence, segment lookup,
 * ambiguity, cycles) are deferred to `fs/import-resolver.ts` — the parser
 * only records the path structurally.
 */
export type ImportIdPath = string[];

export interface ImportDeclaration {
  ids: ImportIdPath[];
  path: string;
  loc: SourceRange;
}

/**
 * View scope a legend block can declare. The vocabulary mixes view types
 * and logical drill-down depths, interpreted depth-symmetrically:
 *
 * - `system` / `deploy` / `org` — the top level of that view type.
 * - `service` / `domain` — drill-down views whose root node is of that kind.
 *
 * Scope matching is exact (no cross-depth stacking); an omitted scope means
 * "the top level of every view". See `legendScopeMatches` in svg-builder.
 */
export type LegendViewScope = "system" | "service" | "domain" | "deploy" | "org";

/**
 * A `ref` entry in a `legend` block resolves to a color via the existing
 * style cascade. The three target kinds correspond to karasu's vocabulary:
 *
 * - `annotation` — `@deprecated`, `@external`, etc.
 * - `tag` — `[external]`, `[implicit]`, etc.
 * - `selector` — a `.krs.style` selector (`.class`, `#id`, or a type name).
 */
export type LegendRefTarget =
  | { kind: "annotation"; name: string }
  | { kind: "tag"; name: string }
  | { kind: "selector"; selector: string };

export type LegendEntry =
  | { kind: "swatch"; color: string; label: string; loc: SourceRange }
  | { kind: "ref"; target: LegendRefTarget; label: string; loc: SourceRange };

export interface LegendBlock {
  /** Optional view scope. When omitted, the legend is shown on the top level of every view. */
  scope?: LegendViewScope;
  /** Optional title rendered above the entries. */
  title?: string;
  entries: LegendEntry[];
  loc: SourceRange;
}

export interface KrsFile {
  styleImports: string[];
  nodeImports: ImportDeclaration[];
  systems: SystemNode[];
  services: ServiceNode[];
  clients: ClientNode[];
  domains: DomainNode[];
  databases: DatabaseNode[];
  queues: QueueGroupNode[];
  storages: StorageNode[];
  deploys: DeployBlock[];
  organizations: OrganizationBlock[];
  legends: LegendBlock[];
  ownerIndex: Map<string, string>;
  /** Maps each node id to its viewPath (e.g. "EC" → ["Payment", "EC"]). System nodes are excluded. */
  nodePathIndex: Map<string, string[]>;
  /** Maps each node id to the absolute file path where it is defined. */
  nodeFileIndex: Map<string, string>;
}

// ─── Diagnostics ───────────────────────────────────

/**
 * Three-level severity. `info` is reserved for diagnostics that surface a
 * **structural fact karasu visualizes but does not prescribe** — e.g. shared
 * databases across services (`infra-redeclared-across-files`). The wording
 * is fact-first; any "this is a smell" framing belongs in linked
 * documentation, not in the message itself. `info` SHOULD render less
 * prominently than `warning` in downstream surfaces (App diagnostic banner,
 * LSP, CLI). See design doc `karasu-position-on-style-prescriptions.md`.
 */
export type DiagnosticSeverity = "error" | "warning" | "info";

/**
 * Per-code params shape. Each entry carries only the structured data needed
 * to re-render the diagnostic message in any language; producers never build
 * user-visible strings.
 *
 * Consumers that need a localized string call `renderDiagnostic(d, t)`
 * from `@karasu-tools/i18n`; the structured `Diagnostic` stays
 * language-neutral.
 *
 * See `docs/design/i18n-support.md`.
 */
export interface DiagnosticParamsByCode {
  // ── Token / parse structure ─────────────────────────────────────────────
  "token-type-mismatch": { expected: string; got: string; value: string };
  "unexpected-token-root": { tokenType: string; value: string };
  "unexpected-token-in-block": { blockKind: string; tokenType: string; value: string };
  "expected-brace-or-string": { got: string; value: string };
  "expected-identifier": { got: string; value: string };
  "expected-string-after": {
    property: "label" | "role" | "description" | "slack" | "github";
  };
  "property-not-for-node-kind": {
    property: "role" | "handles" | "delivers" | "operations";
    nodeKind: string;
  };
  "infra-not-in-context": { infraKind: string; parentKind: string };
  "legend-not-top-level": { parentKind: string };
  "expected-id-or-string": { context: string };
  "expected-node-id": { kind: string };
  "invalid-node-kind": { kind: string };
  "expected-property-value": { propName: string };
  "expected-id-after": { property: string };

  // ── Parser semantic diagnostics ─────────────────────────────────────────
  "team-property-removed": Record<string, never>;
  "link-url-scheme-not-allowed": { url: string; scheme: string };
  "edge-source-mismatch": { from: string; parentId: string };
  "unassigned-resource": { resourceId: string };
  "client-resource-invalid-kind": { kind: string; name: string };
  "unknown-resource-operation": { operation: string; resourceId: string };
  "duplicate-resource-operation": { operation: string; resourceId: string };
  "invalid-crud-decoration": { operation: string; value: string; resourceId: string };
  "empty-crud-decoration": { operation: string; resourceId: string };
  "duplicate-crud-decoration-target": { operation: string; value: string; resourceId: string };
  "duplicate-owner-assignment": { nodeId: string; existingTeam: string };
  "duplicate-team-id": { teamId: string };
  "node-id-multiple-locations": { nodeId: string };
  "duplicate-node-id-parent": { nodeId: string };
  "owns-target-not-found": { ownedId: string };
  "duplicate-edge-id": { authorId: string };
  "ambiguous-edge-base": { fromId: string; toId: string; arrow: "->" | "-->" };

  // ── Style parser ────────────────────────────────────────────────────────
  "style-token-type-mismatch": { expected: string; got: string; value: string };
  "expected-style-property-name": { got: string };
  "expected-semicolon-between-properties": { property: string };

  // ── Style value validator (Phase 3) ────────────────────────────────────
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

  // ── Import resolver ─────────────────────────────────────────────────────
  "circular-import": { filePath: string };
  "file-not-found": { filePath: string };
  "directory-not-found": { dirPath: string };
  "service-outside-system": { serviceId: string };
  "duplicate-node-in-system": { nodeId: string; systemId: string };
  "duplicate-node-in-deploy": { nodeId: string; deployId: string };
  "duplicate-team-in-organization": { teamId: string; orgId: string };
  "system-property-conflict": {
    /** Block id (`system` / `deploy` / `organization` block). */
    blockId: string;
    /** Discriminator so the formatter can phrase the warning correctly. */
    blockKind: "system" | "deploy" | "organization";
    /** Property name (`label` or `description`). */
    property: "label" | "description";
    /** Value that the resolver kept (closer to the import-graph root). */
    chosen: string;
    /** Value that was ignored (declared in a deeper imported file). */
    ignored: string;
  };
  "infra-redeclared-across-files": {
    /** Infra node id (database / queue / storage). */
    blockId: string;
    /** Discriminator so the formatter can phrase the message correctly. */
    blockKind: "database" | "queue" | "storage";
  };
  "infra-leaf-redeclared-silently": {
    /** Leaf id (table / queue-item / bucket). */
    leafId: string;
    /** Leaf kind. */
    leafKind: "table" | "queue-item" | "bucket";
    /** Parent infra block id that contains the leaf. */
    infraId: string;
    /** Parent infra kind. */
    infraKind: "database" | "queue" | "storage";
  };
  "import-id-not-found": { id: string; path: string };
  "import-path-not-found": {
    /** Path segments as written in the import block. */
    path: string[];
    /** 0-based index of the segment that failed to resolve. */
    failedAt: number;
    /** The imported file path (`from "..."`). */
    importPath: string;
    /** Id of the last node that did resolve successfully (omitted when segment 0 fails). */
    lastResolvedId?: string;
  };
  "circular-style-import": { filePath: string };
  "style-file-not-found": { filePath: string };

  // ── App-level synthetic diagnostics ─────────────────────────────────────
  // Constructed by the app when compile() throws, to surface a generic
  // error in the diagnostic banner without pulling in exception details.
  "app-project-compile-error": Record<string, never>;
  "app-org-parse-error": Record<string, never>;
  // Generic fallback for tests and ad-hoc callers that need a Diagnostic
  // without a specific structural shape — the `text` param carries a
  // pre-built string that the renderers return verbatim.
  "generic-text": { text: string };
}

export type DiagnosticCode = keyof DiagnosticParamsByCode;

/**
 * Discriminated union over `code`. Destructuring by `code` narrows `params`
 * to the right shape automatically.
 *
 * Prior shape carried `message: string` — removed in Phase B.2 of the i18n
 * rollout (see `docs/design/i18n-support.md`).
 */
export type Diagnostic = {
  [K in DiagnosticCode]: {
    severity: DiagnosticSeverity;
    code: K;
    params: DiagnosticParamsByCode[K];
    loc?: SourceRange;
  };
}[DiagnosticCode];

export interface ParseResult<T> {
  value: T;
  diagnostics: Diagnostic[];
}
