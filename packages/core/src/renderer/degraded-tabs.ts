// Geometry of the 縮退 tabs on a card's bottom edge (#2179): the `◇ <label>`
// pills that name a boundary membership the frame could not reach.
//
// Split out of the renderer because two passes need the same numbers: the
// renderer paints the pills, and port distribution keeps edges out of the band
// they occupy (#2422). Measuring twice would drift, and the failure would be
// silent — an arrowhead under a tab still looks like an arrowhead.

import type { LayoutNode, Rect } from "./layout-types.js";
import { estimateTextWidth } from "./rendering-constants.js";
import { truncateToWidth } from "./svg-builder.js";

const TAB_CHAR_WIDTH = 6;
const TAB_PAD = 8;
/** Height of a pill, and the band the row occupies. */
export const DEGRADED_TAB_HEIGHT = 18;
/** Distance from the card's right edge to the first pill. */
const RIGHT_MARGIN = 12;
/** How close to the card's left edge the stack may reach. */
const LEFT_MARGIN = 4;
/** Gap between two pills. */
const GAP = 4;

/** One placed pill: where it goes and the text it ended up holding. */
interface DegradedTabBox extends Rect {
  id: string;
  hueIndex: number;
  /** Label after elision — what the renderer draws and what sized the pill. */
  label: string;
}

/**
 * Places the pills right-aligned and stacked leftwards, so a card in three
 * boundaries shows all of them rather than silently keeping the first. Each is
 * sized from the text it will actually hold and clipped to the room still left
 * on the card: boundary labels are author-written and `charDisplayWidth`
 * counts CJK at 1.5×, so an unmeasured pill overflows its own border and the
 * stack walks off the card's left edge.
 */
export function layoutDegradedTabs(node: LayoutNode): DegradedTabBox[] {
  const tabs = node.degradedBoundaries;
  if (!tabs || tabs.length === 0) return [];
  const out: DegradedTabBox[] = [];
  let right = node.x + node.width - RIGHT_MARGIN;
  const y = node.y + node.height - DEGRADED_TAB_HEIGHT / 2;
  for (const tab of tabs) {
    const room = right - (node.x + LEFT_MARGIN);
    // Below one glyph plus the ellipsis there is nothing legible left to draw.
    if (room < TAB_PAD * 2 + TAB_CHAR_WIDTH * 3) break;
    const label = truncateToWidth(`◇ ${tab.label}`, room - TAB_PAD * 2, TAB_CHAR_WIDTH);
    const width = estimateTextWidth(label, TAB_CHAR_WIDTH) + TAB_PAD * 2;
    out.push({
      id: tab.id,
      hueIndex: tab.hueIndex,
      label,
      x: right - width,
      y,
      width,
      height: DEGRADED_TAB_HEIGHT,
    });
    right = right - width - GAP;
  }
  return out;
}

/** The band the whole row covers, or undefined when the card carries no tab. */
export function degradedTabsZone(node: LayoutNode): Rect | undefined {
  const tabs = layoutDegradedTabs(node);
  if (tabs.length === 0) return undefined;
  const left = Math.min(...tabs.map((t) => t.x));
  const right = Math.max(...tabs.map((t) => t.x + t.width));
  return { x: left, y: tabs[0].y, width: right - left, height: DEGRADED_TAB_HEIGHT };
}
