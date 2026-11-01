import type { ResolvedNodeStyle } from "../types/style.js";
import type { DisplayMode, LayoutNode, Rect } from "./layout-types.js";
import { iconViewBox, type SvgIconDef } from "../shapes/shape-registry.js";
import { metaGlyph, type MetaGlyphName } from "./meta-glyphs.js";
import {
  DY_CENTER,
  DY_HANGING,
  el,
  escapeXml,
  truncateToWidth,
  wrapToWidth,
} from "./svg-builder.js";
import {
  CHAR_WIDTH,
  NODE_PADDING_X,
  NODE_PADDING_Y,
  META_FONT_RATIO,
  estimateTextWidth,
  ICON_LABEL_CHAR_WIDTH,
  ICON_DESC_CHAR_WIDTH,
  ICON_LABEL_CJK_WIDTH,
  ICON_DESC_CJK_WIDTH,
  ICON_DESC_MAX_WIDTH,
  teamChipText,
  DESC_MAX_LINES,
  META_GLYPH_GAP,
} from "./rendering-constants.js";
import { shapeInsetsOf, ZERO_INSETS } from "./node-style.js";

// Ratio of the description font size (and its estimated char width) to the
// node's base font size in the *rendered* SVG. Unified with layout.ts's
// DESCRIPTION_FONT_RATIO (0.85) in #2366 proposal C so the wrap the renderer
// performs matches the line count layout reserved height for (closes the
// historical 0.8-vs-0.85 divergence noted in Issue #2014, point 3).
const RENDERED_DESC_FONT_RATIO = 0.85;
// Opacity for secondary text (description) and meta chips layered on the
// card color (#2366 proposal E). 0.9 keeps white-on-service at >= 4.5:1
// where the old 0.7 fell to 3.7:1; the meta row previously used
// palette.textSubtle, which fell to 2.3:1 on the service card.
const SECONDARY_TEXT_OPACITY = 0.9;
const META_TEXT_OPACITY = 0.85;

// Icon-mode text layout constants (from design doc)
const ICON_LABEL_MAX_WIDTH = 122; // px available for title text beside an icon body
const ICON_DESC_MAX_LINES = 3;
const ICON_DESC_LINE_HEIGHT = 14; // px
/**
 * Side inset for text on a card with no icon body to work around, so the
 * budget is the card width minus this on both sides. 8 is what
 * `ICON_DESC_MAX_WIDTH` (144) already implies for the 160px card (#2533).
 */
const ICON_CARD_TEXT_INSET = 8;
/** Type sizes the ICON_*_CHAR_WIDTH estimates are calibrated for. */
const ICON_LABEL_FONT_SIZE = 13;
const ICON_DESC_FONT_SIZE = 11;

/**
 * Text rendered into an icon's declared label/description slots (`krs-label`
 * / `krs-description` positions carried on the SVG icon body) — the icon-mode
 * card's text layout, as opposed to the default centered text stack used by
 * shapes/icons with no slots (see `renderDefaultText`). Caller only invokes
 * this when `iconDef.labelSlot` is present.
 */
