import type { KrsNode, ResourceNode, EntityNode } from "../types/ast.js";

/**
 * The outcome of resolving a `resource` reference to the infra store it
 * ultimately depends on. A resource reaches a store in one of two ways:
 *
 * - **physical**: dot-notation `resource OrderDB.orders` → `ref.parent` is the
 *   infra block id directly.
 * - **logical (canonical)**: a bare `resource Order` resolves to a unique
 *   `entity Order`; its `table OrderDB.orders` physical mapping supplies the
 *   store. This is the design's canonical form — the usecase thinks in terms of
 *   the entity, and the physical table is derived transitively
 *   (`usecase → entity → table → database`). See
 *   `docs/design/domain-entity-modeling.md`.
 */
export interface ResolvedResourceRef {
  /**
   * Infra block id the resource ultimately targets (physical dot-notation, or
   * an entity-mediated `tableRef.parent`). Undefined when the bare id does not
   * resolve to a unique entity, or when the resolved entity has no physical
   * `tableRef` yet (the legitimate forward-design intermediate state).
   */
  infraParentId?: string;
  /** Entity id when a bare resource resolved to a unique entity. */
  entityId?: string;
  /**
   * True when a bare id matched more than one entity model-wide. Such a
   * reference is left unresolved (the root cause is separately surfaced by the
   * `entity-anchor-collision` warning).
   */
  ambiguous: boolean;
}

export interface EntityResolver {
  resolve(resource: ResourceNode): ResolvedResourceRef;
}

/** Collect every `entity` node in the subtree, indexed by id (ids may collide). */
function collectEntities(node: KrsNode, out: Map<string, EntityNode[]>): void {
  for (const child of node.children) {
    if (child.kind === "entity") {
      const arr = out.get(child.id);
      if (arr) arr.push(child as EntityNode);
      else out.set(child.id, [child as EntityNode]);
    }
    collectEntities(child, out);
  }
}

/**
 * Build a resolver over the given model roots. Entity ids form a flat,
 * model-wide namespace (a bare `resource Order` may resolve to an `entity Order`
 * declared in another domain / service), so callers pass the whole model scope,
 * not a single container's children.
 *
 * Resolution requires a **unique** entity match: a duplicated entity id is
 * ambiguous and left unresolved, mirroring the unique-target requirement the
 * design specifies (`docs/design/domain-entity-modeling.md`, §resource 解決).
 */
export function buildEntityResolver(roots: KrsNode[]): EntityResolver {
  const index = new Map<string, EntityNode[]>();
  for (const root of roots) {
    if (root.kind === "entity") {
      const arr = index.get(root.id);
      if (arr) arr.push(root as EntityNode);
      else index.set(root.id, [root as EntityNode]);
    }
    collectEntities(root, index);
  }

  return {
    resolve(resource: ResourceNode): ResolvedResourceRef {
      // Physical dot-notation wins directly; no entity lookup needed.
      if (resource.ref) {
        return { infraParentId: resource.ref.parent, ambiguous: false };
      }
      const matches = index.get(resource.id);
      if (!matches || matches.length === 0) {
        return { ambiguous: false };
      }
      if (matches.length > 1) {
        return { ambiguous: true };
      }
      const entity = matches[0];
      // Resolved logically. `infraParentId` stays undefined when the entity has
      // no physical mapping yet — the resource is still resolved (no
      // unassigned-resource warning), it just derives no service→database edge.
      return { entityId: entity.id, infraParentId: entity.tableRef?.parent, ambiguous: false };
    },
  };
}
