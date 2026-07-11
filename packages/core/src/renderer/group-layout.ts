/**
 * Group-aware layer assignment for the system view "Group by" mode (Issue
 * #1858, design `docs/design/system-view-grouping.md`). Phase P2a, slice A.
 *
 * The default system layout (`assignForcedSystemLayers` in `layout.ts`) buckets
 * nodes into kind tiers. Group-by mode instead buckets nodes into their **group**
 * (P2a: the owning team, resolved via `ownerIndex`) and lays the groups out as a
 * vertical stack, so each group's members are contiguous and can be enclosed in a
 * boundary frame.
 *
 * Two-level topological order (design § "計測 5"):
 *   1. Order the *groups* by a min-feedback-arc-set over the aggregated
 *      group→group edges (exhaustive ≤ 8 groups, greedy beyond; ties break by
 *      declaration order — deterministic and author-controllable).
 *   2. Within each group, longest-path layer the members on intra-group edges.
 *
 * The returned `layers` map has the same shape as `assignForcedSystemLayers`
 * (node id → row index), so the existing placement pipeline consumes it
 * unchanged; `groupBands` additionally records each group's row range so the
 * caller can draw a frame around it.
 *
 * Pure and structural (no AST imports) so it is unit-testable in isolation.
 */

export interface GroupedNode {
  id: string;
  /** Group this node belongs to, or `null` for an un-grouped node (infra / external / un-owned). */
  groupId: string | null;
  /**
   * Fallback ordering rank for un-grouped nodes, placed in a trailing band
   * below every group. Lower ranks sit higher (e.g. infra above external).
   */
  ungroupedRank: number;
}

export interface GroupedEdge {
  from: string;
  to: string;
}

export interface GroupBand {
  /** First row index occupied by this group (inclusive). */
  min: number;
  /** Last row index occupied by this group (inclusive). */
  max: number;
}

export interface GroupedLayerResult {
  /** Node id → row (layer) index, consumed by the existing placement pipeline. */
  layers: Map<string, number>;
  /** Group ids in vertical (top-to-bottom) order. */
  groupOrder: string[];
  /** Row range each group occupies, for drawing its boundary frame. */
  groupBands: Map<string, GroupBand>;
}

/**
 * Weighted directed group→group graph: `from → (to → weight)`. A nested map
 * rather than a flat `"from<sep>to"` string key, so an arbitrary team id (which
 * may contain any character, e.g. `team "ec team"`) can never collide with a
 * separator.
 */
export type GroupEdgeWeights = Map<string, Map<string, number>>;

/** Threshold below which group ordering is solved exactly (n! permutations). */
const EXHAUSTIVE_GROUP_LIMIT = 8;

function edgeWeight(weights: GroupEdgeWeights, from: string, to: string): number {
  return weights.get(from)?.get(to) ?? 0;
}

/** All (from, to, weight) triples of the group graph. */
function edgeTriples(weights: GroupEdgeWeights): { from: string; to: string; weight: number }[] {
  const out: { from: string; to: string; weight: number }[] = [];
  for (const [from, tos] of weights) {
    for (const [to, weight] of tos) out.push({ from, to, weight });
  }
  return out;
}

/**
 * Longest-path layering (0-based) over `ids` using `pairs` as dependency edges.
 * Cycle-safe: relaxation is bounded by `ids.length` passes, so a back edge in a
 * strongly-connected component simply stops contributing instead of looping.
 */
function longestPathLayers(ids: string[], pairs: GroupedEdge[]): Map<string, number> {
  const idSet = new Set(ids);
  const layer = new Map<string, number>(ids.map((id) => [id, 0]));
  const es = pairs.filter((e) => idSet.has(e.from) && idSet.has(e.to));
  for (let pass = 0; pass <= ids.length; pass++) {
    let changed = false;
    for (const e of es) {
      const want = (layer.get(e.from) ?? 0) + 1;
      if ((layer.get(e.to) ?? 0) < want) {
        layer.set(e.to, want);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return layer;
}

/** Aggregate node→node edges into a weighted group→group graph (self-loops dropped). */
function aggregateGroupEdges(
  edges: GroupedEdge[],
  groupOf: Map<string, string | null>,
): GroupEdgeWeights {
  const weights: GroupEdgeWeights = new Map();
  for (const e of edges) {
    const ga = groupOf.get(e.from);
    const gb = groupOf.get(e.to);
    if (!ga || !gb || ga === gb) continue;
    let tos = weights.get(ga);
    if (!tos) {
      tos = new Map();
      weights.set(ga, tos);
    }
    tos.set(gb, (tos.get(gb) ?? 0) + 1);
  }
  return weights;
}

function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const p of permutations(rest)) out.push([arr[i], ...p]);
  }
  return out;
}

/**
 * Order groups so dependencies flow top-to-bottom. Minimises the total weight of
 * backward (against-flow) group edges — a min feedback-arc-set — because an
 * acyclic node graph can still aggregate into a cyclic group graph (design §
 * "計測 4"), so a strict topological order need not exist.
 *
 * Tie-break order: fewer backward *edges*, then smaller total span, then the
 * declared order — every tie resolves deterministically and the author's
 * declaration order wins when nothing else distinguishes two layouts.
 *
 * ≤ 8 groups: exhaustive (≤ 40 320 perms). Beyond: a greedy Eades–Lin–Smyth
 * sweep (linear), which is a good FAS approximation for larger group counts.
 */
