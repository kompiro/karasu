import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { buildAllViewsSvg } from "../index.js";
import { getBuiltinStyleSheet } from "../builtins/default-style.js";
import { FACET_OVERLAY_COLORS } from "./facet-overlay.js";
import { resolvePalette, type DiagramTheme } from "./palette.js";

/**
 * Every colour a themed render draws has to come from somewhere that knows the
 * theme: that theme's `DiagramPalette`, that theme's builtin sheet, or the
 * model itself (a legend swatch the author wrote). The facet ring colours are
 * the one deliberate exception, theme-independent by design (facet-overlay.ts).
 *
 * A colour from anywhere else is a literal in the renderer or a base style that
 * no theme chose, which is how an element no rule paints ends up drawn in one
 * theme's colours in both (TPL-2662). Every shipped example is drawn by
 * `buildAllViewsSvg` in both themes, ungrouped and grouped by team and by
 * boundary, so an element added later is checked as soon as an example draws
 * it there. Live-viewer chrome (`nodeControls`), diff and facet selection are
 * not drawn.
 */

/** Attributes and CSS properties that take a paint. */
const PAINT_ATTRIBUTES = ["fill", "stroke", "color", "stop-color", "flood-color", "lighting-color"];
const PAINT_PROPERTIES = [
  ...PAINT_ATTRIBUTES,
  "background",
  "background-color",
  "border-color",
  "outline-color",
];

/** Paint values that name no colour of their own. */
const NOT_A_COLOUR = new Set(["none", "transparent", "currentcolor", "inherit"]);

/**
 * The named colours the renderer writes, by value. A name outside this table
 * is kept as written and so reported, which can only fail too often: add its
 * value here when one ships.
 */
const NAMED_COLOURS: Record<string, string> = { white: "#ffffff", black: "#000000" };

/**
 * The colour a paint value names, as lowercase `#rrggbb`; `undefined` for a
 * value that names none (a keyword or a `url(…)` paint server). An alpha
 * channel (`#rgba` / `#rrggbbaa`) is dropped: the hue is what a theme chooses.
 * Anything else (`rgb(…)`, an unknown name) comes back as written.
 */
function colourOf(value: string): string | undefined {
  const v = value
    .replace(/!important/i, "")
    .trim()
    .toLowerCase();
  if (NOT_A_COLOUR.has(v) || v.startsWith("url(")) return undefined;
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(v)?.[1];
  if (hex !== undefined) {
    const full = hex.length <= 4 ? [...hex].map((c) => c + c).join("") : hex;
    return `#${full.slice(0, 6)}`;
  }
  return NAMED_COLOURS[v] ?? v;
}

/** Every paint in `svg`: paint attributes, `style` attributes and `<style>` blocks. */
function paintsIn(svg: string): string[] {
  const values: string[] = [];
  const attribute = new RegExp(`\\s(?:${PAINT_ATTRIBUTES.join("|")})="([^"]*)"`, "g");
  for (const m of svg.matchAll(attribute)) values.push(m[1]);
  const declaration = new RegExp(
    `(?:^|[;{\\s])(?:${PAINT_PROPERTIES.join("|")})\\s*:\\s*([^;}"]+)`,
    "g",
  );
  const css = [
    ...[...svg.matchAll(/\sstyle="([^"]*)"/g)].map((m) => m[1]),
    ...[...svg.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]),
  ];
  for (const block of css) for (const m of block.matchAll(declaration)) values.push(m[1]);
  return values.flatMap((value) => colourOf(value) ?? []);
}

