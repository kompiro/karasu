import type { SourceRange } from "./tokens.js";
import type { ResourceOperation } from "../spec/operations.js";

export type { ResourceOperation } from "../spec/operations.js";

export type LogicalNodeKind =
  | "system"
  | "service"
  | "domain"
  | "usecase"
  | "entity"
  | "resource"
  | "user"
  | "client"
  | "database"
  | "queue"
  | "storage"
  | "table"
  | "queue-item"
  | "bucket";

/**
 * The three system-level infra **block** kinds (shared data stores). The single
 * source of truth for "is this an infra block?" across parser, resolver, view,
 * renderer, and CLI — import {@link INFRA_KIND_SET} instead of re-declaring the
 * triple. Leaf sub-resources (`table` / `queue-item` / `bucket`) are NOT here.
 */
export const INFRA_BLOCK_KINDS = ["database", "queue", "storage"] as const;

export type InfraKind = (typeof INFRA_BLOCK_KINDS)[number];

/** Membership set over {@link INFRA_BLOCK_KINDS}; typed as `string` so any node kind can be tested. */
export const INFRA_KIND_SET: ReadonlySet<string> = new Set(INFRA_BLOCK_KINDS);

/**
 * The logical node kinds a team can `owns` (ADR-1720). Single source of truth
 * for the **presentation** side of ownership — the `👥` owner chip on the
 * system-view card, the card's measured height, and `NodeMetadata.team` — so a
 * future ownable kind lights up every surface at once instead of one gate at a
 * time. Resolution has its own enumerations (parser `INDEXED_KINDS`, the
 * `owns` reference validator); they must list the same kinds, which
 * `owner-affordance-kinds.test.ts` checks behaviorally (Issue #2157).
 */
export const OWNABLE_LOGICAL_KINDS = ["service", "domain", "client"] as const;

/** Membership set over {@link OWNABLE_LOGICAL_KINDS}; typed as `string` so any node kind can be tested. */
export const OWNABLE_KIND_SET: ReadonlySet<string> = new Set(OWNABLE_LOGICAL_KINDS);

/**
 * The logical node kinds whose system-view card carries the deploy-view jump
 * affordance (the `D` button / `NodeMetadata.hasDeployContainer`) when a deploy
 * unit `realizes` them — service / domain / client (ADR-1720).
 *
 * Infra blocks are deliberately excluded even though they are valid `realizes`
 * targets (ADR-1632): they render as cylinders / clouds whose corners the
 * rectangular button geometry does not fit. Widening this set therefore needs a
 * shape-aware button placement first, not just another kind (Issue #2157).
 */
export const DEPLOY_AFFORDANCE_KIND_SET: ReadonlySet<string> = new Set([
  "service",
  "domain",
  "client",
]);

export type EdgeKind = "sync" | "async";

export type DeployNodeKind =
  | "war"
  | "jar"
  | "oci"
  | "lambda"
  | "function"
  | "assets"
  | "job"
  | "artifact"
  | "store";

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
  /**
   * Optional parameters on lifecycle annotations, keyed by annotation name
   * (e.g. `{ deprecated: { until: "2026-Q3" } }` from
   * `@deprecated(until: "2026-Q3")`). Only recognized builtin keys are stored
   * — `until` (on `@deprecated` / `@experimental`) and `from` (on
   * `@migration_target`); unsupported params are dropped with a warning.
   * `annotations` (the name list) is unchanged, so existing consumers
   * (style selectors, inheritance, rendering) are unaffected. Values follow
   * graceful degradation: a parseable date is machine-usable, anything else
   * is an opaque display-only string. See ADR (#1568).
   */
  annotationParams?: Record<string, Record<string, string>>;
  children: KrsNode[];
  edges: KrsEdge[];
  /**
   * `boundary` blocks declared *inside* this node's block (#2036). Members are
   * this node's direct children, resolved by bare id — sibling ids are already
   * error-unique (`duplicate-node-id-parent`), so the ambiguity that bare ids
   * have at top level cannot arise here. Absent on kinds that draw no canvas of
   * their own; see `BOUNDARY_HOST_KIND` in the parser.
   */
  boundaries?: BoundaryBlock[];
  /**
   * Ids of the `facet` declarations this node belongs to, written
   * `facets <id>[, <id>]*` (#2065 Part B). Accepted on **every** node kind —
   * membership is externally imposed (a regulation, a policy), so no kind is
   * structurally excluded from it.
   *
   * Repeated `facets` lines accumulate and duplicate ids collapse, so the list
   * is a set in declaration order. Omitted entirely when none were declared, so
   * nodes in existing models keep their exact shape.
   *
   * This is the *reference* side; the declarations live in `KrsFile.facets` and
   * the derived membership map is `KrsFile.facetIndex`. Unlike `boundary`, a
   * facet reference names a flat facet-id namespace, never a node id — the
   * cross-layer addressing problem simply does not arise (#2036 / #2088).
   */
  facets?: string[];
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

