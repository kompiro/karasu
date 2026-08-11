// The node card's top-right corner lane (#2420, design doc
// docs/design/node-chrome-and-ports.md H-1).
//
// Everything that wants the top-right corner — the info button, the deploy
// button, and the annotation chip — is a resident of ONE right-packed lane:
// [i] [D] [chip] from the right, 4px apart. Each resident is offset by the
// occupied width of everything to its right, so **overlap is structurally
// impossible** rather than a property of draw order or z-index. That is the
// whole point: the two defects the PoC review found (the `i` button covering
// the NEW chip, and `i` disappearing behind it) both came from the chip and
// the buttons being positioned independently against the same corner.
//
// The chip is inset — inside the card, not the floating circle outside its
// top-right corner that collided with incoming edges and neighbouring cards
// (#2366 P5). `badge.ts` keeps that circle for the org cards, which have no
// buttons to share the corner with.

import type { LayoutNode, Rect } from "./layout-types.js";
import { CHAR_WIDTH, estimateTextWidth } from "./rendering-constants.js";
import { contrastRatio } from "./contrast.js";
import { el, escapeXml, truncateToWidth } from "./svg-builder.js";

/** Distance from the card's top and right edges to the lane. */
export const LANE_MARGIN = 8;
/** Gap between two lane residents. */
export const LANE_GAP = 4;
/** Diameter of an icon button (`renderIconButton` draws r=8). */
export const BUTTON_SIZE = 16;
/** Height of the annotation chip's pill. */
export const CHIP_HEIGHT = 16;
/** Width of the ghost pill that marks a removed annotation. */
export const GHOST_CHIP_WIDTH = 26;
/** Horizontal padding inside the pill, per side. */
const CHIP_PADDING_X = 5;
/** Advance width reserved for the chip's glyph. */
const CHIP_GLYPH_WIDTH = 11;
/** Gap between the glyph and the label inside the pill. */
const CHIP_GLYPH_GAP = 2;
/** Font size of the chip label. */
const CHIP_FONT_SIZE = 9;
const CHIP_CHAR_WIDTH = CHAR_WIDTH * 0.75;
/** Share of the card width the chip label may occupy before eliding. */
const CHIP_LABEL_MAX_RATIO = 0.4;
/**
 * Characters a label must keep, beside the ellipsis, to be worth drawing.
 * Below this the label is dropped for the glyph: "D…" names no annotation, and
 * a chip that is all ellipsis reads as damage rather than as elision.
 */
const CHIP_LABEL_MIN_CHARS = 2;

/** The two inks a chip label can be drawn in. See {@link chipInk}. */
export const CHIP_INK_LIGHT = "#FFFFFF";
export const CHIP_INK_DARK = "#0F172A";

/** The subset of a resolved node style the lane reads. */
export interface ChipStyle {
  badgeIcon?: string;
  badgeLabel?: string;
  badgeColor?: string;
}

/** A chip that has been measured and fitted into the lane. */
export interface ChipBox extends Rect {
  /** Label text after elision; empty when the label was dropped to fit. */
  label: string;
  /** Glyph drawn before the label; empty when the style has none. */
  glyph: string;
  /** Badge color: the pill's fill when `solid`, its outline when not. */
  color: string;
  /** Label / glyph color, chosen against the pill by {@link chipInk}. */
  ink: string;
  /** False for a color the ink cannot be reasoned about — see `canFillPill`. */
  solid: boolean;
}

export interface CornerLane {
  /** Button centres, rightmost first — the order buttons are drawn in. */
  buttons: readonly { cx: number; cy: number }[];
  /** The annotation chip, when the style carries one. */
  chip?: ChipBox;
  /** The rectangle the lane's residents occupy. */
  zone: Rect;
}

/** Card geometry the lane needs. */
type CardBox = Pick<LayoutNode, "x" | "y" | "width">;

/**
 * How far the shape's drawn body sits inside the bounding box, on the two
 * sides the lane touches. A `user` card's border starts a medallion radius
 * below the box top, and a hexagon's top edge starts a fifth of the width in —
 * anchoring the lane to the box would hang the buttons over the outline
 * (reported on the user card: the ⓘ straddled the top border).
 */
export interface LaneInset {
  top: number;
  right: number;
}

const NO_INSET: LaneInset = { top: 0, right: 0 };