export function renderSlottedText(
  node: LayoutNode,
  /** Where the icon body was drawn — the slots are positions on that body. */
  bodyBox: Rect,
  style: ResolvedNodeStyle,
  iconDef: SvgIconDef,
  displayMode: DisplayMode | undefined,
  textColor: string,
  fontSize: number,
  displayDesc: string | undefined,
): string[] {
  const labelSlot = iconDef.labelSlot;
  if (!labelSlot) return [];

  const children: string[] = [];
  const { width: vw, height: vh } = iconViewBox(iconDef);
  const scaleX = bodyBox.width / vw;
  const scaleY = bodyBox.height / vh;

  const labelX = bodyBox.x + labelSlot.x * scaleX;
  const labelY = bodyBox.y + labelSlot.y * scaleY;
  const labelAnchor = labelSlot.textAnchor ?? "middle";

  // Icon-mode label truncation
  const iconMode = displayMode === "icon";
  const truncatedLabel = iconMode
    ? truncateToWidth(node.label, ICON_LABEL_MAX_WIDTH, ICON_LABEL_CHAR_WIDTH, ICON_LABEL_CJK_WIDTH)
    : node.label;
  const labelFontSize = iconMode ? 13 : fontSize;

  children.push(
    el(
      "text",
      {
        x: labelX,
        y: labelY,
        "text-anchor": labelAnchor,
        dy: DY_CENTER,
        fill: textColor,
        "font-size": `${labelFontSize}px`,
        "font-weight": style.fontWeight,
        "font-family": style.fontFamily,
      },
      escapeXml(truncatedLabel),
    ),
  );

  if (displayDesc && iconDef.descriptionSlot) {
    const descX = bodyBox.x + iconDef.descriptionSlot.x * scaleX;
    const descY = bodyBox.y + iconDef.descriptionSlot.y * scaleY;
    const descAnchor = iconDef.descriptionSlot.textAnchor ?? "middle";
    const descFontSize = iconMode ? 11 : Math.round(fontSize * RENDERED_DESC_FONT_RATIO);

    if (iconMode) {
      // Multi-line description: wrap text into up to 3 lines with tspan elements
      const lines = wrapToWidth(
        displayDesc,
        ICON_DESC_MAX_WIDTH,
        ICON_DESC_CHAR_WIDTH,
        ICON_DESC_MAX_LINES,
        ICON_DESC_CJK_WIDTH,
      );
      const tspans = lines.map((line, i) =>
        el(
          "tspan",
          {
            x: descX,
            dy: i === 0 ? "0" : `${ICON_DESC_LINE_HEIGHT}`,
          },
          escapeXml(line),
        ),
      );
      children.push(
        el(
          "text",
          {
            x: descX,
            y: descY,
            "text-anchor": descAnchor,
            dy: DY_HANGING,
            fill: textColor,
            "font-size": `${descFontSize}px`,
            "font-family": style.fontFamily,
            opacity: 0.7,
          },
          ...tspans,
        ),
      );
    } else {
      children.push(
        el(
          "text",
          {
            x: descX,
            y: descY,
            "text-anchor": descAnchor,
            dy: DY_CENTER,
            fill: textColor,
            "font-size": `${descFontSize}px`,
            "font-family": style.fontFamily,
            opacity: 0.7,
          },
          escapeXml(displayDesc),
        ),
      );
    }
  }

  return children;
}

/**
 * Default centered text stack for shapes/icons with no declared label slot:
 * label, then (as present) description, role, resource badge, capability
 * badge, and the link/team meta row (`renderMetaRow`). Each line grows
 * `nextY` for the next one, and `textLines` centers the whole stack
 * vertically inside the node.
 */
