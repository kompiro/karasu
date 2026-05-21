import { describe, it, expect } from "vitest";
import { type DiagramPalette, darkPalette, lightPalette, resolvePalette } from "./palette.js";

describe("resolvePalette", () => {
  it("defaults to the dark palette when theme is omitted", () => {
    expect(resolvePalette()).toBe(darkPalette);
  });

  it("returns the dark palette for theme 'dark'", () => {
    expect(resolvePalette("dark")).toBe(darkPalette);
  });

  it("returns the light palette for theme 'light'", () => {
    expect(resolvePalette("light")).toBe(lightPalette);
  });
});

describe("palette role coverage", () => {
  const ROLES: (keyof DiagramPalette)[] = [
    "canvasBg",
    "surfaceBg",
    "legendBg",
    "legendBorder",
    "legendText",
    "legendMuted",
    "border",
    "mutedBorder",
    "textPrimary",
    "textMuted",
    "textSubtle",
    "emptyStateText",
    "link",
    "accent",
    "badgeFallback",
  ];

  it("both palettes define every role as a hex color", () => {
    for (const role of ROLES) {
      expect(darkPalette[role]).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(lightPalette[role]).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it("the dark palette preserves the historical chrome hex values", () => {
    // These literals must not drift — they are the bytes existing SVG
    // snapshots were recorded against (default theme is dark).
    expect(darkPalette.canvasBg).toBe("#0F172A");
    expect(darkPalette.surfaceBg).toBe("#1E293B");
    expect(darkPalette.legendBg).toBe("#1F2937");
    expect(darkPalette.legendBorder).toBe("#334155");
    expect(darkPalette.legendText).toBe("#E5E7EB");
    expect(darkPalette.legendMuted).toBe("#9CA3AF");
    expect(darkPalette.border).toBe("#334155");
    expect(darkPalette.mutedBorder).toBe("#475569");
    expect(darkPalette.textPrimary).toBe("#E2E8F0");
    expect(darkPalette.textMuted).toBe("#64748B");
    expect(darkPalette.textSubtle).toBe("#94A3B8");
    expect(darkPalette.emptyStateText).toBe("#9CA3AF");
    expect(darkPalette.link).toBe("#60A5FA");
    expect(darkPalette.accent).toBe("#3B82F6");
    expect(darkPalette.badgeFallback).toBe("#EF4444");
  });

  it("light and dark differ on the canvas background", () => {
    expect(lightPalette.canvasBg).not.toBe(darkPalette.canvasBg);
  });
});
