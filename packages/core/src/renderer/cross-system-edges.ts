/**
 * Cross-system edges on the root view (#3440): the lines drawn between two
 * system frames after every frame has been placed and routed. Each frame's
 * collapse passes may fold the child an edge ends on into a stub, so the
 * frames record their folds as they are laid out and the edges re-anchor onto
 * them here (#1884 for groups, #2646 for categories).
 */
import type { KrsNode, KrsEdge } from "../types/ast.js";
import { withChildAnchoredEdges } from "../view/anchored-edges.js";
import type { ViewSlice } from "../view/view-slice.js";
import { markParallelBundles } from "./edge-routing-bundles.js";
import { nodePathIdentityKey } from "../parser/node-path.js";
import type { LayoutNode, LayoutEdge } from "./layout-types.js";

/** Where each system's folds sent its children, accumulated across systems. */
export interface CrossSystemRemap {
  /**
   * Endpoint id → collapse-stub id, so cross-system edges whose endpoint was
   * folded into a collapsed team re-anchor onto the stub instead of being
   * dropped (#1884; mirrors the single-system ghost-edge remap). Identity for
   * un-collapsed endpoints.
   * Keyed by `nodePathIdentityKey([<system id>, <child id>])`, not by the bare
   * child id: two systems may each hold a child of the same name, and since
   * #2646 they fold to *distinct* per-system stubs, so a bare key would let the
   * last system laid out decide where every other system's edge lands.
   */
  scoped: Map<string, string>;
  /**
   * The same folds keyed by bare child id, for the one endpoint whose system
   * cannot be established: compare mode keeps a *removed* cross-system edge from
   * the before slice, and the merged `systems` carry the after node's edges, so
   * that edge is in no system's list here. `null` marks a child id two systems
   * both fold, where the honest answer is "unknown" and the endpoint stays put
   * rather than anchoring onto an arbitrary system's stub.
   */
  unscoped: Map<string, string | null>;
  /**
   * Which system each cross-system edge starts in. `viewSlice.crossSystemEdges`
   * is flattened across systems and does not carry that, and the source endpoint
   * has to re-anchor onto *its own* system's stub. Keyed by edge identity, since
   * `withChildAnchoredEdges` hands back the model's own edge objects rather than
   * copies: `Alpha.Ext -> Gamma.Cli` and `Beta.Ext -> Gamma.Cli` are equal as
   * text and belong to different systems. A miss (compare mode's removed edges)
   * falls through to the unscoped map above.
   */
  source: Map<KrsEdge, string>;
}

export function createCrossSystemRemap(): CrossSystemRemap {
  return { scoped: new Map(), unscoped: new Map(), source: new Map() };
}

/**
 * Record one system's folded members → stub. Cross-system edges are a separate
 * list that neither collapse pass rewrites, so the re-anchor in
 * {@link layoutCrossSystemEdges} reads what each frame folded from here.
 * `foldEndpoint` is the frame's composed remap, category-first, matching the
 * order the two folds ran in: a category member that no longer exists cannot
 * also be folded into a group stub.
 */
export function recordSystemFolds(
  remap: CrossSystemRemap,
  sys: KrsNode,
  systemNodes: readonly KrsNode[],
  foldEndpoint: (id: string) => string,
): void {
  for (const n of systemNodes) {
    const mapped = foldEndpoint(n.id);
    if (mapped === n.id) continue;
    remap.scoped.set(nodePathIdentityKey([sys.id, n.id]), mapped);
    const prior = remap.unscoped.get(n.id);
    remap.unscoped.set(n.id, prior === undefined || prior === mapped ? mapped : null);
  }
  // Read from the declared set, not `systemRawEdges`: a frame's derived set
  // keeps only edges whose endpoints are both this frame's children, so every
  // qualified target is filtered out of it. Taking the provenance from there
  // would leave #2646's collapsed-endpoint re-anchor with no source system.
  for (const e of withChildAnchoredEdges(sys)) {
    if (e.to.includes(".")) remap.source.set(e, sys.id);
  }
}

/**
 * The root view's cross-system edges, from the placed cards in
 * `allLayoutNodes` (keyed by `nodePathIdentityKey([<system id>, <id>])`), in
 * `viewSlice.crossSystemEdges` order and already bundled per source system.
 */
