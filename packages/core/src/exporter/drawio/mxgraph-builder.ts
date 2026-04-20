/**
 * Tiny XML helpers for emitting mxGraph (draw.io) documents.
 *
 * draw.io's mxfile format is well-defined XML. A full DOM library is overkill
 * for our one-way export, so we emit strings directly while centralising the
 * escaping rules here.
 */

const XML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

export function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => XML_ESCAPES[ch]!);
}

export type AttrValue = string | number | boolean | undefined;

export function renderAttrs(attrs: Record<string, AttrValue>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined) continue;
    const str = typeof value === "boolean" ? (value ? "1" : "0") : String(value);
    parts.push(`${key}="${escapeXml(str)}"`);
  }
  return parts.length > 0 ? " " + parts.join(" ") : "";
}

/**
 * Serialise a draw.io style object (`{ rounded: 1, fillColor: "#fff" }`) into
 * the flat `key=value;...` form that `mxCell[style]` expects.
 *
 * Values that are `undefined` are skipped. Boolean values are encoded as `1`/`0`.
 * Bare shape tokens (e.g. `"group"`) can be passed via the reserved key `_shape`.
 */
export function renderStyle(style: Record<string, AttrValue>): string {
  const parts: string[] = [];
  const shape = style._shape;
  if (typeof shape === "string" && shape.length > 0) {
    parts.push(shape);
  }
  for (const [key, value] of Object.entries(style)) {
    if (key === "_shape" || value === undefined) continue;
    const str = typeof value === "boolean" ? (value ? "1" : "0") : String(value);
    parts.push(`${key}=${str}`);
  }
  return parts.join(";");
}
