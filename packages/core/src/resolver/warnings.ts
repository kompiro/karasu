import type { KrsNode, KrsEdge, KrsFile, TeamNode } from "../types/ast.js";
import type { StyleSheet } from "../types/style.js";
import type { Warning } from "../types/warnings.js";

export function analyze(file: KrsFile, sheets: StyleSheet[], systemSheetCount = 1): Warning[] {
  const warnings: Warning[] = [];

  warnings.push(...detectDomainDispersal(file));
  warnings.push(...detectUnassignedDomains(file));
  warnings.push(...detectUnassignedServices(file));
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
