import { describe, it, expect } from "vitest";
import { truncateToWidth, wrapToWidth } from "./svg-builder.js";

describe("truncateToWidth", () => {
  it("returns text unchanged when it fits", () => {
    expect(truncateToWidth("Hello", 100, 7.5)).toBe("Hello");
  });

  it("truncates ASCII text that exceeds maxWidth, reserving room for ellipsis", () => {
    // textBudget = 50 - 7.5 = 42.5px; 5 chars = 37.5px fit, 6th (F) → 45 > 42.5 → "ABCDE…"
    const result = truncateToWidth("ABCDEFGHIJ", 50, 7.5);
    expect(result).toBe("ABCDE…");
  });

  it("truncates CJK text reserving ellipsis width", () => {
    // textBudget = 122 - 7.5 = 114.5px; 10 katakana = 112.5px fit, 11th → 123.75 > 114.5
    // → "プラットフォームチー…" (10 chars)
    const result = truncateToWidth("プラットフォームチーム", 122, 7.5);
    expect(result).toBe("プラットフォームチー…");
  });

  it("returns empty string unchanged", () => {
    expect(truncateToWidth("", 100, 7.5)).toBe("");
  });

  it("allows short CJK text that fits within width", () => {
    // "テスト" = 3 katakana × 11.25px = 33.75px < 50px
    expect(truncateToWidth("テスト", 50, 7.5)).toBe("テスト");
  });
});

describe("wrapToWidth", () => {
  it("returns single line when text fits", () => {
    const lines = wrapToWidth("Hello", 100, 7.5, 3);
    expect(lines).toEqual(["Hello"]);
  });

  it("wraps long text into multiple lines", () => {
    // Each ASCII char = 7.5px, maxWidth = 30px → ~4 chars per line
    const lines = wrapToWidth("ABCDEFGH", 30, 7.5, 3);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((l) => !l.includes("…") || l === lines[lines.length - 1])).toBe(true);
  });

  it("truncates with ellipsis on last allowed line", () => {
    // Force overflow beyond maxLines
    const lines = wrapToWidth("ABCDEFGHIJKLMNOPQRSTUVWXYZ", 30, 7.5, 2);
    expect(lines.length).toBe(2);
    expect(lines[1]).toContain("…");
  });

  it("handles empty string", () => {
    const lines = wrapToWidth("", 100, 7.5, 3);
    expect(lines).toEqual([""]);
  });

  it("wraps CJK text with 1.5x width", () => {
    // "あいうえおかきくけこ" = 10 hiragana × 11.25px = 112.5px; maxWidth=30 → wraps ~2 per line
    const lines = wrapToWidth("あいうえおかきくけこ", 30, 7.5, 4);
    expect(lines.length).toBeGreaterThan(1);
  });
});
