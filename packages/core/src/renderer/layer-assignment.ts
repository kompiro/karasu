/**
 * Layer assignment for the layout pipelines (#2512): the dependency graph,
 * cycle guard, kind-tier forced layering for the system view, the topological
 * fallback, per-edge direction hints, and the shared computeLayers phase that
 * strings them together for both the single- and multi-system paths (TPL-219).
 */
import type { KrsNode, KrsEdge } from "../types/ast.js";
import { INFRA_KIND_SET } from "../types/ast.js";
import type { EdgeDirection } from "../types/style.js";

function buildGraph(
  nodeIds: string[],
  edges: KrsEdge[],
  edgeDirections?: Map<string, EdgeDirection>,
): { adj: Map<string, string[]>; inDegree: Map<string, number> } {
  const idSet = new Set(nodeIds);
  const adj = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  for (const id of nodeIds) {
    adj.set(id, []);
    inDegree.set(id, 0);
  }

  // Pre-pass: build the dependency edges with `direction: up` applied as
  // logical reversals. If applying a reversal would close a cycle, drop the
  // reversal for that edge (keeping the original orientation) so layer
  // assignment stays valid. `down` / `auto` / `left` / `right` use the
  // natural `from -> to` orientation (left/right are not honored by the
  // layered layout — see docs/spec/style.md).
  const dependencyPairs: Array<{ from: string; to: string }> = [];
  for (const edge of edges) {
    if (!idSet.has(edge.from) || !idSet.has(edge.to)) continue;
    const direction = edgeDirections?.get(`${edge.from}->${edge.to}`);
    if (direction === "up") {
      dependencyPairs.push({ from: edge.to, to: edge.from });
    } else {
      dependencyPairs.push({ from: edge.from, to: edge.to });
    }
  }

  // Cycle guard: if `up` reversals introduce a cycle, retry without them.
  // We don't try to drop a minimal subset — for the MVP, falling back
  // entirely is honest and predictable.
  if (edgeDirections && hasCycle(nodeIds, dependencyPairs)) {
    dependencyPairs.length = 0;
    for (const edge of edges) {
      if (!idSet.has(edge.from) || !idSet.has(edge.to)) continue;
      dependencyPairs.push({ from: edge.from, to: edge.to });
    }
  }

  for (const pair of dependencyPairs) {
    adj.get(pair.from)!.push(pair.to);
    inDegree.set(pair.to, (inDegree.get(pair.to) ?? 0) + 1);
  }
  return { adj, inDegree };
}

/**
 * Apply `direction: up` / `direction: down` hints on top of an
 * already-assigned forced layer map. The forced kind-based layout in
 * system view (user → client → service → ...) ignores edge orientation
 * by design, so a topological reversal in `buildGraph` never reaches it.
 * Instead, for each hinted edge whose source currently sits on the wrong
 * side of its target, we push the source one layer past the target.
 * Other endpoints (and the target itself) are left in place, so a
 * single hint only perturbs the kind stratification for the involved
 * source.
 *
 *   - `up`:   source.layer  =  target.layer + 1   (source ends up below)
 *   - `down`: source.layer  =  target.layer - 1   (source ends up above)
 *
 * `down` is a no-op when the target is already at layer 0 — there is no
 * room to push the source above the topmost row, so the hint is silently
 * dropped (no warning) and the natural orientation is kept.
 *
 * The pass is intentionally simple: it walks the edges once, in
 * declaration order, applying each hint independently. A chain of hints
 * compounds naturally because each later hint reads the freshly-adjusted
 * layer of its target. Conflicting hints (e.g. `A -> B up` and
 * `B -> A up`) are resolved by last-wins, which is a documented quirk
 * rather than a cycle-guarded fallback — forced layers cannot deadlock
 * on a per-edge adjustment the way the topological DAG can.
 */
