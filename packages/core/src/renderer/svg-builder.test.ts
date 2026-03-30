import { describe, it, expect } from "vitest";
import { truncateToWidth, wrapToWidth } from "./svg-builder.js";

describe("truncateToWidth", () => {
  it("returns text unchanged when it fits", () => {
    expect(truncateToWidth("Hello", 100, 7.5)).toBe("Hello");
  });

  it("truncates ASCII text that exceeds maxWidth", () => {
    // 'ABCDEFGHIJ' = 10 chars × 7.5px = 75px; limit 50px → fits ~6 chars (45px)
    const result = truncateToWidth("ABCDEFGHIJ", 50, 7.5);
    expect(result).toContain("…");
    expect(result.length).toBeLessThan("ABCDEFGHIJ".length + 1);
  });

  it("truncates CJK text counted at 1.5x width", () => {
    // "プラットフォームチーム" = 11 katakana × 7.5 × 1.5 = 11.25px each ≈ 123.75px total
    // maxWidth = 122px → should truncate
    const result = truncateToWidth("プラットフォームチーム", 122, 7.5);
    expect(result).toContain("…");
    expect(result).not.toBe("プラットフォームチーム");
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
