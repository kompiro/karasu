import type { KrsNode, KrsEdge, NodeIdPath, ResourceNode } from "../types/ast.js";
import { INFRA_KIND_SET } from "../types/ast.js";
import { nodePathKey } from "../parser/node-path.js";
import {
  buildGhostEndpointResolver,
  edgeEndpointRef,
  type GhostEndpointMatch,
} from "../resolver/edge-endpoint.js";
import { isWriteOperation } from "../spec/operations.js";
import { buildEntityResolver, type EntityResolver } from "../resolver/resource-entity.js";
import {
  collectAnchoredPeerEdges,
  containerCanvasEdges,
  drawnEdgeKey,
  nodeId,
  withChildAnchoredEdges,
} from "./anchored-edges.js";
import {
  buildDomainServiceMap,
  deriveCanvasEdges,
  deriveDeliversEdges,
  deriveImplicitServiceEdges,
  deriveInfraEdges,
} from "./derived-edges.js";
import { projectStoreRelations, unionProjectedRelations } from "./entity-relations.js";
import { resolveContainerChain } from "./view-path.js";
import {
  emptySlice,
  type ExpandedFrame,
  type GhostDomain,
  type GhostSystem,
  type SystemFrameEdges,
  type ViewPath,
  type ViewSlice,
} from "./view-slice.js";

/**
 * At domain level: collect resource nodes with dot-notation refs from each usecase child,
 * deduplicate by ID, and produce synthetic usecase→resource edges.
 * Used to promote sub-resources to sibling level in the UseCase diagram.
 */
function deriveUsecaseResourceNodes(
  usecases: KrsNode[],
  tagMap: ReadonlyMap<string, string>,
  resolver: EntityResolver,
): { resourceNodes: KrsNode[]; edges: KrsEdge[] } {
  const resourceMap = new Map<string, KrsNode>();
  // Last-wins: a later declaration of the same (usecase, resource) pair
  // overrides the earlier classification. This mirrors how cascading
  // stylesheets resolve conflicts and lets authors override an inherited
  // classification by re-stating the resource with different operations.
  const edgeMap = new Map<string, KrsEdge>();

  for (const usecase of usecases) {
    if (usecase.kind !== "usecase") continue;
    for (const resource of usecase.children) {
      if (resource.kind !== "resource") continue;
      const resNode = resource as ResourceNode;
      // Promote a resource once it is *resolved*: physical dot-notation, or a
      // bare id that resolves to a unique entity (the canonical logical form).
      // Unresolved / ambiguous / [external] bare resources stay unpromoted, as
      // before — their unassigned-resource warning is raised by the resolver.
      if (!resNode.ref && resolver.resolve(resNode).entityId === undefined) continue;

      if (!resourceMap.has(resource.id)) {
        resourceMap.set(resource.id, applyInferredTagsDeep(resource, tagMap));
      }
      const key = `${usecase.id}->${resource.id}`;
      const isWrite = isWriteOperation(resNode.properties.operations);
      edgeMap.set(key, {
        from: usecase.id,
        to: resource.id,
        kind: "sync",
        tags: [isWrite ? "write" : "read"],
        label: isWrite ? "W" : "R",
        syntheticLabel: true,
        loc: resource.loc,
        ...(resNode.authorId !== undefined ? { authorId: resNode.authorId } : {}),
      });
    }
  }

  return { resourceNodes: Array.from(resourceMap.values()), edges: Array.from(edgeMap.values()) };
}

/** Maps infra sub-resource kind to the style tag used in resource[tag] rules. */
const KIND_TO_INFERRED_TAG: Partial<Record<string, string>> = {
  table: "table",
  "queue-item": "queue",
  bucket: "storage",
};

/**
 * Build a map from dot-notation resource IDs (e.g. "OrderDB.OrderTable") to the
 * inferred style tag (e.g. "table") derived from the referenced sub-resource kind.
 */
function buildResourceInferredTagsMap(systems: KrsNode[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const system of systems) {
    for (const node of system.children) {
      if (!INFRA_KIND_SET.has(node.kind)) continue;
      for (const sub of node.children) {
        const tag = KIND_TO_INFERRED_TAG[sub.kind];
        if (tag) map.set(`${node.id}.${sub.id}`, tag);
      }
    }
  }
  return map;
}

/**
 * Recursively apply inferred tags to all resource nodes in a subtree that have a
 * dot-notation ref but no explicit tags. Explicit tags always take precedence.
 * Non-resource interior nodes are shallow-copied only when their children changed.
 */
