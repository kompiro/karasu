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
  /**
   * Every group this node is *declared* in, in declaration order (#2176). The
   * node is still placed exactly once, in `groupId` — this is what lets the
   * band order pull its other groups next door and the seam bias put it on the
   * row that touches them. Omitted (the team axis, which stays 1:1) reduces to
   * `[groupId]`, so both terms below vanish and the layout is what it was.
   */
  memberships?: readonly string[];
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

interface GroupedLayerResult {
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

/**
 * Undirected group↔group co-membership counts: how many nodes each pair of
 * groups shares (#2176). Stored symmetrically (both directions carry the same
 * count) so a lookup never has to normalise the pair order.
 *
 * Empty on the team axis and on any model without multi-membership, which is
 * what keeps the ordering below identical to what it was.
 */
export type CoMembershipWeights = Map<string, Map<string, number>>;

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

/**
 * Count the nodes each pair of groups shares, over `groups` only (#2176).
 *
 * Restricted to the groups that actually get a band: a membership naming a
 * group with no band cannot be brought next door by reordering, so counting it
 * would only bias the order towards a neighbour that is not drawn.
 */
function aggregateCoMembership(
  nodes: readonly GroupedNode[],
  groups: readonly string[],
): CoMembershipWeights {
  const banded = new Set(groups);
  const weights: CoMembershipWeights = new Map();
  const bump = (a: string, b: string): void => {
    let tos = weights.get(a);
    if (!tos) {
      tos = new Map();
      weights.set(a, tos);
    }
    tos.set(b, (tos.get(b) ?? 0) + 1);
  };
  for (const n of nodes) {
    const ids = [...new Set(n.memberships ?? [])].filter((g) => banded.has(g));
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        bump(ids[i], ids[j]);
        bump(ids[j], ids[i]);
      }
    }
  }
  return weights;
}

/**
 * How far apart a permutation leaves the groups that share members: each shared
 * node costs the number of bands between its two groups, so adjacent groups
 * cost nothing (#2176). Zero for every permutation when nothing is shared.
 */
