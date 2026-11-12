import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import madge from "madge";
import { beforeAll, describe, expect, it } from "vitest";
import { RASTER_FONT_FILES, readCmapCoverage } from "../../packages/app/src/render/raster-fonts.ts";
import { NodeFileSystemProvider } from "../../packages/cli/src/node-fs.ts";
import {
  buildAllViewsSvg,
  compile,
  compileProject,
  wrapSvgForOgpFrame,
} from "../../packages/core/src/index.ts";
import { OG_FONT_FILES } from "../../packages/nest/src/gallery/og-image.ts";
import { buildManifest, type Entry } from "../render-equivalence/inputs.ts";

// What the PNG raster paths hand resvg-wasm, checked on every model the repo
// owns (TPL-1799, #1799). A browser falls back to the OS for a glyph or a CSS
// feature the SVG needs; resvg in a Worker has only the font buffers it was
// given and draws a static picture. So an SVG that looks right in the preview
// can come out of a raster path with tofu (□) or an empty body, and nothing on
// the SVG side notices.
//
// The checks run on output, not on renderer source: whatever a model makes the
// renderer emit (a new marker glyph, a user's label, a `<style>` rule) is what
// is checked, however the renderer spells it. The models are the corpus Render
// equivalence renders, every example entry and every ```krs fence in the
// acceptance records, so a new example or AT joins without an edit here.

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const FONTS_DIR = join(REPO_ROOT, "packages/app/public/fonts");

/**
 * Every module that loads resvg, and the fonts it hands it. The first test
 * derives the module set from the import graph of every workspace package and
 * the Pages Functions, so a new raster path fails until it is listed here.
 * Listing it is the claim that it rasterizes what the corpus checks below
 * render: `compile` for one concrete view, optionally framed by
 * `wrapSvgForOgpFrame`. A path that rasterizes anything else (the bundled
 * all-views SVG, a diff) needs its own producer in this file first.
 */
const RASTER_PATHS: Record<string, readonly string[]> = {
  // `/render?format=png`: forces `view=system` when none is given, because
  // the all-views default needs CSS `:target` (see the last test).
  "functions/render.ts": RASTER_FONT_FILES,
  // nest's `/g/<id>/og.png`: always `view: "system"`, framed for OGP.
  "packages/nest/src/gallery/og-rasterize.ts": OG_FONT_FILES,
};

/** The SVG elements resvg draws as a static picture. Anything else is browser-only until shown otherwise. */
const STATIC_ELEMENTS = new Set([
  "svg", "g", "defs", "title", "desc", "style", "path", "rect", "circle", "ellipse", "line",
  "polyline", "polygon", "text", "tspan", "marker", "clipPath", "mask", "pattern",
  "linearGradient", "radialGradient", "stop", "use", "symbol",
]); // prettier-ignore

/**
 * CSS properties allowed in a `style` attribute or a `<style>` rule. Presentation
 * properties resvg applies, plus interaction-only ones whose absence in a still
 * image changes nothing (`cursor`, `pointer-events`). `animation`, `transition`
 * and the like are left out on purpose.
 */
const STATIC_CSS_PROPERTIES = new Set([
  "cursor", "pointer-events", "display", "visibility", "opacity", "fill", "fill-opacity",
  "fill-rule", "stroke", "stroke-width", "stroke-opacity", "stroke-dasharray",
  "stroke-dashoffset", "stroke-linecap", "stroke-linejoin", "font-family", "font-size",
  "font-style", "font-weight", "text-anchor", "dominant-baseline", "background",
]); // prettier-ignore

/**
 * Why `svg` would not rasterize as it shows in a browser: an element, a style
 * rule or a reference that only a browser resolves. Empty when it is static.
 */