function applyInferredTagsDeep(node: KrsNode, tagMap: ReadonlyMap<string, string>): KrsNode {
  const patchedChildren =
    node.children.length > 0
      ? node.children.map((c) => applyInferredTagsDeep(c, tagMap))
      : node.children;
  const childrenChanged = patchedChildren.some((c, i) => c !== node.children[i]);

  if (node.kind === "resource" && node.tags.length === 0 && node.ref) {
    const inferredTag = tagMap.get(node.id);
    if (inferredTag) {
      return {
        ...node,
        children: childrenChanged ? patchedChildren : node.children,
        tags: [inferredTag],
      };
    }
  }

  if (childrenChanged) return { ...node, children: patchedChildren };
  return node;
}

/**
 * Apply inferred tags to all resource nodes (at any depth) that have a dot-notation ref
 * but no explicit tags. Nodes with explicit tags are returned unchanged.
 */
function applyInferredTags(nodes: KrsNode[], tagMap: ReadonlyMap<string, string>): KrsNode[] {
  if (tagMap.size === 0) return nodes;
  return nodes.map((node) => applyInferredTagsDeep(node, tagMap));
}

/**
 * Build a map from dot-notation resource IDs (e.g. "OrderDB.OrderTable") to the
 * label of the referenced infra sub-resource (e.g. "注文テーブル").
 * Covers database/queue/storage nodes and their children across all systems.
 */
function buildResourceLabelMap(systems: KrsNode[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const system of systems) {
    for (const node of system.children) {
      if (!INFRA_KIND_SET.has(node.kind)) continue;
      for (const sub of node.children) {
        const key = `${node.id}.${sub.id}`;
        map.set(key, sub.label ?? sub.id);
      }
    }
  }
  return map;
}

/**
 * Find all services in other systems that have a cross-system edge targeting
 * `containerSystemId.containerId`. Returns caller ghost systems (rendered to the
 * left of the container) and synthetic edges in the form:
 *   from = "CallerSystemId.CallerServiceId", to = containerId
 */
function buildCallerGhostSystems(
  containerId: string,
  containerSystemId: string,
  allSystems: KrsNode[],
  resolveGhost: (ref: NodeIdPath) => GhostEndpointMatch | undefined,
): { callerGhostSystems: GhostSystem[]; callerGhostSystemEdges: KrsEdge[] } {
  const targetKey = nodePathKey([containerSystemId, containerId]);
  const map = new Map<string, GhostSystem>();
  const edges: KrsEdge[] = [];

  for (const sys of allSystems) {
    if (sys.id === containerSystemId) continue;
    // Service-anchored edges count as callers too (#2223).
    for (const edge of withChildAnchoredEdges(sys)) {
      if (!edge.to.includes(".")) continue;
      // Match on where the reference *resolves*, not on how it is spelled: a
      // caller may now name this container by any suffix that reaches it
      // (#2577). For `Sys.Child` the resolved path is that same string, so
      // existing caller frames are unchanged.
      const match = resolveGhost(edgeEndpointRef(edge.to));
      if (!match || nodePathKey(match.path) !== targetKey) continue;
      const callerService = sys.children.find((c) => c.id === edge.from);
      if (!callerService) continue;
      const callerPath = [sys.id, callerService.id];
      if (!map.has(sys.id)) {
        map.set(sys.id, { systemNode: sys, visibleServices: [] });
      }
      const gs = map.get(sys.id)!;
      if (!gs.visibleServices.some((s) => s.node.id === callerService.id)) {
        gs.visibleServices.push({ node: callerService, path: callerPath });
      }
      // Qualify the from-ID so layout can find it in layoutNodes by qualified key
      edges.push({ ...edge, from: nodePathKey(callerPath), to: containerId });
    }
  }
  return {
    callerGhostSystems: Array.from(map.values()),
    callerGhostSystemEdges: edges,
  };
}

/** The separator between ancestor labels on a deep ghost's sub-label. */
const GHOST_PATH_SEPARATOR = " › ";

/** Muted "where this actually lives" line for a ghost below the frame's top level. */
function ghostSubLabel(match: GhostEndpointMatch): string | undefined {
  if (match.ancestors.length === 0) return undefined;
  return match.ancestors.map((a) => a.label ?? a.id).join(GHOST_PATH_SEPARATOR);
}

