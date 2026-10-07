/**
 * SVG to PNG for a submission's OGP image (#2995), with resvg-wasm.
 *
 * The one place in this package that loads WebAssembly, and kept in a module of
 * its own for that reason: vitest cannot load the `.wasm` import, so the route
 * tests replace this module with `vi.mock` and everything else in the route
 * stays under test. Whether the real thing produces a PNG is checked with
 * `wrangler dev` (`docs/acceptance/2995-nest-gallery-ogp.md`).
 *
 * PNG exists only inside this Worker, as it does inside the app's `/render`
 * Pages Function: core, the CLI and the app stay SVG-only (ADR-105, ADR-1805).
 * This file mirrors `functions/render.ts` deliberately, fonts included, so the
 * gallery's card and the app's `/s` card are drawn the same way.
 */
import { Resvg, initWasm } from "@resvg/resvg-wasm";
// wrangler resolves the `.wasm` import to a WebAssembly.Module at bundle time.
import resvgWasm from "@resvg/resvg-wasm/index_bg.wasm";
import type { AssetsFetcherLike } from "../env.js";
import { OG_FONT_PATHS, OG_IMAGE_WIDTH } from "./og-image.js";

// Cached per isolate, so wasm init and the ~8MB of fonts are paid once rather
// than per image. A failure clears the cache, so a transient asset fetch error
// is retried by the next request instead of poisoning the isolate.
let wasmReady: Promise<unknown> | undefined;
let fontsReady: Promise<Uint8Array[]> | undefined;

function ensureWasm(): Promise<unknown> {
  wasmReady ??= initWasm(resvgWasm).catch((cause: unknown) => {
    wasmReady = undefined;
    throw cause;
  });
  return wasmReady;
}

function loadFonts(assets: AssetsFetcherLike, base: URL): Promise<Uint8Array[]> {
  fontsReady ??= Promise.all(
    OG_FONT_PATHS.map(async (path) => {
      const response = await assets.fetch(new Request(new URL(path, base)));
      if (!response.ok) throw new Error(`font fetch failed: ${path} (${response.status})`);
      return new Uint8Array(await response.arrayBuffer());
    }),
  ).catch((cause: unknown) => {
    fontsReady = undefined;
    throw cause;
  });
  return fontsReady;
}

/**
 * Rasterize an SVG already framed to the OGP size.
 *
 * `base` is any URL on this deploy; the fonts are read through the `ASSETS`
 * binding, which only looks at the path.
 */
export async function rasterizeOgPng(
  svg: string,
  assets: AssetsFetcherLike,
  base: URL,
): Promise<Uint8Array<ArrayBuffer>> {
  const [, fontBuffers] = await Promise.all([ensureWasm(), loadFonts(assets, base)]);
  const png = new Resvg(svg, {
    fitTo: { mode: "width", value: OG_IMAGE_WIDTH },
    font: {
      loadSystemFonts: false,
      fontBuffers,
      defaultFontFamily: "Noto Sans",
      sansSerifFamily: "Noto Sans",
    },
  })
    .render()
    .asPng();
  // `asPng` copies out of wasm memory into a fresh, non-shared ArrayBuffer;
  // its declared type is just wider than what it returns.
  return png as Uint8Array<ArrayBuffer>;
}
