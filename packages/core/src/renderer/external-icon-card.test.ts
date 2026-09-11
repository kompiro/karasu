/**
 * An external SVG icon (`shape: url(...)`) drawn as a node card, in both
 * display modes (#2696).
 *
 * Shape mode used to drop the node's declared frame on the floor — only icon
 * mode painted one — and to scale the icon body to whatever box the text
 * measured, which stretched a `160×100` drawing into a `286×84` card at
 * `scale(1.79, 0.84)`. Both are asserted here from the emitted SVG, per mode,
 * because the display mode is exactly the axis that differs (TPL-1001), and
 * because reading the drawn outline back is what keeps the assertion on what
 * is drawn rather than on the box it was derived from (TPL-2385).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render } from "./svg-renderer.js";
import { resolveStyles } from "../resolver/style-resolver.js";
import { extractView } from "../view/view-extract.js";
import { Parser } from "../parser/parser.js";
import { StyleParser } from "../parser/style-parser.js";
import { getBuiltinStyleSheet } from "../builtins/default-style.js";
import { loadAndRegisterIcon } from "./svg-icon-loader.js";
import { clearRegistry } from "../shapes/shape-registry.js";
import { registerBuiltinShapes } from "./shapes.js";
import type { DisplayMode } from "./layout.js";

/** A card-shaped icon: pictogram in the corner, text slots beside and below it. */
const CARD_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100">
  <g class="krs-pictogram" transform="translate(6, 4)">
    <rect width="20" height="20" fill="{{color}}"/>
  </g>
  <text class="krs-label" x="30" y="19" text-anchor="start"/>
  <text class="krs-description" x="8" y="44" text-anchor="start"/>
</svg>`;

/** A pictogram-only icon: no slots, so the node keeps its centred text stack. */
const PICTOGRAM_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <circle cx="12" cy="12" r="10" fill="none" stroke="#F59E0B" stroke-width="2"/>
</svg>`;

const LONG_LABEL = "Replace order snapshot service";

function renderFromSource(krs: string, style: string, displayMode?: DisplayMode): string {
  const parseResult = Parser.parse(krs);
  const sheets = [getBuiltinStyleSheet(), StyleParser.parse(style).value];
  const styles = resolveStyles(parseResult.value.systems, sheets);
  const viewSlice = extractView(parseResult.value.systems, []);
  return render(viewSlice, styles, undefined, parseResult.value.ownerIndex, displayMode);
}

function renderService(style: string, displayMode?: DisplayMode, label = LONG_LABEL): string {
  return renderFromSource(`system S { service Svc { label "${label}" } }`, style, displayMode);
}

/** The same node with a description, so the icon's second text slot is filled. */
function renderDescribedService(style: string, displayMode?: DisplayMode): string {
  return renderFromSource(
    `system S { service Svc { label "${LONG_LABEL}" description "Placement and tracking" } }`,
    style,
    displayMode,
  );
}

