import type { KrsEdge, KrsNode } from "../types/ast.js";
import { edgeKey } from "../view/edge-key.js";
import type { SourceRange } from "../types/tokens.js";

/**
 * Synthetic zero-width source range for renderer-synthesized nodes that have no
 * real `.krs` origin — currently the collapse stubs of both collapse axes
 * (category #1821 and group #1858), applied through {@link makeStubNode}. Shared
 * here so a future `SourceRange` shape change updates one place (Issue #1876).
 */
const ZERO_LOC: SourceRange = {
  start: { line: 0, column: 0, offset: 0 },
  end: { line: 0, column: 0, offset: 0 },
};

/**
 * Node kinds a collapse stub may take. Restricted to the two whose node variant
 * needs only a bare `{ links: [] }` for `properties`, so the `as KrsNode`
 * construction below is well-formed: `database` (infra tier, category #1821) and
 * `service` (external tier / group stub, #1858/#1821). A future stub kind with
 * extra required `properties` must widen both this union and the constructed
 * `properties`, surfacing the change here instead of silently producing a
 * malformed node.
 */
type StubKind = "database" | "service";

/**
 * Build a collapse-stub `KrsNode` — the ⊕ placeholder that stands in for a
 * folded category (#1821) or team group (#1858). Centralizes the empty-`KrsNode`
 * boilerplate (`annotations` / `children` / `edges` / `properties` + `ZERO_LOC`)
 * so both collapse axes stay consistent against future `KrsNode` shape changes
 * (Issue #1876). Callers pass the stub's `kind` (which places it in the right
 * layout tier), `label` (carrying the folded count), and marker `tags`.
 */
export function makeStubNode(opts: {
  id: string;
  label: string;
  kind: StubKind;
  tags: readonly string[];
}): KrsNode {
  return {
    kind: opts.kind,
    id: opts.id,
    label: opts.label,
    tags: [...opts.tags],
    annotations: [],
    children: [],
    edges: [],
    loc: ZERO_LOC,
    properties: { links: [] },
  } as KrsNode;
}

/**
 * Fold the diff states of the original edges that collapse onto one stub edge.
 * A single distinct state carries through; a mix reports `changed`, an existing
 * `DiffState` value (see `view-diff.ts`). Order-independent and deterministic.
 */
function foldEdgeDiffStates(states: readonly string[]): string {
  const distinct = new Set(states);
  return distinct.size === 1 ? [...distinct][0] : "changed";
}

/**
 * Re-keys diff state onto the stub edges a collapse re-targets (#1886), for
 * both collapse axes. Decoration keyed on the pre-collapse endpoints misses the
 * stub id and renders undecorated (TPL-1886); the category axis did exactly
 * that until it shared this with the group axis.
 *
 * `add` takes each re-targeted edge with its new endpoints; `folded` returns the
 * fold per stub edge, keyed by `edgeKey` (the render lookup form), kind-less
 * like `edge-layer.ts`, so a sync+async pair shares one slot and folds
 * together. Only non-`unchanged` folds are kept, so an all-`unchanged` bundle
 * stays undecorated like the edges it stands for. Without a diff map it
 * records nothing.
 */
export function diffStateFolder(edgeDiffState: ReadonlyMap<string, string> | undefined): {
  add: (edge: Pick<KrsEdge, "from" | "to">, from: string, to: string) => void;
  folded: () => Map<string, string>;
} {
  const accum = new Map<string, string[]>();
  return {
    add: (edge, from, to) => {
      if (!edgeDiffState) return;
      const renderKey = edgeKey({ from, to });
      const state = edgeDiffState.get(edgeKey(edge)) ?? "unchanged";
      const bucket = accum.get(renderKey);
      if (bucket) bucket.push(state);
      else accum.set(renderKey, [state]);
    },
    folded: () => {
      const out = new Map<string, string>();
      for (const [renderKey, states] of accum) {
        const folded = foldEdgeDiffStates(states);
        if (folded !== "unchanged") out.set(renderKey, folded);
      }
      return out;
    },
  };
}

/**
 * A diff map with the states a first collapse folded onto its stub edges laid
 * over it, for a second collapse that re-targets those edges again. Returns the
 * input when there is nothing to add, so a render outside compare mode keeps
 * passing `undefined`.
 */
export function withFolded(
  edgeDiffState: ReadonlyMap<string, string> | undefined,
  folded: ReadonlyMap<string, string>,
): ReadonlyMap<string, string> | undefined {
  if (!edgeDiffState || folded.size === 0) return edgeDiffState;
  return new Map([...edgeDiffState, ...folded]);
}
