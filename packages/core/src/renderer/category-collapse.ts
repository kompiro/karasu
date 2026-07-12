import { INFRA_KIND_SET, type KrsNode, type KrsEdge } from "../types/ast.js";
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

/**
 * Which collapsible category a system-view node belongs to, or `null`.
 * Structural so it works on both `KrsNode` (pre-layout filtering) and
 * `LayoutNode` (post-layout grouping for the ⊖ control and hover frame).
 */
export function categoryOf(node: { kind: string; tags?: readonly string[] }): CategoryId | null {
  if (INFRA_KIND_SET.has(node.kind)) return "infra";
  if (node.tags?.includes("external")) return "external";
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

interface CategoryCollapseResult {
  nodes: KrsNode[];
  edges: KrsEdge[];
  /**
   * The endpoint remap this collapse applied to `edges` (a collapsed-category
   * member id → its category stub id; identity otherwise). Exposed so callers
   * can re-anchor *other* id lists that reference the same members — e.g. the
   * ghost-edge lists on the ViewSlice — the way `collapseGroups` does (#1874).
   * Identity when nothing collapsed.
   */
  remapEndpoint: (id: string) => string;
}

/**
 * Replace each collapsed category's nodes with a single stub and **re-target**
 * every edge that crossed the category boundary onto the stub — mirroring
 * `collapseGroups` (#1858). An endpoint in a collapsed category becomes that
 * category's stub; edges fully inside one collapsed category fold to a self-loop
 * and are dropped; the rest are de-duplicated per `(from, to, kind)`. So
 * collapsing external/infra keeps the "who depends on the external/infra layer"
 * edges as aggregation trunks to the stub, instead of dropping them (which is
 * what folding the node list alone used to do). Returns the input unchanged when
 * nothing collapses.
 */
export function collapseCategories(
  nodes: readonly KrsNode[],
  edges: readonly KrsEdge[],
  collapsed: ReadonlySet<CategoryId> | undefined,
): CategoryCollapseResult {
  if (!collapsed || collapsed.size === 0) {
    return { nodes: nodes as KrsNode[], edges: edges as KrsEdge[], remapEndpoint: (id) => id };
  }
  const catOfId = new Map<string, CategoryId>();
  const kept: KrsNode[] = [];
  const counts = new Map<CategoryId, number>();
  for (const node of nodes) {
    const cat = categoryOf(node);
    if (cat !== null && collapsed.has(cat)) {
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
      catOfId.set(node.id, cat);
    } else {
      kept.push(node);
    }
  }
  for (const cat of collapsed) {
    const count = counts.get(cat) ?? 0;
    if (count > 0) kept.push(stubNode(cat, count));
  }

  const remap = (id: string): string => {
    const cat = catOfId.get(id);
    return cat !== undefined ? stubId(cat) : id;
  };
  const outEdges: KrsEdge[] = [];
  const seen = new Set<string>();
  for (const edge of edges) {
    const from = remap(edge.from);
    const to = remap(edge.to);
    if (from === edge.from && to === edge.to) {
      // Neither endpoint collapsed: pass through untouched so authored parallel
      // edges between two surviving nodes all survive, along with self-loops.
      outEdges.push(edge);
      continue;
    }
    if (from === to) continue; // both endpoints folded into the same stub
    const key = `${from} ${to} ${edge.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // A re-targeted edge stands for one-or-more real edges, so its authored
    // label no longer describes it — drop the label but keep the sync/async kind.
    outEdges.push({ ...edge, from, to, label: undefined });
  }

  return { nodes: kept, edges: outEdges, remapEndpoint: remap };
}

/**
 * Node-only category collapse for call sites that lay out a node list without
 * needing edge re-targeting (per-system layering). Delegates the folding to
 * {@link collapseCategories}. Returns the input array unchanged when nothing
 * is collapsed.
 */
export function collapseNodeList(
  nodes: readonly KrsNode[],
  collapsed: ReadonlySet<CategoryId> | undefined,
): KrsNode[] {
  return collapseCategories(nodes, [], collapsed).nodes;
}
