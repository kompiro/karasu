import type { KrsEdge, KrsNode } from "../types/ast.js";
import type { ViewSlice } from "../view/view-extract.js";

export type DiffState = "unchanged" | "added" | "removed" | "changed";

export interface NodeDiffMeta {
  state: DiffState;
  changes?: {
    label?: { before?: string; after?: string };
    annotations?: { added: string[]; removed: string[] };
    description?: { before?: string; after?: string };
  };
}

export interface EdgeDiffMeta {
  state: DiffState;
}

export interface DiffedView {
  /** Union ViewSlice — passed to the existing layout/render pipeline. */
  slice: ViewSlice;
  /** Diff state keyed by node id. Includes ghost users and child nodes. */
  nodes: Map<string, NodeDiffMeta>;
  /**
   * Diff state keyed by `${from}->${to}`.
   * Matches the LayoutEdge identification used by svg-renderer; sync/async
   * pairs that share endpoints are treated as a single edge for diff purposes.
   */
  edges: Map<string, EdgeDiffMeta>;
}

export function edgeKey(edge: Pick<KrsEdge, "from" | "to">): string {
  return `${edge.from}->${edge.to}`;
}

function nodeChanges(before: KrsNode, after: KrsNode): NodeDiffMeta["changes"] | undefined {
  const out: NonNullable<NodeDiffMeta["changes"]> = {};
  if ((before.label ?? "") !== (after.label ?? "")) {
    out.label = { before: before.label, after: after.label };
  }
  const beforeAnn = new Set(before.annotations);
  const afterAnn = new Set(after.annotations);
  const added = [...afterAnn].filter((a) => !beforeAnn.has(a));
  const removed = [...beforeAnn].filter((a) => !afterAnn.has(a));
  if (added.length > 0 || removed.length > 0) {
    out.annotations = { added, removed };
  }
  const beforeDesc = before.properties.description;
  const afterDesc = after.properties.description;
  if ((beforeDesc ?? "") !== (afterDesc ?? "")) {
    out.description = { before: beforeDesc, after: afterDesc };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function diffNodeArray(
  before: readonly KrsNode[],
  after: readonly KrsNode[],
  diff: Map<string, NodeDiffMeta>,
): KrsNode[] {
  const beforeById = new Map(before.map((n) => [n.id, n]));
  const merged: KrsNode[] = [];
  const seen = new Set<string>();

  // Iterate in `after` order first so the union slice presents the new structure.
  for (const node of after) {
    const prev = beforeById.get(node.id);
    if (prev === undefined) {
      diff.set(node.id, { state: "added" });
      merged.push(node);
    } else {
      const changes = nodeChanges(prev, node);
      diff.set(node.id, { state: changes ? "changed" : "unchanged", changes });
      merged.push(node);
    }
    seen.add(node.id);
  }
  // Append removed nodes preserving their original order.
  for (const node of before) {
    if (seen.has(node.id)) continue;
    diff.set(node.id, { state: "removed" });
    merged.push(node);
  }
  return merged;
}

function diffEdgeArray(
  before: readonly KrsEdge[],
  after: readonly KrsEdge[],
  diff: Map<string, EdgeDiffMeta>,
): KrsEdge[] {
  const beforeByKey = new Map(before.map((e) => [edgeKey(e), e]));
  const merged: KrsEdge[] = [];
  const seen = new Set<string>();

  for (const edge of after) {
    const key = edgeKey(edge);
    diff.set(key, { state: beforeByKey.has(key) ? "unchanged" : "added" });
    merged.push(edge);
    seen.add(key);
  }
  for (const edge of before) {
    const key = edgeKey(edge);
    if (seen.has(key)) continue;
    diff.set(key, { state: "removed" });
    merged.push(edge);
  }
  return merged;
}

/**
 * Produce a union ViewSlice of two system view slices plus per-element diff state.
 *
 * The merged slice contains every node and edge from either side, ordered with
 * the "after" elements first, so the existing layout engine lays out a single
 * graph in which unchanged elements have stable positions while added/removed
 * elements appear in the same neighborhood as their context.
 *
 * Aggregated implicit edges, ghost domains/systems, and resource label maps
 * are taken from `after` for now — refining their diff semantics is tracked
 * separately (see `docs/design/graphical-diff-viewer.md`).
 */
export function diffSystemViewSlices(before: ViewSlice, after: ViewSlice): DiffedView {
  const nodeDiff = new Map<string, NodeDiffMeta>();
  const edgeDiff = new Map<string, EdgeDiffMeta>();

  const childNodes = diffNodeArray(before.childNodes, after.childNodes, nodeDiff);
  const childEdges = diffEdgeArray(before.childEdges, after.childEdges, edgeDiff);
  const systems = diffNodeArray(before.systems, after.systems, nodeDiff);
  const crossSystemEdges = diffEdgeArray(before.crossSystemEdges, after.crossSystemEdges, edgeDiff);
  const ghostUsers = diffNodeArray(before.ghostUsers, after.ghostUsers, nodeDiff);
  const ghostUserEdges = diffEdgeArray(before.ghostUserEdges, after.ghostUserEdges, edgeDiff);

  const slice: ViewSlice = {
    containerNode: after.containerNode,
    childNodes,
    childEdges,
    ancestorChain: after.ancestorChain,
    ghostUsers,
    ghostUserEdges,
    systems,
    crossSystemEdges,
    ghostSystems: after.ghostSystems,
    ghostSystemEdges: after.ghostSystemEdges,
    callerGhostSystems: after.callerGhostSystems,
    callerGhostSystemEdges: after.callerGhostSystemEdges,
    ghostDomains: after.ghostDomains,
    ghostDomainEdges: after.ghostDomainEdges,
    resourceLabelMap: after.resourceLabelMap,
    resourceInferredTagsMap: after.resourceInferredTagsMap,
    implicitEdgeDetails: after.implicitEdgeDetails,
  };

  return { slice, nodes: nodeDiff, edges: edgeDiff };
}
