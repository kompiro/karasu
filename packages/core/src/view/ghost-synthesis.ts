import type { KrsNode, KrsEdge, NodeIdPath } from "../types/ast.js";
import { nodePathIdentityKey, nodePathKey } from "../parser/node-path.js";
import { edgeEndpointRef, type GhostEndpointMatch } from "../resolver/edge-endpoint.js";
import { nodeId, withChildAnchoredEdges } from "./anchored-edges.js";
import { buildDomainServiceMap } from "./derived-edges.js";
import type { GhostDomain, GhostSystem } from "./view-slice.js";

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
  // Identity, not text (#3111): a dotted join let the domain `S.a.b` (`b` in
  // service `a`) answer for the container `"a.b"` and draw its caller there.
  const targetKey = nodePathIdentityKey([containerSystemId, containerId]);
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
      if (!match || nodePathIdentityKey(match.path) !== targetKey) continue;
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
    const key = nodePathIdentityKey(match.path);
    if (!gs.visibleServices.some((s) => nodePathIdentityKey(s.path) === key)) {
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

export interface GhostSynthesis {
  ghostUsers: KrsNode[];
  ghostUserEdges: KrsEdge[];
  ghostSystems: GhostSystem[];
  ghostSystemEdges: KrsEdge[];
  callerGhostSystems: GhostSystem[];
  callerGhostSystemEdges: KrsEdge[];
  ghostDomains: GhostDomain[];
  ghostDomainEdges: KrsEdge[];
}

export function emptyGhostSynthesis(): GhostSynthesis {
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
 * granularity — see the `isServiceView` check in `extractSystemDrillDownView`
 * (`view-extract.ts`).
 */
export function synthesizeGhosts(
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
