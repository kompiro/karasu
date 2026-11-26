// Checks that compare one client node's own lines, kept apart from
// `warnings.ts` so it stays inside its line budget.

import type { KrsFile, KrsNode } from "../types/ast.js";
import type { Warning } from "../types/warnings.js";

/** A client declares the same capability name twice. */
export function detectDuplicateClientCapabilities(file: KrsFile): Warning[] {
  const warnings: Warning[] = [];
  const visit = (node: KrsNode): void => {
    if (node.kind === "client") {
      const seen = new Map<string, true>();
      for (const cap of node.properties.capabilities) {
        if (seen.has(cap.name)) {
          warnings.push({
            kind: "client-capability-duplicate",
            params: { clientId: node.id, name: cap.name },
            loc: cap.loc,
          });
        } else {
          seen.set(cap.name, true);
        }
      }
    }
    for (const child of node.children) visit(child);
  };
  for (const system of file.systems) for (const child of system.children) visit(child);
  for (const client of file.clients) visit(client);
  for (const service of file.services) visit(service);
  return warnings;
}

/**
 * Two storages of one client node with the same id (#3794). Only the first is
 * what `resource <ClientId>.<Id>` resolves to, so the rest are reported. One
 * client node at a time, like `client-capability-duplicate`: same-id client
 * nodes are separate nodes (KRS018 / KRS030), and their clash is
 * `resource-target-ambiguous` at the reference.
 */
export function detectDuplicateClientResourceIds(file: KrsFile): Warning[] {
  const warnings: Warning[] = [];
  const visit = (node: KrsNode): void => {
    if (node.kind === "client") {
      const seen = new Set<string>();
      for (const res of node.properties.resources) {
        if (res.id === undefined) continue;
        if (seen.has(res.id)) {
          warnings.push({
            kind: "client-resource-duplicate-id",
            params: { clientId: node.id, id: res.id },
            loc: res.loc,
          });
        } else {
          seen.add(res.id);
        }
      }
    }
    for (const child of node.children) visit(child);
  };
  for (const system of file.systems) for (const child of system.children) visit(child);
  for (const client of file.clients) visit(client);
  for (const service of file.services) visit(service);
  return warnings;
}
