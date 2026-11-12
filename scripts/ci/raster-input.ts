// Checks on an SVG that a PNG raster path hands resvg-wasm, and the discovery
// of those paths. Used by `raster-input.test.ts` (TPL-1799); kept apart so the
// test file holds only the table of paths and the corpus.

import { relative, resolve } from "node:path";
import madge from "madge";

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

const ATTRIBUTE = String.raw`([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')`;
const TAG = new RegExp(String.raw`<([a-zA-Z][\w:-]*)((?:\s+${ATTRIBUTE})*)\s*\/?>`, "g");

/**
 * Why `svg` would not rasterize as it shows in a browser: an element, a style
 * rule or a reference that only a browser resolves. Empty when it is static.
 */
export function browserOnlyFeatures(svg: string): string[] {
  const found: string[] = [];
  // resvg fetches nothing: a paint server, marker or image must be in the document.
  const checkUrls = (where: string, value: string) => {
    for (const [, ref] of value.matchAll(/url\(\s*['"]?([^'")]*)/g)) {
      if (!ref.startsWith("#")) found.push(`${where}: url(${ref}) is not a local reference`);
    }
  };
  const checkDeclarations = (where: string, block: string) => {
    for (const declaration of block.split(";")) {
      const property = declaration.split(":")[0]?.trim().toLowerCase();
      if (property && !STATIC_CSS_PROPERTIES.has(property)) {
        found.push(`${where}: CSS property "${property}"`);
      }
    }
    checkUrls(where, block);
  };

  let tags = 0;
  for (const [, name, attrs] of svg.matchAll(TAG)) {
    tags++;
    if (!STATIC_ELEMENTS.has(name)) found.push(`element <${name}>`);
    for (const [, attr, double, single] of attrs.matchAll(new RegExp(ATTRIBUTE, "g"))) {
      const value = double ?? single ?? "";
      // data-* only feeds the app's scripts; it is never drawn.
      if (attr.startsWith("data-")) continue;
      if (attr === "style") checkDeclarations(`<${name} style>`, value);
      if ((attr === "href" || attr === "xlink:href") && !value.startsWith("#")) {
        found.push(`<${name} ${attr}> points outside the document: ${value}`);
      }
      checkUrls(`<${name} ${attr}>`, value);
    }
  }
  // A tag the pattern could not read (an unquoted attribute, say) would skip
  // every check above, so an unread tag is itself a finding.
  const opened = svg.match(/<[a-zA-Z]/g)?.length ?? 0;
  if (opened !== tags) found.push(`${opened - tags} tag(s) this check could not read`);

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

/** Every character `svg` draws or names, with numeric character references decoded. */
export function charactersOf(svg: string): Set<number> {
  const decoded = svg.replace(/&#(x[0-9a-fA-F]+|[0-9]+);/g, (_, ref: string) =>
    String.fromCodePoint(ref.startsWith("x") ? parseInt(ref.slice(1), 16) : Number(ref)),
  );
  const out = new Set<number>();
  for (const ch of decoded) out.add(ch.codePointAt(0) ?? 0);
  return out;
}

/**
 * npm packages that turn an SVG or a drawing into pixels. A module that loads
 * one is a raster path. Browser screenshot tools are out of scope: the repo
 * uses Playwright only in E2E suites, which ship nothing.
 */
const isRasterizer = (pkg: string) =>
  pkg.startsWith("@resvg/") ||
  ["resvg", "sharp", "canvas", "skia-canvas", "@napi-rs/canvas"].includes(pkg);

/** `@scope/name` or `name` from a module specifier or a path under node_modules. */
function packageName(specifierOrPath: string): string {
  const parts = specifierOrPath.split("node_modules/").at(-1)?.split("/") ?? [];
  return parts[0]?.startsWith("@") ? `${parts[0]}/${parts[1]}` : (parts[0] ?? "");
}

/**
 * Repo-relative paths of the modules under `roots` that import a rasterizer,
 * found through madge's parsed import graph (static `import`, `export from`,
 * `import()` and `require` with a literal specifier).
 *
 * What it cannot see: a specifier computed at run time, which no module in the
 * repo uses and a bundler (wrangler, esbuild) could not resolve either; and
 * files outside `roots`. The roots are where deployed code lives (Pages
 * Functions and every workspace package's `src`); `scripts/` and
 * `packages/*\/scripts` run at build or in CI and draw nothing a user receives.
 */
export async function rasterizerLoaders(repoRoot: string, roots: string[]): Promise<string[]> {
  const graph = await madge(roots, {
    baseDir: repoRoot,
    includeNpm: true,
    fileExtensions: ["ts", "tsx", "mts", "cts", "js", "mjs", "cjs"],
    excludeRegExp: [/\.test\.[cm]?[jt]sx?$/],
    // Without mixedImports the TypeScript and ES-module parsers skip
    // `require()`, so a `.ts` file loading a rasterizer that way would escape.
    detectiveOptions: {
      ts: { mixedImports: true },
      tsx: { mixedImports: true },
      es6: { mixedImports: true },
    },
  });
  // A specifier madge could not resolve is dropped from the graph, not
  // reported as an import: a rasterizer missing from node_modules must not
  // make its loader disappear.
  const unresolved = graph.warnings().skipped.filter((s) => isRasterizer(packageName(s)));
  if (unresolved.length > 0) {
    throw new Error(`unresolved rasterizer import(s): ${unresolved.join(", ")}`);
  }
  return Object.entries(graph.obj())
    .filter(([, deps]) =>
      deps.some((dep) => dep.includes("node_modules/") && isRasterizer(packageName(dep))),
    ) // prettier-ignore
    .map(([file]) => relative(repoRoot, resolve(repoRoot, file)))
    .sort();
}
