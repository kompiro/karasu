/**
 * JSX-inspired SVG element builder.
 * Provides a declarative API for constructing SVG markup strings.
 *
 * Usage:
 *   el("rect", { x: 0, y: 0, width: 100, height: 50, fill: "#fff" })
 *   el("g", { opacity: 0.8 }, el("circle", { cx: 50, cy: 50, r: 20 }))
 */

type AttrValue = string | number | undefined | null | false;
type Attrs = Record<string, AttrValue>;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Build an SVG element string, similar to `createElement` / `h()`.
 */
export function el(tag: string, attrs: Attrs, ...children: string[]): string {
  const attrStr = Object.entries(attrs)
    .filter(([, v]) => v !== undefined && v !== null && v !== false)
    .map(([k, v]) => ` ${k}="${escapeXml(String(v))}"`)
    .join("");

  if (children.length === 0) {
    return `<${tag}${attrStr}/>`;
  }
  return `<${tag}${attrStr}>${children.join("\n")}</${tag}>`;
}

export { escapeXml };

/**
 * Return `{ "data-diff-state": state }` when `state` is set, or an empty
 * object. Used by renderers to stamp per-element diff state on wrapper
 * groups without branching at each call site.
 */
export function diffStateAttr(state: string | undefined): Record<string, string> {
  return state ? { "data-diff-state": state } : {};
}

/**
 * Truncate text to fit within a given pixel width, adding "…" if truncated.
 * CJK characters (code point > U+2E80) are counted as 1.5× charWidth.
 * The "…" glyph is reserved from maxWidth so the full output always fits.
 */
export function truncateToWidth(text: string, maxWidth: number, charWidth: number): string {
  // Reserve room for "…" so the truncated result always fits within maxWidth.
  const textBudget = maxWidth - charWidth;
  const chars = [...text];
  let width = 0;
  for (let i = 0; i < chars.length; i++) {
    const cw = chars[i].charCodeAt(0) > 0x2e80 ? charWidth * 1.5 : charWidth;
    if (width + cw > textBudget) {
      return chars.slice(0, i).join("") + "…";
    }
    width += cw;
  }
  return text;
}

/**
 * Wrap text into multiple lines that fit within a given pixel width.
 * Returns up to `maxLines` lines; the last line is truncated with "…" if text remains.
 * CJK characters (code point > U+2E80) are counted as 1.5× charWidth.
 * On the last line, "…" is reserved from maxWidth so the output always fits.
 */
export function wrapToWidth(
  text: string,
  maxWidth: number,
  charWidth: number,
  maxLines: number,
): string[] {
  const chars = [...text];
  const lines: string[] = [];
  let lineStart = 0;
  let lineWidth = 0;
  let lastFitIdx = 0;

  for (let i = 0; i < chars.length; i++) {
    const cw = chars[i].charCodeAt(0) > 0x2e80 ? charWidth * 1.5 : charWidth;
    if (lineWidth + cw > maxWidth) {
      if (lines.length === maxLines - 1) {
        // Last allowed line: reserve room for "…" so the output fits within maxWidth.
        const lastLineBudget = maxWidth - charWidth;
        let j = i;
        let lastLineWidth = lineWidth;
        while (j > lineStart && lastLineWidth > lastLineBudget) {
          j--;
          const prevCw = chars[j].charCodeAt(0) > 0x2e80 ? charWidth * 1.5 : charWidth;
          lastLineWidth -= prevCw;
        }
        lines.push(chars.slice(lineStart, j).join("") + "…");
        return lines;
      }
      lines.push(chars.slice(lineStart, i).join(""));
      lineStart = i;
      lineWidth = cw;
    } else {
      lineWidth += cw;
    }
    lastFitIdx = i;
  }

  if (lineStart <= lastFitIdx) {
    lines.push(chars.slice(lineStart).join(""));
  }

  return lines;
}

/**
 * Options for {@link renderIconCard}.
 * All text values (titleText, descText) are pre-truncated by the caller;
 * this function XML-escapes them internally.
 */
interface IconCardOptions {
  /** Card position */
  x: number;
  y: number;
  /** Node ID for `data-node-id` attribute — XML-escaped internally */
  nodeId: string;
  /** Extra attributes on the wrapper `<g>` (e.g. `data-has-children`, `style`) */
  wrapperAttrs?: Attrs;
  /** Background rect dimensions */
  width: number;
  height: number;
  /** Background rect style */
  rectFill?: string;
  rectStroke?: string;
  rectStrokeWidth?: number | string;
  rectRx?: number;
  /** Pre-rendered pictogram SVG string (inserted between rect and title) */
  pictogram?: string;
  /** Title text — pre-truncated, XML-escaped here */
  titleText: string;
  titleX: number;
  titleY: number;
  titleAttrs?: Attrs;
  /** Description text — pre-truncated, XML-escaped here; omitted if falsy */
  descText?: string;
  descX?: number;
  descY?: number;
  descAttrs?: Attrs;
}

/**
 * Renders an icon-mode card as an SVG group containing a background rect,
 * an optional pictogram, a title text, and an optional description text.
 *
 * Used by org-renderer for team and member icon cards.
 */
export function renderIconCard(opts: IconCardOptions): string {
  const {
    x,
    y,
    nodeId,
    wrapperAttrs,
    width,
    height,
    rectFill,
    rectStroke,
    rectStrokeWidth,
    rectRx,
    pictogram,
    titleText,
    titleX,
    titleY,
    titleAttrs,
    descText,
    descX,
    descY,
    descAttrs,
  } = opts;

  const parts: string[] = [
    el("rect", {
      width,
      height,
      fill: rectFill,
      stroke: rectStroke,
      "stroke-width": rectStrokeWidth,
      rx: rectRx,
    }),
  ];

  if (pictogram) parts.push(pictogram);

  parts.push(el("text", { x: titleX, y: titleY, ...titleAttrs }, escapeXml(titleText)));

  if (descText) {
    parts.push(el("text", { x: descX, y: descY, ...descAttrs }, escapeXml(descText)));
  }

  return el(
    "g",
    {
      transform: `translate(${x},${y})`,
      "data-node-id": escapeXml(nodeId),
      ...wrapperAttrs,
    },
    ...parts,
  );
}
