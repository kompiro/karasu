import type { KrsNode, KrsEdge, NodeIdPath } from "../types/ast.js";
import { resolveNodePathBySuffix } from "../parser/node-path.js";
import { edgeEndpointRef } from "../resolver/edge-endpoint.js";
import { isAnchoredAt, nodeId } from "./anchored-edges.js";
import { resolveContainerChain } from "./view-path.js";
import { emptySlice, type GhostEntity, type ViewPath, type ViewSlice } from "./view-slice.js";

interface DomainEntityEntry {
  domain: KrsNode;
  /** The domain's full path within its system (`[systemId, …, domainId]`), for suffix resolution (#2088). */
  path: NodeIdPath;
  entities: Map<string, KrsNode>;
}

const domainEntityIndexCache = new WeakMap<KrsNode, DomainEntityEntry[]>();

/**
 * Index every domain (at any depth) **within one system** by id, with its
 * `entity` children. Resolves qualified `DomainId.EntityId` cross-domain relation
 * targets in the entity view.
 *
 * Scoped to a single system on purpose: `DomainId` is only error-level unique
 * *within* a system, so a model-wide index could not disambiguate a domain id
 * shared by two systems. Cross-**system** entity references are out of scope in
 * v1 (this view is per-domain, cross-**domain**). Memoized per system node so the
 * static bundle (which extracts the entity view of every domain) builds it once.
 */
function buildDomainEntityIndex(system: KrsNode): DomainEntityEntry[] {
  const cached = domainEntityIndexCache.get(system);
  if (cached) return cached;
  // Every domain in the system, each with its full path (#2088 slice D1) —
  // duplicates included: which one a reference means is the resolver's
  // question, not the index's. The old id-keyed `!index.has` build let the
  // first domain with an id occupy the slot even when it lacked the
  // referenced entity, silently dropping a written relation (#2575).
  const index: DomainEntityEntry[] = [];
  const walk = (node: KrsNode, prefix: readonly string[]): void => {
    const path = [...prefix, node.id];
    if (node.kind === "domain") {
      const entities = new Map<string, KrsNode>();
      for (const child of node.children) {
        if (child.kind === "entity") entities.set(child.id, child);
      }
      index.push({ domain: node, path, entities });
    }
    for (const child of node.children) walk(child, path);
  };
  for (const child of system.children) walk(child, [system.id]);
  domainEntityIndexCache.set(system, index);
  return index;
}

/**
 * The tag the store canvas stamps on an edge it derived from an `entity`
 * relation (#2721). System-assigned, in the same register as `[implicit]`:
 * never present in `.krs` source. `[implicit]` rolls domain edges **up** to
 * the service level; `[projected]` rolls entity relations **down** onto the
 * `table` leaves they map to. Colour only in the builtin sheet — line style
 * stays owned by `[sync]` / `[async]` (TPL-510).
 */
const PROJECTED_TAG = "projected";

/**
 * Project `entity` relations onto a `database` canvas as `table` → `table`
 * edges (#2721, slice A of #2585).
 *
 * A relation projects when **both** endpoints carry a `table <store>.<leaf>`
 * mapping into `store`. Nothing is recorded in the `.krs`: the projection is
 * a render-time derivation, so the store canvas — which drew its leaves with
 * no relations at all — gains the edges with no edit to the model.
 *
 * Endpoint resolution is the entity view's, not a second copy of it: the
 * relation must start at the entity that declares it ({@link isAnchoredAt},
 * the direction rule), a bare target is intra-domain only, and a qualified
 * `DomainId.EntityId` target goes through {@link resolveQualifiedEntity}
 * within the same scope (TPL-1936). A relation the entity view would not draw
 * is not projected either, so the two views cannot disagree about one edge.
 *
 * What does **not** project, by design (TPL-2585): a relation whose endpoint
 * has no `table` mapping, and a relation whose endpoints map into two
 * different stores (it appears on neither canvas). The view is therefore not
 * a complete ER diagram of the entity layer; `coverage` counts the tableless
 * remainder.
 *
 * `scopes` are the per-system domain indexes the model resolves relations in
 * (a no-system file reaches this canvas through the `__unassigned__`
 * pseudo-system, so its orphan domains are one such scope).
 *
 * **Union with the recorded edges** (#2722): `recorded` are the edges the
 * `.krs` states on the canvas — hand-written `table` edges, or the foreign
 * keys `translate --from db` emitted. The recorded side is the confirmed
 * one, so a surviving edge takes only the attributes it does not already
 * have:
 *
 * - same ordered pair from both sources → **one** edge, the recorded one,
 *   without `[projected]`; its **label** is taken from the relation only when
 *   the record has none (a written label wins);
 * - `edge.kind` never transfers — the record's `->` / `-->` is always stated,
 *   so a `-->` relation over a `->` record stays solid (the record states a
 *   different fact: a reference the store enforces);
 * - opposite directions (recorded `A -> B`, projected `B -> A`) → the
 *   recorded side only, and the label does **not** move: `"belongs to"` is
 *   direction-dependent, so carrying it across would make it false.
 *
 * Within the projection the first relation per ordered pair wins, in
 * declaration order. Returns the whole edge list for the canvas.
 */
