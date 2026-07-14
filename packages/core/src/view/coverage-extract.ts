import type { KrsNode, SystemNode, ResourceNode } from "../types/ast.js";

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

export interface CoverageReport {
  domains: DomainCoverage[];
  /** score threshold applied for the `thin` flag */
  threshold: number;
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

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Compute per-domain coverage from a resolved logical model. Every domain is
 * reported (thin ones are flagged, never dropped — see TPL-20260510-05).
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

  return { domains, threshold };
}