export function layoutCrossSystemEdges(
  viewSlice: Pick<ViewSlice, "crossSystemEdges" | "crossSystemTargets">,
  remap: CrossSystemRemap,
  allLayoutNodes: ReadonlyMap<string, LayoutNode>,
): LayoutEdge[] {
  const out: LayoutEdge[] = [];
  // When a team is collapsed (#1884), an endpoint here may have been folded
  // into that team's stub — re-anchor onto the stub via the remap instead of
  // silently dropping the edge (mirrors the single-system ghost-edge remap;
  // TPL-1738: a collapsed node's edges must resolve both endpoints). De-dupe
  // *only* re-targeted edges (one stub can absorb several), so authored
  // parallel cross-system edges between two expanded nodes are untouched and
  // the un-collapsed path stays byte-identical.
  const seenCrossStub = new Set<string>();
  /**
   * Identity unless *that system's* copy of `id` was folded into a stub. A known
   * system is answered from its own fold alone — a miss there means that system
   * did not fold this child, not that another system's stub will do.
   */
  const remapCrossEndpoint = (systemId: string | undefined, id: string): string =>
    (systemId !== undefined
      ? remap.scoped.get(nodePathIdentityKey([systemId, id]))
      : remap.unscoped.get(id)) ?? id;
  // Bare-id fallback for an endpoint whose system is unknown (a compare-mode
  // edge present only in the before slice has no source system): answer only
  // when exactly one node on the root carries that id, never guess between
  // two (#2917, TPL-1352 "decide the fallback").
  const byBareId = new Map<string, LayoutNode | null>();
  for (const node of allLayoutNodes.values()) {
    byBareId.set(node.id, byBareId.has(node.id) ? null : node);
  }
  const uniqueByBareId = (id: string): LayoutNode | undefined => byBareId.get(id) ?? undefined;
  const nodeIn = (systemId: string | undefined, id: string): LayoutNode | undefined =>
    systemId !== undefined
      ? allLayoutNodes.get(nodePathIdentityKey([systemId, id]))
      : uniqueByBareId(id);
  // Cross-system edges are bundled per source system below; `from` is a bare
  // id, so one bundle over every system would fold two systems' same-named
  // `Api -> Other.Svc` together.
  const crossEdgesBySource = new Map<string | undefined, LayoutEdge[]>();
  for (const edge of viewSlice.crossSystemEdges) {
    const sourceSystem = remap.source.get(edge);
    const fromId = remapCrossEndpoint(sourceSystem, edge.from);
    // The root canvas draws a system's direct children only, so the target is
    // anchored on `path[1]` of the path view extraction resolved (#2577). For
    // the two-segment `Sys.Svc` that is the same id the first-dot split gave;
    // for a deeper target it is the service the target lives inside.
    const targetPath = viewSlice.crossSystemTargets.get(edge.to) ?? edge.to.split(".");
    const toService = targetPath[1] ?? targetPath[0];
    // The target system is `targetPath[0]`, so the qualified key is on hand.
    const toServiceRemapped = remapCrossEndpoint(targetPath[0], toService);
    const retargeted = fromId !== edge.from || toServiceRemapped !== toService;
    const toField =
      toServiceRemapped !== toService ? `${targetPath[0]}.${toServiceRemapped}` : edge.to;
    const fromNode = nodeIn(sourceSystem, fromId);
    // A two-segment target names its system in `targetPath[0]`; a one-segment
    // target (no system prefix) falls back to the unique bare id.
    const toNode = nodeIn(targetPath.length > 1 ? targetPath[0] : undefined, toServiceRemapped);
    if (!fromNode || !toNode) continue;
    if (retargeted) {
      // Two systems may now each keep an `Api` card that reaches the same
      // stub (#2917), so the de-dupe identity carries the source system: only
      // edges folded within one source system merge.
      const key = `${sourceSystem ?? ""}\u0000${fromId}->${toField}`;
      if (seenCrossStub.has(key)) continue;
      seenCrossStub.add(key);
    }
    const le: LayoutEdge = {
      from: fromId,
      to: toField,
      // A re-targeted edge stands for one-or-more real edges, so drop its label.
      label: retargeted ? undefined : edge.label,
      fromPoint: {
        x: fromNode.x + fromNode.width,
        y: fromNode.y + fromNode.height / 2,
      },
      toPoint: {
        x: toNode.x,
        y: toNode.y + toNode.height / 2,
      },
    };
    out.push(le);
    const group = crossEdgesBySource.get(sourceSystem);
    if (group) group.push(le);
    else crossEdgesBySource.set(sourceSystem, [le]);
  }

  // The anchor resolver answers `from` (a bare id in the source system); the
  // qualified `to` (`Sys.Svc`) never resolved before either, so the nudge keeps
  // falling back to the chord perpendicular for it.
  for (const [sourceSystem, edges] of crossEdgesBySource) {
    markParallelBundles(edges, (nodeId) => nodeIn(sourceSystem, nodeId));
  }
  return out;
}