/** The hex colours written in `text` (palette values, sheet values, a model's swatches). */
function hexesIn(text: string): string[] {
  return (text.match(/#[0-9a-f]{3,8}\b/gi) ?? []).flatMap((hex) => colourOf(hex) ?? []);
}

/** The colours `theme` itself supplies. */
function themeColours(theme: DiagramTheme): Set<string> {
  const colours = new Set(FACET_OVERLAY_COLORS.flatMap((c) => colourOf(c) ?? []));
  for (const value of Object.values(resolvePalette(theme))) {
    for (const part of [value].flat()) {
      const colour = typeof part === "string" ? colourOf(part) : undefined;
      if (colour !== undefined) colours.add(colour);
    }
  }
  for (const rule of getBuiltinStyleSheet(theme).rules) {
    for (const value of Object.values(rule.properties)) {
      const colour = colourOf(value);
      if (colour !== undefined) colours.add(colour);
    }
  }
  return colours;
}

/**
 * Node kinds whose card no builtin rule paints, so it falls to the resolver's
 * `DEFAULT_NODE_STYLE`, a dark-theme card, in both themes. Known, and left as a
 * decision about their colours rather than fixed here; each entry is checked to
 * still need its exemption, so fixing one fails until it is removed.
 */
const BASE_CARD_KINDS: Record<string, string> = {
  table: "infra leaf inside a database level; no builtin rule paints it",
  "queue-item": "infra leaf inside a queue level; no builtin rule paints it",
  bucket: "infra leaf inside a storage level; no builtin rule paints it",
};

/** `svg` split into the node groups of `kinds` (each cut at its matching `</g>`) and the rest. */
function splitNodeGroups(svg: string, kinds: readonly string[]): { rest: string; cut: string[] } {
  let rest = svg;
  const cut: string[] = [];
  for (const kind of kinds) {
    const marker = `data-node-kind="${kind}"`;
    let at: number;
    while ((at = rest.indexOf(marker)) !== -1) {
      const start = rest.lastIndexOf("<g ", at);
      const tag = /<g[\s>]|<\/g>/g;
      tag.lastIndex = start;
      let depth = 0;
      let end = rest.length;
      for (let m = tag.exec(rest); m; m = tag.exec(rest)) {
        depth += m[0] === "</g>" ? -1 : 1;
        if (depth === 0) {
          end = m.index + m[0].length;
          break;
        }
      }
      cut.push(rest.slice(start, end));
      rest = rest.slice(0, start) + rest.slice(end);
    }
  }
  return { rest, cut };
}

const EXAMPLES_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../examples");
const EXAMPLES: [string, string][] = readdirSync(EXAMPLES_ROOT, {
  recursive: true,
  encoding: "utf8",
})
  .filter((path) => path.endsWith(".krs"))
  .sort()
  .map((path) => [path, readFileSync(resolve(EXAMPLES_ROOT, path), "utf8")]);

const THEMES: DiagramTheme[] = ["dark", "light"];
const GROUPINGS = [undefined, "team", "boundary"] as const;

function draw(krs: string, theme: DiagramTheme, groupBy: (typeof GROUPINGS)[number]): string {
  return (
    buildAllViewsSvg(krs, undefined, undefined, undefined, theme, undefined, groupBy).svg ?? ""
  );
}

describe("every colour of a themed render comes from that theme or the model (TPL-2662)", () => {
  it("scans a non-trivial number of examples", () => {
    expect(EXAMPLES.length).toBeGreaterThan(50);
  });

  describe.each(THEMES)("%s theme", (theme) => {
    const supplied = themeColours(theme);

    it.each(EXAMPLES)("%s", (_path, krs) => {
      const allowed = new Set([...supplied, ...hexesIn(krs)]);
      const stray = new Set<string>();
      for (const groupBy of GROUPINGS) {
        const svg = splitNodeGroups(draw(krs, theme, groupBy), Object.keys(BASE_CARD_KINDS)).rest;
        for (const colour of paintsIn(svg)) if (!allowed.has(colour)) stray.add(colour);
      }
      expect([...stray]).toEqual([]);
    });

    it.each(Object.keys(BASE_CARD_KINDS))("%s still needs its exemption", (kind) => {
      const cards = EXAMPLES.flatMap(
        ([, krs]) => splitNodeGroups(draw(krs, theme, undefined), [kind]).cut,
      );
      expect(cards.length, `no example draws a ${kind}`).toBeGreaterThan(0);
      const unsupplied = cards.flatMap(paintsIn).filter((colour) => !supplied.has(colour));
      expect(
        unsupplied,
        `${kind} is painted from the theme now; drop it from BASE_CARD_KINDS`,
      ).not.toEqual([]);
    });
  });
});