export function renderDefaultText(
  node: LayoutNode,
  style: ResolvedNodeStyle,
  nodeId: string,
  textColor: string,
  fontSize: number,
  displayDesc: string | undefined,
  hasMetaRow: boolean,
  applyShapeInsets: boolean,
  displayMode: DisplayMode | undefined,
): string[] {
  const children: string[] = [];
  // Icon mode gives every card the same fixed width (ICON_CARD_WIDTH), so the
  // text has to be fitted to the card rather than the other way round — the
  // shape-mode contract, where measureNode grew the card to fit, does not
  // apply here (#2533).
  const iconMode = displayMode === "icon";
  // This stack spans the whole card (no icon body reserving a column, which is
  // what makes `renderSlottedText`'s narrower ICON_LABEL_MAX_WIDTH right
  // there), so the budget is the card minus the same 8px inset
  // ICON_DESC_MAX_WIDTH already implies for a 160px card.
  const iconTextWidth = node.width - ICON_CARD_TEXT_INSET * 2;
  // The width constants are calibrated for the icon card's own type sizes, so
  // scale them when the style asks for a different one — otherwise a 12px
  // label is measured as if it were 13px and gets cut while it still fits.
  const labelScale = fontSize / ICON_LABEL_FONT_SIZE;
  const descScale = Math.round(fontSize * RENDERED_DESC_FONT_RATIO) / ICON_DESC_FONT_SIZE;
  // Shape-aware content box (#2366 proposal F): insets are content-safe
  // boundaries, clearance per side is max(padding, inset), and the stack
  // centres on the clearance box — exactly the box measureNode reserved —
  // so a cylinder's text sits below the top ellipse and a user card's text
  // centres on the card, not the bounding box.
  const insets = applyShapeInsets ? shapeInsetsOf(style, node.width, node.height) : ZERO_INSETS;
  const clearLeft = Math.max(NODE_PADDING_X, insets.left);
  const clearRight = Math.max(NODE_PADDING_X, insets.right);
  const textX = node.x + clearLeft + (node.width - clearLeft - clearRight) / 2;
  // Wrap the description exactly like layout.ts measureNode did when it
  // reserved the node height, so drawn lines always fit the card (#2366 C).
  const availableWidth = node.width - clearLeft - clearRight;
  const descLines = displayDesc
    ? iconMode
      ? // The shape-mode content box is `width - NODE_PADDING_X * 2`, which on a
        // 160px icon card leaves 80px and breaks a description into stubs. Use
        // the icon card's own budget instead. Line count stays at DESC_MAX_LINES
        // (not the slotted path's 3): this stack is centred in a fixed-height
        // card rather than seated in a declared slot, so the vertical rhythm is
        // unchanged and only the horizontal fit is corrected.
        wrapToWidth(
          displayDesc,
          iconTextWidth,
          ICON_DESC_CHAR_WIDTH * descScale,
          DESC_MAX_LINES,
          ICON_DESC_CJK_WIDTH * descScale,
        )
      : wrapToWidth(
          displayDesc,
          availableWidth,
          CHAR_WIDTH * RENDERED_DESC_FONT_RATIO,
          DESC_MAX_LINES,
        )
    : [];
  const textLines = 1 + descLines.length + (node.properties.role ? 1 : 0) + (hasMetaRow ? 1 : 0);
  const clearTop = Math.max(NODE_PADDING_Y, insets.top);
  const clearBottom = Math.max(NODE_PADDING_Y, insets.bottom);
  let textY = node.y + clearTop + (node.height - clearTop - clearBottom) / 2;
  if (textLines > 1) textY -= ((textLines - 1) * (fontSize + 4)) / 2;

  children.push(
    el(
      "text",
      {
        x: textX,
        y: textY,
        "text-anchor": "middle",
        dy: DY_CENTER,
        fill: textColor,
        "font-size": `${fontSize}px`,
        "font-weight": style.fontWeight,
        "font-family": style.fontFamily,
      },
      escapeXml(
        iconMode
          ? truncateToWidth(
              node.label,
              iconTextWidth,
              ICON_LABEL_CHAR_WIDTH * labelScale,
              ICON_LABEL_CJK_WIDTH * labelScale,
            )
          : node.label,
      ),
    ),
  );

  let nextY = textY + fontSize + 4;

  if (descLines.length > 0) {
    const descFontSize = Math.round(fontSize * RENDERED_DESC_FONT_RATIO);
    for (const line of descLines) {
      children.push(
        el(
          "text",
          {
            x: textX,
            y: nextY,
            "text-anchor": "middle",
            dy: DY_CENTER,
            fill: textColor,
            "font-size": `${descFontSize}px`,
            "font-family": style.fontFamily,
            opacity: SECONDARY_TEXT_OPACITY,
          },
          escapeXml(line),
        ),
      );
      nextY += fontSize + 4;
    }
  }

  if (node.properties.role) {
    children.push(
      el(
        "text",
        {
          x: textX,
          y: nextY,
          "text-anchor": "middle",
          dy: DY_CENTER,
          fill: textColor,
          "font-size": `${Math.round(fontSize * 0.75)}px`,
          "font-family": style.fontFamily,
          "font-style": "italic",
          opacity: 0.8,
        },
        escapeXml(node.properties.role),
      ),
    );
    nextY += fontSize + 4;
  }

  // Resource badge (client only). Replaces the per-resource text loop with
  // a single "📦 ×N" badge so the card height does not grow with resource
  // count. The full list is surfaced in NodeDetailPanel (Issue #914).
  if (node.properties.resources && node.properties.resources.length > 0) {
    const resCount = node.properties.resources.length;
    const resFontSize = Math.round(fontSize * META_FONT_RATIO);
    const tooltip = node.properties.resources.map((r) => `${r.storageKind} "${r.name}"`).join(", ");
    children.push(
      renderCountChip(
        "package",
        resCount,
        tooltip,
        { "data-client-resource-count": String(resCount) },
        textX,
        nextY,
        resFontSize,
        textColor,
        style.fontFamily,
      ),
    );
    nextY += fontSize + 4;
  }

  // Capability badge (client only). Mirrors the resource badge: a single
  // "🔐 ×N" so the card height stays bounded regardless of how many
  // capabilities the client declares. Full list (including label /
  // description) is surfaced in NodeDetailPanel.
  if (node.properties.capabilities && node.properties.capabilities.length > 0) {
    const capCount = node.properties.capabilities.length;
    const capFontSize = Math.round(fontSize * META_FONT_RATIO);
    const tooltip = node.properties.capabilities.map((c) => c.name).join(", ");
    children.push(
      renderCountChip(
        "capability",
        capCount,
        tooltip,
        { "data-client-capability-count": String(capCount) },
        textX,
        nextY,
        capFontSize,
        textColor,
        style.fontFamily,
      ),
    );
    nextY += fontSize + 4;
  }

  // Meta row: link count + team
  if (hasMetaRow) {
    children.push(...renderMetaRow(node, style, nodeId, textX, nextY, clearLeft, clearRight));
  }

  return children;
}