function buildGhostSystems(
  edges: KrsEdge[],
  resolveGhost: (ref: NodeIdPath) => GhostEndpointMatch | undefined,
): GhostSystem[] {
  const map = new Map<string, GhostSystem>();
  for (const edge of edges) {
    if (!edge.to.includes(".")) continue;
    const match = resolveGhost(edgeEndpointRef(edge.to));
    if (!match) continue;
    const sysId = match.system.id;
    if (!map.has(sysId)) {
      map.set(sysId, { systemNode: match.system, visibleServices: [] });
    }
    const gs = map.get(sysId)!;
    const key = nodePathKey(match.path);
    if (!gs.visibleServices.some((s) => nodePathKey(s.path) === key)) {
      const subLabel = ghostSubLabel(match);
      gs.visibleServices.push({
        node: match.node,
        path: match.path,
        ...(subLabel !== undefined ? { subLabel } : {}),
      });
    }
  }
  return Array.from(map.values());
}

/**
 * Collect ghost domain nodes for the service drill-down view.
 * A ghost domain is a domain node in another service that is connected to
 * this service's domains via a cross-service domain edge (outgoing or incoming).
 *
 * Returns:
 *   ghostDomains — unique foreign GhostDomain entries (node + parentServiceLabel)
 *   ghostDomainEdges — the cross-service edges (original from/to domain IDs preserved)
 */
function buildGhostDomains(
  containerId: string,
  system: KrsNode,
): { ghostDomains: GhostDomain[]; ghostDomainEdges: KrsEdge[] } {
  const allServices = system.children.filter((c) => c.kind === "service");
  const domainServiceMap = buildDomainServiceMap(allServices);
  const localDomainIds = new Set(
    allServices
      .find((s) => s.id === containerId)
      ?.children.filter((c) => c.kind === "domain")
      .map((c) => c.id) ?? [],
  );

  const ghostDomainMap = new Map<string, GhostDomain>();
  const ghostDomainEdges: KrsEdge[] = [];

  // Outgoing: edges from this service's domains to domains in other services
  const containerService = allServices.find((s) => s.id === containerId);
  if (containerService) {
    for (const domain of containerService.children) {
      if (domain.kind !== "domain") continue;
      for (const edge of domain.edges) {
        const targetServiceId = domainServiceMap.get(edge.to);
        if (!targetServiceId || targetServiceId === containerId) continue;
        if (!ghostDomainMap.has(edge.to)) {
          const targetService = allServices.find((s) => s.id === targetServiceId);
          const foreignDomain = targetService?.children.find(
            (c) => c.kind === "domain" && c.id === edge.to,
          );
          if (foreignDomain) {
            ghostDomainMap.set(edge.to, {
              node: foreignDomain,
              parentServiceLabel: targetService?.label ?? targetServiceId,
            });
          }
        }
        ghostDomainEdges.push(edge);
      }
    }
  }

  // Incoming: edges from domains in other services into this service's domains
  for (const service of allServices) {
    if (service.id === containerId) continue;
    for (const domain of service.children) {
      if (domain.kind !== "domain") continue;
      for (const edge of domain.edges) {
        if (!localDomainIds.has(edge.to)) continue;
        if (!ghostDomainMap.has(domain.id)) {
          ghostDomainMap.set(domain.id, {
            node: domain,
            parentServiceLabel: service.label ?? service.id,
          });
        }
        ghostDomainEdges.push(edge);
      }
    }
  }

  return {
    ghostDomains: Array.from(ghostDomainMap.values()),
    ghostDomainEdges,
  };
}

/**
 * Shared context threaded through the {@link extractView} phase helpers:
 * model-wide maps and resolvers that don't vary across the orphan / root /
 * drill-down branches, nor across the paths of one model. The shared part is
 * built by {@link createViewExtractor} (or once per {@link extractView} call);
 * `empty` is fresh per call.
 */
interface ViewExtractContext {
  resourceLabelMap: ReadonlyMap<string, string>;
  resourceInferredTagsMap: ReadonlyMap<string, string>;
  empty: ViewSlice;
  entityResolver: EntityResolver;
  /**
   * Resolves a qualified endpoint to the node and the top-level system that
   * frames it (#2577). Built once per model, like `entityResolver`: the
   * walk is over every system and each ghost lookup would otherwise repeat it.
   */
  ghostEndpoint: (ref: NodeIdPath) => GhostEndpointMatch | undefined;
}

interface PromotedChildren {
  childNodes: KrsNode[];
  childEdges: KrsEdge[];
}

