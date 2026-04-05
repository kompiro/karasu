import type { KrsNode, KrsFile, TeamNode } from "../types/ast.js";
import type { StyleSheet } from "../types/style.js";
import type { Warning } from "../types/warnings.js";

export function analyze(file: KrsFile, sheets: StyleSheet[], systemSheetCount = 1): Warning[] {
  const warnings: Warning[] = [];

  warnings.push(...detectDomainDispersal(file));
  warnings.push(...detectUnassignedDomains(file));
  warnings.push(...detectStyleConflicts(sheets, systemSheetCount));
  warnings.push(...detectMissingProperties(file));
  warnings.push(...detectInvalidOwns(file));
  warnings.push(...detectDeprecatedTeamProperty(file));
  warnings.push(...detectCrossSystemRefs(file));

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
          message: `domain "${domainId}" が複数の service に分散しています`,
          details: [...Array.from(services), "ドメインの凝集性を確認してください"],
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
    message: `domain "${domain.label ?? domain.id}" is not assigned to any service`,
    details: [],
    loc: domain.loc,
  }));
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
        message: `セレクタ "${selector}" が複数のスタイルファイルで定義されています`,
        details: Array.from(sheetIndices).map((i) => `スタイルファイル ${i + 1}`),
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
          message: `デプロイノード "${node.id}" に runtime が指定されていません`,
          details: [],
          loc: node.loc,
        });
      }
      if (!node.properties.realizes) {
        warnings.push({
          kind: "missing-realizes",
          message: `デプロイノード "${node.id}" に realizes が指定されていません`,
          details: [],
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
            message: `team "${team.id}" owns "${ownedId}" but no service or domain with that id exists`,
            details: [],
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
        message: `"${node.id}" has explicit team property but team is already assigned via org.team.owns`,
        details: [
          `team assigned by owns: "${ownerIndex.get(node.id)}"`,
          'Remove the "team" property and use org { team { owns } } instead',
        ],
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
    // Build set of bare service IDs with [external] tag explicitly declared in this system
    const explicitExternalIds = new Set(
      system.children.filter((c) => c.tags.includes("external")).map((c) => c.id),
    );

    for (const edge of system.edges) {
      if (!edge.to.includes(".")) continue;

      const [systemId, serviceId] = edge.to.split(".");

      // Suppressed if the bare service ID is explicitly declared as [external] in the source system
      if (explicitExternalIds.has(serviceId)) continue;

      const referencedSystem = file.systems.find((s) => s.id === systemId);
      if (!referencedSystem || !referencedSystem.children.some((c) => c.id === serviceId)) {
        warnings.push({
          kind: "cross-system-ref-unresolved",
          message: `"${edge.to}" could not be resolved — rendered as unresolved external node`,
          details: [],
          loc: edge.loc,
        });
      } else {
        warnings.push({
          kind: "cross-system-ref-implicit-external",
          message: `"${edge.to}" is referenced from ${system.id}.${edge.from} but not explicitly annotated as @external`,
          details: [`Add 'service ${serviceId} [external]' to system ${system.id} to suppress this warning`],
          loc: edge.loc,
        });
      }
    }
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
