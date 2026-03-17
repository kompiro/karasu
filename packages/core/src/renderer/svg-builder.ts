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
