import type { KrsNode, KrsEdge, KrsFile, TeamNode } from "../types/ast.js";
import type { StyleSheet } from "../types/style.js";
import type { Warning } from "../types/warnings.js";

export function analyze(file: KrsFile, sheets: StyleSheet[], systemSheetCount = 1): Warning[] {
  const warnings: Warning[] = [];

  warnings.push(...detectDomainDispersal(file));
  warnings.push(...detectUnassignedDomains(file));
  warnings.push(...detectUnassignedServices(file));
  warnings.push(...detectUnassignedClients(file));
  warnings.push(...detectUnresolvedHandles(file));
  warnings.push(...detectUnassignedDatabases(file));
  warnings.push(...detectUnassignedQueues(file));
  warnings.push(...detectUnassignedStorages(file));
  warnings.push(...detectUnassignedUsecases(file));
  warnings.push(...detectStyleConflicts(sheets, systemSheetCount));
  warnings.push(...detectMissingProperties(file));
  warnings.push(...detectInvalidOwns(file));
  warnings.push(...detectDeprecatedTeamProperty(file));
  warnings.push(...detectCrossSystemRefs(file));
  warnings.push(...detectCyclicDependencies(file));
  warnings.push(...detectDeliversTargetNotClient(file));

  return warnings;
}

function detectDeliversTargetNotClient(file: KrsFile): Warning[] {
  const clientIds = new Set<string>();
  const services: KrsNode[] = [];

  function walk(nodes: KrsNode[]): void {
    for (const node of nodes) {
      if (node.kind === "client") clientIds.add(node.id);
      if (node.kind === "service") services.push(node);
      walk(node.children);
    }
  }
  for (const system of file.systems) walk(system.children);
  walk(file.services);
  for (const client of file.clients) clientIds.add(client.id);

  const warnings: Warning[] = [];
  for (const service of services) {
    const delivers = (service as KrsNode & { properties: { delivers?: string[] } }).properties
      .delivers;
    if (!delivers) continue;
    for (const targetId of delivers) {
      if (!clientIds.has(targetId)) {
        warnings.push({
          kind: "delivers-target-not-client",
          params: { serviceId: service.id, targetId },
          loc: service.loc,
        });
      }
    }
  }
  return warnings;
}

function detectDomainDispersal(file: KrsFile): Warning[] {
  const warnings: Warning[] = [];

  // Analyze one scope unit (a system's children, or all top-level services).
  // Detection is keyed by domain id — label is a display name and must not affect identity.
  // Each system is an organizational boundary; cross-system domains are intentional.
  function detectInScope(nodes: KrsNode[]): void {
    const domainToServices = new Map<string, Set<string>>();

    function walk(node: KrsNode, parentServiceId?: string): void {
      if (node.kind === "service") {
        parentServiceId = node.id;
      }
      if (node.kind === "domain" && parentServiceId) {
        if (!domainToServices.has(node.id)) {
          domainToServices.set(node.id, new Set());
        }
        domainToServices.get(node.id)!.add(parentServiceId);
      }
      for (const child of node.children) {
        walk(child, parentServiceId);
      }
    }

    for (const node of nodes) {
      walk(node);
    }

    for (const [domainId, services] of domainToServices) {
      if (services.size > 1) {
        warnings.push({
          kind: "domain-dispersal",
          params: { domainId, services: Array.from(services) },
        });
      }
    }
  }

  for (const system of file.systems) {
    detectInScope(system.children);
  }
  if (file.services.length > 0) {
    detectInScope(file.services);
  }

  return warnings;
}

function detectUnassignedDomains(file: KrsFile): Warning[] {
  return file.domains.map((domain) => ({
    kind: "unassigned-domain" as const,
    params: {
      domainId: domain.id,
      ...(domain.label ? { label: domain.label } : {}),
    },
    loc: domain.loc,
  }));
}

function detectUnassignedServices(file: KrsFile): Warning[] {
  return file.services.map((service) => ({
    kind: "unassigned-service" as const,
    params: {
      serviceId: service.id,
      ...(service.label ? { label: service.label } : {}),
    },
    loc: service.loc,
  }));
}

function detectUnassignedClients(file: KrsFile): Warning[] {
  return (file.clients ?? []).map((client) => ({
    kind: "unassigned-client" as const,
    params: {
      clientId: client.id,
      ...(client.label ? { label: client.label } : {}),
    },
    loc: client.loc,
  }));
}