export function orderGroups(declaredOrder: string[], weights: GroupEdgeWeights): string[] {
  if (declaredOrder.length <= 1) return [...declaredOrder];
  const triples = edgeTriples(weights);

  if (declaredOrder.length <= EXHAUSTIVE_GROUP_LIMIT) {
    let best: { order: string[]; w: number; n: number; span: number } | null = null;
    for (const perm of permutations(declaredOrder)) {
      const pos = new Map(perm.map((g, i) => [g, i]));
      let w = 0;
      let n = 0;
      let span = 0;
      for (const { from, to, weight } of triples) {
        const d = (pos.get(to) ?? 0) - (pos.get(from) ?? 0);
        span += weight * Math.abs(d);
        if (d < 0) {
          w += weight;
          n += 1;
        }
      }
      // `permutations` yields the identity (declared) permutation first, and the
      // strict `<` comparisons keep it unless a later permutation is strictly
      // better — so declaration order is the final tie-break winner.
      const better =
        best === null ||
        w < best.w ||
        (w === best.w && (n < best.n || (n === best.n && span < best.span)));
      if (better) best = { order: [...perm], w, n, span };
    }
    return best!.order;
  }

  // Greedy Eades–Lin–Smyth: repeatedly peel sinks to the tail and sources to the
  // head; break the remaining cyclic core by the largest (out−in) weight, then
  // declaration order. Approximates the min feedback-arc-set in linear time.
  const remaining = new Set(declaredOrder);
  const head: string[] = [];
  const tail: string[] = [];
  const live = (a: string, b: string) =>
    remaining.has(a) && remaining.has(b) ? edgeWeight(weights, a, b) : 0;
  while (remaining.size > 0) {
    let peeled = true;
    while (peeled) {
      peeled = false;
      for (const g of declaredOrder) {
        if (!remaining.has(g)) continue;
        let out = 0;
        for (const h of remaining) out += live(g, h);
        if (out === 0) {
          tail.unshift(g);
          remaining.delete(g);
          peeled = true;
        }
      }
    }
    peeled = true;
    while (peeled) {
      peeled = false;
      for (const g of declaredOrder) {
        if (!remaining.has(g)) continue;
        let inc = 0;
        for (const h of remaining) inc += live(h, g);
        if (inc === 0) {
          head.push(g);
          remaining.delete(g);
          peeled = true;
        }
      }
    }
    if (remaining.size === 0) break;
    let pick: string | null = null;
    let pickScore = -Infinity;
    for (const g of declaredOrder) {
      if (!remaining.has(g)) continue;
      let out = 0;
      let inc = 0;
      for (const h of remaining) {
        out += live(g, h);
        inc += live(h, g);
      }
      if (out - inc > pickScore) {
        pickScore = out - inc;
        pick = g;
      }
    }
    if (pick) {
      head.push(pick);
      remaining.delete(pick);
    }
  }
  return [...head, ...tail];
}

/**
 * Assign every node a row index so its group's members are contiguous and groups
 * stack in dependency order. Un-grouped nodes are placed in a trailing band
 * below all groups, ordered by `ungroupedRank` then intra-band longest path.
 *
 * Returns `null` when there are no groups at all — the caller then falls back to
 * the ungrouped system layout, so "Group by: none" and "an org with no owns"
 * both keep today's behavior.
 */
export function assignGroupedLayers(
  nodes: GroupedNode[],
  edges: GroupedEdge[],
  declaredGroupOrder: string[],
): GroupedLayerResult | null {
  const groupOf = new Map<string, string | null>(nodes.map((n) => [n.id, n.groupId]));
  const presentGroups = declaredGroupOrder.filter((g) => nodes.some((n) => n.groupId === g));
  if (presentGroups.length === 0) return null;

  const groupOrder = orderGroups(presentGroups, aggregateGroupEdges(edges, groupOf));

  const layers = new Map<string, number>();
  const groupBands = new Map<string, GroupBand>();
  let base = 0;

  for (const groupId of groupOrder) {
    const memberIds = nodes.filter((n) => n.groupId === groupId).map((n) => n.id);
    const sub = longestPathLayers(memberIds, edges);
    let maxSub = 0;
    for (const id of memberIds) {
      layers.set(id, base + (sub.get(id) ?? 0));
      maxSub = Math.max(maxSub, sub.get(id) ?? 0);
    }
    groupBands.set(groupId, { min: base, max: base + maxSub });
    base += maxSub + 1;
  }

  // Un-grouped nodes: a trailing band below every group. Order by `ungroupedRank`
  // (e.g. infra above external), then longest-path within each rank so read/write
  // chains among un-grouped nodes still flow downward.
  const ungrouped = nodes.filter((n) => n.groupId === null);
  if (ungrouped.length > 0) {
    const ranks = [...new Set(ungrouped.map((n) => n.ungroupedRank))].sort((a, b) => a - b);
    for (const rank of ranks) {
      const ids = ungrouped.filter((n) => n.ungroupedRank === rank).map((n) => n.id);
      const sub = longestPathLayers(ids, edges);
      let maxSub = 0;
      for (const id of ids) {
        layers.set(id, base + (sub.get(id) ?? 0));
        maxSub = Math.max(maxSub, sub.get(id) ?? 0);
      }
      base += maxSub + 1;
    }
  }

  return { layers, groupOrder, groupBands };
}