/** Height of the lane — its tallest possible resident. */
const LANE_HEIGHT = Math.max(BUTTON_SIZE, CHIP_HEIGHT);

/**
 * Top-right corner of the lane.
 *
 * The lane sits directly *above* the content area, its bottom edge on the
 * content's top: that clears the shape's outline without eating into the first
 * line of text. On a plain box the two coincide, since the inset is the
 * padding the text already starts after. Anchoring to the content top itself
 * would put the buttons alongside the label on a `user` card, whose inset
 * carries the medallion strip as well as the padding.
 */
function laneCorner(card: CardBox, inset: LaneInset): { right: number; top: number } {
  return {
    right: card.x + card.width - Math.max(LANE_MARGIN, inset.right),
    top: card.y + Math.max(LANE_MARGIN, inset.top - LANE_HEIGHT),
  };
}

/**
 * Ink for a chip label: whichever of the two fixed inks contrasts better with
 * the pill it sits on.
 *
 * The choice is made against the pill color, not the theme — a badge-color is
 * picked to be legible on its theme's canvas, which says nothing about what is
 * legible *on top of it*. Fixing the ink to white instead would put every dark
 * theme badge-color below 4.5:1 (`#F59E0B` reaches only 2.15:1). The guard in
 * `default-style-contrast.test.ts` holds the chosen ink to WCAG AA.
 */
export function chipInk(pillColor: string): string {
  const light = contrastRatio(CHIP_INK_LIGHT, pillColor) ?? 0;
  const dark = contrastRatio(CHIP_INK_DARK, pillColor) ?? 0;
  return dark > light ? CHIP_INK_DARK : CHIP_INK_LIGHT;
}

/**
 * Whether the pill can be filled with `color` at all.
 *
 * `badge-color` accepts any CSS color, but the luminance math behind
 * {@link chipInk} reads 6-digit hex only. Filling a pill with a color we
 * cannot reason about would mean guessing an ink — `badge-color: yellow` would
 * take white and land at 1.07:1. Such a chip is drawn outlined instead, with
 * the label in the badge color on the card, which is what the badge did before
 * the pill existed and keeps the contrast question where the sheet author
 * already answered it.
 */
function canFillPill(color: string): boolean {
  return contrastRatio(CHIP_INK_LIGHT, color) !== undefined;
}

/** Width a pill needs for the given content. Never less than what it draws. */
function pillWidth(glyph: string, label: string): number {
  const glyphPart = glyph ? CHIP_GLYPH_WIDTH : 0;
  const gap = glyph && label ? CHIP_GLYPH_GAP : 0;
  const labelPart = label ? estimateTextWidth(label, CHIP_CHAR_WIDTH) : 0;
  return CHIP_PADDING_X * 2 + glyphPart + gap + labelPart;
}

/** Total width `buttonCount` buttons take from the lane, gap included. */
function buttonsWidthOf(buttonCount: number): number {
  return buttonCount * (BUTTON_SIZE + LANE_GAP);
}

/**
 * Where a box of `width` sits when packed left of `buttonCount` buttons — the
 * one place the "each resident is offset by what stands to its right" rule is
 * expressed.
 */
export function laneBox(
  card: CardBox,
  buttonCount: number,
  width: number,
  height: number,
  inset: LaneInset = NO_INSET,
): Rect {
  const corner = laneCorner(card, inset);
  return {
    x: corner.right - buttonsWidthOf(buttonCount) - width,
    y: corner.top,
    width,
    height,
  };
}

/**
 * Packs the corner lane for one node.
 *
 * `buttonCount` is how many icon buttons this render draws — 0 in static
 * output, up to 2 in the app. The chip is placed left of them and degrades —
 * label elided at {@link CHIP_LABEL_MAX_RATIO} of the card, then dropped
 * entirely, leaving the glyph — until the lane fits the card. The chip itself
 * is never dropped: an annotation the viewer cannot see at all is worse than
 * one shown as a bare glyph.
 */