/**
 * Validate `handles` cross-references for `client` and `service` nodes.
 *
 * Expose rule (one-hop, recursive):
 *   A node N exposes domain D iff:
 *     1. N has a child `domain D` (self-owned), OR
 *     2. N declares `handles D` AND at least one of N's outgoing communication
 *        edges targets a node that exposes D.
 *
 * For each `handles D` declaration whose D cannot be resolved through the
 * rule, emit an `unresolved-handles` warning. The rule mirrors how the
 * design doc describes the BFF passthrough chain (client → BFF.handles →
 * backend.owns).
 *
 * Implementation notes:
 * - Operates per-system: only edges declared at the same system scope are
 *   considered. Top-level clients/services (file.clients / file.services)
 *   already produce `unassigned-*` warnings; their `handles` declarations
 *   simply have no edges to resolve through.
 * - Memoizes "exposes(node, domain)" inside a single system to keep the
 *   recursion linear in the number of nodes. The recursion is well-founded
 *   because we expand exactly one hop per call (the recursive call resolves
 *   on the *target* side of an edge, and a graph with finite nodes
 *   terminates).
 * - `delivers` is a service-side property and not an edge, so it does not
 *   participate.
 */
function detectUnresolvedHandles(file: KrsFile): Warning[] {
  const warnings: Warning[] = [];

  for (const system of file.systems) {
    // Build node lookup and outgoing-edge index keyed by source id.
    const nodeById = new Map<string, KrsNode>();
    for (const child of system.children) {
      nodeById.set(child.id, child);
    }
    const outgoingByFrom = new Map<string, string[]>();
    for (const edge of system.edges) {
      let list = outgoingByFrom.get(edge.from);
      if (!list) {
        list = [];
        outgoingByFrom.set(edge.from, list);
      }
      list.push(edge.to);
    }

    // Memoization: nodeId -> domainId -> boolean
    const memo = new Map<string, Map<string, boolean>>();
    const inProgress = new Set<string>(); // cycle guard (key: nodeId|domainId)

    function ownsDomain(node: KrsNode, domainId: string): boolean {
      return node.children.some((c) => c.kind === "domain" && c.id === domainId);
    }

    function declaredHandles(node: KrsNode): string[] | undefined {
      if (node.kind === "client" || node.kind === "service") {
        return node.properties.handles;
      }
      return undefined;
    }

    function exposes(nodeId: string, domainId: string): boolean {
      let domainMap = memo.get(nodeId);
      if (domainMap?.has(domainId)) return domainMap.get(domainId)!;

      const node = nodeById.get(nodeId);
      if (!node) {
        if (!domainMap) {
          domainMap = new Map();
          memo.set(nodeId, domainMap);
        }
        domainMap.set(domainId, false);
        return false;
      }

      // Cycle guard — treat in-progress lookups as not-yet-exposed; this
      // prevents infinite recursion on pathological graphs (e.g. A.handles X
      // pointing to B.handles X pointing back to A).
      const key = `${nodeId}|${domainId}`;
      if (inProgress.has(key)) {
        if (!domainMap) {
          domainMap = new Map();
          memo.set(nodeId, domainMap);
        }
        domainMap.set(domainId, false);
        return false;
      }
      inProgress.add(key);

      // Rule 1: own
      if (ownsDomain(node, domainId)) {
        if (!domainMap) {
          domainMap = new Map();
          memo.set(nodeId, domainMap);
        }
        domainMap.set(domainId, true);
        inProgress.delete(key);
        return true;
      }

      // Rule 2: re-export — the node declared `handles D` AND an outgoing
      // edge target also exposes D.
      const handles = declaredHandles(node);
      if (handles?.includes(domainId)) {
        const targets = outgoingByFrom.get(nodeId) ?? [];
        for (const target of targets) {
          if (exposes(target, domainId)) {
            if (!domainMap) {
              domainMap = new Map();
              memo.set(nodeId, domainMap);
            }
            domainMap.set(domainId, true);
            inProgress.delete(key);
            return true;
          }
        }
      }

      if (!domainMap) {
        domainMap = new Map();
        memo.set(nodeId, domainMap);
      }
      domainMap.set(domainId, false);
      inProgress.delete(key);
      return false;
    }

    // Check every client / service in this system that declares `handles`.
    for (const node of system.children) {
      if (node.kind !== "client" && node.kind !== "service") continue;
      const handles = node.properties.handles;
      if (!handles || handles.length === 0) continue;

      for (const domainId of handles) {
        // For the declaring node itself, "exposes" recurses into rule 2 and
        // walks the outgoing edges. Self-owned domains (rule 1) take
        // precedence and are also tested there.
        if (exposes(node.id, domainId)) continue;

        warnings.push({
          kind: "unresolved-handles",
          params: {
            nodeId: node.id,
            nodeKind: node.kind,
            domainId,
          },
          loc: node.loc,
        });
      }
    }
  }

  return warnings;
}

function detectUnassignedDatabases(file: KrsFile): Warning[] {
  return (file.databases ?? []).map((db) => ({
    kind: "unassigned-database" as const,
    params: {
      databaseId: db.id,
      ...(db.label ? { label: db.label } : {}),
    },
    loc: db.loc,
  }));
}

