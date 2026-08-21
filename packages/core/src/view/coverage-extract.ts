import type { KrsNode, SystemNode, ResourceNode, EntityNode, InfraKind } from "../types/ast.js";
import { indexDeclaredInfra, infraLeafKey } from "../spec/infra-index.js";
import { buildEntityResolver } from "../resolver/resource-entity.js";

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
    });
  }

  return { infra, tablelessEntities };
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
