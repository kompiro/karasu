import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Parser, applyKrsPatch } from "@karasu-tools/core";
import type { KrsNode } from "@karasu-tools/core";
import { readStdin } from "./stdin.js";

/**
 * Apply stdin .krs content to an existing .krs file.
 *
 * For each top-level block in stdin:
 *   - If a node with the same ID already exists in the target file → replace it
 *   - Otherwise → append it at the end of the file
 *
 * If the target file does not exist, it is created with the stdin content.
 */
export async function apply(targetFile: string): Promise<void> {
  const incoming = await readStdin();

  if (!incoming.trim()) {
    process.stderr.write("Error: stdin is empty — pipe translated .krs content to apply\n");
    process.exit(1);
    return; // unreachable in production; allows process.exit to be mocked in tests
  }

  const targetPath = resolve(targetFile);
  const existing = existsSync(targetPath) ? readFileSync(targetPath, "utf-8") : "";

  const result = applyIncoming(existing, incoming);
  writeFileSync(targetPath, result, "utf-8");
}

/**
 * Apply incoming .krs blocks to an existing source string.
 * Exported for unit testing.
 */
export function applyIncoming(existing: string, incoming: string): string {
  // Parse the incoming content to find all top-level block IDs
  const incomingParsed = Parser.parse(incoming);
  const incomingTopLevel = [
    ...incomingParsed.value.systems,
    ...incomingParsed.value.services,
    ...incomingParsed.value.domains,
    ...incomingParsed.value.deploys,
  ];

  if (incomingTopLevel.length === 0) {
    // No recognizable top-level nodes — append as-is
    const result = applyKrsPatch(existing, "append", undefined, incoming);
    return result.ok ? result.source : existing;
  }

  // Parse existing file to know which IDs are already present (including system children)
  const existingParsed = Parser.parse(existing);
  const existingIds = new Set<string>([
    ...existingParsed.value.systems.map((n) => n.id),
    ...existingParsed.value.services.map((n) => n.id),
    ...existingParsed.value.domains.map((n) => n.id),
    ...existingParsed.value.deploys.map((d) => d.id),
  ]);
  for (const system of existingParsed.value.systems) {
    collectDescendantIds(system.children, existingIds);
  }

  // Extract individual top-level blocks from incoming source using loc offsets
  // and apply each one independently
  let current = existing;

  for (const node of incomingTopLevel) {
    const blockContent = incoming.slice(node.loc.start.offset, node.loc.end.offset + 1).trim();

    if (!existingIds.has(node.id)) {
      // Append as a new top-level block
      const appendResult = applyKrsPatch(current, "append", undefined, blockContent);
      if (appendResult.ok) {
        current = appendResult.source;
        // Track the newly added ID so subsequent blocks don't try to append it again
        existingIds.add(node.id);
      }
      continue;
    }

    // Node exists in target — for system nodes, check whether all incoming children
    // already exist in the target. If so, replace each child individually to preserve
    // sibling nodes (e.g. manually-added services) absent from the incoming content.
    const asSystem = incomingParsed.value.systems.find((s) => s.id === node.id);
    if (asSystem && allChildrenExistIn(asSystem.children, existingIds)) {
      for (const child of asSystem.children) {
        const childContent = incoming
          .slice(child.loc.start.offset, child.loc.end.offset + 1)
          .trim();
        const replaceResult = applyKrsPatch(current, "replace", child.id, childContent);
        if (replaceResult.ok) {
          current = replaceResult.source;
        } else {
          process.stderr.write(
            `Warning: could not replace node "${child.id}": ${replaceResult.error}\n`,
          );
        }
      }
      continue;
    }

    // Replace the existing node wholesale
    const replaceResult = applyKrsPatch(current, "replace", node.id, blockContent);
    if (replaceResult.ok) {
      current = replaceResult.source;
    } else {
      process.stderr.write(
        `Warning: could not replace node "${node.id}": ${replaceResult.error}\n`,
      );
    }
  }

  return current;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Recursively adds the IDs of all descendant nodes to the given set. */
function collectDescendantIds(nodes: KrsNode[], ids: Set<string>): void {
  for (const node of nodes) {
    ids.add(node.id);
    collectDescendantIds(node.children, ids);
  }
}

/** Returns true when every child ID in the incoming list already exists in the target. */
function allChildrenExistIn(children: KrsNode[], existingIds: Set<string>): boolean {
  return children.every((child) => existingIds.has(child.id));
}