export function unionProjectedRelations(
  recorded: readonly KrsEdge[],
  projected: readonly KrsEdge[],
): KrsEdge[] {
  const edges: KrsEdge[] = [...recorded];
  const pairKey = (from: string, to: string): string => `${from}->${to}`;
  /** Ordered pair → index of the first recorded edge on it (label transfer target). */
  const recordedAt = new Map<string, number>();
  /** Pairs a recorded edge occupies in either direction (projection is suppressed). */
  const occupied = new Set<string>();
  recorded.forEach((e, i) => {
    const key = pairKey(e.from, e.to);
    if (!recordedAt.has(key)) recordedAt.set(key, i);
    occupied.add(key);
    occupied.add(pairKey(e.to, e.from));
  });
  for (const edge of projected) {
    const key = pairKey(edge.from, edge.to);
    const at = recordedAt.get(key);
    if (at !== undefined) {
      // Same pair, same direction: the record survives; only a missing label
      // is taken from the relation.
      const rec = edges[at];
      if (rec.label === undefined && edge.label !== undefined) {
        edges[at] = { ...rec, label: edge.label };
      }
      continue;
    }
    if (occupied.has(key)) continue; // opposite direction recorded: record only, no label
    edges.push(edge);
  }
  return edges;
}

/**
 * The entity relations that land on `store`'s leaves, as `[projected]` edges —
 * the projected side of the store canvas before the union above, one edge per
 * ordered pair (first relation wins, in declaration order). Every system is a
 * resolution scope: an entity may map into a store declared in another system,
 * and the `__unassigned__` pseudo-system is how a no-system file's orphan
 * domains reach here. Empty for anything but a `database`.
 *
 * Exported for `coverage`, which diffs this set against `containerCanvasEdges`
 * (`anchored-edges.ts`, #2723) — the report and the canvas must read the same
 * projection, or the report would describe edges nobody sees.
 */
export function projectStoreRelations(store: KrsNode, systems: readonly KrsNode[]): KrsEdge[] {
  if (store.kind !== "database") return [];
  const leafIds = new Set(store.children.map(nodeId));
  const leafOf = (entity: KrsNode): string | undefined => {
    const ref = entity.kind === "entity" ? entity.tableRef : undefined;
    if (!ref || ref.parent !== store.id || !leafIds.has(ref.child)) return undefined;
    return ref.child;
  };
  const seen = new Set<string>();
  const projected: KrsEdge[] = [];
  for (const system of systems) {
    const index = buildDomainEntityIndex(system);
    for (const entry of index) {
      for (const entity of entry.entities.values()) {
        const from = leafOf(entity);
        if (from === undefined) continue;
        for (const edge of entity.edges) {
          if (!isAnchoredAt(entity, edge)) continue; // #2501: origin = reference holder
          const target = edge.to.includes(".")
            ? resolveQualifiedEntity(edge.to, index)?.entity
            : entry.entities.get(edge.to);
          if (!target) continue; // bare foreign id / unresolved — dropped, as in the entity view
          const to = leafOf(target);
          if (to === undefined) continue;
          const key = `${from}->${to}`;
          if (seen.has(key)) continue;
          seen.add(key);
          projected.push({ ...edge, from, to, tags: [...edge.tags, PROJECTED_TAG] });
        }
      }
    }
  }
  return projected;
}

/**
 * Resolve a qualified relation target to its domain + entity by the suffix
 * rule (#2088): the reference matches an entity whose full path it suffixes,
 * so the leading segments must suffix the owning domain's path and the entity
 * must actually exist in it. Returns `null` for a bare id (no dot) or an
 * unresolved reference.
 *
 * Qualifiers run to any depth since slice E lifted `parseEdge`'s two-segment
 * cap (#2577) — `Parent.Child.Entity` is read here the same way `DomainId.EntityId`
 * always was, which is what closes #2575's out-of-scope note. A multi-match
 * keeps the first in declaration order; ambiguity is reported by the edge
 * detector, which sees the declaring scope this resolver does not.
 */
function resolveQualifiedEntity(
  target: string,
  index: readonly DomainEntityEntry[],
): { domain: KrsNode; entity: KrsNode; domainId: string; entityId: string } | null {
  if (!target.includes(".")) return null;
  const ref = edgeEndpointRef(target);
  // A leading or trailing dot leaves an empty segment, which names nothing.
  if (ref.some((segment) => segment === "")) return null;
  const entityId = ref[ref.length - 1];
  const candidates = index.flatMap((entry) => {
    const entity = entry.entities.get(entityId);
    return entity ? [{ path: [...entry.path, entity.id], entry, entity }] : [];
  });
  const match = resolveNodePathBySuffix(ref, candidates)[0];
  if (match === undefined) return null;
  return {
    domain: match.entry.domain,
    entity: match.entity,
    domainId: match.entry.domain.id,
    entityId: match.entity.id,
  };
}

