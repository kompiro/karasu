/**
 * The declared physical universe: every `database` / `queue` / `storage` block
 * and the leaves (`table` / `queue-item` / `bucket`) declared inside it.
 *
 * One walk, because three consumers need the *same* answer and drifting copies
 * of "which physical things exist" is how a reference check and a report end up
 * disagreeing about the same model (TPL-1720):
 *
 * - `parser/reference-validation.ts` — does `resource Db.T` / `table Db.T` name
 *   something that exists (#2078)?
 * - `view/coverage-extract.ts` — how much of the declared physical layer did the
 *   logical model actually represent (#2078)?
 * - `view/crud-matrix-extract.ts` — one matrix column per leaf.
 *
 * Infra blocks reach the model through two routes — nested in a `system` (the
 * canonical form) and as a top-level bucket on `KrsFile` — and callers differ on
 * which roots they hold, so this takes a plain node array and walks whatever it
 * is given.
 */
import type { KrsNode, InfraKind } from "../types/ast.js";
import { INFRA_KIND_SET } from "../types/ast.js";

export interface DeclaredInfraBlock {
  infraId: string;
  kind: InfraKind;
  /** Leaf ids declared inside the block, in declaration order. */
  leafIds: string[];
  /** Same ids as a set, for the membership tests reference checks make. */
  leaves: Set<string>;
  /** Leaf label fallback, keyed by leaf id (`label ?? id`). */
  leafLabels: Map<string, string>;
}

/**
 * Index every declared infra block reachable from `roots`, keyed by block id.
 *
 * A block id repeated across roots (S4.5 same-id infra reopen) unions its
 * leaves rather than replacing them: the merged model is what callers are
 * asking about, and dropping the first declaration's leaves here would make a
 * legitimately reopened `database` look like it lost tables.
 */
export function indexDeclaredInfra(roots: readonly KrsNode[]): Map<string, DeclaredInfraBlock> {
  const index = new Map<string, DeclaredInfraBlock>();

  const visit = (node: KrsNode): void => {
    if (INFRA_KIND_SET.has(node.kind)) {
      let entry = index.get(node.id);
      if (!entry) {
        entry = {
          infraId: node.id,
          kind: node.kind as InfraKind,
          leafIds: [],
          leaves: new Set(),
          leafLabels: new Map(),
        };
        index.set(node.id, entry);
      }
      for (const sub of node.children) {
        if (entry.leaves.has(sub.id)) continue;
        entry.leaves.add(sub.id);
        entry.leafIds.push(sub.id);
        entry.leafLabels.set(sub.id, sub.label ?? sub.id);
      }
      // Infra blocks do not nest, so there is nothing further down this branch.
      return;
    }
    for (const child of node.children) visit(child);
  };

  for (const root of roots) visit(root);
  return index;
}

/** Fully-qualified leaf key (`<infraId>.<leafId>`) — the table-granular identity. */
export function infraLeafKey(infraId: string, leafId: string): string {
  return `${infraId}.${leafId}`;
}
