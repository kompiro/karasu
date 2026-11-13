import type { RasterFit, SharePngSvg } from "../../packages/app/src/render/share-render.js";
import { Resvg, initWasm } from "@resvg/resvg-wasm";
// wrangler resolves the `.wasm` import to a WebAssembly.Module at bundle time.
import resvgWasm from "@resvg/resvg-wasm/index_bg.wasm";

/**
 * resvg for `/render?format=png` (ADR-1805), and the only place under
 * `functions/` that loads it. Not a route: Pages builds routes only from files
 * that export an `onRequest*` handler, and this one exports none.
 *
 * {@link rasterizeSharePng} accepts only a {@link SharePngSvg}, which only
 * `sharePngSource` makes, so the SVG this draws is always one the raster-input
 * guard (`scripts/ci/raster-input.test.ts`, TPL-1799) checks. Drawing anything
 * else means importing resvg in another module, which that guard's discovery
 * reports until the new module is listed with its own source function.
 *
 * resvg has no system fonts in the Workers runtime, so fonts are shipped as
 * static assets (packages/app/public/fonts) and fetched via env.ASSETS. Without
 * them, text would not render. Noto Sans covers Latin; Noto Sans JP is the
 * fallback for Japanese (and other CJK via the JP subset's coverage); Noto Emoji
 * (monochrome) covers the emoji the SVG renderer emits and the ⚠ / ⚗ annotation
 * badges; Noto Sans Symbols 2 covers the ✦ (U+2726) @new badge, a Dingbats
 * symbol that Noto Emoji does NOT include. Without these, those glyphs
 * rasterize as tofu (□) even though the browser SVG is fine (the OS supplies
 * them there). resvg falls back across all provided buffers, so listing them
 * here is enough; no per-family wiring. Coverage is guarded by
 * packages/app/src/render/png-font-coverage.test.ts and
 * scripts/ci/raster-input.test.ts.
 */

/** The `ASSETS` binding, through which the fonts are read. */
interface AssetsBinding {
  fetch(input: Request | string | URL): Promise<Response>;
}

const FONT_PATHS = [
  "/fonts/NotoSans-Regular.ttf",
  "/fonts/NotoSansJP-Regular.otf",
  "/fonts/NotoEmoji.ttf",
  "/fonts/NotoSansSymbols2-Regular.ttf",
];

// init / font loading is cached at module scope so the cold-start cost (wasm
// init + ~8MB font fetch+decode) is paid once per isolate, not per request.
// On failure the cache is cleared so a transient error (e.g. an asset fetch
// hiccup) doesn't permanently poison the isolate — the next request retries.
let wasmReady: Promise<unknown> | undefined;
let fontsReady: Promise<Uint8Array[]> | undefined;

function ensureWasm(): Promise<unknown> {
  if (!wasmReady) {
    wasmReady = initWasm(resvgWasm).catch((err) => {
      wasmReady = undefined;
      throw err;
    });
  }
  return wasmReady;
}

function loadFonts(assets: AssetsBinding, origin: string): Promise<Uint8Array[]> {
  if (!fontsReady) {
    fontsReady = Promise.all(
      FONT_PATHS.map(async (path) => {
        const res = await assets.fetch(new URL(path, origin));
        if (!res.ok) throw new Error(`font fetch failed: ${path} (${res.status})`);
        return new Uint8Array(await res.arrayBuffer());
      }),
    ).catch((err) => {
      fontsReady = undefined;
      throw err;
    });
  }
  return fontsReady;
}

/** Rasterize what `sharePngSource` chose. `origin` is any URL origin on this deploy. */
export async function rasterizeSharePng(
  svg: SharePngSvg,
  options: { fitTo: RasterFit; background: string | undefined },
  assets: AssetsBinding,
  origin: string,
): Promise<Uint8Array<ArrayBuffer>> {
  const [, fontBuffers] = await Promise.all([ensureWasm(), loadFonts(assets, origin)]);
  const png = new Resvg(svg, {
    fitTo: options.fitTo,
    background: options.background,
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