/**
 * Child-collection phase, shared by the orphan drill-down and system
 * drill-down branches: at domain level, promote resource nodes with
 * dot-notation refs to sibling level (via {@link deriveUsecaseResourceNodes})
 * so they appear as connected nodes in the UseCase diagram. Entities are
 * excluded at every container kind — they render only in the (separate)
 * entity view, so keeping them out here avoids stray unstyled boxes and a
 * collision with an entity-resolved bare `resource` promoted above (which
 * shares the entity's id).
 */
function collectPromotedChildren(
  container: KrsNode,
  edges: KrsEdge[],
  resourceInferredTagsMap: ReadonlyMap<string, string>,
  entityResolver: EntityResolver,
): PromotedChildren {
  const renderableChildren = container.children.filter((c) => c.kind !== "entity");
  let childNodes = applyInferredTags(renderableChildren, resourceInferredTagsMap);
  let childEdges = edges;
  if (container.kind === "domain") {
    const { resourceNodes, edges: resourceEdges } = deriveUsecaseResourceNodes(
      renderableChildren,
      resourceInferredTagsMap,
      entityResolver,
    );
    if (resourceNodes.length > 0) {
      childNodes = [...childNodes, ...resourceNodes];
      childEdges = [...edges, ...resourceEdges];
    }
  }
  return { childNodes, childEdges };
}

interface GhostSynthesis {
  ghostUsers: KrsNode[];
  ghostUserEdges: KrsEdge[];
  ghostSystems: GhostSystem[];
  ghostSystemEdges: KrsEdge[];
  callerGhostSystems: GhostSystem[];
  callerGhostSystemEdges: KrsEdge[];
  ghostDomains: GhostDomain[];
  ghostDomainEdges: KrsEdge[];
}

function emptyGhostSynthesis(): GhostSynthesis {
  return {
    ghostUsers: [],
    ghostUserEdges: [],
    ghostSystems: [],
    ghostSystemEdges: [],
    callerGhostSystems: [],
    callerGhostSystemEdges: [],
    ghostDomains: [],
    ghostDomainEdges: [],
  };
}

/**
 * Ghost-edge synthesis phase, service view only: builds every ghost category
 * (users, ghost systems, caller ghost systems, ghost domains) attached to
 * `containerNode`. Only called when the drill-down path resolves to service
 * granularity — see {@link extractSystemDrillDownView}'s `isServiceView` check.
 */
function synthesizeGhosts(
  containerNode: KrsNode,
  system: KrsNode,
  systems: KrsNode[],
  resolveGhost: (ref: NodeIdPath) => GhostEndpointMatch | undefined,
): GhostSynthesis {
  const containerId = nodeId(containerNode);
  // Service-anchored edges behave as system-scope edges (#2223), so every
  // system-scope lookup below reads them too.
  const systemScopeEdges = withChildAnchoredEdges(system);
  const users = system.children.filter((c) => c.kind === "user");
  const connectedEdges = systemScopeEdges.filter(
    (e) =>
      (users.some((p) => nodeId(p) === e.from) && e.to === containerId) ||
      (users.some((p) => nodeId(p) === e.to) && e.from === containerId),
  );
  const connectedUserIds = new Set(
    connectedEdges.flatMap((e) => {
      const ids: string[] = [];
      if (e.from !== containerId) ids.push(e.from);
      if (e.to !== containerId) ids.push(e.to);
      return ids;
    }),
  );
  const ghostUsers = users.filter((p) => connectedUserIds.has(nodeId(p)));
  const ghostUserEdges = connectedEdges;

  // Ghost systems: edges from this service to qualified targets in other known systems
  const candidateEdges = systemScopeEdges.filter(
    (e) => e.from === containerId && e.to.includes("."),
  );
  const ghostSystems = buildGhostSystems(candidateEdges, resolveGhost);
  // Only include edges that resolved to a known ghost system. Asking the
  // resolver again (rather than re-splitting the string) keeps this filter and
  // the frame it filters against on one definition of where a path lands.
  const ghostSystemEdges = candidateEdges.filter(
    (e) => resolveGhost(edgeEndpointRef(e.to)) !== undefined,
  );

  // Caller ghost systems: other systems that have edges pointing into this service
  const { callerGhostSystems, callerGhostSystemEdges } = buildCallerGhostSystems(
    containerId,
    system.id,
    systems,
    resolveGhost,
  );

  // Ghost domains: cross-service domain edges (both outgoing and incoming)
  const { ghostDomains, ghostDomainEdges } = buildGhostDomains(containerId, system);

  return {
    ghostUsers,
    ghostUserEdges,
    ghostSystems,
    ghostSystemEdges,
    callerGhostSystems,
    callerGhostSystemEdges,
    ghostDomains,
    ghostDomainEdges,
  };
}

