import type { KrsNode } from "../types/ast.js";
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
