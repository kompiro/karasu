import type { KrsEdge, KrsNode } from "../types/ast.js";
import { quotedIdLiteral } from "../formatter/quote-id.js";
import type { DomainEdgeDetail, SystemFrameEdges, ViewSlice } from "../view/view-extract.js";

export type DiffState = "unchanged" | "added" | "removed" | "changed";

export interface NodeDiffMeta {
  state: DiffState;
  changes?: {
    label?: { before?: string; after?: string };
    annotations?: { added: string[]; removed: string[] };
    description?: { before?: string; after?: string };
  };
}

export interface EdgeDiffMeta {
  state: DiffState;
  changes?: {
    /**
     * Set when both sides had an aggregated implicit edge between the same
     * service pair but the underlying constituent domain edges differ.
     */
    domainEdges?: {
      added: DomainEdgeDetail[];
      removed: DomainEdgeDetail[];
    };
  };
}

export interface DiffedView {
  /** Union ViewSlice — passed to the existing layout/render pipeline. */
  slice: ViewSlice;
  /** Diff state keyed by node id. Includes ghost users and child nodes. */
  nodes: Map<string, NodeDiffMeta>;
  /**
   * Diff state keyed by {@link edgeKey}.
   * Matches the LayoutEdge identification used by svg-renderer; sync/async
   * pairs that share endpoints are treated as a single edge for diff purposes.
   */
  edges: Map<string, EdgeDiffMeta>;
}

/**
 * Compare-mode identity of an edge: the key every diff map is written under
 * and every renderer reads back (`svg-renderer.ts`, `group-collapse.ts`, the
 * root view's per-frame lookup in `layout.ts`, the deploy ghost-edge diff).
 * Build it here and nowhere else, so the writers and readers cannot drift
 * apart (TPL-1352).
 *
 * A plain `${from}->${to}` join is not injective: a quoted id may contain
 * `->`, so `a -> "b->c"` and `"a->b" -> c` both joined to `a->b->c` and the
 * two edges shared one diff state (#2819). An endpoint that would make the
 * join ambiguous (it carries the `->` separator, or the `"` / `\` the quoted
 * form is built from) is therefore wrapped in the `.krs` string-literal form,
 * the same rule `nodePathRefId` applies to path segments (ADR-2714). The key
 * then splits one way only: a bare `from` has no `->` in it and cannot end the
 * separator early (`->` does not overlap itself), and a quoted `from` ends at
 * its closing quote. Every other edge keeps the `${from}->${to}` it always had.
 */
export function edgeKey(edge: Pick<KrsEdge, "from" | "to">): string {
  return `${quoteEdgeEndpoint(edge.from)}->${quoteEdgeEndpoint(edge.to)}`;
}