/**
 * Among `allChildren`, find every service named in `expandedContainers`
 * (#1921) that actually has domain children — the ones eligible to be
 * spliced into the sibling grid as a boundary-frame band.
 */
function resolveExpandedServices(
  allChildren: KrsNode[],
  expandedContainers: ReadonlySet<string> | undefined,
): { expandedServices: Map<string, KrsNode>; expandedSet: ReadonlySet<string> | undefined } {
  const expandedServices = new Map<string, KrsNode>();
  if (expandedContainers && expandedContainers.size > 0) {
    for (const child of allChildren) {
      if (
        child.kind === "service" &&
        expandedContainers.has(child.id) &&
        child.children.some((c) => c.kind === "domain")
      ) {
        expandedServices.set(child.id, child);
      }
    }
  }
  const expandedSet = expandedServices.size > 0 ? new Set(expandedServices.keys()) : undefined;
  return { expandedServices, expandedSet };
}

/**
 * Expanded-frame construction phase: splice each expanded service's domains
 * into the sibling grid in place of the service node, and record the frame
 * band the layout draws around each contiguous member band.
 */
function spliceExpandedFrames(
  allChildren: KrsNode[],
  expandedServices: Map<string, KrsNode>,
  resourceInferredTagsMap: ReadonlyMap<string, string>,
): { childNodes: KrsNode[]; expandedFrames: ExpandedFrame[] } {
  const expandedFrames: ExpandedFrame[] = [];
  const childNodes: KrsNode[] = [];
  for (const child of allChildren) {
    const expanded = expandedServices.get(nodeId(child));
    if (expanded) {
      const domains = applyInferredTags(
        expanded.children.filter((c) => c.kind === "domain"),
        resourceInferredTagsMap,
      );
      childNodes.push(...domains);
      expandedFrames.push({
        containerId: expanded.id,
        label: expanded.label ?? expanded.id,
        memberIds: domains.map(nodeId),
      });
    } else {
      childNodes.push(child);
    }
  }
  return { childNodes, expandedFrames };
}

/**
 * No-system-file phase: render orphan services/domains as peer nodes with no
 * container (`path.length === 0`), or drill down from an orphan as the path
 * root (`path.length > 0`). Mirrors {@link extractRootSystemView} /
 * {@link extractSystemDrillDownView} for the no-system case.
 */
function extractOrphanView(orphans: KrsNode[], path: ViewPath, ctx: ViewExtractContext): ViewSlice {
  const { empty, resourceInferredTagsMap, entityResolver } = ctx;
  if (orphans.length === 0) return empty;

  if (path.length === 0) {
    // Orphans are drawn as siblings on one canvas, so an edge anchored inside
    // one of them draws here (#2223) — the same treatment the `__unassigned__`
    // pseudo-system gives them on the SVG path. Collected first so an anchored
    // service edge suppresses the implicit one derived for the same pair.
    const anchoredEdges = collectAnchoredPeerEdges(orphans, new Set());
    const { edges: implicitServiceEdges, details: implicitEdgeDetails } =
      deriveImplicitServiceEdges(
        orphans.filter((c) => c.kind === "service"),
        new Set(anchoredEdges.map((e) => `${e.from}->${e.to}`)),
      );
    const derivedEdges = deriveInfraEdges(orphans, entityResolver);
    const deliversEdges = deriveDeliversEdges(orphans);
    return {
      ...empty,
      childNodes: orphans,
      childEdges: [...anchoredEdges, ...derivedEdges, ...implicitServiceEdges, ...deliversEdges],
      implicitEdgeDetails,
    };
  }

  // Drill-down under orphan root
  const root = orphans.find((c) => nodeId(c) === path[0]);
  if (!root) return empty;
  const chain: KrsNode[] = [root];
  let cursor: KrsNode = root;
  for (let i = 1; i < path.length; i++) {
    const child = cursor.children.find((c) => nodeId(c) === path[i]);
    if (!child) return empty;
    chain.push(child);
    cursor = child;
  }
  const container = chain.pop()!;
  const containerChildIds = new Set(container.children.map(nodeId));
  const ownEdges = container.edges.filter(
    (e) => containerChildIds.has(e.from) && containerChildIds.has(e.to),
  );
  const drawnKeys = new Set(ownEdges.map(drawnEdgeKey));
  const edges = [...ownEdges, ...collectAnchoredPeerEdges(container.children, drawnKeys)];
  // Entities render only in the (separate) entity view — exclude them from the
  // domain / usecase drill-down so they neither appear as stray unstyled boxes
  // nor collide with an entity-resolved bare `resource` promoted below (which
  // shares the entity's id). Mirrors the systems-branch filter.
  const { childNodes, childEdges } = collectPromotedChildren(
    container,
    edges,
    resourceInferredTagsMap,
    entityResolver,
  );
  return {
    ...empty,
    containerNode: container,
    childNodes,
    childEdges,
    ancestorChain: chain,
  };
}

