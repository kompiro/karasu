import type { DeployBlock, DeployNode, SystemNode } from "../types/ast.js";
import type { EdgeKind } from "../types/ast.js";

export interface DeployContainer {
  /** The service id that these units realize */
  serviceId: string;
  /** Human-readable label resolved from the system hierarchy */
  serviceLabel: string;
  units: DeployNode[];
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
 */
export function extractDeployView(deploys: DeployBlock[], systems: SystemNode[]): DeployViewSlice {
  const empty: DeployViewSlice = {
    deployLabel: "",
    containers: [],
    unclassifiedUnits: [],
    ghostEdges: [],
  };

  if (deploys.length === 0) return empty;

  // Use the first deploy block
  const deployBlock = deploys[0];

  // Group units by realizes target
  const groupedByRealizes = new Map<string, DeployNode[]>();
  const unclassifiedUnits: DeployNode[] = [];

  for (const unit of deployBlock.nodes) {
    const realizes = unit.properties.realizes;
    if (realizes) {
      if (!groupedByRealizes.has(realizes)) {
        groupedByRealizes.set(realizes, []);
      }
      groupedByRealizes.get(realizes)!.push(unit);
    } else {
      unclassifiedUnits.push(unit);
    }
  }

  // Build service label map from system children
  const serviceLabelMap = new Map<string, string>();
  for (const system of systems) {
    for (const child of system.children) {
      const id = child.id ?? child.label;
      serviceLabelMap.set(id, child.label);
    }
  }

  // Build containers
  const containers: DeployContainer[] = [];
  for (const [serviceId, units] of groupedByRealizes) {
    containers.push({
      serviceId,
      serviceLabel: serviceLabelMap.get(serviceId) ?? serviceId,
      units,
    });
  }

  // Build ghost edges from system-level edges between realized services
  const realizesTargets = new Set(groupedByRealizes.keys());
  const ghostEdges: DeployGhostEdge[] = [];

  for (const system of systems) {
    for (const edge of system.edges) {
      if (realizesTargets.has(edge.from) && realizesTargets.has(edge.to)) {
        ghostEdges.push({
          from: edge.from,
          to: edge.to,
          label: edge.label,
          kind: edge.kind,
        });
      }
    }
  }

  return {
    deployLabel: deployBlock.label,
    containers,
    unclassifiedUnits,
    ghostEdges,
  };
}
