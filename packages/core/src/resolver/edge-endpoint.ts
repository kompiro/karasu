// ---------------------------------------------------------------------------
// Edge endpoint resolution (#2577, slice E of #2088).
//
// The last of the nine reference sites to move onto the shared suffix rule.
// It is also the only one that meets an existing *scope* rule head-on:
// ADR-2075 binds an endpoint to the peers of the block the edge is declared
// in, while the suffix rule by itself would let a reference reach anywhere.
//
// The two are reconciled by filtering, not by exempting. A qualified endpoint
// is not an escape hatch — its suffix candidates are narrowed to those whose
// **head segment** lands on a node the declaring scope can already see:
//
//     visible(C) = peers(C) ∪ peers(parent(C)) ∪ … ∪ { top-level roots }
//
// so a path means "descend from something visible", and reach stays determined
// by structure rather than by spelling. A bare endpoint keeps ADR-2075's
// verdict verbatim — its scope is `peers(C)`, not the folded set — which is
// what makes this change non-destructive: every qualified endpoint that parses
// today is `TopLevelSystem.Child`, and a top-level root is in `visible(C)` from
// everywhere, so no existing model changes verdict.
//
// Callers: `resolver/warnings.ts` (the scope / ambiguity / cross-system
// diagnostics) and `view/view-extract.ts` (ghost systems and cross-system
// edges), which used to split on the first dot and anchor `[systemId,
// directChild]` — the assumption this module retires.
// ---------------------------------------------------------------------------

import type { KrsFile, KrsNode, NodeIdPath } from "../types/ast.js";
import { collectDeclaredNodePaths, type DeclaredNodePath } from "../parser/reference-validation.js";
import {
  ambiguousNodePathCandidates,
  nodePathIdentityKey,
  resolveNodePathBySuffix,
} from "../parser/node-path.js";
import { synthesizeUnassignedSystem } from "../view/unassigned-system.js";

/**
 * Read an endpoint as written on {@link KrsEdge} into path segments.
 *
 * `KrsEdge.to` is a joined string, so this splits on `.` exactly like the
 * first-dot arithmetic it replaces — including the pre-existing quirk that a
 * quoted id containing a dot (`A -> "b.c"`) is indistinguishable from the
 * two-segment path (the caveat `nodePathKey` already carries). Keeping the
 * quirk is deliberate: slice E promises that no model changes verdict.
 */
export function edgeEndpointRef(endpoint: string): NodeIdPath {
  return endpoint.split(".");
}

/** Pre-computed scope sets and path lookups for one merged {@link KrsFile}. */
export interface EdgeEndpointIndex {
  /** Every declared node keyed by bare id, each entry carrying its full path. */
  readonly declared: Map<string, DeclaredNodePath[]>;
  /** Node instance -> its full path. */
  pathOf(node: KrsNode): NodeIdPath;
  /** Full path (identity key) -> the node declared there; first declaration wins. */
  nodeAt(path: readonly string[]): KrsNode | undefined;
  /** ADR-2075's `peers(C)`, as full-path identity keys. */
  peers(container: KrsNode): ReadonlySet<string>;
  /** `peers(C)` folded up the ancestor chain, plus every top-level root. */
  visible(container: KrsNode): ReadonlySet<string>;
}

/**
 * Build the scope index for a merged file. One walk; the peer and visible sets
 * are memoized per container because the detectors ask for the same container
 * once per endpoint.
 */
