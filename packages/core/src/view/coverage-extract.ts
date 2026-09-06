import type {
  KrsNode,
  SystemNode,
  ResourceNode,
  EntityNode,
  InfraKind,
  EdgeKind,
} from "../types/ast.js";
import { INFRA_KIND_SET } from "../types/ast.js";
import { indexDeclaredInfra, infraLeafKey } from "../spec/infra-index.js";
import { buildEntityResolver } from "../resolver/resource-entity.js";
import { containerCanvasEdges, projectStoreRelations } from "./view-extract.js";

/**
 * Per-domain density metrics over a resolved logical model. Used by the
 * architecture-reverse harness to detect the "domain thinned out" failure
 * mode quantitatively instead of eyeballing (see
 * `docs/design/reverse-architecture-skill.md`).
 *
 * A node is attributed to its **nearest enclosing domain** — nested domains
 * do not double-count their ancestor's interior.
 */
export interface DomainCoverage {
  domainId: string;
  label: string;
  systemId: string;
  serviceId: string | undefined;
  /** usecase nodes whose nearest domain ancestor is this domain */
  usecases: number;
  /** entity nodes whose nearest domain ancestor is this domain */
  entities: number;
  /** distinct resources referenced by this domain's usecases */
  resourceRefs: number;
  /** relation/communication edges declared within this domain's interior */
  edges: number;
  /** composite density score in [0, 1], normalized across all domains */
  score: number;
  /** true when `score` falls below `threshold` (relatively thin) */
  thin: boolean;
}

/**
 * How much of one declared infra block the logical model actually represents.
 *
 * Counted from the **declaration** side on purpose. Walking outward from the
 * logical model can only ever find leaves something already points at, so a
 * table nothing references is invisible to it — which is how a reverse-
 * engineering merge shipped a model missing 9 of 35 real tables and measured
 * clean (#1991, #2078).
 */
export interface InfraCoverage {
  infraId: string;
  kind: InfraKind;
  /** `table` / `queue-item` / `bucket` leaves the block declares. */
  leaves: number;
  /** Leaves some `entity` claims via `table <infra>.<leaf>`. */
  mappedByEntity: number;
  /** Leaves some usecase `resource` reaches, directly or through an entity. */
  referencedByResource: number;
  /**
   * Leaves a usecase touches that no entity maps — the **mechanically
   * repairable** drop: the entity exists, its `table` line went missing.
   */
  unmappedButReferenced: string[];
  /**
   * Leaves no entity maps and no usecase touches — nothing in the logical
   * model represents them, which usually means a domain was never dug.
   * Kept separate from `unmappedButReferenced` because the two need different
   * repairs, and folding them together loses that (TPL-999).
   */
  unreferenced: string[];
  /**
   * A **recorded** table relation (a `table` edge written in the `.krs`, or
   * the foreign key `translate --from db` emitted) with no corresponding
   * entity relation projected onto the store (#2723). The **mechanically
   * repairable** one: the logical model is missing a relation the store
   * states. On a translated model this is exactly "a declared FK the entity
   * layer lacks", which turns the reverse harness's cross-domain relation
   * reconciliation from guesswork into a checklist.
   *
   * The axis is recorded-vs-projected, deliberately not FK-vs-app-level: an
   * untagged table edge means *confirmed*, not *machine-written* (#2722), so
   * nothing after parsing separates a translated FK from a hand-written edge,
   * and the report does not pretend to.
   *
   * Always empty for a `queue` / `storage` block: only a `database` has a
   * projection to diff against.
   */
  recordedWithoutProjection: LeafRelation[];
  /**
   * A projected entity relation with no corresponding record — the store does
   * not enforce it (application-level integrity). Reported as a fact, never as
   * a defect, in the same stance as `tablelessEntities`: on a UUID-keyed schema
   * with app-level integrity this is most of the model. Kept separate from
   * `recordedWithoutProjection` because the two have different repairs, and
   * folding them together loses that (TPL-999).
   */
  projectionWithoutRecorded: LeafRelation[];
  /**
   * Recorded `A -> B` while the projection has only `B -> A`. The canvas
   * resolves this toward the recorded side (and moves no label), so the
   * report is the only place the disagreement survives. Given in the
   * recorded orientation.
   */
  directionMismatch: LeafRelation[];
  /**
   * Same ordered pair on both sides with a different `edge.kind` (`->` vs
   * `-->`). The canvas keeps the recorded kind; as above, only the report
   * preserves the difference.
   */
  kindMismatch: LeafRelation[];
}

/**
 * An ordered table relation, `from` holding the reference (the same direction
 * rule the store canvas, entity relations and foreign keys all share).
 */
export interface LeafRelation {
  from: string;
  to: string;
}

/**
 * An `entity` carrying no `table` mapping. Reported as a fact, never as a
 * defect: a read-model projection, a KV-backed aggregate and a computed view
 * are all legitimately tableless, and so is any entity mid forward-design.
 * Whoever reads this decides which it is.
 */
