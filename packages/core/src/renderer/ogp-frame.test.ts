import { describe, it, expect } from "vitest";
import { DEFAULT_OGP_BACKGROUND, parseOgpBackground, wrapSvgForOgpFrame } from "./ogp-frame.js";

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

// #3773: `background` comes from the `/render` query's `bg` and is written into
// an SVG attribute, so only a strict hex colour may reach it.
describe("parseOgpBackground", () => {
  it.each(["#fff", "#FFF", "#fff8", "#a1b2c3", "#A1B2C3", "#a1b2c3d4"])("accepts %s", (raw) => {
    expect(parseOgpBackground(raw)).toBe(raw);
  });

  it.each([
    null,
    undefined,
    "",
    "#",
    "#ff",
    "#fffff",
    "#fffffff",
    "#fffffffff",
    "#ggg",
    "fff",
    "white",
    "transparent",
    "rgb(0,0,0)",
    "#fff ",
    " #fff",
    "#fff\n",
    '#fff"/><filter/>',
    '"/><filter id="x"><feTurbulence/></filter><rect fill="',
  ])("refuses %j", (raw) => {
    expect(parseOgpBackground(raw)).toBeUndefined();
  });

  // Every ASCII character that is not a hex digit, placed before, inside and
  // after an otherwise valid colour, is refused: no quote, `<`, `>`, `&`,
  // whitespace or control character can reach the attribute.
  it("refuses any non-hex-digit ASCII character around or inside a colour", () => {
    const leaked: string[] = [];
    for (let code = 0; code < 128; code++) {
      const ch = String.fromCharCode(code);
      if (/[0-9a-f]/i.test(ch)) continue;
      for (const raw of [`${ch}#fff`, `#f${ch}ff`, `#fff${ch}`, `#ffffff${ch}`, `#ffffffff${ch}`]) {
        if (parseOgpBackground(raw) !== undefined) leaked.push(JSON.stringify(raw));
      }
    }
    expect(leaked).toEqual([]);
  });
});

describe("wrapSvgForOgpFrame background", () => {
  const INJECTION = '"/><filter id="x"><feTurbulence/></filter><rect fill="';

  it("writes a valid hex background as the frame fill", () => {
    expect(wrapSvgForOgpFrame(TALL, 1200, 630, "#123456")).toContain(
      '<rect width="1200" height="630" fill="#123456"/>',
    );
  });

  it.each([INJECTION, "white", "#fff<", ""])(
    "falls back to the default and adds no markup for %j",
    (background) => {
      const out = wrapSvgForOgpFrame(TALL, 1200, 630, background);
      expect(out).toContain(`<rect width="1200" height="630" fill="${DEFAULT_OGP_BACKGROUND}"/>`);
      expect(out).not.toContain("filter");
      // The frame adds exactly its own two tags around the diagram.
      expect(out).toBe(wrapSvgForOgpFrame(TALL, 1200, 630, DEFAULT_OGP_BACKGROUND));
    },
  );
});