function coMembershipSeparation(weights: CoMembershipWeights, pos: Map<string, number>): number {
  let cost = 0;
  for (const [a, tos] of weights) {
    for (const [b, count] of tos) {
      // Each unordered pair is stored twice; count it once.
      if (a >= b) continue;
      const gap = Math.abs((pos.get(a) ?? 0) - (pos.get(b) ?? 0));
      cost += count * Math.max(0, gap - 1);
    }
  }
  return cost;
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
 * Tie-break order: fewer backward *edges*, then less co-membership separation
 * (#2176), then smaller total span, then the declared order — every tie
 * resolves deterministically and the author's declaration order wins when
 * nothing else distinguishes two layouts.
 *
 * The co-membership term sits *below* the feedback-arc-set terms, so pulling
 * two boundaries together never costs the diagram its top-to-bottom dependency
 * flow, and *above* the span term, so a share that can be made adjacent is —
 * a shared node's two frames can only overlap when their bands touch (#2179).
 * It is identically 0 for every permutation when nothing is shared, so the
 * comparison falls straight through to `span` and the order is unchanged.
 *
 * ≤ 8 groups: exhaustive (≤ 40 320 perms). Beyond: a greedy Eades–Lin–Smyth
 * sweep (linear), which is a good FAS approximation for larger group counts.
 */
export function orderGroups(
  declaredOrder: string[],
  weights: GroupEdgeWeights,
  coWeights: CoMembershipWeights = new Map(),
): string[] {
  if (declaredOrder.length <= 1) return [...declaredOrder];
  const triples = edgeTriples(weights);

  if (declaredOrder.length <= EXHAUSTIVE_GROUP_LIMIT) {
    let best: { order: string[]; w: number; n: number; co: number; span: number } | null = null;
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
      const co = coMembershipSeparation(coWeights, pos);
      // `permutations` yields the identity (declared) permutation first, and the
      // strict `<` comparisons keep it unless a later permutation is strictly
      // better — so declaration order is the final tie-break winner.
      const better =
        best === null ||
        w < best.w ||
        (w === best.w &&
          (n < best.n || (n === best.n && (co < best.co || (co === best.co && span < best.span)))));
      if (better) best = { order: [...perm], w, n, co, span };
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
  return improveCoMembership([...head, ...tail], triples, coWeights);
}

/**
 * Best-effort co-membership pass for the greedy branch (> 8 groups, #2176).
 *
 * The exhaustive branch gets adjacency for free by scoring it in the cost
 * tuple; the greedy sweep has no such knob, so instead we take its answer and
 * swap adjacent pairs that bring shared groups closer **without worsening the
 * feedback-arc-set** — the same precedence, applied locally. Bounded by the
 * group count, and a no-op when nothing is shared.
 *
 * Explicitly weaker than the exhaustive branch: a share that only a non-local
 * move could make adjacent stays non-adjacent, and falls back to the 縮退 tab
 * (#2179). Large group counts trade optimality for a linear ordering pass.
 */
function improveCoMembership(
  order: string[],
  triples: { from: string; to: string; weight: number }[],
  coWeights: CoMembershipWeights,
): string[] {
  if (coWeights.size === 0 || order.length < 3) return order;
  const score = (candidate: string[]): { w: number; n: number; co: number } => {
    const pos = new Map(candidate.map((g, i) => [g, i]));
    let w = 0;
    let n = 0;
    for (const { from, to, weight } of triples) {
      if ((pos.get(to) ?? 0) - (pos.get(from) ?? 0) < 0) {
        w += weight;
        n += 1;
      }
    }
    return { w, n, co: coMembershipSeparation(coWeights, pos) };
  };
  let current = [...order];
  let best = score(current);
  for (let pass = 0; pass < order.length; pass++) {
    let improved = false;
    for (let i = 0; i + 1 < current.length; i++) {
      const candidate = [...current];
      [candidate[i], candidate[i + 1]] = [candidate[i + 1], candidate[i]];
      const s = score(candidate);
      if (s.w <= best.w && s.n <= best.n && s.co < best.co) {
        current = candidate;
        best = s;
        improved = true;
      }
    }
    if (!improved) break;
  }
  return current;
}

/**
 * The group order handed to `assignGroupedLayers`: the axis map's own order,
 * then every *declared* group it does not name (#2178).
 *
 * Deriving the order from the axis map alone drops a group whose members are
 * all claimed by an earlier one, and a group with no members at all — declared,
 * labelled, and yet non-existent to the band machinery (TPL-2161). Declarations
 * supply existence; the axis supplies membership.
 *
 * The axis part comes first so groups that do have members keep exactly the
 * order they have today (which is declaration order — the parser fills the axis
 * in `contains` order). The appended ids have no member to band, so
 * `assignGroupedLayers` filters them out until placement can reach them (#2176)
 * — the order is complete either way.
 */
export function groupOrderFor(
  groupIndex: Map<string, string>,
  declaredGroupOrder: readonly string[] | undefined,
): string[] {
  const order = [...new Set(groupIndex.values())];
  if (declaredGroupOrder === undefined) return order;
  const seen = new Set(order);
  for (const groupId of declaredGroupOrder) {
    if (seen.has(groupId)) continue;
    seen.add(groupId);
    order.push(groupId);
  }
  return order;
}

/**
 * Move each shared member to the row of its band that **touches** the band of
 * another group it belongs to — the seam (#2176).
 *
 * A shared node's two frames can only overlap when one reaches one row out of
 * its band (#2179), so the closer the node sits to the seam, the smaller the
 * reach and the overlap. Only an *adjacent* band is worth reaching for; a group
 * two bands away cannot be reached whatever row the node takes, and falls back
 * to the 縮退 tab.
 *
 * **The dependency flow wins.** A node only moves when its intra-group edges
 * permit it: to the last row only if nothing inside the group depends on it, to
 * the first only if it depends on nothing inside the group. (The latter is
 * already where longest-path layering puts it, so the first-row branch is a
 * no-op today — it is written out so the rule stays true if the layering ever
 * changes.) A node that cannot move keeps the row it had.
 *
 * Mutates `sub` in place: this only rewrites row indexes, never adds or drops
 * an entry, so every node is still placed exactly once (TPL-1738).
 */
function applySeamBias(
  members: readonly GroupedNode[],
  memberIds: readonly string[],
  edges: readonly GroupedEdge[],
  sub: Map<string, number>,
  maxSub: number,
  groupId: string,
  groupPos: ReadonlyMap<string, number>,
): void {
  if (maxSub === 0) return; // A one-row band is its own seam, both ways.
  const self = groupPos.get(groupId);
  if (self === undefined) return;
  const inGroup = new Set(memberIds);
  const intra = edges.filter((e) => inGroup.has(e.from) && inGroup.has(e.to));
  for (const n of members) {
    // The first *adjacent* co-membership in declaration order decides the
    // direction, so a node shared with a band above and one below resolves
    // deterministically to whichever the author declared first.
    let want: "first" | "last" | null = null;
    for (const other of n.memberships ?? []) {
      if (other === groupId) continue;
      const d = (groupPos.get(other) ?? Number.NaN) - self;
      if (d === -1) want = "first";
      else if (d === 1) want = "last";
      else continue;
      break;
    }
    if (want === "last" && !intra.some((e) => e.from === n.id)) sub.set(n.id, maxSub);
    else if (want === "first" && !intra.some((e) => e.to === n.id)) sub.set(n.id, 0);
  }
}

/** The placement axis plus the band order it implies — see {@link resolvePlacementAxis}. */
interface PlacementAxis {
  /** Node id → the group whose band places it. */
  axis: Map<string, string>;
  /**
   * Group order for {@link assignGroupedLayers}, seeded from the *primary* axis
   * so a claim gives a boundary a body without also reshuffling the stack.
   */
  groupOrder: string[];
}

/**
 * The 1:1 axis a banded layout places by, resolved from the declared 1:N
 * membership for one canvas (#2176).
 *
 * A node's placement group is its **primary** — the first boundary it was
 * declared in (#2178) — with one exception. A boundary whose members are *all*
 * claimed by an earlier one has nothing in the primary axis, so it gets no
 * band, and with no band there is no frame and no label: it is declared,
 * labelled, and absent from the diagram (the state TPL-1503 rules out, and the
 * one #2161's prototype reproduced). Such a boundary instead **claims one of
 * its shared members** on this canvas, which gives it a body to draw.
 *
 * The claim is bounded so it can only ever add a frame, never remove one:
 *
 * - only a member that is *present* on this canvas counts — the axis is
 *   model-wide, the band machinery is per-canvas;
 * - only a member whose current group keeps **another** present member is
 *   taken, so filling one band can never empty another;
 * - bandless boundaries are resolved in declaration order and members in
 *   membership order, and each claim updates the counts the next one sees, so
 *   the result is deterministic and no member is claimed twice.
 *
 * A boundary with no eligible member keeps no band — the honest answer when the
 * only candidate is the last member of its own band. The node still appears
 * exactly once either way (TPL-1738); what moves is which frame draws it, which
 * is why this runs *before* the collapse pass, so the frame and the group a
 * collapse folds into cannot disagree.
 */
export function resolvePlacementAxis(
  membership: ReadonlyMap<string, readonly string[]>,
  declaredGroupOrder: readonly string[] | undefined,
  presentNodeIds: ReadonlySet<string>,
): PlacementAxis {
  const axis = new Map<string, string>();
  for (const [nodeId, groupIds] of membership) {
    // `primaryBoundaryOf` (types/ast.ts) is the definition of "primary"; it is
    // spelled out rather than imported to keep this module free of AST imports.
    // `boundary-membership.test.ts` pins the two to the same answer (TPL-1032).
    if (groupIds.length > 0) axis.set(nodeId, groupIds[0]);
  }
  // Seeded from the *primary* axis, before any claim below: the band order is
  // the author's declaration order (the parser fills membership in `contains`
  // order), and giving a boundary a body must not also reshuffle the stack.
  const groupOrder = groupOrderFor(axis, declaredGroupOrder);

  /** Present members each group currently holds — the count a claim must not empty. */
  const held = new Map<string, number>();
  for (const [nodeId, groupId] of axis) {
    if (presentNodeIds.has(nodeId)) held.set(groupId, (held.get(groupId) ?? 0) + 1);
  }

  const declared = declaredGroupOrder ?? [
    ...new Set([...membership.values()].flatMap((ids) => [...ids])),
  ];
  for (const groupId of declared) {
    if ((held.get(groupId) ?? 0) > 0) continue;
    for (const [nodeId, groupIds] of membership) {
      if (!presentNodeIds.has(nodeId) || !groupIds.includes(groupId)) continue;
      const from = axis.get(nodeId);
      if (from === undefined || from === groupId) continue;
      if ((held.get(from) ?? 0) < 2) continue;
      axis.set(nodeId, groupId);
      held.set(from, (held.get(from) ?? 0) - 1);
      held.set(groupId, 1);
      // A claimed group now has a member, so it must be in the band order or
      // `assignGroupedLayers` would filter it out of `presentGroups` and leave
      // its member with no row at all. Already there whenever the caller passed
      // `declaredGroupOrder`; this covers the callers that do not.
      if (!groupOrder.includes(groupId)) groupOrder.push(groupId);
      break;
    }
  }
  return { axis, groupOrder };
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
  /**
   * The tier the team bands occupy (the service tier, `systemTier` 2). Un-grouped
   * nodes ranked *above* it (actors / clients) stay above the bands and those *at
   * or below* it (un-owned services, infra, external) stay below — so the overall
   * user → client → service → infra → external flow survives grouping.
   */
  groupTier = 2,
): GroupedLayerResult | null {
  const groupOf = new Map<string, string | null>(nodes.map((n) => [n.id, n.groupId]));
  const presentGroups = declaredGroupOrder.filter((g) => nodes.some((n) => n.groupId === g));
  if (presentGroups.length === 0) return null;

  const coWeights = aggregateCoMembership(nodes, presentGroups);
  const groupOrder = orderGroups(presentGroups, aggregateGroupEdges(edges, groupOf), coWeights);
  const groupPos = new Map(groupOrder.map((g, i) => [g, i]));

  const layers = new Map<string, number>();
  const groupBands = new Map<string, GroupBand>();
  let base = 0;

  // Place un-grouped nodes one band per distinct rank (ascending), longest-path
  // sub-layering within each so read/write chains still flow downward.
  const placeRankBands = (subset: GroupedNode[]) => {
    const ranks = [...new Set(subset.map((n) => n.ungroupedRank))].sort((a, b) => a - b);
    for (const rank of ranks) {
      const ids = subset.filter((n) => n.ungroupedRank === rank).map((n) => n.id);
      const sub = longestPathLayers(ids, edges);
      let maxSub = 0;
      for (const id of ids) {
        layers.set(id, base + (sub.get(id) ?? 0));
        maxSub = Math.max(maxSub, sub.get(id) ?? 0);
      }
      base += maxSub + 1;
    }
  };

  const ungrouped = nodes.filter((n) => n.groupId === null);

  // Actors / clients (rank < groupTier) stay above the team bands.
  placeRankBands(ungrouped.filter((n) => n.ungroupedRank < groupTier));

  // Team bands occupy the service tier's slot, in dependency order.
  for (const groupId of groupOrder) {
    const members = nodes.filter((n) => n.groupId === groupId);
    const memberIds = members.map((n) => n.id);
    const sub = longestPathLayers(memberIds, edges);
    let maxSub = 0;
    for (const id of memberIds) maxSub = Math.max(maxSub, sub.get(id) ?? 0);
    applySeamBias(members, memberIds, edges, sub, maxSub, groupId, groupPos);
    for (const id of memberIds) layers.set(id, base + (sub.get(id) ?? 0));
    groupBands.set(groupId, { min: base, max: base + maxSub });
    base += maxSub + 1;
  }

  // Un-owned services, infra and external (rank >= groupTier) stay below.
  placeRankBands(ungrouped.filter((n) => n.ungroupedRank >= groupTier));

  return { layers, groupOrder, groupBands };
}