export interface TablelessEntity {
  entityId: string;
  /** Nearest enclosing domain, undefined for an entity outside one. */
  domainId: string | undefined;
}

export interface PhysicalCoverage {
  infra: InfraCoverage[];
  tablelessEntities: TablelessEntity[];
}

export interface CoverageReport {
  domains: DomainCoverage[];
  /** score threshold applied for the `thin` flag */
  threshold: number;
  /**
   * Physical-layer recovery, orthogonal to the per-domain scores above and
   * deliberately **not** folded into `score`: the score is normalized across
   * domains, so a new dimension would move every existing `thin` verdict
   * (ADR-1895 — enrichment shifts the baseline).
   *
   * Empty when the model declares no infra at all. That is not a measurement
   * of zero; it means there is no physical layer to have recovered, and the
   * dangling references such a model usually carries are reported by
   * `unresolved-resource-ref` / `unresolved-table-ref` instead.
   */
  physical: PhysicalCoverage;
}

export interface CoverageOptions {
  /**
   * Override the thin-score threshold (absolute, on the 0..1 score scale).
   * Default: half the median domain score — a domain notably below the pack
   * is flagged. Relative by design: if every domain is equally thin, none is
   * flagged (a documented limitation).
   */
  threshold?: number;
}

interface DomainAccumulator {
  domainId: string;
  label: string;
  systemId: string;
  serviceId: string | undefined;
  usecases: number;
  entities: number;
  resourceIds: Set<string>;
  edges: number;
}

function resourceKey(res: ResourceNode): string {
  return res.ref ? `${res.ref.parent}.${res.ref.child}` : res.id;
}

/**
 * DFS the resolved `systems` tree, attributing usecase / entity / resource /
 * edge counts to the nearest enclosing domain.
 */
function collectDomains(systems: readonly SystemNode[]): DomainAccumulator[] {
  const acc: DomainAccumulator[] = [];

  function walk(
    node: KrsNode,
    systemId: string,
    serviceId: string | undefined,
    domain: DomainAccumulator | undefined,
  ): void {
    const nextService = node.kind === "service" ? node.id : serviceId;
    let nextDomain = domain;

    if (node.kind === "domain") {
      // A nested domain starts its own accumulator (nearest-ancestor rule).
      const entry: DomainAccumulator = {
        domainId: node.id,
        label: node.label ?? node.id,
        systemId,
        serviceId: nextService,
        usecases: 0,
        entities: 0,
        resourceIds: new Set(),
        edges: 0,
      };
      acc.push(entry);
      nextDomain = entry;
    } else if (domain) {
      if (node.kind === "usecase") {
        domain.usecases += 1;
        for (const child of node.children) {
          if (child.kind === "resource") domain.resourceIds.add(resourceKey(child as ResourceNode));
        }
      } else if (node.kind === "entity") {
        domain.entities += 1;
      }
      domain.edges += node.edges.length;
    }

    for (const child of node.children) walk(child, systemId, nextService, nextDomain);
  }

  for (const sys of systems) {
    for (const child of sys.children) walk(child, sys.id, undefined, undefined);
  }
  return acc;
}

/**
 * Measure how much of the declared physical layer the logical model reaches.
 *
 * Resource → leaf resolution goes through `buildEntityResolver`, not through
 * `res.ref` alone: a bare `resource Order` backed by `entity Order { table
 * OrderDB.orders }` is the *canonical* form (ADR-1870), so reading only the
 * dotted form would report a fully-modeled table as untouched.
 */
function collectPhysical(systems: readonly SystemNode[]): PhysicalCoverage {
  const roots = systems as readonly KrsNode[];
  const declared = indexDeclaredInfra(roots);
  if (declared.size === 0) return { infra: [], tablelessEntities: [] };

  const resolver = buildEntityResolver([...systems]);
  const mapped = new Set<string>();
  const referenced = new Set<string>();
  const tablelessEntities: TablelessEntity[] = [];

  const walk = (node: KrsNode, domainId: string | undefined): void => {
    const nextDomain = node.kind === "domain" ? node.id : domainId;
    if (node.kind === "entity") {
      const entity = node as EntityNode;
      if (entity.tableRef) {
        mapped.add(infraLeafKey(entity.tableRef.parent, entity.tableRef.child));
      } else {
        tablelessEntities.push({ entityId: entity.id, domainId: nextDomain });
      }
    } else if (node.kind === "resource") {
      const resolved = resolver.resolve(node as ResourceNode);
      if (resolved.infraParentId !== undefined && resolved.infraChildId !== undefined) {
        referenced.add(infraLeafKey(resolved.infraParentId, resolved.infraChildId));
      }
    }
    for (const child of node.children) walk(child, nextDomain);
  };
  for (const sys of systems) {
    for (const child of sys.children) walk(child, undefined);
  }

  // Every `database` node by id — reopened blocks (S4.5) each carry their own
  // recorded edges, so the diff unions over all of them.
  const storesById = new Map<string, KrsNode[]>();
  for (const sys of systems) {
    for (const child of sys.children) {
      if (!INFRA_KIND_SET.has(child.kind) || child.kind !== "database") continue;
      const list = storesById.get(child.id) ?? [];
      list.push(child);
      storesById.set(child.id, list);
    }
  }

  const infra: InfraCoverage[] = [];
  for (const block of declared.values()) {
    const unmappedButReferenced: string[] = [];
    const unreferenced: string[] = [];
    let mappedCount = 0;
    let referencedCount = 0;
    for (const leafId of block.leafIds) {
      const key = infraLeafKey(block.infraId, leafId);
      const isMapped = mapped.has(key);
      const isReferenced = referenced.has(key);
      if (isMapped) mappedCount += 1;
      if (isReferenced) referencedCount += 1;
      if (isReferenced && !isMapped) unmappedButReferenced.push(leafId);
      else if (!isReferenced && !isMapped) unreferenced.push(leafId);
    }
    infra.push({
      infraId: block.infraId,
      kind: block.kind,
      leaves: block.leafIds.length,
      mappedByEntity: mappedCount,
      referencedByResource: referencedCount,
      unmappedButReferenced,
      unreferenced,
      ...diffStoreRelations(storesById.get(block.infraId) ?? [], roots),
    });
  }

  return { infra, tablelessEntities };
}