/** Everything the renderer emitted for one node. */
function nodeGroup(svg: string, id = "Svc"): string {
  const start = svg.indexOf(`data-node-id="${id}"`);
  expect(start).toBeGreaterThan(-1);
  const rest = svg.slice(start);
  const next = rest.indexOf("data-node-id=", 1);
  return next === -1 ? rest : rest.slice(0, next);
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The node's own card — its first `<rect>`, the one edges and chrome sit on. */
function cardRect(group: string): Box & { fill?: string; stroke?: string } {
  const tag = /<rect\s[^>]*\/>/.exec(group);
  expect(tag).not.toBeNull();
  const attr = (name: string): string | undefined =>
    new RegExp(`\\b${name}="([^"]*)"`).exec(tag![0])?.[1];
  return {
    x: Number(attr("x")),
    y: Number(attr("y")),
    width: Number(attr("width")),
    height: Number(attr("height")),
    fill: attr("fill"),
    stroke: attr("stroke"),
  };
}

/** Where the icon body landed: `<g transform="translate(x, y) scale(sx, sy)">`. */
function bodyPlacement(group: string): { x: number; y: number; scaleX: number; scaleY: number } {
  const m = /transform="translate\(([-\d.]+), ([-\d.]+)\) scale\(([-\d.]+), ([-\d.]+)\)"/.exec(
    group,
  );
  expect(m).not.toBeNull();
  return { x: Number(m![1]), y: Number(m![2]), scaleX: Number(m![3]), scaleY: Number(m![4]) };
}

/** The box the icon body occupies, in node coordinates. */
function bodyBox(group: string, viewBox: { w: number; h: number }): Box {
  const p = bodyPlacement(group);
  return { x: p.x, y: p.y, width: viewBox.w * p.scaleX, height: viewBox.h * p.scaleY };
}

beforeEach(() => {
  clearRegistry();
  registerBuiltinShapes();
  loadAndRegisterIcon("card-icon", CARD_ICON, true);
  loadAndRegisterIcon("dot-icon", PICTOGRAM_ICON);
});

describe("external icon card (#2696)", () => {
  const FRAMED = `service {
    shape: url("card-icon");
    background-color: #123456;
    border-color: #ABCDEF;
    border-width: 3;
    border-radius: 12;
  }`;

  describe("shape mode", () => {
    it("paints the declared card frame the icon body has nowhere to put", () => {
      const group = nodeGroup(renderService(FRAMED));

      expect(group).toContain('fill="#123456"');
      expect(group).toContain('stroke="#ABCDEF"');
      expect(group).toContain('stroke-width="3"');
      expect(group).toContain('rx="12"');
    });

    it("draws that frame on the whole node box, so edges meet what is drawn", () => {
      const group = nodeGroup(renderService(FRAMED));
      const card = cardRect(group);
      const body = bodyBox(group, { w: 160, h: 100 });
      // Both the fitted size and the emitted scale are rounded for legibility,
      // so containment is asserted to the precision they are written at rather
      // than exactly. A tenth of a pixel is far below anything visible.
      const slack = 0.1;

      // The card is the outline; the body is fitted inside it.
      expect(body.width).toBeLessThanOrEqual(card.width + slack);
      expect(body.height).toBeLessThanOrEqual(card.height + slack);
      expect(body.x).toBeGreaterThanOrEqual(card.x - slack);
      expect(body.y).toBeGreaterThanOrEqual(card.y - slack);
      expect(body.x + body.width).toBeLessThanOrEqual(card.x + card.width + slack);
      expect(body.y + body.height).toBeLessThanOrEqual(card.y + card.height + slack);
    });

    it("keeps the icon body's viewBox ratio instead of stretching it to the card", () => {
      const group = nodeGroup(renderService(FRAMED));
      const { scaleX, scaleY } = bodyPlacement(group);
      const card = cardRect(group);

      // Exactly equal, not merely close: both axes are emitted from the one
      // scale the fit computed, so a difference means something re-derived it.
      expect(scaleX).toBe(scaleY);
      // The card really is off-aspect — without the fit this would have been
      // the 2.13× stretch #2696 measured.
      expect(card.width / card.height).not.toBeCloseTo(160 / 100, 2);
    });

    it("puts both of the icon's text slots on the body they belong to", () => {
      const group = nodeGroup(renderDescribedService(FRAMED));
      const body = bodyBox(group, { w: 160, h: 100 });
      const { scaleX, scaleY } = bodyPlacement(group);
      // Both slots, because they move independently of each other: the label
      // sits at (30, 19) and the description at (8, 44) of the icon's own
      // 160×100 coordinate system, and either can be left behind on its own.
      const texts = [...group.matchAll(/<text[^>]*\bx="([\d.]+)"[^>]*\by="([\d.]+)"/g)].map(
        (m) => ({ x: Number(m[1]), y: Number(m[2]) }),
      );
      expect(texts.length).toBeGreaterThanOrEqual(2);

      expect(texts[0].x).toBeCloseTo(body.x + 30 * scaleX, 1);
      expect(texts[0].y).toBeCloseTo(body.y + 19 * scaleY, 1);
      expect(texts[1].x).toBeCloseTo(body.x + 8 * scaleX, 1);
      expect(texts[1].y).toBeCloseTo(body.y + 44 * scaleY, 1);
    });

    it("centres a slot-less icon, which has no layout of its own to line up", () => {
      const group = nodeGroup(renderService(`service { shape: url("dot-icon"); }`));
      const card = cardRect(group);
      const body = bodyBox(group, { w: 24, h: 24 });

      expect(body.x - card.x).toBeCloseTo(card.x + card.width - (body.x + body.width), 1);
      expect(body.y - card.y).toBeCloseTo(card.y + card.height - (body.y + body.height), 1);
    });

    it("leaves a url() with no registered icon on the box fallback, with no second rect", () => {
      const group = nodeGroup(renderService(`service { shape: url("no-such-icon"); }`));

      expect((group.match(/<rect\s/g) ?? []).length).toBe(1);
    });
  });

  describe("icon mode is unchanged", () => {
    it("still fills the fixed card with the icon body", () => {
      const group = nodeGroup(renderService(FRAMED, "icon"));
      const card = cardRect(group);

      expect(card.width).toBe(160);
      expect(card.height).toBe(56);
      expect(bodyPlacement(group)).toMatchObject({ x: card.x, y: card.y, scaleX: 1 });
    });

    it("leaves a transform that genuinely repeats exactly as it was", () => {
      // The fit snaps a scale to four decimals when it already is one, which is
      // how `(160 * 0.66) / 160` stops being written as `0.6599999999999999`.
      // An icon whose viewBox does not divide the fixed card scales by a
      // repeating quotient in icon mode, and that is emitted untouched — the
      // snap must never be a rounding of values this registry already emitted.
      const group = nodeGroup(renderService(`service { shape: url("dot-icon"); }`, "icon"));

      expect(group).toContain("scale(6.666666666666667, 2.3333333333333335)");
    });

    it("paints the same declared frame as shape mode", () => {
      const iconGroup = nodeGroup(renderService(FRAMED, "icon"));
      const shapeGroup = nodeGroup(renderService(FRAMED, "shape"));

      for (const group of [iconGroup, shapeGroup]) {
        const card = cardRect(group);
        expect(card.fill).toBe("#123456");
        expect(card.stroke).toBe("#ABCDEF");
      }
    });
  });
});
