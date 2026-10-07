import { describe, it, expect } from "vitest";
import { wrapSvgForOgpFrame } from "./ogp-frame.js";

const TALL =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 598" width="320" height="598"><rect/></svg>';

describe("wrapSvgForOgpFrame", () => {
  it("wraps the diagram in a fixed W×H frame with a background and contains it", () => {
    const out = wrapSvgForOgpFrame(TALL, 1200, 630, "#ffffff");
    // Outer canvas is exactly the OGP frame size.
    expect(
      out.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"'),
    ).toBe(true);
    // Background fills the letterbox margins.
    expect(out).toContain('<rect width="1200" height="630" fill="#ffffff"/>');
    // The inner diagram is contained (meet), not cropped/stretched.
    expect(out).toContain('preserveAspectRatio="xMidYMid meet"');
    // The original viewBox is preserved so the content scales correctly.
    expect(out).toContain('viewBox="0 0 320 598"');
  });

  it("re-sizes the inner root to the frame (no leftover original width/height)", () => {
    const out = wrapSvgForOgpFrame(TALL, 1200, 630, "#fff");
    const inner = out.slice(out.indexOf("</rect>") + 1 || out.indexOf("/>") + 2);
    // The inner <svg> must carry the frame dimensions, not 320×598.
    expect(out).toContain('width="1200" height="630" preserveAspectRatio="xMidYMid meet"');
    expect(inner).not.toContain('width="320"');
    expect(inner).not.toContain('height="598"');
  });

  it("derives a viewBox from width/height when none is present", () => {
    const noViewBox =
      '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="598"><rect/></svg>';
    const out = wrapSvgForOgpFrame(noViewBox, 1200, 630, "#fff");
    expect(out).toContain('preserveAspectRatio="xMidYMid meet"');
    expect(out).toContain('width="1200" height="630"');
  });

  it("leaves a non-SVG string untouched", () => {
    expect(wrapSvgForOgpFrame("not an svg", 1200, 630, "#fff")).toBe("not an svg");
  });
});
