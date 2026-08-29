// ---------------------------------------------------------------------------
// Edge endpoint resolution (#2577, slice E of #2088).
//
// The last of the nine reference sites to move onto the shared suffix rule.
// It is also the only one that meets an existing *scope* rule head-on:
// ADR-2075 binds an endpoint to the peers of the block the edge is declared
// in, while the suffix rule by itself would let a reference reach anywhere.
//
// The two are reconciled by filtering, not by exempting. A qualified endpoint
// is not an escape hatch: to point inside another system you **name that
// system and descend from it**, so a qualified reference is the whole path
// from a top-level root down to the target. That is ADR-104's two-segment
// cross-system notation generalised along depth, and it leaves reach
// determined by structure rather than by spelling.
//
// A bare endpoint keeps ADR-2075's verdict verbatim — its scope is `peers(C)`.
// Together the two make the change non-destructive: every qualified endpoint
// that parsed before the cap lift is `TopLevelSystem.Child`, which is
// root-anchored by construction, so no existing model changes verdict.
//
// Anchoring is what keeps every accepted form drawable, so the condition is
// exactly the one the ghost renderer can satisfy: a path rooted at a `system`.
// A reference descending from a non-root peer (`Checkout.Payment` written
// beside `Checkout`), or one rooted at a top-level orphan (`Billing.Invoice`,
// where `Billing` is a bare `domain`), names a node no ghost frame can hold —
// so admitting it would resolve a reference the view then drops in silence,
// which is what TPL-2075 forbids. Both are reported instead.
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
  /** ADR-2075's `peers(C)`, as full-path identity keys. */
  peers(container: KrsNode): ReadonlySet<string>;
  /**
   * Whether a node is declared at this exact path *inside* a top-level
   * `system` — the ghost renderer's pool, expressed as the set it actually is.
   *
   * Not a test on the root segment's id: a top-level orphan may share its id
   * with a system (`domain Shop` beside `system Shop` both parse), and then an
   * id test admits the orphan's subtree, which the renderer still cannot draw.
   */
  isInsideSystem(path: readonly string[]): boolean;
}

/**
 * Build the scope index for a merged file. One walk; the peer sets are
 * memoized per container because the detectors ask for the same container once
 * per endpoint.
 */
export function buildEdgeEndpointIndex(file: KrsFile): EdgeEndpointIndex {
  const declared = collectDeclaredNodePaths(file);
  const parentOf = new Map<KrsNode, KrsNode>();
  const pathOf = new Map<KrsNode, NodeIdPath>();
  /**
   * Paths of the nodes a system frame can draw — the system's descendants,
   * excluding the system itself. Collected on this walk rather than derived
   * from the root id, so it stays the same set the ghost resolver builds.
   */
  const insideSystem = new Set<string>();

  const walk = (node: KrsNode, prefix: NodeIdPath, underSystem: boolean): void => {
    const path = [...prefix, node.id];
    pathOf.set(node, path);
    if (underSystem) insideSystem.add(nodePathIdentityKey(path));
    for (const child of node.children) {
      parentOf.set(child, node);
      walk(child, path, underSystem);
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
  for (const system of file.systems) {
    // The system is the frame, not something drawn inside one, so it seeds the
    // walk without joining `insideSystem`.
    pathOf.set(system, [system.id]);
    for (const child of system.children) {
      parentOf.set(child, system);
      walk(child, [system.id], true);
    }
  }
  for (const node of topLevel) walk(node, [], false);

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

  return {
    declared,
    pathOf: (node) => pathOf.get(node) ?? [node.id],
    peers,
    isInsideSystem: (path) => insideSystem.has(nodePathIdentityKey(path)),
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
 * The two spellings answer to different sets, and that difference is the whole
 * reconciliation with ADR-2075:
 *
 * - **length 1 (bare)** — must be in `peers(C)`. ADR-2075's judgement,
 *   unchanged.
 * - **length 2+ (qualified)** — must spell the whole path from a top-level
 *   `system` down to the target: `ref.length === path.length`, and the node it
 *   names must actually sit inside a system. Naming a system and descending
 *   from it is the only way to reach inside it, at any depth.
 *
 *   Both halves matter, and for the same reason — a ghost frame *is* a
 *   top-level system. A path rooted at a top-level orphan (`Billing.Invoice`,
 *   where `Billing` is a bare `domain`) has no frame to be drawn in, so
 *   admitting it would resolve a reference the renderer then drops in silence.
 *   That makes this condition exactly the ghost resolver's, which is what lets
 *   the checker and the view agree on every reference.
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
  const inScope =
    ref.length === 1
      ? matches.filter((m) => index.peers(container).has(nodePathIdentityKey(m.path)))
      : matches.filter((m) => m.path.length === ref.length && index.isInsideSystem(m.path));
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
 * Walks systems only and takes the same full-path condition
 * {@link resolveEdgeEndpoint} applies, so the two answer one question with one
 * rule: a reference is cross-system exactly when it spells a path from a
 * top-level `system`. Neither side can accept what the other rejects. Without
 * that agreement the checker resolves references the view then drops — the
 * failure this module was extracted to make impossible.
 *
 * For a two-segment `Sys.Child` the walk lands on exactly the node
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
  return (ref) => resolveNodePathBySuffix(ref, entries).find((m) => m.path.length === ref.length);
}
