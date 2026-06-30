import { INFRA_KIND_SET, type KrsNode } from "../types/ast.js";
import type { SourceRange } from "../types/tokens.js";

/**
 * Collapsible node categories on the system view (Issue #1821, design
 * `docs/design/layer-toggles.md`). A category groups the dependency-tier nodes
 * a reader may want to fold away to cut horizontal density:
 *
 * - `infra` — shared infra blocks (`database` / `queue` / `storage`)
 * - `external` — `[external]`-tagged service nodes
 *
 * Identification mirrors `systemTier()` in `layout.ts` so the two stay in sync
 * (TPL-20260519-02: the infra-kind / `[external]`-tag vocabulary has one source
 * of truth).
 */
export type CategoryId = "external" | "infra";

/**
 * Marker tag on a synthesized collapse stub. The renderer draws a stub node
 * (⊕ + count) instead of a normal card when it sees this tag (Issue #1821).
 */
export const CATEGORY_STUB_TAG = "__category_stub__";

const ZERO_LOC: SourceRange = {
  start: { line: 0, column: 0, offset: 0 },
  end: { line: 0, column: 0, offset: 0 },
};

/** Which collapsible category a system-view node belongs to, or `null`. */
export function categoryOf(node: KrsNode): CategoryId | null {
  if (INFRA_KIND_SET.has(node.kind)) return "infra";
  if (node.tags.includes("external")) return "external";
  return null;
}

/** Stable id of the stub that stands in for a collapsed category. */
export function stubId(category: CategoryId): string {
  return `__collapsed_${category}__`;
}

/**
 * Build the stub node for a collapsed category. The stub reuses a real node
 * kind so `systemTier()` places it in the same tier as the nodes it replaces —
 * `database` (infra tier) for `infra`, `service` + `[external]` (external tier)
 * for `external` — and carries `CATEGORY_STUB_TAG` so the renderer knows to draw
 * the ⊕ placeholder. The count is encoded in the label (e.g. `Infra (4)`).
 */
function stubNode(category: CategoryId, count: number): KrsNode {
  const base = {
    id: stubId(category),
    annotations: [] as string[],
    children: [] as KrsNode[],
    edges: [],
    loc: ZERO_LOC,
    properties: { links: [] },
  };
  if (category === "infra") {
    return { ...base, kind: "database", label: `Infra (${count})`, tags: [CATEGORY_STUB_TAG] };
  }
  return {
    ...base,
    kind: "service",
    label: `External (${count})`,
    tags: [CATEGORY_STUB_TAG, "external"],
    properties: { links: [] },
  };
}

/**
 * Replace each collapsed category's nodes with a single stub. Edges touching the
 * removed nodes are dropped downstream by `computeLayoutEdges` (their endpoint is
 * no longer in `layoutNodes`), so only the node list is transformed here, before
 * layout — the diagram reflows and the collapsed tier shrinks to its stub.
 *
 * Returns the input array unchanged when nothing is collapsed.
 */
export function collapseNodeList(
  nodes: readonly KrsNode[],
  collapsed: ReadonlySet<CategoryId> | undefined,
): KrsNode[] {
  if (!collapsed || collapsed.size === 0) return nodes as KrsNode[];
  const kept: KrsNode[] = [];
  const counts = new Map<CategoryId, number>();
  for (const node of nodes) {
    const cat = categoryOf(node);
    if (cat !== null && collapsed.has(cat)) {
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    } else {
      kept.push(node);
    }
  }
  for (const cat of collapsed) {
    const count = counts.get(cat) ?? 0;
    if (count > 0) kept.push(stubNode(cat, count));
  }
  return kept;
}