function detectUnassignedQueues(file: KrsFile): Warning[] {
  return (file.queues ?? []).map((q) => ({
    kind: "unassigned-queue" as const,
    params: {
      queueId: q.id,
      ...(q.label ? { label: q.label } : {}),
    },
    loc: q.loc,
  }));
}

function detectUnassignedStorages(file: KrsFile): Warning[] {
  return (file.storages ?? []).map((s) => ({
    kind: "unassigned-storage" as const,
    params: {
      storageId: s.id,
      ...(s.label ? { label: s.label } : {}),
    },
    loc: s.loc,
  }));
}

function detectUnassignedUsecases(file: KrsFile): Warning[] {
  const warnings: Warning[] = [];

  function walkServiceChildren(nodes: KrsNode[]): void {
    for (const node of nodes) {
      if (node.kind === "service") {
        for (const child of node.children) {
          if (child.kind === "usecase") {
            warnings.push({
              kind: "unassigned-usecase",
              params: { usecaseId: child.id },
              loc: child.loc,
            });
          }
        }
        // recurse into domains to find nested services (not expected, but safe)
        walkServiceChildren(node.children.filter((c) => c.kind !== "usecase"));
      }
    }
  }

  for (const system of file.systems) {
    walkServiceChildren(system.children);
  }
  walkServiceChildren(file.services);

  return warnings;
}

function detectStyleConflicts(sheets: StyleSheet[], systemSheetCount = 1): Warning[] {
  // Skip system sheets (built-in + any injected theme sheets) — they are designed to be overridden.
  // Only detect conflicts among user sheets (index systemSheetCount+).
  const userSheets = sheets.slice(systemSheetCount);
  if (userSheets.length <= 1) return [];
  const warnings: Warning[] = [];

  // Group rules by serialized selector, tracking which user sheet they came from
  const selectorToSheets = new Map<string, Set<number>>();

  for (let i = 0; i < userSheets.length; i++) {
    for (const rule of userSheets[i].rules) {
      const key = serializeSelector(rule.selector);
      if (!selectorToSheets.has(key)) {
        selectorToSheets.set(key, new Set());
      }
      selectorToSheets.get(key)!.add(i);
    }
  }

  for (const [selector, sheetIndices] of selectorToSheets) {
    if (sheetIndices.size > 1) {
      warnings.push({
        kind: "style-conflict",
        params: { selector, sheetIndices: Array.from(sheetIndices) },
      });
    }
  }

  return warnings;
}

function detectMissingProperties(file: KrsFile): Warning[] {
  const warnings: Warning[] = [];

  for (const deploy of file.deploys) {
    for (const node of deploy.nodes) {
      if (!node.properties.runtime) {
        warnings.push({
          kind: "missing-runtime",
          params: { nodeId: node.id },
          loc: node.loc,
        });
      }
      if (!node.properties.realizes?.length) {
        warnings.push({
          kind: "missing-realizes",
          params: { nodeId: node.id },
          loc: node.loc,
        });
      }
    }
  }

  return warnings;
}

function detectInvalidOwns(file: KrsFile): Warning[] {
  const warnings: Warning[] = [];

  // Build the set of all valid service/domain IDs
  const validIds = new Set<string>();
  function collectIds(nodes: KrsNode[]): void {
    for (const node of nodes) {
      if (node.kind === "service" || node.kind === "domain") {
        validIds.add(node.id);
      }
      collectIds(node.children);
    }
  }
  for (const system of file.systems) {
    collectIds(system.children);
  }
  for (const service of file.services) {
    validIds.add(service.id);
    collectIds(service.children);
  }
  for (const domain of file.domains) {
    validIds.add(domain.id);
    collectIds(domain.children);
  }

  // Check each owns reference
  function checkTeams(teams: TeamNode[]): void {
    for (const team of teams) {
      for (const ownedId of team.properties.owns) {
        if (!validIds.has(ownedId)) {
          warnings.push({
            kind: "invalid-owns",
            params: { teamId: team.id, ownedId },
            loc: team.loc,
          });
        }
      }
      checkTeams(team.children.filter((c): c is TeamNode => c.kind === "team"));
    }
  }

  for (const org of file.organizations) {
    checkTeams(org.teams);
  }

  return warnings;
}

function detectDeprecatedTeamProperty(file: KrsFile): Warning[] {
  const warnings: Warning[] = [];
  const ownerIndex = file.ownerIndex;

  function walk(node: KrsNode): void {
    if (
      (node.kind === "service" || node.kind === "domain") &&
      node.properties.team &&
      ownerIndex.has(node.id)
    ) {
      warnings.push({
        kind: "deprecated-team-property",
        params: {
          nodeId: node.id,
          ownerTeamId: ownerIndex.get(node.id)!,
        },
        loc: node.loc,
      });
    }
    for (const child of node.children) {
      walk(child);
    }
  }

  for (const system of file.systems) {
    for (const child of system.children) {
      walk(child);
    }
  }
  for (const service of file.services) {
    walk(service);
  }
  for (const domain of file.domains) {
    walk(domain);
  }

  return warnings;
}