/**
 * Root system view phase (`path.length === 0`, at least one system present):
 * shows `systems[0]`'s direct children plus unassigned orphans, with derived
 * infra/implicit-service/delivers edges, in-place service expansion (#1921),
 * and the full cross-system edge set for the multi-system root.
 */
function extractRootSystemView(
  systems: KrsNode[],
  unassignedServices: KrsNode[],
  unassignedDomains: KrsNode[],
  expandedContainers: ReadonlySet<string> | undefined,
  ctx: ViewExtractContext,
): ViewSlice {
  const { resourceLabelMap, resourceInferredTagsMap, entityResolver } = ctx;
  const system = systems[0];
  const allChildren = [...system.children, ...unassignedServices, ...unassignedDomains];

  // In-place expansion (#1921): a service named in `expandedContainers` that
  // actually has domain children is replaced by those domains as a boundary
  // frame band; cross-boundary edges re-anchor to the exact internal domain.
  // Primary-system only, so every other frame derives with an empty set.
  const { expandedServices, expandedSet } = resolveExpandedServices(
    allChildren,
    expandedContainers,
  );

  // Every system frame owns the edge set derived from the nodes *it* places, and
  // the derivation is one function for all of them (#2756). Before this, only
  // `systems[0]` was ever handed to the derivation helpers, and the multi-system
  // layout path re-derived its own edges from `sys.edges` — so a dependency
  // spelled as `usecase` / `resource` / `delivers` rather than an arrow was
  // dropped on every root view with more than one system, and on the
  // `__unassigned__` root a system-less model gets (TPL-219).
  const systemEdges = new Map<string, SystemFrameEdges>();
  const primaryFrame = deriveCanvasEdges({
    scopeEdges: system.edges,
    canvasChildren: allChildren,
    // Service-anchored edges (#2223) are explicit edges of this canvas too: the
    // peer set is the system's own children, so a spliced-in orphan is not a
    // peer of a service the way a declared sibling is.
    anchorChildren: system.children,
    entityResolver,
    expandedSet,
  });
  systemEdges.set(nodeId(system), primaryFrame);
  for (const sys of systems.slice(1)) {
    systemEdges.set(
      nodeId(sys),
      deriveCanvasEdges({
        scopeEdges: sys.edges,
        canvasChildren: sys.children,
        anchorChildren: sys.children,
        entityResolver,
        expandedSet: undefined,
      }),
    );
  }

  // Splice each expanded service's domains into the sibling grid, and record
  // the frame band the layout draws around them.
  const { childNodes, expandedFrames } = spliceExpandedFrames(
    allChildren,
    expandedServices,
    resourceInferredTagsMap,
  );

  // The union over every frame, so the consumers keyed off `childEdges` —
  // `assignEdgeCanonicalIds`, `resolveStyles`' `extraEdges`, the compare-mode
  // merge — reach all systems through their existing wiring. The multi-system
  // layout path reads `systemEdges` instead, so the union is never a layout
  // input and cannot leak one system's edge into another's frame.
  const childEdges = [...systemEdges.values()].flatMap((frame) => frame.edges);

  // Cross-system edges: collect from all systems where the target is qualified
  // and lands somewhere in the model. The membership test used to be "the
  // first segment names a known system", which is the same question the ghost
  // resolver answers — asked once, at any depth (#2577).
  const crossSystemTargets = new Map<string, NodeIdPath>();
  const crossSystemEdges = systems.flatMap((sys) =>
    withChildAnchoredEdges(sys).filter((e) => {
      if (!e.to.includes(".")) return false;
      const match = ctx.ghostEndpoint(edgeEndpointRef(e.to));
      if (!match) return false;
      crossSystemTargets.set(e.to, match.path);
      return true;
    }),
  );

  return {
    containerNode: system,
    childNodes,
    childEdges,
    ancestorChain: [],
    ghostUsers: [],
    ghostUserEdges: [],
    systems,
    crossSystemEdges,
    crossSystemTargets,
    ghostSystems: [],
    ghostSystemEdges: [],
    callerGhostSystems: [],
    callerGhostSystemEdges: [],
    ghostDomains: [],
    ghostDomainEdges: [],
    ghostEntities: [],
    ghostEntityEdges: [],
    resourceLabelMap,
    resourceInferredTagsMap,
    implicitEdgeDetails: primaryFrame.implicitEdgeDetails,
    systemEdges,
    expandedFrames,
  };
}

