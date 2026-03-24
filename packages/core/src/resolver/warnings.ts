import type { KrsNode, KrsFile } from "../types/ast.js";
import type { StyleSheet } from "../types/style.js";
import type { Warning } from "../types/warnings.js";

export function analyze(file: KrsFile, sheets: StyleSheet[]): Warning[] {
  const warnings: Warning[] = [];

  warnings.push(...detectDomainDispersal(file));
  warnings.push(...detectStyleConflicts(sheets));
  warnings.push(...detectMissingProperties(file));

  return warnings;
}

function detectDomainDispersal(file: KrsFile): Warning[] {
  const warnings: Warning[] = [];
  // Map: domain label -> set of parent service ids/labels
  const domainToServices = new Map<string, Set<string>>();

  function walk(node: KrsNode, parentServiceName?: string): void {
    if (node.kind === "service") {
      parentServiceName = node.id;
    }
    if (node.kind === "domain" && parentServiceName) {
      const domainName = node.label ?? node.id;
      if (!domainToServices.has(domainName)) {
        domainToServices.set(domainName, new Set());
      }
      domainToServices.get(domainName)!.add(parentServiceName);
    }
    for (const child of node.children) {
      walk(child, parentServiceName);
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

  for (const [domainName, services] of domainToServices) {
    if (services.size > 1) {
      warnings.push({
        kind: "domain-dispersal",
        message: `domain "${domainName}" が複数の service に分散しています`,
        details: [...Array.from(services), "ドメインの凝集性を確認してください"],
      });
    }
  }

  return warnings;
}

function detectStyleConflicts(sheets: StyleSheet[]): Warning[] {
  // Skip the builtin sheet (index 0) — it is designed to be overridden.
  // Only detect conflicts among user sheets (index 1+).
  const userSheets = sheets.slice(1);
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
