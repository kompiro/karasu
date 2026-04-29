/**
 * Shared "is this legend ref in use" computation. Used by both the resolver
 * (to decide whether to emit `legend-ref-unresolved`) and the renderer (to
 * decide whether to paint the entry with a fallback swatch when no style
 * rule colours it).
 *
 * Splitting these two callers used to disagree: the resolver counted a ref
 * as resolved when the annotation/tag merely appeared on a node, but the
 * renderer required a paintable style rule. That mismatch silently dropped
 * legend entries for semantic-only annotations like `[human]`.
 */
import type { KrsFile, KrsNode, LegendRefTarget } from "../types/ast.js";

export interface LegendUsage {
  /** Annotations that appear on at least one node (`@deprecated`, `[human]`, etc.) */
  annotations: Set<string>;
  /** Tags that appear on at least one node (`[external]`, `[mobile]`, etc.) */
  tags: Set<string>;
  /** Every node id present in the file (for `#id` selectors) */
  nodeIds: Set<string>;
  /** Every kind (`service`, `domain`, `database`, ...) present in the file */
  nodeKinds: Set<string>;
}

export function collectLegendUsage(file: KrsFile): LegendUsage {
  const annotations = new Set<string>();
  const tags = new Set<string>();
  const nodeIds = new Set<string>();
  const nodeKinds = new Set<string>();

  function walk(nodes: KrsNode[]): void {
    for (const node of nodes) {
      nodeIds.add(node.id);
      nodeKinds.add(node.kind);
      for (const a of node.annotations) annotations.add(a);
      for (const t of node.tags) tags.add(t);
      walk(node.children);
    }
  }
  for (const system of file.systems) {
    nodeIds.add(system.id);
    nodeKinds.add(system.kind);
    walk(system.children);
  }
  walk(file.services);
  walk(file.clients);
  walk(file.domains);
  walk(file.databases);
  walk(file.queues);
  walk(file.storages);

  return { annotations, tags, nodeIds, nodeKinds };
}

export function legendRefHasUsage(target: LegendRefTarget, usage: LegendUsage): boolean {
  switch (target.kind) {
    case "annotation":
      return usage.annotations.has(target.name);
    case "tag":
      return usage.tags.has(target.name);
    case "selector": {
      const sel = target.selector;
      if (sel.startsWith("#")) return usage.nodeIds.has(sel.slice(1));
      // `.class` selectors are accepted by the parser for forward compat
      // but `.krs.style` has no class concept yet (see docs/spec/style.md).
      if (sel.startsWith(".")) return false;
      return usage.nodeKinds.has(sel);
    }
  }
}