/**
 * Drill-down phase for a known system (`path.length > 0`): resolves the
 * container via {@link resolveContainerChain} (path resolution), collects its
 * child edges (including domain-to-domain edges surfaced at service level),
 * synthesizes ghost users/systems/domains at service granularity, and
 * promotes dot-notation resources at domain granularity.
 */
function extractSystemDrillDownView(
  systems: KrsNode[],
  path: ViewPath,
  unassignedServices: KrsNode[],
  unassignedDomains: KrsNode[],
  ctx: ViewExtractContext,
): ViewSlice {
  const { empty, resourceLabelMap, resourceInferredTagsMap, entityResolver } = ctx;

  // Determine the active system and walk the path to the container.
  // path[0] is the system ID when it matches a known system. Otherwise the
  // path names a top-level node first and a real system's child second; the
  // shared helper picks the owning system (the "Unassigned" pseudo-system for
  // a top-level node) that becomes the drill-down root.
  const resolved = resolveContainerChain(systems, path, unassignedServices, unassignedDomains);
  if (!resolved) return empty;
  const { ancestorChain, startIndex } = resolved;
  const system = ancestorChain[0];

  // The last node in ancestorChain is the container; ancestors are everything before it
  const containerNode = ancestorChain.pop()!;

  // Edges anchored inside a child block draw on this canvas, where the
  // declaring block is a node: intra-service domain-to-domain edges on the
  // service view, and service-anchored edges when this container is the
  // system (#2223). A `database` canvas also draws the entity relations that
  // land on its leaves, unioned with the edges the `.krs` records there
  // (#2721, #2722).
  const childEdges = unionProjectedRelations(
    containerCanvasEdges(containerNode),
    projectStoreRelations(containerNode, systems),
  );

  // Ghost users/systems/domains: only for service view.
  // With system ID in path: path.length - startIndex === 1 (e.g. ["ECPlatform", "ECommerce"]).
  // Without system ID (unassigned domain fallback): path.length === 1.
  const isServiceView = path.length - startIndex === 1;
  const {
    ghostUsers,
    ghostUserEdges,
    ghostSystems,
    ghostSystemEdges,
    callerGhostSystems,
    callerGhostSystemEdges,
    ghostDomains,
    ghostDomainEdges,
  } = isServiceView
    ? synthesizeGhosts(containerNode, system, systems, ctx.ghostEndpoint)
    : emptyGhostSynthesis();

  // At domain level: promote resource nodes with dot-notation refs to sibling level
  // so they appear as connected nodes in the UseCase diagram.
  // Entities are conceptual data nodes rendered only in the (deferred) entity
  // view — exclude them here so they don't appear as stray unstyled boxes in
  // the domain / usecase drill-down.
  const { childNodes: promotedChildNodes, childEdges: finalChildEdges } = collectPromotedChildren(
    containerNode,
    childEdges,
    resourceInferredTagsMap,
    entityResolver,
  );

  return {
    containerNode,
    childNodes: promotedChildNodes,
    childEdges: finalChildEdges,
    ancestorChain,
    ghostUsers,
    ghostUserEdges,
    systems: [],
    crossSystemEdges: [],
    crossSystemTargets: new Map(),
    ghostSystems,
    ghostSystemEdges,
    callerGhostSystems,
    callerGhostSystemEdges,
    ghostDomains,
    ghostDomainEdges,
    // Entity-view only; the usecase/service view never has ghost entities.
    ghostEntities: [],
    ghostEntityEdges: [],
    resourceLabelMap,
    resourceInferredTagsMap,
    implicitEdgeDetails: new Map(),
    expandedFrames: [],
  };
}

/**
 * The model-wide part of an extraction, shared by every call of one
 * {@link ViewExtractor}: the resource maps and the entity / ghost-endpoint
 * resolvers. Read-only once built. The per-call `empty` slice is deliberately
 * not here: a returned slice owns its arrays, so an unresolved path gets a
 * fresh one each time.
 */
interface SharedViewExtractContext {
  resourceLabelMap: ReadonlyMap<string, string>;
  resourceInferredTagsMap: ReadonlyMap<string, string>;
  entityResolver: EntityResolver;
  ghostEndpoint: (ref: NodeIdPath) => GhostEndpointMatch | undefined;
}

