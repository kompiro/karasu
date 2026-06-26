import { renderSharePayload } from "../packages/app/src/render/share-render.js";
import { Resvg, initWasm } from "@resvg/resvg-wasm";
// wrangler resolves the `.wasm` import to a WebAssembly.Module at bundle time.
import resvgWasm from "@resvg/resvg-wasm/index_bg.wasm";

/**
 * Cloudflare Pages Function: GET /render — a karasu-nest share payload as an
 * image, embeddable as an <img> (README / OGP).
 *
 * SVG (`format` omitted) is produced by the unit-tested `renderSharePayload`.
 * `format=png` additionally rasterizes that SVG with resvg-wasm — PNG lives
 * only here (the Workers runtime), keeping core/cli/app SVG-only per
 * ADR-20260404-03. Deployed alongside the SPA — see .github/workflows/deploy.yml.
 *
 * resvg has no system fonts in the Workers runtime, so fonts are shipped as
 * static assets (packages/app/public/fonts) and fetched via env.ASSETS. Without
 * them, text would not render. Noto Sans covers Latin; Noto Sans JP is the
 * fallback for Japanese (and other CJK via the JP subset's coverage).
 */

interface Env {
  ASSETS: { fetch(input: Request | string | URL): Promise<Response> };
}

const FONT_PATHS = ["/fonts/NotoSans-Regular.ttf", "/fonts/NotoSansJP-Regular.otf"];

// init / font loading is cached at module scope so the cold-start cost (wasm
// init + ~5MB font fetch+decode) is paid once per isolate, not per request.
let wasmReady: Promise<unknown> | undefined;
let fontsReady: Promise<Uint8Array[]> | undefined;

function ensureWasm(): Promise<unknown> {
  if (!wasmReady) wasmReady = initWasm(resvgWasm);
  return wasmReady;
}

function loadFonts(env: Env, origin: string): Promise<Uint8Array[]> {
  if (!fontsReady) {
    fontsReady = Promise.all(
      FONT_PATHS.map(async (path) => {
        const res = await env.ASSETS.fetch(new URL(path, origin));
        if (!res.ok) throw new Error(`font fetch failed: ${path} (${res.status})`);
        return new Uint8Array(await res.arrayBuffer());
      }),
    );
  }
  return fontsReady;
}

const cacheControl = (status: number) =>
  status === 200 ? "public, max-age=600, immutable" : "no-store";

export async function onRequestGet(context: { request: Request; env: Env }): Promise<Response> {
  const url = new URL(context.request.url);
  const wantsPng = url.searchParams.get("format") === "png";

  // The default (no `view`) SVG is the bundled all-views diagram, whose CSS
  // `:target` tab navigation is interactive — rasterized to a static PNG it
  // shows only the tab bar with an empty body. PNG needs one concrete view, so
  // default to `system` when none is given. (SVG keeps the all-views default.)
  const params = new URLSearchParams(url.search);
  if (wantsPng && !params.get("view")) params.set("view", "system");

  const result = renderSharePayload(params);

  // SVG, or any error from the shared handler, passes through unchanged.
  if (!wantsPng || result.status !== 200) {
    return new Response(result.body, {
      status: result.status,
      headers: {
        "Content-Type": result.contentType,
        "Cache-Control": cacheControl(result.status),
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  try {
    const [, fontBuffers] = await Promise.all([ensureWasm(), loadFonts(context.env, url.origin)]);
    const widthRaw = Number(url.searchParams.get("width"));
    const width = Number.isFinite(widthRaw) && widthRaw > 0 ? Math.min(widthRaw, 4096) : undefined;
    const background = url.searchParams.get("bg") ?? undefined;
    const png = new Resvg(result.body, {
      fitTo: width ? { mode: "width", value: width } : { mode: "original" },
      background,
      font: {
        loadSystemFonts: false,
        fontBuffers,
        defaultFontFamily: "Noto Sans",
        sansSerifFamily: "Noto Sans",
      },
    })
      .render()
      .asPng();
    return new Response(png, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=600, immutable",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    return new Response(
      `PNG rasterization failed: ${err instanceof Error ? err.message : String(err)}`,
      {
        status: 500,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Access-Control-Allow-Origin": "*" },
      },
    );
  }
}
