import type { KrsNode } from "../types/ast.js";
import { nodeId } from "./anchored-edges.js";
import { isUnassignedSystem } from "./unassigned-system.js";
import type { ViewPath } from "./view-slice.js";

/** A {@link ViewPath} resolved to its nodes; see {@link resolveContainerChain}. */
export interface ResolvedContainerChain {
  /** `[system, …, container]`: the owning system (the `__unassigned__` pseudo-system for a top-level node) first, the container last. */
  ancestorChain: KrsNode[];
  /** Index of the first path segment below the system: 1 when `path[0]` is the system id, 0 when the path has no system segment. */
  startIndex: number;
}

/**
 * Walk `path` to its container node, returning the ancestor chain (the
 * container is the last element) or `null` when the path does not resolve.
 *
 * This is the one reader of a {@link ViewPath} (#3113): `extractView` and
 * `extractEntityView` (both in `view-extract.ts`) and the app's breadcrumb and
 * chat-level lookups all call it, so a path lands on the same node whichever of
 * them reads it.
 *
 * A path with no system segment names a top-level node first, because that is
 * the only node the writers (`nodePathIndex`, the root canvas's
 * `data-node-path`) leave the segment off for. It is walked from the
 * `__unassigned__` pseudo-system, then from the top-level services / domains a
 * caller without the pseudo-system passes separately, then from each real
 * system that owns the first segment, and the first walk that reaches the end
 * of the path wins. The real-system fallback keeps a path that omits its
 * system id resolving as it did, as long as no top-level node walks it too.
 */
export function resolveContainerChain(
  systems: readonly KrsNode[],
  path: ViewPath,
  unassignedServices: readonly KrsNode[] = [],
  unassignedDomains: readonly KrsNode[] = [],
): ResolvedContainerChain | null {
  if (systems.length === 0 || path.length === 0) return null;
  // A caller without the pseudo-system passes top-level nodes separately and
  // draws them in the first system's frame, so one may follow a system id too.
  const orphanAt = (i: number): KrsNode | undefined =>
    unassignedServices.find((c) => nodeId(c) === path[i]) ??
    unassignedDomains.find((c) => nodeId(c) === path[i]);

  const systemNode = systems.find((s) => s.id === path[0]);
  if (systemNode) {
    const resolved = walkContainerChain([systemNode], path, 1);
    if (resolved) return resolved;
    const orphan = orphanAt(1);
    return orphan ? walkContainerChain([systemNode, orphan], path, 2, 1) : null;
  }

  const unassigned = systems.find(isUnassignedSystem);
  if (unassigned) {
    const resolved = walkContainerChain([unassigned], path, 0);
    if (resolved) return resolved;
  }
  const orphan = orphanAt(0);
  if (orphan) {
    // Seeded with `systems[0]`, the frame these callers draw top-level nodes in.
    const resolved = walkContainerChain([systems[0], orphan], path, 1, 0);
    if (resolved) return resolved;
  }
  for (const system of systems) {
    if (system === unassigned || !system.children.some((c) => c.id === path[0])) continue;
    const resolved = walkContainerChain([system], path, 0);
    if (resolved) return resolved;
  }
  return null;
}

/**
 * Walk `path[from…]` down from the last node of `seed`. `startIndex` is the
 * index of the first segment below the system, which differs from `from` only
 * when the seed already holds a top-level node.
 */
function walkContainerChain(
  seed: KrsNode[],
  path: ViewPath,
  from: number,
  startIndex: number = from,
): ResolvedContainerChain | null {
  const ancestorChain = [...seed];
  let current = ancestorChain[ancestorChain.length - 1];
  for (let i = from; i < path.length; i++) {
    const child = current.children.find((c) => nodeId(c) === path[i]);
    if (!child) return null;
    ancestorChain.push(child);
    current = child;
  }
  return { ancestorChain, startIndex };
}
