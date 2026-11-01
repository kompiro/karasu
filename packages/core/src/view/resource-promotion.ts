import type { KrsNode, KrsEdge, ResourceNode } from "../types/ast.js";
import { INFRA_KIND_SET } from "../types/ast.js";
import { isWriteOperation } from "../spec/operations.js";
import type { EntityResolver } from "../resolver/resource-entity.js";
import { edgeKey } from "./edge-key.js";

/**
 * At domain level: collect resource nodes with dot-notation refs from each usecase child,
 * deduplicate by ID, and produce synthetic usecase→resource edges.
 * Used to promote sub-resources to sibling level in the UseCase diagram.
 */
function deriveUsecaseResourceNodes(
  usecases: KrsNode[],
  tagMap: ReadonlyMap<string, string>,
  resolver: EntityResolver,
): { resourceNodes: KrsNode[]; edges: KrsEdge[] } {
  const resourceMap = new Map<string, KrsNode>();
  // Last-wins: a later declaration of the same (usecase, resource) pair
  // overrides the earlier classification. This mirrors how cascading
  // stylesheets resolve conflicts and lets authors override an inherited
  // classification by re-stating the resource with different operations.
  const edgeMap = new Map<string, KrsEdge>();

  for (const usecase of usecases) {
    if (usecase.kind !== "usecase") continue;
    for (const resource of usecase.children) {
      if (resource.kind !== "resource") continue;
      const resNode = resource as ResourceNode;
      // Promote a resource once it is *resolved*: physical dot-notation, or a
      // bare id that resolves to a unique entity (the canonical logical form).
      // Unresolved / ambiguous / [external] bare resources stay unpromoted, as
      // before — their unassigned-resource warning is raised by the resolver.
      if (!resNode.ref && resolver.resolve(resNode).entityId === undefined) continue;

      if (!resourceMap.has(resource.id)) {
        resourceMap.set(resource.id, applyInferredTagsDeep(resource, tagMap));
      }
      const key = edgeKey({ from: usecase.id, to: resource.id });
      const isWrite = isWriteOperation(resNode.properties.operations);
      edgeMap.set(key, {
        from: usecase.id,
        to: resource.id,
        kind: "sync",
        tags: [isWrite ? "write" : "read"],
        label: isWrite ? "W" : "R",
        syntheticLabel: true,
        loc: resource.loc,
        ...(resNode.authorId !== undefined ? { authorId: resNode.authorId } : {}),
      });
    }
  }

  return { resourceNodes: Array.from(resourceMap.values()), edges: Array.from(edgeMap.values()) };
}

/** Maps infra sub-resource kind to the style tag used in resource[tag] rules. */
const KIND_TO_INFERRED_TAG: Partial<Record<string, string>> = {
  table: "table",
  "queue-item": "queue",
  bucket: "storage",
};

/**
 * Build a map from dot-notation resource IDs (e.g. "OrderDB.OrderTable") to the
 * inferred style tag (e.g. "table") derived from the referenced sub-resource kind.
 */
export function buildResourceInferredTagsMap(systems: KrsNode[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const system of systems) {
    for (const node of system.children) {
      if (!INFRA_KIND_SET.has(node.kind)) continue;
      for (const sub of node.children) {
        const tag = KIND_TO_INFERRED_TAG[sub.kind];
        if (tag) map.set(`${node.id}.${sub.id}`, tag);
      }
    }
  }
  return map;
}

/**
 * Recursively apply inferred tags to all resource nodes in a subtree that have a
 * dot-notation ref but no explicit tags. Explicit tags always take precedence.
 * Non-resource interior nodes are shallow-copied only when their children changed.
 */
function applyInferredTagsDeep(node: KrsNode, tagMap: ReadonlyMap<string, string>): KrsNode {
  const patchedChildren =
    node.children.length > 0
      ? node.children.map((c) => applyInferredTagsDeep(c, tagMap))
      : node.children;
  const childrenChanged = patchedChildren.some((c, i) => c !== node.children[i]);

  if (node.kind === "resource" && node.tags.length === 0 && node.ref) {
    const inferredTag = tagMap.get(node.id);
    if (inferredTag) {
      return {
        ...node,
        children: childrenChanged ? patchedChildren : node.children,
        tags: [inferredTag],
      };
    }
  }

  if (childrenChanged) return { ...node, children: patchedChildren };
  return node;
}

/**
 * Apply inferred tags to all resource nodes (at any depth) that have a dot-notation ref
 * but no explicit tags. Nodes with explicit tags are returned unchanged.
 */
export function applyInferredTags(
  nodes: KrsNode[],
  tagMap: ReadonlyMap<string, string>,
): KrsNode[] {
  if (tagMap.size === 0) return nodes;
  return nodes.map((node) => applyInferredTagsDeep(node, tagMap));
}

/**
 * Build a map from dot-notation resource IDs (e.g. "OrderDB.OrderTable") to the
 * label of the referenced infra sub-resource (e.g. "注文テーブル").
 * Covers database/queue/storage nodes and their children across all systems.
 */
export function buildResourceLabelMap(systems: KrsNode[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const system of systems) {
    for (const node of system.children) {
      if (!INFRA_KIND_SET.has(node.kind)) continue;
      for (const sub of node.children) {
        const key = `${node.id}.${sub.id}`;
        map.set(key, sub.label ?? sub.id);
      }
    }
  }
  return map;
}

export interface PromotedChildren {
  childNodes: KrsNode[];
  childEdges: KrsEdge[];
}

/**
 * Child-collection phase, shared by the orphan drill-down and system
 * drill-down branches: at domain level, promote resource nodes with
 * dot-notation refs to sibling level (via {@link deriveUsecaseResourceNodes})
 * so they appear as connected nodes in the UseCase diagram. Entities are
 * excluded at every container kind — they render only in the (separate)
 * entity view, so keeping them out here avoids stray unstyled boxes and a
 * collision with an entity-resolved bare `resource` promoted above (which
 * shares the entity's id).
 */
export function collectPromotedChildren(
  container: KrsNode,
  edges: KrsEdge[],
  resourceInferredTagsMap: ReadonlyMap<string, string>,
  entityResolver: EntityResolver,
): PromotedChildren {
  const renderableChildren = container.children.filter((c) => c.kind !== "entity");
  let childNodes = applyInferredTags(renderableChildren, resourceInferredTagsMap);
  let childEdges = edges;
  if (container.kind === "domain") {
    const { resourceNodes, edges: resourceEdges } = deriveUsecaseResourceNodes(
      renderableChildren,
      resourceInferredTagsMap,
      entityResolver,
    );
    if (resourceNodes.length > 0) {
      childNodes = [...childNodes, ...resourceNodes];
      childEdges = [...edges, ...resourceEdges];
    }
  }
  return { childNodes, childEdges };
}
