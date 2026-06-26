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
 */

// initWasm must run exactly once per isolate; cache the promise at module scope
// so the cold-start cost is paid once and shared across requests.
let wasmReady: Promise<unknown> | undefined;
function ensureWasm(): Promise<unknown> {
  if (!wasmReady) wasmReady = initWasm(resvgWasm);
  return wasmReady;
}

const ok = (status: number) =>
  status === 200 ? "public, max-age=600, immutable" : "no-store";

export async function onRequestGet(context: { request: Request }): Promise<Response> {
  const url = new URL(context.request.url);
  const result = renderSharePayload(url.searchParams);

  // SVG, or any error from the shared handler, passes through unchanged.
  if (url.searchParams.get("format") !== "png" || result.status !== 200) {
    return new Response(result.body, {
      status: result.status,
      headers: {
        "Content-Type": result.contentType,
        "Cache-Control": ok(result.status),
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  try {
    await ensureWasm();
    const widthRaw = Number(url.searchParams.get("width"));
    const width = Number.isFinite(widthRaw) && widthRaw > 0 ? Math.min(widthRaw, 4096) : undefined;
    const background = url.searchParams.get("bg") ?? undefined;
    const png = new Resvg(result.body, {
      fitTo: width ? { mode: "width", value: width } : { mode: "original" },
      background,
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