export function buildEdgeEndpointIndex(file: KrsFile): EdgeEndpointIndex {
  const declared = collectDeclaredNodePaths(file);
  const parentOf = new Map<KrsNode, KrsNode>();
  const pathOf = new Map<KrsNode, NodeIdPath>();
  const nodeAt = new Map<string, KrsNode>();

  const walk = (node: KrsNode, prefix: NodeIdPath): void => {
    const path = [...prefix, node.id];
    pathOf.set(node, path);
    const key = nodePathIdentityKey(path);
    // First declaration wins, matching the `nodeById` convention the scope
    // detector has always used for the same question.
    if (!nodeAt.has(key)) nodeAt.set(key, node);
    for (const child of node.children) {
      parentOf.set(child, node);
      walk(child, path);
    }
  };

  const topLevel = [
    ...file.services,
    ...file.domains,
    ...file.clients,
    ...file.databases,
    ...file.queues,
    ...file.storages,
  ];
  for (const system of file.systems) walk(system, []);
  for (const node of topLevel) walk(node, []);

  // Only top-level *domains* reach a real system's frame (the drawio exporter
  // splices `krsFile.domains` in beside the system's children), and every other
  // orphan is wrapped into the `__unassigned__` pseudo-system whose children are
  // peers of one another (ADR-681 / #2223). Both sets are read from their own
  // builders so the two definitions of "orphan peer" cannot drift — the same
  // reason ADR-2075 gave for reading the wrap set rather than re-deriving it.
  const orphanDomainKeys = file.domains.map((n) => nodePathIdentityKey([n.id]));
  const unassignedChildren = synthesizeUnassignedSystem(file)?.children ?? [];
  const orphanPeerIds = new Set(unassignedChildren.map((c) => c.id));
  const orphanPeerKeys = unassignedChildren.map((c) => nodePathIdentityKey([c.id]));

  // The top-level roots — systems and the orphan buckets. Folding these into
  // every `visible(C)` is the term that keeps today's `Sys.Child` resolving
  // from any depth, so lifting the parse cap adds reach without moving any
  // existing endpoint.
  const topLevelRootKeys = [
    ...file.systems.map((s) => nodePathIdentityKey([s.id])),
    ...topLevel.map((n) => nodePathIdentityKey([n.id])),
  ];

  const keyOf = (node: KrsNode): string => nodePathIdentityKey(pathOf.get(node) ?? [node.id]);
  const childKeys = (parent: KrsNode): string[] => {
    const base = pathOf.get(parent) ?? [parent.id];
    return parent.children.map((c) => nodePathIdentityKey([...base, c.id]));
  };

  const peersCache = new Map<KrsNode, Set<string>>();
  const peers = (container: KrsNode): Set<string> => {
    const cached = peersCache.get(container);
    if (cached) return cached;
    let result: Set<string>;
    if (container.kind === "system") {
      result = new Set([...childKeys(container), ...orphanDomainKeys]);
    } else {
      const parent = parentOf.get(container);
      if (parent) {
        // The container's own id is the self-anchored source of every edge the
        // parser accepts inside a service / domain / entity block.
        result = new Set([keyOf(container), ...childKeys(parent)]);
      } else {
        // A parentless block the wrap itself skips (a top-level `client`) is
        // drawn on no frame at all, so it has no peers to draw an edge to.
        result = orphanPeerIds.has(container.id)
          ? new Set([keyOf(container), ...orphanPeerKeys])
          : new Set([keyOf(container)]);
      }
    }
    peersCache.set(container, result);
    return result;
  };

  const visibleCache = new Map<KrsNode, Set<string>>();
  const visible = (container: KrsNode): Set<string> => {
    const cached = visibleCache.get(container);
    if (cached) return cached;
    const result = new Set<string>(topLevelRootKeys);
    for (let c: KrsNode | undefined = container; c !== undefined; c = parentOf.get(c)) {
      for (const key of peers(c)) result.add(key);
    }
    visibleCache.set(container, result);
    return result;
  };

  return {
    declared,
    pathOf: (node) => pathOf.get(node) ?? [node.id],
    nodeAt: (path) => nodeAt.get(nodePathIdentityKey(path)),
    peers,
    visible,
  };
}

