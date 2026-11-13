import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { RASTER_FONT_FILES, readCmapCoverage } from "../../packages/app/src/render/raster-fonts.ts";
import { sharePngSource } from "../../packages/app/src/render/share-render.ts";
import { encodeShare } from "../../packages/app/src/utils/inline-share.ts";
import { NodeFileSystemProvider } from "../../packages/cli/src/node-fs.ts";
import {
  buildAllViewsSvg,
  type SharePayload,
  synthesizeSharePayload,
} from "../../packages/core/src/index.ts";
import { OG_FONT_FILES } from "../../packages/nest/src/gallery/og-image.ts";
import { ogImageSource } from "../../packages/nest/src/gallery/render.ts";
import { buildManifest } from "../render-equivalence/inputs.ts";
import { browserOnlyFeatures, charactersOf, rasterizerLoaders } from "./raster-input.ts";

// What the PNG raster paths hand resvg-wasm, checked on every model the repo
// owns (TPL-1799, #1799). A browser falls back to the OS for a glyph or a CSS
// feature the SVG needs; resvg in a Worker has only the font buffers it was
// given and draws a static picture. So an SVG that looks right in the preview
// can come out of a raster path with tofu (□) or an empty body, and nothing on
// the SVG side notices.
//
// Each path is run through its own entry function, the code that decides which
// SVG gets rasterized (view defaulting, the OGP frame), so a change to that
// choice is checked, not only the renderer. The checks run on output, not on
// renderer source: whatever a model makes the renderer emit (a new marker
// glyph, a user's label, a `<style>` rule) is checked however it is spelled.
// The models are the corpus Render equivalence renders, every example entry and
// every krs fence in the acceptance records, bundled into one share payload the
// way a repo permalink bundles a project.

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const FONTS_DIR = join(REPO_ROOT, "packages/app/public/fonts");

const VIEWS = [undefined, "system", "deploy", "org"] as const;
const THEMES = ["light", "dark"] as const;
const DISPLAY_MODES = [undefined, "icon"] as const;
const FITS = [{}, { fit: "contain", width: "1200", height: "630" }] as const;

/** One raster path: the fonts it hands resvg, and every SVG it would rasterize for a model. */
interface RasterPath {
  fonts: readonly string[];
  /** The SVGs, or the answer when the path would draw nothing (never expected for the corpus). */
  draw(payload: SharePayload): { variant: string; svg?: string; refused?: string }[];
}

/**
 * Every module that loads a rasterizer, keyed by path. The first test derives
 * the module set from the import graph, so a new raster path fails until it is
 * listed here with the function that chooses what it rasterizes.
 */
const RASTER_PATHS: Record<string, RasterPath> = {
  // `/render?format=png` (`functions/render.ts`). `rasterizeSharePng` accepts
  // only the branded SVG `sharePngSource` returns, and the handler passes its
  // query straight through to `sharePngSource`.
  "functions/_lib/share-raster.ts": {
    fonts: RASTER_FONT_FILES,
    draw: (payload) => {
      const s = encodeShare(payload);
      return VIEWS.flatMap((view) =>
        THEMES.flatMap((theme) =>
          DISPLAY_MODES.flatMap((displayMode) =>
            FITS.map((fit) => {
              const query = { s, theme, ...(view && { view }), ...(displayMode && { displayMode }), ...fit }; // prettier-ignore
              const source = sharePngSource(new URLSearchParams(query));
              const variant = new URLSearchParams({ ...query, s: "…" }).toString();
              return "svg" in source ? { variant, svg: source.svg } : { variant, refused: source.body }; // prettier-ignore
            }),
          ),
        ),
      );
    },
  },
  // nest's `/g/<id>/og.png`. `rasterizeOgPng` accepts only the branded SVG
  // `ogImageSource` returns. A submission is one `.krs` with no sheet.
  "packages/nest/src/gallery/og-rasterize.ts": {
    fonts: OG_FONT_FILES,
    draw: (payload) => {
      const source = ogImageSource(payload.krs);
      return ["svg" in source ? { variant: "og", svg: source.svg } : { variant: "og", refused: source.body }]; // prettier-ignore
    },
  },
};

interface Drawn {
  path: string;
  label: string;
  svg: string;
}

let drawn: Drawn[];
let refused: string[];
let entryCount: number;

