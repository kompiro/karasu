import type { DeployBlock, DeployNode, NodeIdPath, SystemNode } from "../types/ast.js";
import type { EdgeKind } from "../types/ast.js";
import { deriveInfraEdges } from "./view-extract.js";
import {
  nodePathIdentityKey,
  nodePathRefId,
  resolveNodePathBySuffix,
} from "../parser/node-path.js";

export interface DeployContainer {
  /** The service id that these units realize */
  serviceId: string;
  /**
   * The realized node's own id, set only when that id names this container's
   * nodes and nothing else.
   *
   * A consumer that matches a container against the node it realizes — the
   * system view's deploy-jump button, the draw.io metadata lookup — keys on
   * this, not on {@link serviceId}. `serviceId` is the container's identity,
   * and identity can need spelling a node's own id space has no word for: a
   * qualified path when two containers share the bare id (#2549), quotes when
   * a segment carries the separator (#2714).
   *
   * Unset in the two cases where a bare id would over-answer:
   *
   * - another container answers to the same bare id (the case #2549 qualified),
   * - the ref **narrowed** to one of several same-named nodes
   *   (`realizes Shop.Api` while an `Admin.Api` also exists), whether or not
   *   that other node is deployed. Matching on the bare id would light both.
   *
   * A bare ref that resolves to several same-named nodes keeps its id: that is
   * broadcast (ADR-927 / ADR-1566), and the container does realize them all.
   */
  nodeId?: string;
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

  // The nodes a `realizes` ref can name at container granularity: system-level
  // children, keyed by full path. Two systems' same-named services are two
  // nodes here, which is what lets a qualified ref pick one of them.
  const candidates: { path: NodeIdPath; label: string }[] = [];
  const labelByBareId = new Map<string, string>();
  // How many of them answer to each bare id — what decides whether a bare id
  // can be handed to a consumer that matches nodes by it (see `nodeId`).
  const candidatesByBareId = new Map<string, number>();
  for (const system of systems) {
    for (const child of system.children) {
      candidates.push({ path: [system.id, child.id], label: child.label ?? child.id });
      labelByBareId.set(child.id, child.label ?? child.id);
      candidatesByBareId.set(child.id, (candidatesByBareId.get(child.id) ?? 0) + 1);
    }
  }

  // Group units by realizes target
  interface RealizesGroup {
    /** Last segment of the ref — the container's display id when nothing collides. */
    bareId: string;
    /** Full path of the node the ref resolved to, when it named exactly one. */
    path?: NodeIdPath;
    label?: string;
    units: DeployNode[];
  }
  const groupedByRealizes = new Map<string, RealizesGroup>();
  const unclassifiedUnits: DeployNode[] = [];
  // `${unit index}\u0000${container key}` for every membership already made,
  // so the guard below costs one lookup instead of a scan of the container's
  // units — the same shape `deriveDeliversEdges` uses for `service -> client`.
  const seenMembership = new Set<string>();

  for (const [unitIndex, unit] of deployBlock.nodes.entries()) {
    const realizes = unit.properties.realizes;
    if (realizes && realizes.length > 0) {
      for (const target of realizes) {
        // Containers group by the node a ref RESOLVES to, not by the ref's
        // last segment (#2549): grouping by id merged `realizes TenantA.Api`
        // and `realizes TenantB.Api` into one container carrying whichever
        // label was walked last, so the narrowing the qualified form exists to
        // express was inert in the view that consumes `realizes`. A ref that
        // resolves to nothing (a top-level service, shared infra) or to
        // several nodes (uniform broadcast) still groups by id, as before.
        const bareId = target.path[target.path.length - 1];
        const matches = resolveNodePathBySuffix(target.path, candidates);
        const resolved = matches.length === 1 ? matches[0] : undefined;
        const key = resolved ? nodePathIdentityKey(resolved.path) : bareId;
        let group = groupedByRealizes.get(key);
        if (!group) {
          group = {
            bareId,
            ...(resolved ? { path: resolved.path, label: resolved.label } : {}),
            units: [],
          };
          groupedByRealizes.set(key, group);
        }
        // One unit joins one container once (#2552). The parser already drops
        // a target spelled identically twice, but the key here is the node a
        // ref RESOLVES to, so two refs it cannot collapse — `realizes Api` and
        // `realizes Shop.Api`, each carrying its own range for
        // `unresolved-realizes` / `realizes-target-ambiguous` — still arrive
        // at one container. Membership is idempotent, the way
        // `deriveDeliversEdges` keeps one `service -> client` edge per pair.
        const membership = `${unitIndex}\u0000${key}`;
        if (seenMembership.has(membership)) continue;
        seenMembership.add(membership);
        group.units.push(unit);
      }
    } else {
      unclassifiedUnits.push(unit);
    }
  }

