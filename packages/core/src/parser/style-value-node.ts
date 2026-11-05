import type { SourceRange, Token } from "../types/tokens.js";
import type { ValueNode } from "../types/style.js";
import { inFile, tokenLoc } from "./style-source-range.js";

/**
 * Classify a bare identifier atom. Hex tokens land here too because the
 * lexer emits them as `Identifier` with a leading `#` (see style-lexer
 * `readHexColor`). Numeric values (`12`, `12px`, `0.5`) similarly come
 * through as `Identifier`.
 */
export function classifyIdentAtom(
  value: string,
  token: Token,
  file: string | undefined,
): ValueNode {
  if (value.startsWith("#")) {
    return { kind: "hex", value, loc: tokenLoc(token, file) };
  }
  const numericMatch = /^(-?(?:\d+(?:\.\d+)?|\.\d+))([a-zA-Z%]+)?$/.exec(value);
  if (numericMatch) {
    const numeric = Number.parseFloat(numericMatch[1]);
    const unit = numericMatch[2];
    if (unit) {
      return {
        kind: "length",
        value: numeric,
        unit,
        raw: numericMatch[1],
        loc: tokenLoc(token, file),
      };
    }
    return {
      kind: "number",
      value: numeric,
      raw: numericMatch[1],
      loc: tokenLoc(token, file),
    };
  }
  return { kind: "ident", value, loc: tokenLoc(token, file) };
}

/**
 * The value node for a declaration's atoms. Commas split items; within an
 * item, one atom stands for itself and several make a `sequence` (#3141), so
 * every atom the author wrote reaches the validator. The caller has already
 * refused an empty value or an empty item, so every segment has an atom.
 */
export function buildValueNode(atoms: ValueNode[], segmentStarts: number[]): ValueNode {
  const items: ValueNode[] = [];
  for (let i = 0; i < segmentStarts.length; i++) {
    const end = i + 1 < segmentStarts.length ? segmentStarts[i + 1] : atoms.length;
    items.push(segmentNode(atoms.slice(segmentStarts[i], end)));
  }
  if (items.length === 1) return items[0];
  return {
    kind: "list",
    items,
    loc: spanOf(items),
  };
}

/** One comma item: a single atom, or a `sequence` of its space-separated atoms. */
function segmentNode(atoms: ValueNode[]): ValueNode {
  const [first, second, ...rest] = atoms;
  if (second === undefined) return first;
  return { kind: "sequence", items: [first, second, ...rest], loc: spanOf(atoms) };
}

/** From the first node's start to the last one's end. */
function spanOf(nodes: ValueNode[]): SourceRange {
  // The nodes are atoms of one declaration, so they share its file.
  return inFile(
    { start: nodes[0].loc.start, end: nodes[nodes.length - 1].loc.end },
    nodes[0].loc.file,
  );
}