beforeAll(async () => {
  const records = readdirSync(join(REPO_ROOT, "docs/acceptance"))
    .filter((file) => file.endsWith(".md"))
    .map((file) => `docs/acceptance/${file}`);
  const { entries } = buildManifest(REPO_ROOT, records);
  entryCount = entries.length;
  const fs = new NodeFileSystemProvider();
  drawn = [];
  refused = [];
  for (const entry of entries) {
    const payload =
      entry.kind === "fence" ? { krs: entry.source } : await synthesizeSharePayload(entry.path, fs);
    for (const [path, { draw }] of Object.entries(RASTER_PATHS)) {
      for (const { variant, svg, refused: why } of draw(payload)) {
        const label = `${entry.name} :: ${path} ${variant}`;
        if (svg === undefined) refused.push(`${label}: ${why}`);
        else drawn.push({ path, label, svg });
      }
    }
  }
  // Drawing the whole corpus on every path takes about 5 s locally and longer
  // on a CI runner, past vitest's 10 s hook default.
}, 120_000);

function coverageOf(files: readonly string[]): Set<number> {
  const covered = new Set<number>();
  for (const file of files) {
    for (const cp of readCmapCoverage(readFileSync(join(FONTS_DIR, file)))) covered.add(cp);
  }
  return covered;
}

describe("raster paths (TPL-1799)", () => {
  it("lists every module that loads a rasterizer", async () => {
    const roots = [
      join(REPO_ROOT, "functions"),
      // Every workspace package's runtime source (`packages/*`); e2e suites have none.
      ...readdirSync(join(REPO_ROOT, "packages"))
        .map((pkg) => join(REPO_ROOT, "packages", pkg, "src"))
        .filter((dir) => existsSync(dir)),
    ];
    expect(await rasterizerLoaders(REPO_ROOT, roots)).toEqual(Object.keys(RASTER_PATHS).sort());
    // madge parses every runtime source file in the repo: about 2 s locally,
    // 6 to 8 s on a CI runner, past vitest's 5 s test default.
  }, 60_000);

  it("draws every corpus model on every path, with no model dropped", () => {
    // A model that stopped compiling would otherwise leave the checks below
    // with less to look at and nothing to say about it.
    expect(refused).toEqual([]);
    expect(entryCount).toBeGreaterThan(200);
    for (const [path, { draw }] of Object.entries(RASTER_PATHS)) {
      const perModel = draw({ krs: "system A { service B {} }" }).length;
      expect(drawn.filter((d) => d.path === path)).toHaveLength(entryCount * perModel);
    }
  });

  it.each(Object.entries(RASTER_PATHS))(
    "%s: its fonts cover every character the corpus draws (no tofu)",
    (path, { fonts }) => {
      const covered = coverageOf(fonts);
      const missing = new Map<string, string>();
      for (const { label, svg } of drawn.filter((d) => d.path === path)) {
        for (const cp of charactersOf(svg)) {
          const key = `U+${cp.toString(16).toUpperCase().padStart(4, "0")} ${String.fromCodePoint(cp)}`; // prettier-ignore
          if (cp > 0x7e && !covered.has(cp) && !missing.has(key)) missing.set(key, label);
        }
      }
      // Each entry names the first model that drew the character.
      expect(Object.fromEntries(missing)).toEqual({});
    },
  );

  it("the SVG each path rasterizes uses nothing a static rasterizer drops (:target, web fonts, animation)", () => {
    const offending: Record<string, string[]> = {};
    for (const { label, svg } of drawn) {
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

describe("browserOnlyFeatures / charactersOf", () => {
  it("reads single-quoted attributes and flags a remote paint server in CSS", () => {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg'><rect style='fill: url(https://x.test/p.svg#g)'/></svg>`; // prettier-ignore
    expect(browserOnlyFeatures(svg)).toEqual([
      "<rect style>: url(https://x.test/p.svg#g) is not a local reference",
    ]);
  });

  it("reports a tag it cannot read instead of skipping it", () => {
    expect(browserOnlyFeatures(`<svg><rect width=10/></svg>`)).toEqual([
      "1 tag(s) this check could not read",
    ]);
  });

  it("decodes numeric character references", () => {
    expect(charactersOf("&#x29C9;&#9671;")).toEqual(new Set([0x29c9, 0x25c7]));
  });
});