function buildSharedContext(systems: KrsNode[], orphans: KrsNode[]): SharedViewExtractContext {
  const resourceLabelMap = buildResourceLabelMap(systems);
  const resourceInferredTagsMap = buildResourceInferredTagsMap(systems);
  // Resolver over the whole model: a bare `resource <id>` in one domain may
  // resolve to an `entity` declared in another domain / service, so this is
  // built once from every root, not per-container.
  const entityResolver = buildEntityResolver([...systems, ...orphans]);
  return {
    resourceLabelMap,
    resourceInferredTagsMap,
    entityResolver,
    ghostEndpoint: buildGhostEndpointResolver(systems),
  };
}

function extractWithContext(
  systems: KrsNode[],
  path: ViewPath,
  unassignedDomains: KrsNode[],
  unassignedServices: KrsNode[],
  expandedContainers: ReadonlySet<string> | undefined,
  shared: SharedViewExtractContext,
): ViewSlice {
  const orphans = [...unassignedServices, ...unassignedDomains];
  const ctx: ViewExtractContext = {
    ...shared,
    empty: emptySlice(shared.resourceLabelMap, shared.resourceInferredTagsMap),
  };

  // No-system file: render orphan services/domains as peer nodes with no container.
  // Drill-down walks from the orphan as path root.
  if (systems.length === 0) {
    return extractOrphanView(orphans, path, ctx);
  }

  // Root system view (path = [])
  if (path.length === 0) {
    return extractRootSystemView(
      systems,
      unassignedServices,
      unassignedDomains,
      expandedContainers,
      ctx,
    );
  }

  // Determine the active system and walk the path to the container.
  return extractSystemDrillDownView(systems, path, unassignedServices, unassignedDomains, ctx);
}

/** {@link extractView} bound to one model snapshot; see {@link createViewExtractor}. */
export type ViewExtractor = (path: ViewPath, expandedContainers?: ReadonlySet<string>) => ViewSlice;

/**
 * An extractor over one model snapshot (#2759): every call shares the four
 * whole-model structures {@link extractView} would otherwise rebuild (the
 * resource maps, the entity resolver, the ghost-endpoint resolver).
 *
 * The bundle builders (`buildDrillDownSvg`, `buildAllLayersSvg`,
 * `buildAllViewsSvg`) extract once per level and once per child probe; on a
 * 1,800-node model that rebuilt the structures about 2,000 times per bundle.
 * Each builder now creates one extractor per build, and a build's model is
 * fixed by construction.
 *
 * The caller owns the snapshot: `systems` and the orphan lists must not change
 * while the extractor is in use (TPL-1032). That is the whole contract, and it
 * is why nothing is remembered across calls of {@link extractView} itself: a
 * caller that edits a model in place and extracts again through
 * `extractView` gets the edited model, because that function stays a pure
 * function of its arguments.
 *
 * Every slice an extractor returns reads the shared maps (typed read-only) and
 * owns everything else, exactly as a slice from `extractView` does.
 */
export function createViewExtractor(
  systems: KrsNode[],
  unassignedDomains: KrsNode[] = [],
  unassignedServices: KrsNode[] = [],
): ViewExtractor {
  const shared = buildSharedContext(systems, [...unassignedServices, ...unassignedDomains]);
  return (path, expandedContainers) =>
    extractWithContext(
      systems,
      path,
      unassignedDomains,
      unassignedServices,
      expandedContainers,
      shared,
    );
}

export function extractView(
  systems: KrsNode[],
  path: ViewPath,
  unassignedDomains: KrsNode[] = [],
  unassignedServices: KrsNode[] = [],
  /**
   * Service ids to expand in place in the root system view (#1921). Each named
   * service is replaced by its domain children (spliced as a boundary-frame
   * band) while siblings stay collapsed; cross-boundary edges re-anchor to the
   * exact internal domain. Only honoured on the root system view; ignored on
   * drill-down levels. On a multi-system root only the primary system
   * (`systems[0]`) expands, and its spliced domains keep the full path
   * `<system>.<service>.<domain>` on their cards and metadata (#2917); the
   * other system frames stay collapsed (Phase 1 scope).
   */
  expandedContainers?: ReadonlySet<string>,
): ViewSlice {
  const shared = buildSharedContext(systems, [...unassignedServices, ...unassignedDomains]);
  return extractWithContext(
    systems,
    path,
    unassignedDomains,
    unassignedServices,
    expandedContainers,
    shared,
  );
}
