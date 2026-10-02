import { describe, it, expect } from "vitest";
import { canvasLabel, displayEdgeLabel } from "./edge-label-disclosure.js";

describe("displayEdgeLabel", () => {
  it("returns the label itself when it fits, so a short label is drawn as written", () => {
    const label = "authorizes requests";
    expect(displayEdgeLabel(label, 40)).toBe(label);
    // Exactly at the budget still fits.
    expect(displayEdgeLabel("a".repeat(40), 40)).toBe("a".repeat(40));
  });

  it("draws the label whole when there is no budget", () => {
    const long = "x".repeat(300);
    expect(displayEdgeLabel(long, Infinity)).toBe(long);
    expect(displayEdgeLabel(long, undefined)).toBe(long);
  });

  it("cuts at a word boundary and ends with an ellipsis", () => {
    const label =
      "authorizes every request via @/permissions (canViewWebsiteSection, canViewReport)";
    const shown = displayEdgeLabel(label, 40);
    expect(shown).toBe("authorizes every request via…");
    // The words that remain are whole words of the original.
    expect(label.startsWith(shown.slice(0, -1))).toBe(true);
  });

  it("never draws more characters than the budget, ellipsis included", () => {
    const label = "delegates session deletion to deleteSession (src/queries/prisma/session.ts)";
    for (const max of [8, 16, 24, 32, 40, 60]) {
      expect(Array.from(displayEdgeLabel(label, max)).length).toBeLessThanOrEqual(max);
    }
  });

  it("cuts mid-word only when a word boundary would throw away most of the budget", () => {
    // One space, early: backing up to it would leave 2 of 20 characters.
    expect(displayEdgeLabel("is averyveryverylongsingletokenlabel", 20)).toBe(
      "is averyveryverylon…",
    );
  });

  it("does not leave punctuation hanging against the ellipsis", () => {
    expect(displayEdgeLabel("loads the website (fetchWebsite, Redis cache) to resolve", 20)).toBe(
      "loads the website…",
    );
  });

  it("counts code points, so a surrogate pair is never split", () => {
    const label = "😀".repeat(30);
    const shown = displayEdgeLabel(label, 10);
    expect(Array.from(shown)).toHaveLength(10);
    expect(shown).toBe("😀".repeat(9) + "…");
  });

  it("truncates a label written without spaces, such as Japanese", () => {
    const label = "リクエストごとに権限を確認し、認証トークンを検証してから処理を委譲する";
    const shown = displayEdgeLabel(label, 16);
    expect(Array.from(shown)).toHaveLength(16);
    expect(shown.endsWith("…")).toBe(true);
  });
});

describe("canvasLabel", () => {
  const auto = { labelMaxChars: 40, labelDisplay: "auto" as const };

  it("is undefined for an edge with no label", () => {
    expect(canvasLabel({}, auto)).toBeUndefined();
    expect(canvasLabel({ label: "" }, auto)).toBeUndefined();
  });

  it("applies the style to an authored label", () => {
    expect(canvasLabel({ label: "calls" }, auto)).toEqual({ text: "calls", display: "auto" });
    expect(canvasLabel({ label: "calls" }, { labelMaxChars: 40, labelDisplay: "hover" })).toEqual({
      text: "calls",
      display: "hover",
    });
    const long = "resolves the tracked website / link / pixel (fetchWebsite, findLink, findPixel)";
    expect(canvasLabel({ label: long }, auto)?.text).toBe("resolves the tracked website / link…");
  });

  it("never withholds or truncates a synthetic label: nothing could disclose it again", () => {
    // Synthetic labels are not emitted as `data-edge-label` (ADR-1554), so a
    // viewer has no text to show for one the canvas left off (TPL-3022).
    const marker = { label: "W", syntheticLabel: true };
    expect(canvasLabel(marker, { labelMaxChars: 40, labelDisplay: "hover" })).toEqual({
      text: "W",
      display: "always",
    });
    const count = { label: "12 domain edges", syntheticLabel: true };
    expect(canvasLabel(count, { labelMaxChars: 4, labelDisplay: "auto" })).toEqual({
      text: "12 domain edges",
      display: "always",
    });
  });

  it("never withholds a label that is the click target of the aggregated-edge panel", () => {
    const edge = {
      label: "places an order",
      domainEdges: [
        {
          fromDomainId: "Order",
          fromDomainLabel: "Order",
          toDomainId: "Stock",
          toDomainLabel: "Stock",
        },
      ],
    };
    expect(canvasLabel(edge, { labelMaxChars: 40, labelDisplay: "hover" })?.display).toBe("always");
    expect(canvasLabel(edge, auto)?.display).toBe("always");
  });
});
