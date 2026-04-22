import type { DeployNode } from "../types/ast.js";
import type {
  DeployContainer,
  DeployGhostEdge,
  DeployViewSlice,
} from "../view/deploy-view-extract.js";
import type { DiffState, EdgeDiffMeta, NodeDiffMeta } from "./view-diff.js";

export interface DiffedDeployView {
  /** Union DeployViewSlice — passed to the existing layout/render pipeline. */
  slice: DeployViewSlice;
  /**
   * Diff state per element id. Keys are deploy unit ids (and synthetic
   * `container:<serviceId>` keys for whole-container additions/removals).
   */
  nodes: Map<string, NodeDiffMeta>;
  /** Diff state per ghost edge keyed `${from}->${to}`. */
  edges: Map<string, EdgeDiffMeta>;
  /** Diff state per container keyed by `serviceId` (Issue #750). */
  containers: Map<string, DiffState>;
}

function deployNodeChanges(
  before: DeployNode,
  after: DeployNode,
): NodeDiffMeta["changes"] | undefined {
  const out: NonNullable<NodeDiffMeta["changes"]> = {};
  if ((before.label ?? "") !== (after.label ?? "")) {
    out.label = { before: before.label, after: after.label };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function diffDeployUnits(
  before: readonly DeployNode[],
  after: readonly DeployNode[],
  diff: Map<string, NodeDiffMeta>,
): DeployNode[] {
  const beforeById = new Map(before.map((n) => [n.id, n]));
  const merged: DeployNode[] = [];
  const seen = new Set<string>();

  for (const unit of after) {
    const prev = beforeById.get(unit.id);
    if (prev === undefined) {
      diff.set(unit.id, { state: "added" });
    } else {
      const changes = deployNodeChanges(prev, unit);
      diff.set(unit.id, { state: changes ? "changed" : "unchanged", changes });
    }
    merged.push(unit);
    seen.add(unit.id);
  }
  for (const unit of before) {
    if (seen.has(unit.id)) continue;
    diff.set(unit.id, { state: "removed" });
    merged.push(unit);
  }
  return merged;
}

function diffContainers(
  before: readonly DeployContainer[],
  after: readonly DeployContainer[],
  diff: Map<string, NodeDiffMeta>,
  containerDiff: Map<string, DiffState>,
): DeployContainer[] {
  const beforeByService = new Map(before.map((c) => [c.serviceId, c]));
  const merged: DeployContainer[] = [];
  const seen = new Set<string>();

  for (const container of after) {
    const prev = beforeByService.get(container.serviceId);
    if (prev === undefined) {
      // Whole container is new — mark every unit as added.
      for (const unit of container.units) {
        diff.set(unit.id, { state: "added" });
      }
      containerDiff.set(container.serviceId, "added");
      merged.push(container);
    } else {
      const unitDiffs = new Map<string, NodeDiffMeta>();
      const mergedUnits = diffDeployUnits(prev.units, container.units, unitDiffs);
      let anyChanged = false;
      for (const [id, meta] of unitDiffs) {
        diff.set(id, meta);
        if (meta.state !== "unchanged") anyChanged = true;
      }
      containerDiff.set(container.serviceId, anyChanged ? "changed" : "unchanged");
      merged.push({ ...container, units: mergedUnits });
    }
    seen.add(container.serviceId);
  }
  for (const container of before) {
    if (seen.has(container.serviceId)) continue;
    for (const unit of container.units) {
      diff.set(unit.id, { state: "removed" });
    }
    containerDiff.set(container.serviceId, "removed");
    merged.push(container);
  }
  return merged;
}

function diffGhostEdges(
  before: readonly DeployGhostEdge[],
  after: readonly DeployGhostEdge[],
  diff: Map<string, EdgeDiffMeta>,
): DeployGhostEdge[] {
  const key = (e: DeployGhostEdge) => `${e.from}->${e.to}`;
  const beforeByKey = new Map(before.map((e) => [key(e), e]));
  const merged: DeployGhostEdge[] = [];
  const seen = new Set<string>();

  for (const edge of after) {
    const k = key(edge);
    diff.set(k, { state: beforeByKey.has(k) ? "unchanged" : "added" });
    merged.push(edge);
    seen.add(k);
  }
  for (const edge of before) {
    const k = key(edge);
    if (seen.has(k)) continue;
    diff.set(k, { state: "removed" });
    merged.push(edge);
  }
  return merged;
}

/**
 * Produce a union DeployViewSlice of two deploy views plus per-element diff state.
 *
 * Containers are matched by `serviceId`, deploy units by their id, ghost edges by
 * `from->to`. The "after" elements appear first so the union layout reflects the
 * new structure; removed elements are appended in their original order so the
 * reader still sees what disappeared.
 *
 * Selecting which deploy block to compare is the caller's responsibility — pass
 * the slices already extracted from the matching block id on each side.
 */
export function diffDeployViewSlices(
  before: DeployViewSlice,
  after: DeployViewSlice,
): DiffedDeployView {
  const nodeDiff = new Map<string, NodeDiffMeta>();
  const edgeDiff = new Map<string, EdgeDiffMeta>();
  const containerDiff = new Map<string, DiffState>();

  const containers = diffContainers(before.containers, after.containers, nodeDiff, containerDiff);
  const unclassifiedUnits = diffDeployUnits(
    before.unclassifiedUnits,
    after.unclassifiedUnits,
    nodeDiff,
  );
  const ghostEdges = diffGhostEdges(before.ghostEdges, after.ghostEdges, edgeDiff);

  const slice: DeployViewSlice = {
    deployLabel: after.deployLabel || before.deployLabel,
    containers,
    unclassifiedUnits,
    ghostEdges,
  };

  return { slice, nodes: nodeDiff, edges: edgeDiff, containers: containerDiff };
}
