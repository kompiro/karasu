import type { KrsFile, KrsNode, FacetBlock } from "../types/ast.js";
import { knownFacetIds } from "./facet-overlay.js";

/**
 * Facet overview: "which elements belong to facet X", derived from the model
 * (#2177, tags-and-facets Part B slice 4).
 *
 * This is the receiver of the locality trade-off the design took. Membership is
 * written **element-side** (`facets pii` next to the thing that has it), which
 * is what keeps a rename from meaning an edit to a distant list — and the price
 * is that no single place in the source answers "what is in PCI scope?". The
 * centralized view is the answer, and it is **derived, never authored**: the
 * rejected by-reference form (`facet pci { contains … }`) would have given the
 * same audit list as source, along with the addressing and locality problems
 * that got it rejected.
 *
 * Because it is derived, it cannot drift from the model, and there is no second
 * place to keep in sync (TPL-1032).
 */

/** One element that declares membership in a facet. */
export interface FacetMemberInfo {
  /** Bare node id, as written. */
  id: string;
  /** Declared `label`, when the node has one. */
  label?: string;
  /** Node kind (`service`, `entity`, `database`, …). */
  kind: string;
  /**
   * Ancestor ids from the outermost block down to the node's parent.
   *
   * Load bearing, not decoration: node ids are unique only among siblings
   * (ADR-927), so two `Payment` nodes in different services are two different
   * elements that a bare id cannot tell apart (TPL-1352). An audit list that
   * showed one `Payment` row would be wrong in the one situation where being
   * right matters.
   */
  path: string[];
}

/** One facet and everything that declares membership in it. */
export interface FacetOverviewEntry {
  id: string;
  /** Declared `label`, absent for a facet that is referenced but never declared. */
  label?: string;
  /** Declared `description` — where the rule's prose lives (ADR-832 stays intact). */
  description?: string;
  /** Declared `link` entries, so an audit can reach the real policy document. */
  links: { url: string; label?: string }[];
  /** True when a `facet <id> { … }` block exists. False for reference-only ids. */
  declared: boolean;
  /** Members in document order, deduplicated per (path, id). */
  members: FacetMemberInfo[];
}

/**
 * Build the overview for `file`.
 *
 * Walks the **declaration sites** — the nodes that carry a `facets` property —
 * rather than reading `KrsFile.facetIndex`. The index keys on the bare node id,
 * so two same-named nodes in different scopes share one entry holding the union
 * of their memberships; reading it here would merge two elements into one row
 * and attribute each one's facets to both. `facet-not-declared` learned this
 * the same way (see the `facetIndex` doc comment in `types/ast.ts`).
 *
 * Facet order matches {@link knownFacetIds} — declared first, then
 * reference-only — which is the order the overlay assigns colours in, so the
 * panel and the diagram cannot disagree about which facet is which.
 */
export function buildFacetOverview(file: KrsFile): FacetOverviewEntry[] {
  const declarations = new Map<string, FacetBlock>(file.facets.map((f) => [f.id, f]));
  const members = new Map<string, FacetMemberInfo[]>();

  const visit = (node: KrsNode, path: string[]): void => {
    for (const facetId of node.facets ?? []) {
      const list = members.get(facetId) ?? [];
      // A node may repeat `facets pii` across several lines; the model merges
      // them, so the overview shows one row.
      if (!list.some((m) => m.id === node.id && samePath(m.path, path))) {
        list.push({
          id: node.id,
          ...(node.label ? { label: node.label } : {}),
          kind: node.kind,
          path,
        });
      }
      members.set(facetId, list);
    }
    const childPath = [...path, node.id];
    for (const child of node.children) visit(child, childPath);
  };

  // Same root set as the other model walks (`detectFacetsNotDeclared`): top-level
  // orphan blocks are reachable without a `system` wrapper.
  for (const system of file.systems) visit(system, []);
  for (const client of file.clients) visit(client, []);
  for (const service of file.services) visit(service, []);
  for (const domain of file.domains) visit(domain, []);
  for (const database of file.databases) visit(database, []);
  for (const queue of file.queues) visit(queue, []);
  for (const storage of file.storages) visit(storage, []);

  return knownFacetIds(file).map((id) => {
    const declaration = declarations.get(id);
    return {
      id,
      ...(declaration?.label ? { label: declaration.label } : {}),
      ...(declaration?.properties.description
        ? { description: declaration.properties.description }
        : {}),
      links: (declaration?.properties.links ?? []).map((l) => ({
        url: l.url,
        ...(l.label ? { label: l.label } : {}),
      })),
      declared: declaration !== undefined,
      members: members.get(id) ?? [],
    };
  });
}

function samePath(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((segment, i) => segment === b[i]);
}