/**
 * A glyph + text pair anchored like SVG text: "start" draws the glyph at x,
 * "end" right-aligns glyph + text at x, "middle" centres the pair on x.
 * Replaces the emoji-prefixed meta strings (#2366 proposal D) — the same
 * geometry `metaChipWidth` reserves during measurement.
 */
function metaChip(
  glyph: MetaGlyphName,
  text: string,
  x: number,
  anchor: "start" | "end" | "middle",
  y: number,
  fontSize: number,
  color: string,
  fontFamily: string,
): string[] {
  const glyphSize = fontSize + 4;
  const textWidth = estimateTextWidth(text, CHAR_WIDTH * META_FONT_RATIO);
  const total = glyphSize + META_GLYPH_GAP + textWidth;
  const left = anchor === "start" ? x : anchor === "end" ? x - total : x - total / 2;
  return [
    metaGlyph(glyph, left, y - glyphSize / 2, glyphSize, color),
    el(
      "text",
      {
        x: left + glyphSize + META_GLYPH_GAP,
        y,
        dy: DY_CENTER,
        fill: color,
        "font-size": `${fontSize}px`,
        "font-family": fontFamily,
      },
      escapeXml(text),
    ),
  ];
}

/** Centred "glyph ×N" chip with a tooltip (client resource / capability rows). */
function renderCountChip(
  glyph: MetaGlyphName,
  count: number,
  tooltip: string,
  dataAttrs: Record<string, string>,
  cx: number,
  y: number,
  fontSize: number,
  color: string,
  fontFamily: string,
): string {
  return el(
    "g",
    { ...dataAttrs, opacity: META_TEXT_OPACITY },
    el("title", {}, escapeXml(tooltip)),
    ...metaChip(glyph, `×${count}`, cx, "middle", y, fontSize, color, fontFamily),
  );
}

/**
 * Link-count / team meta row rendered below a default-text-stack node's
 * badges (Issue #914 / team grouping). `hasMetaRow` (checked by the caller)
 * guarantees at least one of link count / team is present; both, only one,
 * or the layout (left/right split when both) branch on that here.
 *
 * #2366 proposals D + E: the emoji (🔗 / 👥) became vector glyphs, and the
 * row inherits the node's own text color at META_TEXT_OPACITY instead of
 * palette.textSubtle (2.3:1 on the service card background).
 */
function renderMetaRow(
  node: LayoutNode,
  style: ResolvedNodeStyle,
  nodeId: string,
  textX: number,
  nextY: number,
  clearLeft: number,
  clearRight: number,
): string[] {
  const children: string[] = [];
  const metaFontSize = Math.round(style.fontSize * META_FONT_RATIO);
  const color = style.color;
  const buttonAttrs = { style: "cursor: pointer", "pointer-events": "all" };
  const team = node.properties.team;

  const linkChip = (x: number, anchor: "start" | "middle"): string =>
    el(
      "g",
      { "data-link-button": nodeId, ...buttonAttrs, opacity: META_TEXT_OPACITY },
      ...metaChip(
        "link",
        String(node.linkCount),
        x,
        anchor,
        nextY,
        metaFontSize,
        color,
        style.fontFamily,
      ),
    );
  const teamChip = (teamId: string, x: number, anchor: "end" | "middle"): string =>
    el(
      "g",
      { "data-team-button": teamId, ...buttonAttrs, opacity: META_TEXT_OPACITY },
      ...metaChip(
        "team",
        teamChipText(node.properties.teamLabel ?? teamId),
        x,
        anchor,
        nextY,
        metaFontSize,
        color,
        style.fontFamily,
      ),
    );

  if (node.linkCount > 0 && team) {
    // Both link count and team: link on the left, team on the right
    children.push(linkChip(node.x + clearLeft, "start"));
    children.push(teamChip(team, node.x + node.width - clearRight, "end"));
  } else if (node.linkCount > 0) {
    children.push(linkChip(textX, "middle"));
  } else if (team) {
    children.push(teamChip(team, textX, "middle"));
  }

  return children;
}