type StoreRelationDiff = Pick<
  InfraCoverage,
  "recordedWithoutProjection" | "projectionWithoutRecorded" | "directionMismatch" | "kindMismatch"
>;

/**
 * Diff the two edge sets of a store's ER view (#2723): what the `.krs` records
 * on the leaves against what the entity layer projects onto them. Both sets
 * come from the functions the canvas itself draws from, so the report can
 * never describe an edge the canvas does not have. Relation identity is the
 * ordered pair; the first edge per pair on each side decides its kind.
 */
function diffStoreRelations(
  stores: readonly KrsNode[],
  systems: readonly KrsNode[],
): StoreRelationDiff {
  const diff: StoreRelationDiff = {
    recordedWithoutProjection: [],
    projectionWithoutRecorded: [],
    directionMismatch: [],
    kindMismatch: [],
  };
  if (stores.length === 0) return diff;
  const key = (from: string, to: string): string => `${from}->${to}`;
  const recorded = new Map<string, { from: string; to: string; kind: EdgeKind }>();
  const projected = new Map<string, { from: string; to: string; kind: EdgeKind }>();
  for (const store of stores) {
    for (const e of containerCanvasEdges(store)) {
      const k = key(e.from, e.to);
      if (!recorded.has(k)) recorded.set(k, { from: e.from, to: e.to, kind: e.kind });
    }
    for (const e of projectStoreRelations(store, systems)) {
      const k = key(e.from, e.to);
      if (!projected.has(k)) projected.set(k, { from: e.from, to: e.to, kind: e.kind });
    }
  }
  for (const [k, rec] of recorded) {
    const pair = { from: rec.from, to: rec.to };
    const same = projected.get(k);
    if (same) {
      if (same.kind !== rec.kind) diff.kindMismatch.push(pair);
    } else if (projected.has(key(rec.to, rec.from))) {
      diff.directionMismatch.push(pair);
    } else {
      diff.recordedWithoutProjection.push(pair);
    }
  }
  for (const [k, proj] of projected) {
    if (recorded.has(k) || recorded.has(key(proj.to, proj.from))) continue;
    diff.projectionWithoutRecorded.push({ from: proj.from, to: proj.to });
  }
  return diff;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Compute per-domain coverage from a resolved logical model. Every domain is
 * reported (thin ones are flagged, never dropped — see TPL-999).
 */
export function extractCoverage(
  systems: readonly SystemNode[],
  options: CoverageOptions = {},
): CoverageReport {
  const accumulators = collectDomains(systems);

  const raw = accumulators.map((a) => ({
    ...a,
    resourceRefs: a.resourceIds.size,
  }));

  // Normalize each metric by its max across domains, then average → score.
  const maxUsecases = Math.max(1, ...raw.map((d) => d.usecases));
  const maxEntities = Math.max(1, ...raw.map((d) => d.entities));
  const maxResources = Math.max(1, ...raw.map((d) => d.resourceRefs));
  const maxEdges = Math.max(1, ...raw.map((d) => d.edges));

  const scored = raw.map((d) => {
    const score =
      (d.usecases / maxUsecases +
        d.entities / maxEntities +
        d.resourceRefs / maxResources +
        d.edges / maxEdges) /
      4;
    return { ...d, score };
  });

  const threshold = options.threshold ?? 0.5 * median(scored.map((d) => d.score));

  const domains: DomainCoverage[] = scored.map((d) => ({
    domainId: d.domainId,
    label: d.label,
    systemId: d.systemId,
    serviceId: d.serviceId,
    usecases: d.usecases,
    entities: d.entities,
    resourceRefs: d.resourceRefs,
    edges: d.edges,
    score: d.score,
    thin: d.score < threshold,
  }));

  return { domains, threshold, physical: collectPhysical(systems) };
}
