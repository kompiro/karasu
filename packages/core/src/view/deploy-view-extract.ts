import type { DeployBlock, DeployNode, SystemNode } from "../types/ast.js";
import type { EdgeKind } from "../types/ast.js";
import { deriveInfraEdges } from "./view-extract.js";

export interface DeployContainer {
  /** The service id that these units realize */
  serviceId: string;
  /** Human-readable label resolved from the system hierarchy */
  serviceLabel: string;
  units: DeployNode[];
  /**
   * Kind band this container belongs to, when every unit is the same terminal
   * kind. Currently only `job`: a container whose units are all `kind: "job"`
   * is pulled out of the dependency DAG and clustered into a dedicated job band
   * (#1738), so scheduled jobs read as one operational group instead of
   * scattering by the dependency depth of the domain they realize. `undefined`
   * for ordinary (compute / mixed) containers that stay on the DAG.
   */
  kindBand?: "job";
}

export interface DeployGhostEdge {
  from: string;
  to: string;
  label?: string;
  kind: EdgeKind;
}

export interface DeployViewSlice {
  /** Label of the deploy block (e.g., "本番環境") */
  deployLabel: string;
  /** Groups of deploy units by realized service */
  containers: DeployContainer[];
  /** Units with no realizes property */
  unclassifiedUnits: DeployNode[];
  /** Edges from the system diagram, between realized services */
  ghostEdges: DeployGhostEdge[];
}

/**
 * Extracts a DeployViewSlice from deploy blocks + system nodes.
 * Groups deploy units by their `realizes` value and derives ghost edges
 * from system-level edges between the realized services.
 *
 * @param selectedId - id of the deploy block to render; falls back to the first block if not found
 */
export function extractDeployView(
  deploys: DeployBlock[],
  systems: SystemNode[],
  selectedId?: string,
): DeployViewSlice {
  const empty: DeployViewSlice = {
    deployLabel: "",
    containers: [],
    unclassifiedUnits: [],
    ghostEdges: [],
  };

  if (deploys.length === 0) return empty;

  const deployBlock = selectedId
    ? (deploys.find((d) => d.id === selectedId) ?? deploys[0])
    : deploys[0];

  // Group units by realizes target
  const groupedByRealizes = new Map<string, DeployNode[]>();
  const unclassifiedUnits: DeployNode[] = [];

  for (const unit of deployBlock.nodes) {
    const realizes = unit.properties.realizes;
    if (realizes && realizes.length > 0) {
      for (const serviceId of realizes) {
        if (!groupedByRealizes.has(serviceId)) {
          groupedByRealizes.set(serviceId, []);
        }
        groupedByRealizes.get(serviceId)!.push(unit);
      }
    } else {
      unclassifiedUnits.push(unit);
    }
  }

  // Build service label map from system children
  const serviceLabelMap = new Map<string, string>();
  for (const system of systems) {
    for (const child of system.children) {
      const id = child.id;
      serviceLabelMap.set(id, child.label ?? child.id);
    }
  }

  // Build containers
  const containers: DeployContainer[] = [];
  for (const [serviceId, units] of groupedByRealizes) {
    // A container is a job band member only when *every* unit is a `job`. A
    // mixed container (job + other kinds) stays on the dependency DAG so its
    // `realizes`-labelled cluster is not split (#1738).
    const isJobOnly = units.length > 0 && units.every((u) => u.kind === "job");
    containers.push({
      serviceId,
      serviceLabel: serviceLabelMap.get(serviceId) ?? serviceId,
      units,
      ...(isJobOnly ? { kindBand: "job" as const } : {}),
    });
  }

  // Build ghost edges between realized targets. Two sources are merged:
  //   1. raw top-level `system.edges` (service→service communication), and
  //   2. synthesized `service → infra` dependency edges (`deriveInfraEdges`,
  //      from usecase `resource <Infra>.<Sub>` refs) — so a service container
  //      connects to the realized store's container (#1658). The same helper
  //      backs the system view, keeping both views' dependency sets in sync.
  // Edges nested inside service children are not considered. Both endpoints must
  // be realized (have a deploy unit); dedup by `from->to`.
  const realizesTargets = new Set(groupedByRealizes.keys());
  const ghostEdges: DeployGhostEdge[] = [];
  const seenGhost = new Set<string>();

  const pushGhost = (edge: { from: string; to: string; label?: string; kind: EdgeKind }): void => {
    if (!realizesTargets.has(edge.from) || !realizesTargets.has(edge.to)) return;
    const key = `${edge.from}->${edge.to}`;
    if (seenGhost.has(key)) return;
    seenGhost.add(key);
    ghostEdges.push({ from: edge.from, to: edge.to, label: edge.label, kind: edge.kind });
  };

  for (const system of systems) {
    for (const edge of system.edges) {
      pushGhost({ from: edge.from, to: edge.to, label: edge.label, kind: edge.kind });
    }
  }
  // Derive service→infra dependencies over ALL systems' children at once, not
  // per-system: shared infra is commonly declared at the top level (a dedicated
  // infra file) and referenced by services inside a `system`, so the service and
  // the infra node live in different `children` lists. A merged list lets that
  // canonical pattern resolve. The deploy view is flat (not per-system), so
  // merging is appropriate here.
  const allChildren = systems.flatMap((s) => s.children);
  for (const edge of deriveInfraEdges(allChildren)) {
    pushGhost({ from: edge.from, to: edge.to, kind: edge.kind });
  }

  return {
    deployLabel: deployBlock.label ?? deployBlock.id,
    containers,
    unclassifiedUnits,
    ghostEdges,
  };
}
