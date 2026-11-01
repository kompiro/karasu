import type { KrsNode, KrsEdge } from "../types/ast.js";
import { edgeKindKey } from "./edge-key.js";

export function nodeId(node: KrsNode): string {
  return node.id;
}

/**
 * Identity of a drawn edge: the endpoint pair **and** the arrow kind, so a
 * sync and an async edge between the same pair stay two edges. Suppression of
 * *derived* edges keys on the bare pair instead — see `explicitKeys`. Built by
 * {@link edgeKindKey}, so an endpoint carrying `->` cannot pose as another
 * pair (#3111).
 */
export function drawnEdgeKey(edge: KrsEdge): string {
  return edgeKindKey(edge);
}

/**
 * Does this edge start at the block that declares it? The **edge origin scope**
 * rule (spec § Edge declaration), stated once for every consumer: the parser
 * rejects a mismatch with `edge-source-mismatch` but keeps the declaration for
 * recovery, so the render side has to ask the same question again (#2501).
 *
 * Kept as one definition because the answer feeds three separate paths — the
 * peer canvas, the system-scope machinery, and the entity view — and a rule
 * spelled three times is a rule that drifts.
 */
export function isAnchoredAt(child: KrsNode, edge: KrsEdge): boolean {
  return edge.from === nodeId(child);
}

/**
 * The block kinds the parser binds to their own id, mirroring the `parentId`
 * it passes in `parser.ts` (`kind === "service" || "domain" || "entity"`). Only
 * these raise `edge-source-mismatch`, so only these have a diagnostic to carry
 * the signal when the render side drops an edge.
 */
const ORIGIN_SCOPED_KINDS: ReadonlySet<KrsNode["kind"]> = new Set(["service", "domain", "entity"]);

/**
 * May the parent canvas lift this edge off `child`? Anchored edges always may.
 * An edge in a block with **no** origin-scope rule may too, exactly as written:
 * `client W { S1 -> S2 }` parses clean and is reported by nothing, so guarding
 * it would drop it with no signal anywhere — the silent drop TPL-2075 forbids.
 * That placement is outside the spec either way; this keeps it as it was rather
 * than making it newly renderable or newly invisible.
 */
function isLiftableToPeerCanvas(child: KrsNode, edge: KrsEdge): boolean {
  return !ORIGIN_SCOPED_KINDS.has(child.kind) || isAnchoredAt(child, edge);
}

/**
 * Child-anchored edges (#2223). An edge declared inside a `service` / `domain`
 * block originates from that block (spec § Edge origin scope), so the canvas
 * that can draw it is the **parent's** — the one where the declaring block
 * itself is a node. Collecting them here is what gives `service S1 { S1 -> S2 }`
 * a rendering path at all; without it the edge sits on `S1.edges`, is only ever
 * consulted while drawing S1's own canvas, and can never satisfy that canvas's
 * "both endpoints are children of S1" filter.
 *
 * The peer set is the drawn siblings' ids, which is exactly the `peersOf` set
 * `detectEdgeEndpointsNotAtScope` uses (`resolver/warnings.ts`). Peer-ness is
 * not the whole keep condition, though: the edge must also be
 * {@link isLiftableToPeerCanvas}, which sends a source-mismatched declaration
 * to the **parser's** `edge-source-mismatch` instead (#2501). So an edge is
 * still drawn here or reported somewhere and never both, but "reported" now
 * spans both stages rather than this detector alone (TPL-2075).
 *
 * `entity` children are excluded: their relations render in the (separate)
 * entity view via `extractEntityView` (`entity-relations.ts`), and the
 * entities themselves are filtered out of this canvas's nodes.
 *
 * `drawnKeys` is read **and extended**, so callers can chain this after the
 * container's own edges and let those win on a duplicate spelling.
 */
export function collectAnchoredPeerEdges(children: KrsNode[], drawnKeys: Set<string>): KrsEdge[] {
  const renderable = children.filter((c) => c.kind !== "entity");
  const peerIds = new Set(renderable.map(nodeId));
  const anchored: KrsEdge[] = [];
  for (const child of renderable) {
    for (const edge of child.edges) {
      if (!isLiftableToPeerCanvas(child, edge)) continue;
      if (!peerIds.has(edge.from) || !peerIds.has(edge.to)) continue;
      const key = drawnEdgeKey(edge);
      if (drawnKeys.has(key)) continue;
      anchored.push(edge);
      drawnKeys.add(key);
    }
  }
  return anchored;
}

/**
 * A system's edges plus every edge anchored inside one of its child blocks
 * (#2223) — `service S { S -> Other.Svc }` is the service-scope spelling of
 * `system T { S -> Other.Svc }`, so it must feed the same system-scope
 * machinery: ghost systems, caller ghost systems, cross-system edges and
 * ghost users. Only {@link isAnchoredAt} edges are lifted, and the premise is
 * why: an edge is the child-scope spelling of a system-scope one *because* it
 * starts at the child. An edge that does not — `client W { S1 -> S2 }` — is no
 * such spelling, and feeding it here would attribute cross-system calls and
 * caller ghosts to a service that never declared them, and (this list carrying
 * no dedup of its own) draw a second parallel arrow beside the system-scope
 * edge it duplicates. Unlike {@link collectAnchoredPeerEdges}, this is not a
 * canvas keep-filter, so the extra allowance made there does not apply here.
 *
 * Exported for `renderer/layout.ts`: the multi-system / `__unassigned__` root
 * lays each system out from `sys.edges` rather than from `ViewSlice.childEdges`,
 * so it has to lift the anchored ones itself or the edge is dropped again
 * between extraction and layout.
 */
export function withChildAnchoredEdges(system: KrsNode): KrsEdge[] {
  const anchored = system.children.flatMap((child) =>
    child.edges.filter((e) => isAnchoredAt(child, e)),
  );
  return anchored.length > 0 ? [...system.edges, ...anchored] : system.edges;
}

/**
 * The edges a container's own canvas draws between its children before any
 * derivation: the edges declared at the container's scope whose endpoints are
 * both children, plus the edges anchored inside a child block that the parent
 * canvas may lift (#2223). For a `database` this is the **recorded** side of
 * the store's ER view — hand-written `table` edges and the foreign keys
 * `translate --from db` emitted — which is why `coverage` reads it (#2723).
 */
export function containerCanvasEdges(container: KrsNode): KrsEdge[] {
  const childIds = new Set(container.children.map(nodeId));
  const ownEdges = container.edges.filter((e) => childIds.has(e.from) && childIds.has(e.to));
  const drawnKeys = new Set(ownEdges.map(drawnEdgeKey));
  return [...ownEdges, ...collectAnchoredPeerEdges(container.children, drawnKeys)];
}
