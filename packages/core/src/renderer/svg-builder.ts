/**
 * JSX-inspired SVG element builder.
 * Provides a declarative API for constructing SVG markup strings.
 *
 * Usage:
 *   el("rect", { x: 0, y: 0, width: 100, height: 50, fill: "#fff" })
 *   el("g", { opacity: 0.8 }, el("circle", { cx: 50, cy: 50, r: 20 }))
 */

import type { LegendBlock, LegendEntry, LegendRefTarget, LegendViewScope } from "../types/ast.js";
import type { StyleRule, StyleSelector, StyleSheet } from "../types/style.js";
import { type LegendUsage, legendRefHasUsage } from "../legend/usage.js";
import type { DiagramPalette } from "./palette.js";

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

// ─── Legend footer ────────────────────────────────────────────────────────

const LEGEND_LEFT_PAD = 24;
const LEGEND_TOP_PAD = 16;
const LEGEND_BOTTOM_PAD = 16;
const LEGEND_BLOCK_GAP = 12;
const LEGEND_TITLE_HEIGHT = 22;
const LEGEND_ENTRY_HEIGHT = 22;
const LEGEND_SWATCH_SIZE = 16;
const LEGEND_LABEL_GAP = 12;
// Legend chrome colors are theme-driven (see renderer/palette.ts):
//   palette.legendBg / legendBorder / legendText / legendMuted.
// `legendMuted` doubles as the fallback swatch for refs whose target
// appears on a real node but no `.krs.style` rule paints them — e.g.
// semantic-only annotations like `[human]` (Issue #999).

interface LegendFooter {
  /** SVG group positioned at y=0 in its own local coordinate space. */
  svg: string;
  height: number;
}

/**
 * Render scopes that are the top level of a view type. An unscoped legend
 * (`legend { ... }`) appears exactly there — never on drill-down levels,
 * whose scopes (`service` / `domain`) must be opted into explicitly.
 */
const TOP_LEVEL_SCOPES: ReadonlySet<LegendViewScope> = new Set(["system", "deploy", "org"]);

/**
 * Exact-match scope switching (Issue #1513): each render depth shows only
 * the legends declared for precisely that scope — no cross-depth stacking.
 * `legend system` does not appear on a service drill-down, and
 * `legend service` does not appear at the system top level.
 */
export function legendScopeMatches(
  scope: LegendViewScope | undefined,
  renderScope: LegendViewScope,
): boolean {
  if (scope === undefined) return TOP_LEVEL_SCOPES.has(renderScope);
  return scope === renderScope;
}

/**
 * Render a legend footer band that lists every legend block applicable to
 * `scope`. Caller is responsible for positioning the returned `svg` group
 * at y=mainHeight and extending its outer `<svg>` viewBox by `height`.
 *
 * Returns `null` when no legend block applies to `scope` — the renderer
 * should skip the footer entirely in that case.
 *
 * Selector resolution mirrors the resolver's `legend-ref-unresolved`
 * detection (`resolver/warnings.ts`): the highest-specificity matching
 * style rule supplies the swatch color. Refs with no node usage *and* no
 * matching rule are skipped so a stale reference does not silently emit a
 * colorless square. Refs that *are* in use but have no painting rule fall
 * back to a neutral swatch so the legend stays informative for semantic-
 * only annotations like `[human]` (Issue #999).
 */
