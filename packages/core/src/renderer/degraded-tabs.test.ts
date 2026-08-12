import { describe, expect, it } from "vitest";
import { degradedTabsZone, layoutDegradedTabs, DEGRADED_TAB_HEIGHT } from "./degraded-tabs.js";
import type { LayoutNode } from "./layout-types.js";

function card(degraded: { id: string; label: string; hueIndex: number }[]): LayoutNode {
  return {
    kind: "service",
    id: "Svc",
    label: "Svc",
    properties: { links: [] },
    linkCount: 0,
    hasChildren: false,
    hasDescription: false,
    x: 100,
    y: 50,
    width: 200,
    height: 80,
    degradedBoundaries: degraded,
  } as LayoutNode;
}

describe("layoutDegradedTabs", () => {
  it("stacks the pills leftwards from the card's right edge", () => {
    const tabs = layoutDegradedTabs(
      card([
        { id: "a", label: "Payments", hueIndex: 0 },
        { id: "b", label: "Core", hueIndex: 1 },
      ]),
    );
    expect(tabs).toHaveLength(2);
    expect(tabs[0].x + tabs[0].width).toBe(288); // 300 - 12
    expect(tabs[1].x + tabs[1].width).toBeLessThanOrEqual(tabs[0].x);
    for (const tab of tabs) {
      expect(tab.y).toBe(50 + 80 - DEGRADED_TAB_HEIGHT / 2);
      expect(tab.x).toBeGreaterThan(100);
    }
  });

  it("sizes each pill from the text it will actually hold", () => {
    const [short] = layoutDegradedTabs(card([{ id: "a", label: "A", hueIndex: 0 }]));
    const [long] = layoutDegradedTabs(
      card([{ id: "a", label: "A much longer name", hueIndex: 0 }]),
    );
    expect(long.width).toBeGreaterThan(short.width);
    expect(long.label.startsWith("◇ ")).toBe(true);
  });

  it("stops stacking rather than walking off the card's left edge", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      id: `b${i}`,
      label: `Boundary ${i}`,
      hueIndex: i,
    }));
    const tabs = layoutDegradedTabs(card(many));
    expect(tabs.length).toBeLessThan(many.length);
    expect(Math.min(...tabs.map((t) => t.x))).toBeGreaterThanOrEqual(100);
  });

  it("elides a label too long for the room left", () => {
    const [tab] = layoutDegradedTabs(
      card([{ id: "a", label: "boundary name far past the card width", hueIndex: 0 }]),
    );
    expect(tab.label.endsWith("…")).toBe(true);
    expect(tab.x).toBeGreaterThanOrEqual(100);
  });

  it("has no geometry for a card in no degraded boundary", () => {
    expect(layoutDegradedTabs(card([]))).toEqual([]);
    expect(degradedTabsZone(card([]))).toBeUndefined();
  });
});

describe("degradedTabsZone", () => {
  it("covers the whole row, which is what ports keep out of", () => {
    const node = card([
      { id: "a", label: "Payments", hueIndex: 0 },
      { id: "b", label: "Core", hueIndex: 1 },
    ]);
    const tabs = layoutDegradedTabs(node);
    const zone = degradedTabsZone(node)!;
    expect(zone.x).toBe(Math.min(...tabs.map((t) => t.x)));
    expect(zone.x + zone.width).toBe(Math.max(...tabs.map((t) => t.x + t.width)));
    expect(zone.height).toBe(DEGRADED_TAB_HEIGHT);
  });
});