function browserOnlyFeatures(svg: string): string[] {
  const found: string[] = [];
  const checkDeclarations = (where: string, block: string) => {
    for (const declaration of block.split(";")) {
      const property = declaration.split(":")[0]?.trim().toLowerCase();
      if (property && !STATIC_CSS_PROPERTIES.has(property)) {
        found.push(`${where}: CSS property "${property}"`);
      }
    }
  };
  for (const tag of svg.matchAll(/<([a-zA-Z][\w:-]*)((?:\s+[\w:-]+="[^"]*")*)\s*\/?>/g)) {
    const [, name, attrs] = tag;
    if (!STATIC_ELEMENTS.has(name)) found.push(`element <${name}>`);
    for (const [, attr, value] of attrs.matchAll(/([\w:-]+)="([^"]*)"/g)) {
      // data-* only feeds the app's scripts; it is never drawn.
      if (attr.startsWith("data-")) continue;
      if (attr === "style") checkDeclarations(`<${name} style>`, value);
      if ((attr === "href" || attr === "xlink:href") && !value.startsWith("#")) {
        found.push(`<${name} ${attr}> points outside the document: ${value}`);
      }
      for (const [, ref] of value.matchAll(/url\(\s*['"]?([^'")]*)/g)) {
        if (!ref.startsWith("#"))
          found.push(`<${name} ${attr}> url(${ref}) is not a local reference`);
      }
    }
  }
  for (const [, css] of svg.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
    const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
    // @font-face, @import, @keyframes, @media: none of them reach a still image.
    for (const [rule] of text.matchAll(/@[\w-]+/g)) found.push(`<style> at-rule ${rule}`);
    for (const [, selector, body] of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      // :target, :hover, :has(...) depend on a browser's state.
      if (selector.includes(":")) found.push(`<style> selector "${selector.trim()}"`);
      checkDeclarations("<style>", body);
    }
  }
  return [...new Set(found)];
}

const VIEWS = ["system", "deploy", "org"] as const;
const THEMES = ["light", "dark"] as const;
const DISPLAY_MODES = [undefined, "icon"] as const;

interface Rendered {
  label: string;
  svg: string;
}

/** Every corpus model in every view, theme and display mode, framed as the OGP card is. */
async function renderCorpus(): Promise<Rendered[]> {
  const records = readdirSync(join(REPO_ROOT, "docs/acceptance"))
    .filter((file) => file.endsWith(".md"))
    .map((file) => `docs/acceptance/${file}`);
  const { entries } = buildManifest(REPO_ROOT, records);
  const fs = new NodeFileSystemProvider();
  const out: Rendered[] = [];
  for (const entry of entries as Entry[]) {
    for (const diagramType of VIEWS) {
      for (const theme of THEMES) {
        for (const displayMode of DISPLAY_MODES) {
          const options = { diagramType, theme, displayMode };
          const result =
            entry.kind === "fence"
              ? compile(entry.source, options)
              : await compileProject(entry.path, fs, options);
          if (result.diagnostics.some((d) => d.severity === "error")) continue;
          const label = `${entry.name} :: ${diagramType}/${theme}/${displayMode ?? "shape"}`;
          out.push({ label, svg: result.svg });
          out.push({ label: `${label} (OGP frame)`, svg: wrapSvgForOgpFrame(result.svg, 1200, 630, "#ffffff") }); // prettier-ignore
        }
      }
    }
  }
  return out;
}

function coverageOf(files: readonly string[]): Set<number> {
  const covered = new Set<number>();
  for (const file of files) {
    for (const cp of readCmapCoverage(readFileSync(join(FONTS_DIR, file)))) covered.add(cp);
  }
  return covered;
}

let corpus: Rendered[];
beforeAll(async () => {
  corpus = await renderCorpus();
});

describe("raster paths (TPL-1799)", () => {
  it("lists every module that loads resvg", async () => {
    const roots = [
      join(REPO_ROOT, "functions"),
      // Every workspace package's runtime source (`packages/*`); e2e suites have none.
      ...readdirSync(join(REPO_ROOT, "packages"))
        .map((pkg) => join(REPO_ROOT, "packages", pkg, "src"))
        .filter((dir) => existsSync(dir)),
    ];
    const graph = await madge(roots, {
      baseDir: REPO_ROOT,
      includeNpm: true,
      fileExtensions: ["ts", "tsx", "mts"],
      excludeRegExp: [/\.test\.tsx?$/],
    });
    const loaders = Object.entries(graph.obj())
      .filter(([, deps]) => deps.some((dep) => /(^|\/)@resvg\//.test(dep)))
      .map(([file]) => relative(REPO_ROOT, resolve(REPO_ROOT, file)))
      .sort();
    expect(loaders).toEqual(Object.keys(RASTER_PATHS).sort());
  });

  it("renders a corpus to check", () => {
    // A corpus that silently compiled to nothing would pass every check below.
    expect(corpus.length).toBeGreaterThan(500);
  });

  it.each(Object.entries(RASTER_PATHS))(
    "%s: its fonts cover every character the corpus draws (no tofu)",
    (_path, fonts) => {
      const covered = coverageOf(fonts);
      const missing = new Map<string, string>();
      for (const { label, svg } of corpus) {
        for (const ch of svg) {
          const cp = ch.codePointAt(0) ?? 0;
          const key = `U+${cp.toString(16).toUpperCase().padStart(4, "0")} ${ch}`;
          if (cp > 0x7e && !covered.has(cp) && !missing.has(key)) missing.set(key, label);
        }
      }
      // Each entry names the first model that drew the character.
      expect(Object.fromEntries(missing)).toEqual({});
    },
  );

  it("the corpus SVG uses nothing a static rasterizer drops (:target, web fonts, animation)", () => {
    const offending: Record<string, string[]> = {};
    for (const { label, svg } of corpus) {
      const features = browserOnlyFeatures(svg);
      if (features.length > 0) offending[label] = features;
    }
    expect(offending).toEqual({});
  });

  it("would flag the bundled all-views SVG, which is why PNG renders one view", () => {
    // The detector is not vacuous: the all-views SVG switches tabs with CSS
    // `:target`, and a still image of it is a tab bar over an empty body.
    const { svg } = buildAllViewsSvg("system A { service B {} }", undefined, undefined, undefined, "light"); // prettier-ignore
    expect(browserOnlyFeatures(svg).some((f) => f.includes(":target"))).toBe(true);
  });
});