function detectCrossSystemRefs(file: KrsFile): Warning[] {
  const warnings: Warning[] = [];

  for (const system of file.systems) {
    // Build set of system IDs with [external] tag explicitly declared as children of this system.
    // A child node with the same ID as the referenced system suppresses the implicit-external warning.
    const explicitExternalIds = new Set(
      system.children.filter((c) => c.tags.includes("external")).map((c) => c.id),
    );

    for (const edge of system.edges) {
      if (!edge.to.includes(".")) continue;

      const [systemId, serviceId] = edge.to.split(".");

      // Suppressed if the referenced system ID is explicitly declared as [external] in the source system
      if (explicitExternalIds.has(systemId)) continue;

      const referencedSystem = file.systems.find((s) => s.id === systemId);
      if (!referencedSystem || !referencedSystem.children.some((c) => c.id === serviceId)) {
        warnings.push({
          kind: "cross-system-ref-unresolved",
          params: { ref: edge.to },
          loc: edge.loc,
        });
      } else {
        warnings.push({
          kind: "cross-system-ref-implicit-external",
          params: {
            ref: edge.to,
            sourceSystemId: system.id,
            sourceNodeId: edge.from,
            targetSystemId: systemId,
          },
          loc: edge.loc,
        });
      }
    }
  }

  return warnings;
}

function detectCyclicDependencies(file: KrsFile): Warning[] {
  const warnings: Warning[] = [];

  function detectInEdges(edges: KrsEdge[]): void {
    // Only inspect sync edges — async cycles are intentional (eventual consistency patterns)
    const syncEdges = edges.filter((e) => e.kind === "sync");
    if (syncEdges.length === 0) return;

    // Build adjacency map: node -> outgoing sync edges
    const adj = new Map<string, KrsEdge[]>();
    for (const edge of syncEdges) {
      if (!adj.has(edge.from)) adj.set(edge.from, []);
      adj.get(edge.from)!.push(edge);
    }

    const WHITE = 0,
      GRAY = 1,
      BLACK = 2;
    const color = new Map<string, number>();

    function dfs(node: string, path: string[]): void {
      color.set(node, GRAY);
      const currentPath = [...path, node];

      for (const edge of adj.get(node) ?? []) {
        const neighbor = edge.to;

        // Self-reference
        if (neighbor === node) {
          edge.cyclic = true;
          warnings.push({
            kind: "cyclic-dependency",
            params: { cyclePath: [node, node] },
            loc: edge.loc,
          });
          continue;
        }

        const neighborColor = color.get(neighbor) ?? WHITE;
        if (neighborColor === GRAY) {
          // Back edge found — mark this edge and all edges in the cycle
          edge.cyclic = true;
          const cycleStartIdx = currentPath.indexOf(neighbor);
          const cyclePath = [...currentPath.slice(cycleStartIdx), neighbor];

          // Mark all edges that form the cycle
          for (let i = 0; i < cyclePath.length - 1; i++) {
            const from = cyclePath[i];
            const to = cyclePath[i + 1];
            for (const cycleEdge of syncEdges.filter((se) => se.from === from && se.to === to)) {
              cycleEdge.cyclic = true;
            }
          }

          warnings.push({
            kind: "cyclic-dependency",
            params: { cyclePath },
            loc: edge.loc,
          });
        } else if (neighborColor === WHITE) {
          dfs(neighbor, currentPath);
        }
      }

      color.set(node, BLACK);
    }

    // Collect all nodes that appear in sync edges
    const nodes = new Set<string>();
    for (const edge of syncEdges) {
      nodes.add(edge.from);
      nodes.add(edge.to);
    }

    for (const node of nodes) {
      if ((color.get(node) ?? WHITE) === WHITE) {
        dfs(node, []);
      }
    }
  }

  function walkNodes(nodes: KrsNode[]): void {
    for (const node of nodes) {
      detectInEdges(node.edges);
      walkNodes(node.children);
    }
  }

  for (const system of file.systems) {
    detectInEdges(system.edges);
    walkNodes(system.children);
  }

  return warnings;
}

function serializeSelector(selector: {
  nodeType?: string;
  tags: string[];
  annotations: string[];
  id?: string;
}): string {
  const parts: string[] = [];
  if (selector.id) parts.push(`#${selector.id}`);
  if (selector.nodeType) parts.push(selector.nodeType);
  for (const tag of selector.tags) parts.push(`[${tag}]`);
  for (const ann of selector.annotations) parts.push(`@${ann}`);
  return parts.join("");
}