export function packCornerLane(
  card: CardBox,
  style: ChipStyle,
  buttonCount: number,
  fallbackColor: string,
  inset: LaneInset = NO_INSET,
): CornerLane {
  const { right, top } = laneCorner(card, inset);
  const cy = top + BUTTON_SIZE / 2;

  const buttons: { cx: number; cy: number }[] = [];
  for (let i = 0; i < buttonCount; i++) {
    buttons.push({ cx: right - BUTTON_SIZE / 2 - i * (BUTTON_SIZE + LANE_GAP), cy });
  }
  const buttonsWidth = buttonsWidthOf(buttonCount);

  if (!style.badgeIcon && !style.badgeLabel) {
    return {
      buttons,
      zone: { x: right - buttonsWidth, y: top, width: buttonsWidth, height: BUTTON_SIZE },
    };
  }

  const glyph = style.badgeIcon ?? "";
  let label = style.badgeLabel ?? "";
  if (label) {
    // The label yields first: to 40% of the card, and to whatever the pill has
    // left once its own padding, the glyph and the buttons are accounted for.
    const labelBudget = Math.min(
      card.width * CHIP_LABEL_MAX_RATIO,
      // What is left of the shape's own top edge once the buttons and the
      // pill's padding are taken out.
      right - card.x - Math.max(LANE_MARGIN, inset.right) - buttonsWidth - pillWidth(glyph, ""),
    );
    if (estimateTextWidth(label, CHIP_CHAR_WIDTH) > labelBudget) {
      label =
        labelBudget >= (CHIP_LABEL_MIN_CHARS + 1) * CHIP_CHAR_WIDTH
          ? truncateToWidth(label, labelBudget, CHIP_CHAR_WIDTH)
          : "";
    }
  }
  // A style with only a label has no glyph to degrade to, so the label stays
  // even when it does not fit — an empty pill would say nothing at all.
  if (!label && !glyph) label = style.badgeLabel ?? "";

  const color = style.badgeColor ?? fallbackColor;
  const solid = canFillPill(color);
  const box = laneBox(card, buttonCount, pillWidth(glyph, label), CHIP_HEIGHT, inset);
  const chip: ChipBox = { ...box, label, glyph, color, ink: solid ? chipInk(color) : color, solid };

  return {
    buttons,
    chip,
    zone: {
      x: chip.x,
      y: top,
      width: buttonsWidth + chip.width,
      height: Math.max(BUTTON_SIZE, CHIP_HEIGHT),
    },
  };
}

/** SVG parts of the inset pill: the pill, its glyph, and its label. */
export function renderChip(chip: ChipBox): string[] {
  const parts: string[] = [
    el("rect", {
      x: chip.x,
      y: chip.y,
      width: chip.width,
      height: chip.height,
      rx: chip.height / 2,
      fill: chip.solid ? chip.color : "none",
      stroke: chip.solid ? undefined : chip.color,
      "stroke-width": chip.solid ? undefined : 1,
    }),
  ];
  const midY = chip.y + chip.height / 2;
  let cursor = chip.x + CHIP_PADDING_X;
  if (chip.glyph) {
    parts.push(
      el(
        "text",
        {
          x: cursor + CHIP_GLYPH_WIDTH / 2,
          y: midY,
          "text-anchor": "middle",
          "dominant-baseline": "central",
          fill: chip.ink,
          "font-size": `${CHIP_FONT_SIZE}px`,
        },
        escapeXml(chip.glyph),
      ),
    );
    cursor += CHIP_GLYPH_WIDTH + (chip.label ? CHIP_GLYPH_GAP : 0);
  }
  if (chip.label) {
    parts.push(
      el(
        "text",
        {
          x: cursor,
          y: midY,
          "dominant-baseline": "central",
          fill: chip.ink,
          "font-size": `${CHIP_FONT_SIZE}px`,
          "font-weight": "bold",
          "font-family": "sans-serif",
        },
        escapeXml(chip.label),
      ),
    );
  }
  return parts;
}

/**
 * The ghost pill marking a node whose last annotation was removed: there is no
 * current badge to draw, so a dashed empty pill holds the spot (#738).
 */
export function renderGhostChip(box: Rect, color: string): string[] {
  return [
    el("rect", {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      rx: box.height / 2,
      fill: "transparent",
      stroke: color,
      "stroke-width": 1.5,
      "stroke-dasharray": "3 2",
    }),
    el(
      "text",
      {
        x: box.x + box.width / 2,
        y: box.y + box.height / 2,
        "text-anchor": "middle",
        "dominant-baseline": "central",
        fill: color,
        "font-size": `${CHIP_FONT_SIZE}px`,
      },
      "✕",
    ),
  ];
}