/**
 * A conceptual domain entity (a `domain` child). Carries only identity,
 * relations (as `edges`), ownership (implied by its parent domain), and an
 * optional physical mapping to an infra sub-resource — **never attributes**
 * (columns / types / indexes). This "no attributes" line keeps the model on
 * the slowly-changing structural side of the DB-schema non-goal: physical
 * schema stays out of scope, conceptual entities and their relations come in.
 * See `docs/adr/1870-domain-entity-modeling.md`.
 */
export interface EntityNode extends BaseNodeFields {
  kind: "entity";
  properties: CommonProperties;
  /**
   * Physical mapping to an infra sub-resource, written `table <InfraId>.<subId>`.
   * `parent` is the infra block id (e.g. "OrderDB"), `child` is the leaf id
   * (e.g. "orders"). Undefined when the entity has no physical mapping yet —
   * the legitimate forward-design / bottom-up intermediate state.
   */
  tableRef?: { parent: string; child: string };
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
   * When undefined, the resource is a bare declaration; the resolver resolves it
   * to a unique `entity` of the same id, or raises `unassigned-resource` when it
   * resolves to no store (see `resolver/resource-entity.ts`).
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
  | EntityNode
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
  annotations: string[];
  annotationParams?: Record<string, Record<string, string>>;
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

// ─── 境界（P2b: system view の意味的クラスタ宣言） ──────
//
// `boundary <id> "label"? { contains <node-id> ... }` は、著者が任意に引く
// 意味的まとまりを宣言する top-level 構文。`organization`/`owns` と同じく
// containment ではなく参照（id 参照でファイル横断可）で、`boundaryMembership`
// （node id → 宣言されたすべての boundary id、1:N）を成す。team（`ownerIndex`）
// と直交する第二の Group-by 軸になる。experimental notation（ADR-1820）。
// 設計: docs/design/system-view-grouping.md「P2b 詳細設計」、
// docs/design/boundary-membership-slice-a.md（1:N 化、#2178）。
export interface BoundaryBlock {
  kind: "boundary";
  id: string;
  label?: string;
  properties: CommonProperties;
  /** Member node ids listed via `contains` (one per line, mirroring `owns`). */
  contains: string[];
  loc: SourceRange;
}

// ─── facet（#2065 Part B: 外在的な集合所属の宣言） ──────
//
// `facet <id> { label | description | link }` は、規制・ポリシーのように
// アーキテクチャの外から課される集合（PCI スコープ、PII、認証必須）を
// 宣言する top-level 構文。boundary と違い**所属リストを持たない** —
// 所属は要素側の `facets` プロパティで書く（locality）。
//
// 文法は `label` / `description` / `link` で閉じ、`contains` も述語も
// 持たない。これは ADR-832（実行時 authz のルール言語を入れない）が求める
// 「滑り落ちを構造的に防ぐ設計 = 語彙の凍結」であり、恒久的な制約である。
// ルールの本文は description / link に prose として置く。
// experimental notation（ADR-1820）。設計: docs/design/tags-and-facets.md /
// docs/design/facet-grammar-and-model.md。
export interface FacetBlock {
  kind: "facet";
  id: string;
  label?: string;
  properties: CommonProperties;
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
  boundaries: BoundaryBlock[];
  /** Top-level `facet` declarations (#2065 Part B). The reference side is `BaseNodeFields.facets`. */
  facets: FacetBlock[];
  legends: LegendBlock[];
  ownerIndex: Map<string, string>;
  /**
   * Every `boundary` a node is declared in, in declaration order (P2b, #2178).
   *
   * Membership is **1:N at the model layer**: a node listed in three boundaries
   * yields three entries. Needing a single value is a *view* requirement (one
   * band, one collapse stub) and is absorbed where the view places the node, by
   * {@link primaryBoundaryOf} — never by dropping declarations here, which
   * would leave the fact unrecoverable for every other consumer (TPL-2161).
   * There is deliberately no parallel 1:1 field to drift against (TPL-1032).
   *
   * Refines ADR-1974 decision 2 (`boundaryIndex`, 1:1 first-declared-wins).
   */
  boundaryMembership: Map<string, string[]>;
  /**
   * Membership declared by *scoped* `boundary` blocks (#2036), keyed by the
   * declaring scope and then by child id: `scopeKey(path) → (childId → boundaryIds)`.
   *
   * A flat `Map<nodeId, boundaryIds>` cannot express this: node ids are unique
   * only among siblings, so the scope is a distinguishing dimension the key must
   * carry (TPL-1352). Build keys with {@link boundaryScopeKey} on both
   * the producing and consuming side so the separator never leaks.
   *
   * Top-level `boundary` blocks use the flat {@link KrsFile.boundaryMembership}
   * above; both are 1:N, for the same reason.
   */
  scopedBoundaryMembership: Map<string, Map<string, string[]>>;
  /**
   * Facet membership declared by the element-side `facets` property: node id →
   * the set of facet ids it belongs to (#2065 Part B).
   *
   * **1:N by design, and it stays 1:N through every merge.** Multi-membership is
   * a normal state (an entity can be both PII and PCI scope), never a diagnostic
   * condition, so this map holds every declared membership rather than picking a
   * winner. A view that can only draw one value per node resolves that on the
   * view side; the model layer does not discard the fact (TPL-2161 — which
   * `boundaryMembership` now follows too, since #2178 retired its first-wins).
   *
   * Nodes with no `facets` property are absent from the map (no empty sets).
   *
   * The key is the **bare node id**, matching the flat `ownerIndex` /
   * `boundaryMembership` convention. Node ids are only unique among siblings
   * (ADR-927), so two same-named nodes in different scopes share one entry —
   * the union of both their memberships. Anything that needs to know *which*
   * node a membership came from must therefore resolve identity itself rather
   * than trust a bare id, or it will pick the wrong `Payment` (TPL-1352 — a key
   * must carry every distinguishing dimension; `scopedBoundaryMembership` is the
   * worked example of doing it). `facet-not-declared` learned this the hard
   * way: it read this index and reported the first same-named node's location
   * instead of the one that wrote the reference, and now walks the declaration
   * sites instead. The overlay slice paints specific nodes and has the same
   * requirement.
   */
  facetIndex: Map<string, Set<string>>;
  /** Maps each node id to its viewPath (e.g. "EC" → ["Payment", "EC"]). System nodes are excluded. */
  nodePathIndex: Map<string, string[]>;
  /** Maps each node id to the absolute file path where it is defined. */
  nodeFileIndex: Map<string, string>;
}

/**
 * Single source of truth for an empty {@link KrsFile}. Returns a **fresh**
 * literal on every call (fresh arrays/Maps) — callers must not share a single
 * instance across parses/merges, since each represents a distinct file's
 * accumulator. Used by the parser (`parseFile`), the import resolver
 * (circular-import fallback + merge accumulator), and CLI subtree wrapping.
 */
/**
 * Key for {@link KrsFile.scopedBoundaryMembership}: the chain of node ids from the
 * root down to the declaring node (e.g. `["Shop", "Checkout"]`).
 *
 * The single place the encoding is chosen, so producer (parser) and consumer
 * (layout) cannot disagree. Ids may be written as quoted strings and can hold
 * any character, so joining on a separator is not injective — `["A B"]` and
 * `["A", "B"]` would collide on any separator an id is allowed to contain.
 * JSON encoding is injective for string arrays whatever the ids hold.
 */
export function boundaryScopeKey(pathIds: readonly string[]): string {
  return JSON.stringify(pathIds);
}

/**
 * The one boundary a *banded* view can place a node in: its first-declared
 * membership (#2178).
 *
 * The model keeps every declared membership ({@link KrsFile.boundaryMembership});
 * a banded view needs exactly one value per node, because a node is laid out
 * once (TPL-1738) and collapses into one stub. That reduction lives here, in a
 * single pure function, rather than in a second index the model would have to
 * keep in sync (TPL-1032) — so any other view (detail panel, legend, export)
 * still reads the full membership.
 *
 * First-declared wins: the boundary axis has no annotation precedence (unlike
 * the team axis's `@migration_target`, ADR-1566), so this is the tie rule of
 * TPL-1583 with nothing above it.
 */
export function primaryBoundaryOf(ids: readonly string[] | undefined): string | undefined {
  return ids?.[0];
}

/**
 * Union `boundaryIds` into `membership[memberId]`, in place.
 *
 * The one place the merge predicate for 1:N membership lives (#2178), shared by
 * the multi-file import merge and the diff merge so they cannot drift into
 * different answers for the same model (TPL-2161). Idempotent per
 * (member, boundary); order is first-seen, which fixes the primary.
 */
export function mergeMembership(
  membership: Map<string, string[]>,
  memberId: string,
  boundaryIds: readonly string[],
): void {
  const declared = membership.get(memberId);
  if (declared === undefined) {
    membership.set(memberId, [...boundaryIds]);
    return;
  }
  for (const boundaryId of boundaryIds) {
    if (!declared.includes(boundaryId)) declared.push(boundaryId);
  }
}

/**
 * Group id of a *scoped* boundary on the grouping axis: the declaring scope
 * path plus the boundary id, in the same injective JSON encoding as
 * {@link boundaryScopeKey}. A scoped boundary's identity is (declaring scope,
 * id) — #2036 — so everything keyed by its group id (frame container id,
 * collapse state, stub id) must carry both dimensions (TPL-1352): a
 * bare id would fuse same-named boundaries across scopes into one collapse
 * key. Top-level boundaries keep their bare id — the flat form is one
 * model-wide declaration, so one shared collapse state is its identity.
 *
 * (A top-level boundary whose quoted id happens to spell a full JSON array
 * could collide with this space; treated as pathological and not defended.)
 */
export function scopedBoundaryGroupId(scopePath: readonly string[], boundaryId: string): string {
  return boundaryScopeKey([...scopePath, boundaryId]);
}

/**
 * The author-facing name inside a group id: the boundary id for a scoped
 * group id (the last element of its JSON encoding), the id itself otherwise.
 * Used wherever a group id is *displayed* — collapse-stub labels and the
 * frame-title fallback — so the scope qualifier never leaks into the diagram.
 */
export function displayGroupId(groupId: string): string {
  if (!groupId.startsWith("[")) return groupId;
  try {
    const parts: unknown = JSON.parse(groupId);
    if (
      Array.isArray(parts) &&
      parts.length > 0 &&
      parts.every((p): p is string => typeof p === "string")
    ) {
      return parts[parts.length - 1];
    }
  } catch {
    // Not a scoped group id — fall through to the raw id.
  }
  return groupId;
}

export function createEmptyKrsFile(): KrsFile {
  return {
    styleImports: [],
    nodeImports: [],
    systems: [],
    services: [],
    clients: [],
    domains: [],
    databases: [],
    queues: [],
    storages: [],
    deploys: [],
    organizations: [],
    boundaries: [],
    facets: [],
    legends: [],
    ownerIndex: new Map(),
    boundaryMembership: new Map(),
    scopedBoundaryMembership: new Map(),
    facetIndex: new Map(),
    nodePathIndex: new Map(),
    nodeFileIndex: new Map(),
  };
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
  "top-level-declaration": { construct: "user" | "edge" };
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
  "entity-not-in-domain": { parentKind: string };
  "node-not-in-context": { childKind: string; parentKind: string };
  "legend-not-top-level": { parentKind: string };
  "expected-id-or-string": { context: string };
  "expected-node-id": { kind: string };
  "invalid-node-kind": { kind: string };
  "expected-property-value": { propName: string };
  "expected-id-after": { property: string };

  // ── Parser semantic diagnostics ─────────────────────────────────────────
  "team-property-removed": Record<string, never>;
  "annotation-param-unsupported": { annotation: string; key: string };
  "link-url-scheme-not-allowed": { url: string; scheme: string };
  "edge-source-mismatch": { from: string; parentId: string };
  "client-resource-invalid-kind": { kind: string; name: string };
  "unknown-resource-operation": { operation: string; resourceId: string };
  "duplicate-resource-operation": { operation: string; resourceId: string };
  "invalid-crud-decoration": { operation: string; value: string; resourceId: string };
  "empty-crud-decoration": { operation: string; resourceId: string };
  "duplicate-crud-decoration-target": { operation: string; value: string; resourceId: string };
  "duplicate-owner-assignment": { nodeId: string; existingTeam: string };
  "duplicate-boundary-assignment": { nodeId: string; existingBoundary: string };
  "boundary-not-in-context": { parentKind: string };
  "duplicate-boundary-id": { boundaryId: string };
  // Two `facet` blocks declare the same id, so a `facets <id>` reference cannot
  // say which declaration's metadata it means (#2065 Part B). Evaluated on the
  // merged model, so a duplicate split across two files is caught too.
  "duplicate-facet-id": { facetId: string };
  // ADR-19 conformance (#2133): the positional `<kw> <id> "<label>"` form.
  // Removed outright on `boundary` (experimental, no compat promise) …
  "positional-label-removed": { construct: string };
  // … and deprecated-but-accepted on organization / team / member (v1.0
  // constructs; the form was never in the spec, but shipped builds parsed it).
  "positional-label-deprecated": { construct: string };
  "contains-target-not-found": { memberId: string };
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
  "unknown-edge-selector-attribute": { attribute: string };

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