function applyDirectionHintsToForcedLayers(
  layers: Map<string, number>,
  edges: KrsEdge[],
  edgeDirections: Map<string, EdgeDirection>,
): Map<string, number> {
  const adjusted = new Map(layers);
  for (const edge of edges) {
    const dir = edgeDirections.get(`${edge.from}->${edge.to}`);
    if (dir === undefined || dir === "auto") continue;
    if (!adjusted.has(edge.from) || !adjusted.has(edge.to)) continue;
    const targetLayer = adjusted.get(edge.to)!;
    const fromLayer = adjusted.get(edge.from)!;
    if (dir === "up" && fromLayer <= targetLayer) {
      adjusted.set(edge.from, targetLayer + 1);
    } else if (dir === "down" && fromLayer >= targetLayer && targetLayer > 0) {
      adjusted.set(edge.from, targetLayer - 1);
    } else if ((dir === "left" || dir === "right") && fromLayer !== targetLayer) {
      // Pull the source into the target's layer so the within-layer
      // reorder pass can place them side by side. The forced kind layout
      // still informs every other node's row, so the perturbation is
      // local to the hinted source endpoint.
      adjusted.set(edge.from, targetLayer);
    }
  }
  return adjusted;
}

/**
 * Shared layering phase for the single- and multi-system pipelines: grouped
 * bands (when the Group-by axis produced them) win, then the kind-tier forced
 * layers, falling back to a topological sort; per-edge direction hints apply
 * last. Extracted so the two paths cannot drift on how a canvas turns nodes
 * into layers (TPL-219). `forcedLayers` is returned because both callers gate
 * their barycenter / column-hint passes on it.
 */
export function computeLayers(
  nodes: KrsNode[],
  edges: KrsEdge[],
  groupedLayers: Map<string, number> | null,
  edgeDirections: Map<string, EdgeDirection> | undefined,
): { layers: Map<string, number>; forcedLayers: Map<string, number> | null } {
  const nodeIds = nodes.map((n) => n.id);
  const forcedLayers = groupedLayers ?? assignForcedSystemLayers(nodes, edges);
  let layers: Map<string, number>;
  if (forcedLayers) {
    layers = forcedLayers;
  } else {
    const { adj, inDegree } = buildGraph(nodeIds, edges, edgeDirections);
    layers = assignLayers(nodeIds, adj, inDegree);
  }
  if (edgeDirections) {
    layers = applyDirectionHintsToForcedLayers(layers, edges, edgeDirections);
  }
  return { layers, forcedLayers };
}

function hasCycle(nodeIds: string[], pairs: Array<{ from: string; to: string }>): boolean {
  const adj = new Map<string, string[]>();
  for (const id of nodeIds) adj.set(id, []);
  for (const pair of pairs) adj.get(pair.from)?.push(pair.to);

  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const id of nodeIds) color.set(id, WHITE);

  const stack: Array<{ node: string; nextChild: number }> = [];
  for (const start of nodeIds) {
    if (color.get(start) !== WHITE) continue;
    stack.push({ node: start, nextChild: 0 });
    color.set(start, GRAY);
    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      const children = adj.get(top.node) ?? [];
      if (top.nextChild < children.length) {
        const next = children[top.nextChild++];
        const c = color.get(next);
        if (c === GRAY) return true;
        if (c === WHITE) {
          color.set(next, GRAY);
          stack.push({ node: next, nextChild: 0 });
        }
      } else {
        color.set(top.node, BLACK);
        stack.pop();
      }
    }
  }
  return false;
}

/**
 * Bucket a system-view node into one of five ordered tiers.
 * Lower index → upper row group.
 *
 *   0: user       — actor at the top of the access path
 *   1: client     — user-facing surface (mobile / web / desktop / etc.)
 *   2: internal   — services we own (and any other non-infra logical kinds)
 *   3: infra      — owned data stores (database/queue/storage) the services read/write
 *   4: external   — services that run in *another system* (`[external]`)
 *
 * Splitting the former combined "dep" tier (#1724): infra sits directly under
 * the internal services it backs (most read/write edges are short), and
 * external systems form a separate row below. This roughly halves the widest
 * bottom row when a model has many of both.
 *
 * Boundary rule: infra kinds (database/queue/storage) are always *inside* the
 * system boundary, so they stay in the infra tier regardless of an `[external]`
 * tag — the kind check comes before the tag check. The external tier is only
 * for nodes that genuinely live in another system (e.g. `service [external]`).
 * A `database [external]` is a modeling contradiction (an in-boundary store
 * tagged as another boundary); we keep it on the infra row rather than promote
 * it. See ADR-1724 (docs/adr/1724-system-view-infra-external-tier-split.md).
 */
const SYSTEM_TIER_COUNT = 5;
export function systemTier(node: KrsNode): 0 | 1 | 2 | 3 | 4 {
  if (node.kind === "user") return 0;
  if (node.kind === "client") return 1;
  if (INFRA_KIND_SET.has(node.kind)) return 3;
  if (node.tags.includes("external")) return 4;
  return 2;
}