/** What one endpoint reference resolved to at one declaring scope. */
export interface EdgeEndpointResolution {
  /** The reference as segments. */
  ref: NodeIdPath;
  /** Every suffix match in the model, before the scope filter. */
  matches: DeclaredNodePath[];
  /** The matches the declaring scope can actually reach. */
  inScope: DeclaredNodePath[];
  /**
   * Set when {@link inScope} holds 2+ matches that are NOT uniform in
   * (kind, depth) — the shared #2088 discriminator. A uniform multi-match is
   * the intentional broadcast ADR-927 / ADR-1566 legitimize and stays silent.
   */
  ambiguous?: DeclaredNodePath[];
}

/**
 * Resolve one endpoint reference at the scope that declared its edge.
 *
 * The scope set differs by reference length, and that difference is the whole
 * reconciliation with ADR-2075:
 *
 * - **length 1 (bare)** — `peers(C)`. ADR-2075's judgement, unchanged.
 * - **length 2+ (qualified)** — `visible(C)`, tested against the node the
 *   reference's *head* segment names (the ancestor of the match at depth
 *   `path.length - ref.length`). Qualification descends from something the
 *   scope can see; it does not escape the scope.
 *
 * Ambiguity is reported for qualified references only: a bare id keeps
 * ADR-2075's verdict, and peers are sibling-unique enough that a bare
 * multi-match is the pre-existing broadcast rather than a new question.
 */
export function resolveEdgeEndpoint(
  index: EdgeEndpointIndex,
  container: KrsNode,
  ref: NodeIdPath,
): EdgeEndpointResolution {
  const candidates = index.declared.get(ref[ref.length - 1]) ?? [];
  const matches = resolveNodePathBySuffix(ref, candidates);
  const scope = ref.length === 1 ? index.peers(container) : index.visible(container);
  const inScope = matches.filter((m) =>
    scope.has(nodePathIdentityKey(m.path.slice(0, m.path.length - ref.length + 1))),
  );
  const ambiguous = ref.length === 1 ? undefined : ambiguousNodePathCandidates(inScope);
  return { ref, matches, inScope, ...(ambiguous ? { ambiguous } : {}) };
}

/** Where a qualified endpoint lands, for the view that has to draw it as a ghost. */
export interface GhostEndpointMatch {
  /** The top-level system whose ghost frame draws the node. */
  system: KrsNode;
  /** The node the reference resolved to. */
  node: KrsNode;
  /** Its full path, rooted at the system id — also the ghost's layout key (#2548). */
  path: NodeIdPath;
  /** Nodes strictly between the system and {@link node}; empty for a direct child. */
  ancestors: KrsNode[];
}

/**
 * Resolve a qualified endpoint to the node it names and the top-level system
 * that frames it, for ghost rendering.
 *
 * This is the top-level-root term of `visible(C)` on its own: a ghost frame is
 * always a top-level system, so "matches whose head is a top-level root"
 * already answers the question, and the view does not need the declaring
 * container. For a two-segment `Sys.Child` the walk lands on exactly the node
 * `allSystems.find(…).children.find(…)` used to find — the paths are equal by
 * construction — so existing ghosts are byte-identical; depth is the only
 * thing that changes.
 *
 * Ties keep the first declaration, the same first-wins the ghost lookup has
 * always had; a genuinely ambiguous reference is reported by
 * {@link resolveEdgeEndpoint} rather than silently picked here.
 */
export function buildGhostEndpointResolver(
  systems: readonly KrsNode[],
): (ref: NodeIdPath) => GhostEndpointMatch | undefined {
  const entries: GhostEndpointMatch[] = [];
  for (const system of systems) {
    const walk = (node: KrsNode, prefix: NodeIdPath, ancestors: KrsNode[]): void => {
      const path = [...prefix, node.id];
      entries.push({ system, node, path, ancestors });
      const inner = [...ancestors, node];
      for (const child of node.children) walk(child, path, inner);
    };
    for (const child of system.children) walk(child, [system.id], []);
  }
  return (ref) => resolveNodePathBySuffix(ref, entries)[0];
}
