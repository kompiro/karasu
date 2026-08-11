import { describe, expect, it } from "vitest";
import {
  BUTTON_SIZE,
  CHIP_HEIGHT,
  CHIP_INK_DARK,
  CHIP_INK_LIGHT,
  chipInk,
  LANE_GAP,
  LANE_MARGIN,
  packCornerLane,
  renderChip,
  type ChipStyle,
} from "./corner-lane.js";
import { contrastRatio, WCAG_AA_NORMAL_TEXT } from "./contrast.js";

const CARD = { x: 100, y: 50, width: 200 };
const FALLBACK = "#94A3B8";

/** Every resident of the lane, as [left, right] spans. */
function spans(card: typeof CARD, style: ChipStyle, buttonCount: number): [number, number][] {
  const lane = packCornerLane(card, style, buttonCount, FALLBACK);
  const boxes: [number, number][] = lane.buttons.map((b) => [
    b.cx - BUTTON_SIZE / 2,
    b.cx + BUTTON_SIZE / 2,
  ]);
  if (lane.chip) boxes.push([lane.chip.x, lane.chip.x + lane.chip.width]);
  return boxes.sort((a, b) => a[0] - b[0]);
}

describe("packCornerLane", () => {
  it("packs [i] [D] [chip] from the right edge, gap apart", () => {
    const lane = packCornerLane(CARD, { badgeIcon: "✦", badgeLabel: "NEW" }, 2, FALLBACK);
    const right = CARD.x + CARD.width - LANE_MARGIN;

    expect(lane.buttons[0].cx).toBe(right - BUTTON_SIZE / 2);
    expect(lane.buttons[1].cx).toBe(right - BUTTON_SIZE / 2 - (BUTTON_SIZE + LANE_GAP));
    expect(lane.chip!.x + lane.chip!.width).toBe(right - 2 * (BUTTON_SIZE + LANE_GAP));
    expect(lane.chip!.y).toBe(CARD.y + LANE_MARGIN);
  });

  // The defect the lane exists to make impossible: chip and buttons used to be
  // placed against the same corner independently, so one covered the other.
  it.each([0, 1, 2])("leaves no overlap between residents with %i buttons", (buttonCount) => {
    for (const label of ["", "N", "NEW", "Migration target", "非常に長い日本語ラベルの見本"]) {
      const boxes = spans(CARD, { badgeIcon: "✦", badgeLabel: label }, buttonCount);
      for (let i = 1; i < boxes.length; i++) {
        expect(
          boxes[i][0],
          `label "${label}" with ${buttonCount} buttons: residents overlap`,
        ).toBeGreaterThanOrEqual(boxes[i - 1][1]);
      }
    }
  });

  it("keeps every resident inside the card", () => {
    for (const width of [120, 160, 200, 320]) {
      const card = { ...CARD, width };
      const boxes = spans(card, { badgeIcon: "✦", badgeLabel: "Migration target" }, 2);
      expect(boxes[0][0]).toBeGreaterThanOrEqual(card.x);
      expect(boxes[boxes.length - 1][1]).toBeLessThanOrEqual(card.x + card.width);
    }
  });

  it("reserves a pill wide enough for what it draws — the label is never clipped", () => {
    // Elision is the only thing allowed to shorten a label; the pill always
    // takes the width of the text it ends up with, plus its padding.
    for (const label of ["N", "NEW", "Migration target"]) {
      const lane = packCornerLane(CARD, { badgeIcon: "✦", badgeLabel: label }, 2, FALLBACK);
      const chip = lane.chip!;
      const drawn = renderChip(chip);
      const text = drawn.at(-1)!;
      const x = Number(/ x="([\d.]+)"/.exec(text)![1]);
      expect(x).toBeGreaterThanOrEqual(chip.x);
      expect(x).toBeLessThan(chip.x + chip.width);
    }
  });

  it("elides the label rather than growing past 40% of the card", () => {
    const lane = packCornerLane(
      CARD,
      { badgeIcon: "✦", badgeLabel: "Migration target" },
      0,
      FALLBACK,
    );
    expect(lane.chip!.label).not.toBe("Migration target");
    expect(lane.chip!.label.endsWith("…")).toBe(true);
    expect(lane.chip!.width).toBeLessThanOrEqual(CARD.width * 0.4 + 20);
  });

  it("degrades to the glyph alone before it would push the pill off the card", () => {
    // A narrow card with both buttons leaves no room for text.
    const lane = packCornerLane(
      { x: 0, y: 0, width: 90 },
      { badgeIcon: "✦", badgeLabel: "Deprecated" },
      2,
      FALLBACK,
    );
    expect(lane.chip!.label).toBe("");
    expect(lane.chip!.glyph).toBe("✦");
  });

  it("keeps a label-only chip's label, since it has no glyph to fall back on", () => {
    const lane = packCornerLane(
      { x: 0, y: 0, width: 90 },
      { badgeLabel: "Deprecated" },
      2,
      FALLBACK,
    );
    expect(lane.chip!.label).not.toBe("");
  });

  it("emits no chip when the style carries neither glyph nor label", () => {
    const lane = packCornerLane(CARD, {}, 1, FALLBACK);
    expect(lane.chip).toBeUndefined();
    expect(lane.buttons).toHaveLength(1);
    expect(lane.zone.width).toBe(BUTTON_SIZE + LANE_GAP);
  });

  it("falls back to the palette color when the style names none", () => {
    expect(packCornerLane(CARD, { badgeLabel: "X" }, 0, FALLBACK).chip!.color).toBe(FALLBACK);
  });

  describe("zone", () => {
    it("covers every resident", () => {
      const style = { badgeIcon: "✦", badgeLabel: "NEW" };
      const lane = packCornerLane(CARD, style, 2, FALLBACK);
      const boxes = spans(CARD, style, 2);
      expect(lane.zone.x).toBeLessThanOrEqual(boxes[0][0]);
      expect(lane.zone.x + lane.zone.width).toBeGreaterThanOrEqual(boxes[boxes.length - 1][1]);
      expect(lane.zone.height).toBeGreaterThanOrEqual(Math.max(BUTTON_SIZE, CHIP_HEIGHT));
    });

    // `assignChipZones` reserves the interactive packing for both modes, which
    // only holds if that packing is the widest one.
    it("is widest with the buttons drawn, so reserving that covers the static render", () => {
      const style = { badgeIcon: "✦", badgeLabel: "Migration target" };
      const withButtons = packCornerLane(CARD, style, 2, FALLBACK).zone;
      const without = packCornerLane(CARD, style, 0, FALLBACK).zone;
      expect(withButtons.x).toBeLessThanOrEqual(without.x);
      expect(withButtons.x + withButtons.width).toBeGreaterThanOrEqual(without.x + without.width);
    });
  });
});

describe("chipInk", () => {
  it("picks the ink that contrasts with the pill, not the theme", () => {
    // Bright dark-theme badge colors take dark ink; deep light-theme ones white.
    expect(chipInk("#F59E0B")).toBe(CHIP_INK_DARK);
    expect(chipInk("#22D3EE")).toBe(CHIP_INK_DARK);
    expect(chipInk("#1E3A5F")).toBe(CHIP_INK_LIGHT);
  });

  it("meets AA against the pill it chose for", () => {
    for (const pill of ["#F59E0B", "#22D3EE", "#A855F7", "#1E3A5F", "#94A3B8"]) {
      expect(contrastRatio(chipInk(pill), pill)!).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    }
  });
});