/**
 * Force a kind-based layered placement for the system-view (Phase 6 of #823).
 *
 * Two-step layering:
 *   1. Bucket each node into one of five tiers (`systemTier`).
 *   2. Within each tier, run a fresh topological sort on the intra-tier
 *      edges to assign sub-rows. Cross-tier edges don't influence sub-rows
 *      (the tier order already pins them).
 *
 * Final row = (sum of tier heights of preceding tiers) + sub-row in own tier.
 * Empty tiers contribute zero height. So a system with `service A → B → C`
 * and a single `database D` yields A at row 0, B at row 1, C at row 2,
 * D at row 3 — the call chain flows top-to-bottom and the dep sits below.
 *
 * Returns `null` when no `user`, `client`, infra, or external node appears —
 * in that case there is no kind-based separation to enforce, so the caller
 * falls back to top-level topological layering. This keeps service drill-down
 * views (domains / usecases / resources) on the existing topo path.
 */
function assignForcedSystemLayers(nodes: KrsNode[], edges: KrsEdge[]): Map<string, number> | null {
  const occupied: boolean[] = new Array(SYSTEM_TIER_COUNT).fill(false);
  const byTier: KrsNode[][] = Array.from({ length: SYSTEM_TIER_COUNT }, () => []);
  for (const n of nodes) {
    const t = systemTier(n);
    occupied[t] = true;
    byTier[t].push(n);
  }

  // No system-view signal beyond plain internal services → let topo handle it.
  if (!occupied[0] && !occupied[1] && !occupied[3] && !occupied[4]) return null;

  // Per-tier sub-layer assignment via topological sort on intra-tier edges.
  const subLayers: Map<string, number>[] = byTier.map((tierNodes) => {
    if (tierNodes.length === 0) return new Map<string, number>();
    const ids = tierNodes.map((n) => n.id);
    const idSet = new Set(ids);
    const intraEdges = edges.filter((e) => idSet.has(e.from) && idSet.has(e.to));
    const { adj, inDegree } = buildGraph(ids, intraEdges);
    return assignLayers(ids, adj, inDegree);
  });

  // Tier base = cumulative height of preceding tiers (each tier contributes
  // (max sub-layer + 1) when occupied, 0 when empty).
  const tierBase: number[] = [];
  let acc = 0;
  for (let t = 0; t < SYSTEM_TIER_COUNT; t++) {
    tierBase.push(acc);
    if (occupied[t]) {
      let maxSub = 0;
      for (const n of byTier[t]) {
        maxSub = Math.max(maxSub, subLayers[t].get(n.id) ?? 0);
      }
      acc += maxSub + 1;
    }
  }

  const layers = new Map<string, number>();
  for (const n of nodes) {
    const t = systemTier(n);
    layers.set(n.id, tierBase[t] + (subLayers[t].get(n.id) ?? 0));
  }

  // Post-pass: mirror of the user pull-down for the infra tier (Issue #974).
  // An infra node used only by a service that sits above the deepest internal
  // service would otherwise be forced to the global bottom, with a long edge
  // cutting through several intermediate rows. Pull each infra node up to one
  // row below its deepest source. Strictly upward — never push a node down.
  // Infra with no incoming edges keeps the bottom-tier default.
  //
  // Iterate to a fixed point so that infra-on-infra chains propagate
  // regardless of `byTier[3]` order: when an upstream node gets pulled up,
  // its downstream consumers see the updated layer on the next pass.
  // Bounded by `byTier[3].length` iterations (each pass either pulls at
  // least one node up or terminates), so the cost stays linear.
  //
  // NB: this pull-up runs only on the infra tier (3), not on external (4).
  // External is the *upper* dep tier's sibling sitting strictly below it, so
  // pulling external up would let it collide with the infra row and undo the
  // infra/external split that narrows the diagram (#1724). External placement
  // is handled separately below.
  const infraIds = new Set(byTier[3].map((n) => n.id));
  const inByInfra = new Map<string, string[]>();
  for (const e of edges) {
    if (!infraIds.has(e.to)) continue;
    const list = inByInfra.get(e.to) ?? [];
    list.push(e.from);
    inByInfra.set(e.to, list);
  }
  for (let pass = 0; pass < byTier[3].length; pass++) {
    let changed = false;
    for (const d of byTier[3]) {
      const sources = inByInfra.get(d.id);
      if (!sources || sources.length === 0) continue;
      let maxSourceLayer = -Infinity;
      for (const sid of sources) {
        const sl = layers.get(sid);
        if (sl === undefined) continue;
        if (sl > maxSourceLayer) maxSourceLayer = sl;
      }
      if (!Number.isFinite(maxSourceLayer)) continue;
      const desired = maxSourceLayer + 1;
      const current = layers.get(d.id) ?? 0;
      if (desired < current) {
        layers.set(d.id, desired);
        changed = true;
      }
    }
    if (!changed) break;
  }

  // External tier (4): place it as a fresh band strictly below every other
  // node (services, domains, and infra after their pull-up). Third-party SaaS
  // reads as the outermost dependency, and keeping it on its own bottom band
  // — rather than merged with infra — is what halves the widest row (#1724).
  // We intentionally do NOT pull external up toward shallow consumers: that
  // would reintroduce the infra/external overlap. The resulting skip-layer
  // edges to external are rescued by orthogonal routing (ADR-968).
  if (byTier[4].length > 0) {
    const externalIds = new Set(byTier[4].map((n) => n.id));
    let maxOtherLayer = 0;
    for (const [id, l] of layers) {
      if (externalIds.has(id)) continue;
      if (l > maxOtherLayer) maxOtherLayer = l;
    }
    const externalBase = maxOtherLayer + 1;
    for (const n of byTier[4]) {
      layers.set(n.id, externalBase + (subLayers[4].get(n.id) ?? 0));
    }
  }

  // Post-pass: an actor that bypasses the client tier (e.g. an admin that
  // connects directly to a backend service) would otherwise sit in the top
  // row and have its edge cut through any intermediate client card. Pull
  // each user whose outgoing edges all target a deeper row down to one row
  // above its closest target. Users with no outgoing edges keep the tier-0
  // placement.
  //
  // Runs last, after the infra pull-up and the external band, so a user
  // whose only target is an in-boundary node is pulled down correctly.
  // External services (tier 4) are intentionally excluded from this
  // calculation: when the ≥2-hub gate engages they move to side columns
  // at service-tier height, so pulling a user toward their former
  // bottom-band layer index would strand the user in an empty row with a
  // long diagonal edge to the side column.  A user that targets only
  // externals keeps the default tier-0 placement.
  const outByUser = new Map<string, string[]>();
  for (const e of edges) {
    const fromNode = nodes.find((n) => n.id === e.from);
    if (!fromNode || fromNode.kind !== "user") continue;
    const list = outByUser.get(e.from) ?? [];
    list.push(e.to);
    outByUser.set(e.from, list);
  }
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  for (const u of byTier[0]) {
    const targets = outByUser.get(u.id);
    if (!targets || targets.length === 0) continue;
    let minTargetLayer = Infinity;
    for (const tid of targets) {
      const targetNode = nodeById.get(tid);
      if (targetNode && systemTier(targetNode) === 4) continue; // skip externals
      const tl = layers.get(tid);
      if (tl === undefined) continue;
      if (tl < minTargetLayer) minTargetLayer = tl;
    }
    if (!Number.isFinite(minTargetLayer)) continue;
    const desired = Math.max(0, minTargetLayer - 1);
    const current = layers.get(u.id) ?? 0;
    if (desired > current) layers.set(u.id, desired);
  }

  return layers;
}

function assignLayers(
  nodeIds: string[],
  adj: Map<string, string[]>,
  inDegree: Map<string, number>,
): Map<string, number> {
  const layers = new Map<string, number>();
  const queue: string[] = [];

  for (const id of nodeIds) {
    if ((inDegree.get(id) ?? 0) === 0) {
      queue.push(id);
      layers.set(id, 0);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentLayer = layers.get(current)!;

    for (const next of adj.get(current) ?? []) {
      const newLayer = currentLayer + 1;
      if (!layers.has(next) || layers.get(next)! < newLayer) {
        layers.set(next, newLayer);
      }
      inDegree.set(next, (inDegree.get(next) ?? 0) - 1);
      if (inDegree.get(next) === 0) {
        queue.push(next);
      }
    }
  }

  for (const id of nodeIds) {
    if (!layers.has(id)) {
      layers.set(id, 0);
    }
  }

  return layers;
}
