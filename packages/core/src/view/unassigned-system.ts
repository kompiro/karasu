import type { KrsFile, KrsNode, SystemNode } from "../types/ast.js";

/** Synthetic id used for the pseudo-system that wraps top-level (unassigned) services/domains. */
const UNASSIGNED_SYSTEM_ID = "__unassigned__";

/** Label rendered in the SVG for the pseudo-system container. */
const UNASSIGNED_SYSTEM_LABEL = "Unassigned";

/**
 * Build a synthetic `system` node that wraps every top-level `service` / `domain` /
 * `database` / `queue` / `storage` declaration (those that live outside any real
 * `system` block). Returns null when the file has no orphans — in that case callers
 * should continue with the original systems list untouched.
 *
 * The synthetic node is what makes the renderer draw a dedicated frame labeled
 * "Unassigned" instead of merging orphans into a real system's area.
 */
export function synthesizeUnassignedSystem(krsFile: KrsFile): SystemNode | null {
  const services = krsFile.services ?? [];
  const databases = krsFile.databases ?? [];
  const queues = krsFile.queues ?? [];
  const storages = krsFile.storages ?? [];
  const domains = krsFile.domains ?? [];
  const children: KrsNode[] = [...services, ...databases, ...queues, ...storages, ...domains];
  if (children.length === 0) return null;

  const zeroLoc = {
    start: { line: 0, column: 0, offset: 0 },
    end: { line: 0, column: 0, offset: 0 },
  };

  return {
    kind: "system",
    id: UNASSIGNED_SYSTEM_ID,
    label: UNASSIGNED_SYSTEM_LABEL,
    children,
    edges: [],
    tags: [],
    annotations: [],
    properties: { links: [] },
    loc: zeroLoc,
  };
}

/**
 * Return the original systems plus a pseudo-system for orphans, or the original
 * list unchanged when the file has none. Convenience wrapper used by the entry
 * points that need to drive the renderer.
 */
export function withUnassignedSystem(krsFile: KrsFile): KrsNode[] {
  const pseudo = synthesizeUnassignedSystem(krsFile);
  return pseudo ? [...krsFile.systems, pseudo] : krsFile.systems;
}