/**
 * Extract the **entity view** of a domain: its `entity` children and their
 * relation edges — an alternative drill-down to the domain's usecase view.
 * Returns an empty slice when the path does not resolve to a domain or the
 * domain owns no entities.
 *
 * Relations:
 * - **intra-domain** — a bare `edge.to` matching a local entity id.
 * - **cross-domain** — a qualified `DomainId.EntityId` target. The foreign
 *   entity is surfaced as a muted **ghost** ({@link GhostEntity}), keyed by the
 *   qualified id (entity ids are only warning-level unique, so a bare id can't
 *   disambiguate). Both outgoing (this domain → foreign) and incoming (foreign →
 *   this domain) directions are collected, mirroring the ghost-domain view
 *   (ADR-460). Bare cross-domain references, and qualified references to
 *   a resource / unknown target, are dropped.
 */
export function extractEntityView(systems: KrsNode[], path: ViewPath): ViewSlice {
  const empty = emptySlice();

  const resolved = resolveContainerChain(systems, path);
  if (!resolved) return empty;
  const { ancestorChain } = resolved;
  // ancestorChain[0] is the owning system (resolveContainerChain always seeds it
  // first). Cross-domain resolution is scoped to it — see buildDomainEntityIndex.
  const owningSystem = ancestorChain[0];
  const domain = ancestorChain.pop()!;
  if (domain.kind !== "domain") return empty;

  const entities = domain.children.filter((c) => c.kind === "entity");
  if (entities.length === 0) return empty;
  const localEntityIds = new Set(entities.map((e) => e.id));

  const childNodes: KrsNode[] = [...entities];
  const childEdges: KrsEdge[] = [];

  const index = buildDomainEntityIndex(owningSystem);
  const ghostMap = new Map<string, GhostEntity>();
  const ghostEntityEdges: KrsEdge[] = [];
  const addGhost = (foreignDomain: KrsNode, foreignEntity: KrsNode, key: string): void => {
    if (!ghostMap.has(key)) {
      ghostMap.set(key, {
        node: foreignEntity,
        parentDomainLabel: foreignDomain.label ?? foreignDomain.id,
        key,
      });
    }
  };

  // Outgoing: this domain's entities → other-domain entities. Bare targets are
  // intra-domain (or dropped); qualified `Other.Foreign` targets become ghosts.
  for (const entity of entities) {
    for (const edge of entity.edges) {
      // The origin-scope rule is what enforces the relation direction here
      // (origin = the reference holder), so a mismatched source is not merely
      // misplaced — it names the wrong end. Drawing it would show a reference
      // the model does not contain, and the ghost branch below would restate
      // it as `entity.id -> …`, fabricating a source the author never wrote
      // (#2501).
      if (!isAnchoredAt(entity, edge)) continue;
      if (localEntityIds.has(edge.to)) {
        childEdges.push(edge); // intra-domain (bare local id)
        continue;
      }
      const foreign = resolveQualifiedEntity(edge.to, index);
      if (!foreign) continue; // bare non-local / resource / unresolved → drop
      if (foreign.domain === domain) {
        // Qualified reference to a local entity — treat as intra-domain.
        if (localEntityIds.has(foreign.entityId)) {
          childEdges.push({ ...edge, to: foreign.entityId });
        }
        continue;
      }
      const key = `${foreign.domainId}.${foreign.entityId}`;
      addGhost(foreign.domain, foreign.entity, key);
      ghostEntityEdges.push({ ...edge, from: entity.id, to: key });
    }
  }

  // Incoming: other-domain entities → this domain's entities (qualified `D.local`).
  for (const entry of index) {
    if (entry.domain === domain) continue; // node identity, robust to id collisions
    for (const foreignEntity of entry.entities.values()) {
      for (const edge of foreignEntity.edges) {
        if (!isAnchoredAt(foreignEntity, edge)) continue; // #2501, as above
        const target = resolveQualifiedEntity(edge.to, index);
        if (!target || target.domain !== domain) continue;
        if (!localEntityIds.has(target.entityId)) continue;
        const key = `${entry.domain.id}.${foreignEntity.id}`;
        addGhost(entry.domain, foreignEntity, key);
        ghostEntityEdges.push({ ...edge, from: key, to: target.entityId });
      }
    }
  }

  return {
    ...empty,
    containerNode: domain,
    childNodes,
    childEdges,
    ancestorChain,
    ghostEntities: Array.from(ghostMap.values()),
    ghostEntityEdges,
  };
}
