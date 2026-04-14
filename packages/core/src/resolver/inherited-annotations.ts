import type { KrsNode } from "../types/ast.js";

/**
 * Compute effective annotations for descendants of an annotated `service`.
 *
 * Rule: a node with an empty `annotations` array inherits the nearest
 * annotated ancestor's annotations (transitive, replace — never merge).
 * A node with its own non-empty annotations stops the inheritance chain
 * for its own subtree (its children inherit from *it*, not from further up).
 *
 * Inheritance only starts at `service` — a `system` carrying annotations
 * does not propagate them to its service children (YAGNI; revisit when
 * system-level annotations become a real use case). Nodes that appear in
 * the returned map are exactly those descendants of a service that end up
 * with an effective annotation set different from their own source-level
 * annotations.
 *
 * Callers that need to look up "annotations to use for style matching /
 * rendering" for an arbitrary node should fall back to `node.annotations`
 * when the id is absent from the map.
 *
 * The `roots` argument can hold any `KrsNode`s — typically systems, but
 * a focused container (a service or a domain) also works. When the root
 * itself is a `service` carrying annotations, those annotations propagate
 * directly into its children.
 */
export function buildInheritedAnnotations(roots: KrsNode[]): Map<string, string[]> {
  const map = new Map<string, string[]>();

  function walkDescendants(node: KrsNode, parentAnnotations: string[]): void {
    const effective = node.annotations.length > 0 ? node.annotations : parentAnnotations;
    if (effective.length > 0 && node.annotations.length === 0) {
      map.set(node.id, effective);
    }
    for (const child of node.children) {
      walkDescendants(child, effective);
    }
  }

  function walkRoot(root: KrsNode): void {
    if (root.kind === "system") {
      // System-level annotations do not propagate. Restart inheritance fresh
      // at each service (or descend into non-service children with no parent).
      for (const child of root.children) {
        if (child.kind === "service") {
          for (const grand of child.children) {
            walkDescendants(grand, child.annotations);
          }
        } else {
          walkDescendants(child, []);
        }
      }
      return;
    }
    if (root.kind === "service") {
      // Service is the inheritance start. Its own annotations propagate to
      // every descendant whose own annotation set is empty.
      for (const child of root.children) {
        walkDescendants(child, root.annotations);
      }
      return;
    }
    // Other root kinds (domain, etc.) carry no inheritance start of their own.
    // Walk descendants in case any inner subtree contains a service (rare but safe).
    walkDescendants(root, []);
  }

  for (const root of roots) {
    walkRoot(root);
  }

  return map;
}