function quoteEdgeEndpoint(endpoint: string): string {
  return endpoint.includes("->") || /["\\]/.test(endpoint) ? quotedIdLiteral(endpoint) : endpoint;
}

function nodeChanges(before: KrsNode, after: KrsNode): NodeDiffMeta["changes"] | undefined {
  const out: NonNullable<NodeDiffMeta["changes"]> = {};
  if ((before.label ?? "") !== (after.label ?? "")) {
    out.label = { before: before.label, after: after.label };
  }
  const beforeAnn = new Set(before.annotations);
  const afterAnn = new Set(after.annotations);
  const added = [...afterAnn].filter((a) => !beforeAnn.has(a));
  const removed = [...beforeAnn].filter((a) => !afterAnn.has(a));
  if (added.length > 0 || removed.length > 0) {
    out.annotations = { added, removed };
  }
  const beforeDesc = before.properties.description;
  const afterDesc = after.properties.description;
  if ((beforeDesc ?? "") !== (afterDesc ?? "")) {
    out.description = { before: beforeDesc, after: afterDesc };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function diffNodeArray(
  before: readonly KrsNode[],
  after: readonly KrsNode[],
  diff: Map<string, NodeDiffMeta>,
): KrsNode[] {
  const beforeById = new Map(before.map((n) => [n.id, n]));
  const merged: KrsNode[] = [];
  const seen = new Set<string>();

  // Iterate in `after` order first so the union slice presents the new structure.
  for (const node of after) {
    const prev = beforeById.get(node.id);
    if (prev === undefined) {
      diff.set(node.id, { state: "added" });
      merged.push(node);
    } else {
      const changes = nodeChanges(prev, node);
      // Annotation-only changes are rendered as a badge diff (D-2 in the design
      // doc / Issue #738): the node body stays `unchanged` so figures with
      // frequent annotation churn remain readable, while `changes.annotations`
      // is still carried forward for the renderer and detail panel.
      const bodyChanged = changes !== undefined && (changes.label || changes.description);
      diff.set(node.id, { state: bodyChanged ? "changed" : "unchanged", changes });
      merged.push(node);
    }
    seen.add(node.id);
  }
  // Append removed nodes preserving their original order.
  for (const node of before) {
    if (seen.has(node.id)) continue;
    diff.set(node.id, { state: "removed" });
    merged.push(node);
  }
  return merged;
}

function diffEdgeArray(
  before: readonly KrsEdge[],
  after: readonly KrsEdge[],
  diff: Map<string, EdgeDiffMeta>,
): KrsEdge[] {
  const beforeByKey = new Map(before.map((e) => [edgeKey(e), e]));
  const merged: KrsEdge[] = [];
  const seen = new Set<string>();

  for (const edge of after) {
    const key = edgeKey(edge);
    diff.set(key, { state: beforeByKey.has(key) ? "unchanged" : "added" });
    merged.push(edge);
    seen.add(key);
  }
  for (const edge of before) {
    const key = edgeKey(edge);
    if (seen.has(key)) continue;
    diff.set(key, { state: "removed" });
    merged.push(edge);
  }
  return merged;
}

/**
 * Identity of one constituent domain edge within an aggregated edge. Local to
 * this module and never read back as text, so JSON is enough to keep it
 * injective: a `${from}->${to}#${label}` join let a quoted id carrying `->`
 * or `#` stand for a different pair (#2819).
 */
function detailKey(d: DomainEdgeDetail): string {
  return JSON.stringify([d.fromDomainId, d.toDomainId, d.label ?? ""]);
}

/**
 * For each aggregated implicit edge present in both slices, set-diff the
 * constituent domain edges. Produces a union detail map annotated with
 * per-row diffState and, when the set differs, updates the owning edge's
 * diff meta to `changed` with a `changes.domainEdges` payload.
 */
function diffImplicitEdgeDetails(
  before: ReadonlyMap<string, DomainEdgeDetail[]>,
  after: ReadonlyMap<string, DomainEdgeDetail[]>,
  edgeDiff: Map<string, EdgeDiffMeta>,
  edges: readonly KrsEdge[],
): Map<string, DomainEdgeDetail[]> {
  const merged = new Map<string, DomainEdgeDetail[]>();
  const keys = new Set<string>([...before.keys(), ...after.keys()]);
  // The details map is keyed `${from}->${to}#${kind}` (view-extract's
  // `groupKey`). Its diff state lives under `edgeKey` of the same edge, so map
  // one to the other through the edges themselves: cutting the detail key at
  // its first `#` misreads an endpoint that carries `#` or `->` (#2819).
  const edgeDiffKeyOf = new Map<string, string>();
  for (const edge of edges) {
    edgeDiffKeyOf.set(`${edge.from}->${edge.to}#${edge.kind}`, edgeKey(edge));
  }

  for (const key of keys) {
    const b = before.get(key);
    const a = after.get(key);
    const edgeDiffKey = edgeDiffKeyOf.get(key);

    if (b === undefined || a === undefined) {
      // Only one side has details. Leave the underlying edge's state as-is
      // (diffEdgeArray already classified it as added/removed). The detail
      // rows are preserved with the parent state so the panel can still list
      // them.
      const parentState = a === undefined ? "removed" : "added";
      const source = a ?? b!;
      merged.set(
        key,
        source.map((d) => ({ ...d, diffState: parentState })),
      );
      continue;
    }

    const beforeKeys = new Map(b.map((d) => [detailKey(d), d]));
    const afterKeys = new Map(a.map((d) => [detailKey(d), d]));
    const added: DomainEdgeDetail[] = [];
    const removed: DomainEdgeDetail[] = [];
    const rows: DomainEdgeDetail[] = [];

    for (const d of a) {
      if (beforeKeys.has(detailKey(d))) {
        rows.push({ ...d, diffState: "unchanged" });
      } else {
        const withState: DomainEdgeDetail = { ...d, diffState: "added" };
        rows.push(withState);
        added.push(d);
      }
    }
    for (const d of b) {
      if (!afterKeys.has(detailKey(d))) {
        const withState: DomainEdgeDetail = { ...d, diffState: "removed" };
        rows.push(withState);
        removed.push(d);
      }
    }
    merged.set(key, rows);

    if ((added.length > 0 || removed.length > 0) && edgeDiffKey !== undefined) {
      const meta = edgeDiff.get(edgeDiffKey);
      if (meta && meta.state === "unchanged") {
        edgeDiff.set(edgeDiffKey, {
          state: "changed",
          changes: { domainEdges: { added, removed } },
        });
      }
    }
  }

  return merged;
}

/**
 * Merge the per-system-frame edge sets of the two slices (#2756), frame by frame.
 *
 * Needed because the multi-system layout reads `systemEdges`, not `childEdges`:
 * without the merge, compare mode on a multi-system root would hand the layout
 * only the `after` frames, and every *removed* derived edge would vanish from the
 * drawing — the same silent drop this fix is closing, re-opened one mode over.
 *
 * A frame present on one side only is carried through as-is, so a system added or
 * deleted between the two revisions keeps its edges. `undefined` when neither
 * slice has frames, which is every view but the root one.
 */
/** Stand-in for the missing side of a frame that exists in only one revision. */
const EMPTY_DETAILS: ReadonlyMap<string, DomainEdgeDetail[]> = new Map();

function diffSystemFrames(
  before: ViewSlice,
  after: ViewSlice,
  edgeDiff: Map<string, EdgeDiffMeta>,
): ReadonlyMap<string, SystemFrameEdges> | undefined {
  const b = before.systemEdges;
  const a = after.systemEdges;
  if (!b && !a) return undefined;
  const merged = new Map<string, SystemFrameEdges>();
  for (const systemId of new Set([...(b?.keys() ?? []), ...(a?.keys() ?? [])])) {
    // Diff this frame into a map of its own, then fold it into the shared one.
    // The frame-scoped copy is what the layout reads: the shared map is keyed by
    // `${from}->${to}` with no system in it, so when two frames both hold an
    // `Api->Store` the second frame diffed overwrites the first and a removal in
    // one system reads back as `unchanged` (#2756). The shared map is still
    // filled, for the single-system path and the consumers keyed off it.
    //
    // A frame on one side only — a system added or deleted between the revisions
    // — diffs against an empty stand-in rather than being passed through. Passing
    // it through left its edges with no state of their own, so they fell back to
    // the shared map, and a system added beside one that already held the same
    // edge id rendered `unchanged` instead of `added`. Going through the same
    // helper answers it without a second way to build the same keys.
    const bf = b?.get(systemId);
    const af = a?.get(systemId);
    const frameDiff = new Map<string, EdgeDiffMeta>();
    const edges = diffEdgeArray(bf?.edges ?? [], af?.edges ?? [], frameDiff);
    const implicitEdgeDetails = diffImplicitEdgeDetails(
      bf?.implicitEdgeDetails ?? EMPTY_DETAILS,
      af?.implicitEdgeDetails ?? EMPTY_DETAILS,
      frameDiff,
      edges,
    );
    for (const [key, meta] of frameDiff) edgeDiff.set(key, meta);
    merged.set(systemId, {
      edges,
      implicitEdgeDetails,
      edgeDiffState: new Map([...frameDiff].map(([key, meta]) => [key, meta.state])),
    });
  }
  return merged;
}

/**
 * Produce a union ViewSlice of two system view slices plus per-element diff state.
 *
 * The merged slice contains every node and edge from either side, ordered with
 * the "after" elements first, so the existing layout engine lays out a single
 * graph in which unchanged elements have stable positions while added/removed
 * elements appear in the same neighborhood as their context.
 *
 * Aggregated implicit edges, ghost domains/systems, and resource label maps
 * are taken from `after` for now — refining their diff semantics is tracked
 * separately (see `docs/design/graphical-diff-viewer.md`).
 */
export function diffSystemViewSlices(before: ViewSlice, after: ViewSlice): DiffedView {
  const nodeDiff = new Map<string, NodeDiffMeta>();
  const edgeDiff = new Map<string, EdgeDiffMeta>();

  const childNodes = diffNodeArray(before.childNodes, after.childNodes, nodeDiff);
  const childEdges = diffEdgeArray(before.childEdges, after.childEdges, edgeDiff);
  const systems = diffNodeArray(before.systems, after.systems, nodeDiff);
  const crossSystemEdges = diffEdgeArray(before.crossSystemEdges, after.crossSystemEdges, edgeDiff);
  const ghostUsers = diffNodeArray(before.ghostUsers, after.ghostUsers, nodeDiff);
  const ghostUserEdges = diffEdgeArray(before.ghostUserEdges, after.ghostUserEdges, edgeDiff);

  const slice: ViewSlice = {
    containerNode: after.containerNode,
    childNodes,
    childEdges,
    ancestorChain: after.ancestorChain,
    ghostUsers,
    ghostUserEdges,
    systems,
    crossSystemEdges,
    // A union: a cross-system edge kept from `before` (a removal) still needs
    // its target path to anchor on, and `after` wins on a key both sides carry.
    crossSystemTargets: new Map([...before.crossSystemTargets, ...after.crossSystemTargets]),
    ghostSystems: after.ghostSystems,
    ghostSystemEdges: after.ghostSystemEdges,
    callerGhostSystems: after.callerGhostSystems,
    callerGhostSystemEdges: after.callerGhostSystemEdges,
    ghostDomains: after.ghostDomains,
    ghostDomainEdges: after.ghostDomainEdges,
    ghostEntities: after.ghostEntities,
    ghostEntityEdges: after.ghostEntityEdges,
    resourceLabelMap: after.resourceLabelMap,
    resourceInferredTagsMap: after.resourceInferredTagsMap,
    implicitEdgeDetails: diffImplicitEdgeDetails(
      before.implicitEdgeDetails,
      after.implicitEdgeDetails,
      edgeDiff,
      [...childEdges, ...crossSystemEdges, ...ghostUserEdges],
    ),
    systemEdges: diffSystemFrames(before, after, edgeDiff),
    expandedFrames: after.expandedFrames,
  };

  return { slice, nodes: nodeDiff, edges: edgeDiff };
}