  // A container's id is the bare node id, which is what the deploy view has
  // always drawn and what its anchors are built from. Only when two containers
  // would answer to the same bare id does the qualified path take over, and
  // only for those two: an unqualified model keeps every id it had.
  //
  // Both forms are emitted through `nodePathRefId`, not a plain join: the id
  // is what tells two containers apart (`containerCenterX`, the SVG's
  // `data-container-id`, the diff's per-container key), so the way a path is
  // flattened into it has to be injective. A plain join is not — a quoted id
  // that itself contains a dot spells the same string as a qualified path, and
  // `realizes "Shop.Api"` then landed on the container `realizes Shop.Api`
  // built (#2714). Quoting only the segments that would make the join
  // ambiguous costs nothing anywhere else: a non-empty id with no `.`, `"` or
  // `\` in it is emitted exactly as before.
  const groupsByBareId = new Map<string, number>();
  for (const group of groupedByRealizes.values()) {
    groupsByBareId.set(group.bareId, (groupsByBareId.get(group.bareId) ?? 0) + 1);
  }
  const qualifyingPathOf = (group: RealizesGroup): NodeIdPath | undefined =>
    group.path !== undefined && (groupsByBareId.get(group.bareId) ?? 0) > 1
      ? group.path
      : undefined;
  const containerIdOf = (group: RealizesGroup): string =>
    nodePathRefId(qualifyingPathOf(group) ?? [group.bareId]);
  // The bare id a consumer may match a *node* by, or undefined when it would
  // answer for more nodes than this container realizes. A narrowing ref is the
  // case counting containers misses: `realizes Shop.Api` with no `Admin.Api`
  // container still must not light `Admin.Api`'s deploy button, because the id
  // `Api` reaches both nodes and only one of them is deployed.
  const matchableNodeIdOf = (group: RealizesGroup): string | undefined => {
    if (qualifyingPathOf(group) !== undefined) return undefined;
    const narrowsToOneOfSeveral =
      group.path !== undefined && (candidatesByBareId.get(group.bareId) ?? 0) > 1;
    return narrowsToOneOfSeveral ? undefined : group.bareId;
  };

  // Build containers
  const containers: DeployContainer[] = [];
  const containerIdByPath = new Map<string, string>();
  const containerIdByBareId = new Map<string, string>();
  for (const group of groupedByRealizes.values()) {
    const serviceId = containerIdOf(group);
    if (group.path) containerIdByPath.set(nodePathIdentityKey(group.path), serviceId);
    if (!containerIdByBareId.has(group.bareId)) containerIdByBareId.set(group.bareId, serviceId);
    // A container is a job band member only when *every* unit is a `job`. A
    // mixed container (job + other kinds) stays on the dependency DAG so its
    // `realizes`-labelled cluster is not split (#1738).
    const isJobOnly = group.units.length > 0 && group.units.every((u) => u.kind === "job");
    containers.push({
      serviceId,
      ...(matchableNodeIdOf(group) === undefined ? {} : { nodeId: group.bareId }),
      serviceLabel: group.label ?? labelByBareId.get(group.bareId) ?? group.bareId,
      units: group.units,
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
  const ghostEdges: DeployGhostEdge[] = [];
  const seenGhost = new Set<string>();

  // An endpoint is a bare id in its system's scope, so it addresses a
  // container by path first (the id alone cannot tell two systems' same-named
  // services apart) and falls back to the id for endpoints with no system
  // context — the top-level infra `deriveInfraEdges` reaches.
  const containerIdFor = (endpointId: string, systemId?: string): string | undefined =>
    (systemId !== undefined
      ? containerIdByPath.get(nodePathIdentityKey([systemId, endpointId]))
      : undefined) ?? containerIdByBareId.get(endpointId);

  const pushGhost = (
    edge: { from: string; to: string; label?: string; kind: EdgeKind },
    systemId?: string,
  ): void => {
    const from = containerIdFor(edge.from, systemId);
    const to = containerIdFor(edge.to, systemId);
    if (from === undefined || to === undefined) return;
    // `\u0000` and not `->`: both halves are author-chosen ids, and an id may
    // contain the arrow (`service "b->c"` needs no quoting, holding no `.`).
    const key = `${from}\u0000${to}`;
    if (seenGhost.has(key)) return;
    seenGhost.add(key);
    ghostEdges.push({ from, to, label: edge.label, kind: edge.kind });
  };

  for (const system of systems) {
    for (const edge of system.edges) {
      pushGhost({ from: edge.from, to: edge.to, label: edge.label, kind: edge.kind }, system.id);
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