export function buildLegendFooter(
  legends: LegendBlock[],
  scope: LegendViewScope,
  sheets: StyleSheet[],
  width: number,
  palette: DiagramPalette,
  usage?: LegendUsage,
): LegendFooter | null {
  const applicable = legends.filter((l) => legendScopeMatches(l.scope, scope));
  if (applicable.length === 0) return null;

  const blocks: { title?: string; rows: { color: string; label: string }[] }[] = [];
  let totalRows = 0;
  let totalTitles = 0;
  for (const legend of applicable) {
    const rows: { color: string; label: string }[] = [];
    for (const entry of legend.entries) {
      const color = resolveLegendEntryColor(entry, sheets, usage, palette);
      if (color === null) continue;
      rows.push({ color, label: entry.label });
    }
    if (rows.length === 0) continue;
    blocks.push({ title: legend.title, rows });
    if (legend.title) totalTitles++;
    totalRows += rows.length;
  }
  if (blocks.length === 0) return null;

  const innerHeight =
    LEGEND_TOP_PAD +
    totalTitles * LEGEND_TITLE_HEIGHT +
    totalRows * LEGEND_ENTRY_HEIGHT +
    Math.max(0, blocks.length - 1) * LEGEND_BLOCK_GAP +
    LEGEND_BOTTOM_PAD;

  const parts: string[] = [];
  // Background band + top separator
  parts.push(
    el("rect", {
      x: 0,
      y: 0,
      width,
      height: innerHeight,
      fill: palette.legendBg,
    }),
  );
  parts.push(
    el("line", {
      x1: 0,
      y1: 0,
      x2: width,
      y2: 0,
      stroke: palette.legendBorder,
      "stroke-width": 1,
    }),
  );

  let cursor = LEGEND_TOP_PAD;
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.title) {
      parts.push(
        el(
          "text",
          {
            x: LEGEND_LEFT_PAD,
            y: cursor + LEGEND_TITLE_HEIGHT - 6,
            fill: palette.legendMuted,
            "font-size": "12px",
            "font-family": "sans-serif",
            "font-weight": "bold",
          },
          escapeXml(block.title),
        ),
      );
      cursor += LEGEND_TITLE_HEIGHT;
    }
    for (const row of block.rows) {
      const swatchY = cursor + (LEGEND_ENTRY_HEIGHT - LEGEND_SWATCH_SIZE) / 2;
      parts.push(
        el("rect", {
          x: LEGEND_LEFT_PAD,
          y: swatchY,
          width: LEGEND_SWATCH_SIZE,
          height: LEGEND_SWATCH_SIZE,
          fill: row.color,
          stroke: palette.legendBorder,
          "stroke-width": 1,
          rx: 3,
        }),
      );
      parts.push(
        el(
          "text",
          {
            x: LEGEND_LEFT_PAD + LEGEND_SWATCH_SIZE + LEGEND_LABEL_GAP,
            y: cursor + LEGEND_ENTRY_HEIGHT - 7,
            fill: palette.legendText,
            "font-size": "12px",
            "font-family": "sans-serif",
          },
          escapeXml(row.label),
        ),
      );
      cursor += LEGEND_ENTRY_HEIGHT;
    }
    if (i < blocks.length - 1) cursor += LEGEND_BLOCK_GAP;
  }

  return {
    svg: el("g", { class: "legend-footer" }, ...parts),
    height: innerHeight,
  };
}

function resolveLegendEntryColor(
  entry: LegendEntry,
  sheets: StyleSheet[],
  usage: LegendUsage | undefined,
  palette: DiagramPalette,
): string | null {
  if (entry.kind === "swatch") return entry.color;
  return resolveLegendRefColor(entry.target, sheets, usage, palette);
}

function resolveLegendRefColor(
  target: LegendRefTarget,
  sheets: StyleSheet[],
  usage: LegendUsage | undefined,
  palette: DiagramPalette,
): string | null {
  // Per-property cascade merge across every matching rule, mirroring
  // `mergeMatchingProperties` in resolver/style-resolver.ts. Picking a
  // single "best" rule and reading its background-color/badge-color used
  // to lose the swatch in icon mode (Issue #1001): the icon-theme rule
  // (e.g. `service { shape: url(...) }`) tied on specificity with the
  // builtin `service { background-color: ... }` rule and won as best
  // because it was declared later — but it only set `shape`, so no
  // color was found.
  const matching: { rule: StyleRule; specificity: number; sourceIndex: number }[] = [];
  for (const sheet of sheets) {
    for (const rule of sheet.rules) {
      if (!ruleMatchesTarget(rule.selector, target)) continue;
      matching.push({
        rule,
        specificity: rule.specificity,
        sourceIndex: rule.sourceIndex,
      });
    }
  }
  matching.sort((a, b) => a.specificity - b.specificity || a.sourceIndex - b.sourceIndex);
  const merged: Record<string, string> = {};
  for (const { rule } of matching) Object.assign(merged, rule.properties);

  // Prefer background-color for the main swatch; fall back to badge-color
  // (annotation rules in the builtin sheet often paint via badge-color).
  const painted = merged["background-color"] ?? merged["badge-color"];
  if (painted) return painted;
  // No painting rule (or matching rule that doesn't paint). If the target
  // is in use on at least one node, the ref is still semantically valid —
  // emit a neutral fallback swatch rather than silently dropping the
  // entry. If the target is unused, the resolver has already emitted
  // `legend-ref-unresolved`; we drop it here too.
  if (usage && legendRefHasUsage(target, usage)) return palette.legendMuted;
  return null;
}

function ruleMatchesTarget(selector: StyleSelector, target: LegendRefTarget): boolean {
  switch (target.kind) {
    case "annotation":
      return selector.annotations.includes(target.name);
    case "tag":
      return selector.tags.includes(target.name);
    case "selector": {
      const sel = target.selector;
      if (sel.startsWith("#")) return selector.id === sel.slice(1);
      if (sel.startsWith(".")) return false;
      return selector.nodeType === sel;
    }
  }
}
