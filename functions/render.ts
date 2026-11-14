import { renderSharePayload, sharePngSource } from "../packages/app/src/render/share-render.js";
import { rasterizeSharePng } from "./_lib/share-raster.js";

/**
 * Cloudflare Pages Function: GET /render — a karasu-nest share payload as an
 * image, embeddable as an <img> (README / OGP).
 *
 * SVG (`format` omitted) is produced by the unit-tested `renderSharePayload`.
 * `format=png` rasterizes the SVG `sharePngSource` chooses with resvg-wasm
 * (`_lib/share-raster.ts`) — PNG lives only here (the Workers runtime),
 * keeping core/cli/app SVG-only per ADR-105. Deployed alongside the SPA — see
 * .github/workflows/deploy.yml.
 */

interface Env {
  ASSETS: { fetch(input: Request | string | URL): Promise<Response> };
}

const CACHE_OK = "public, max-age=600, immutable";
const cacheControl = (status: number) => (status === 200 ? CACHE_OK : "no-store");

export async function onRequestGet(context: { request: Request; env: Env }): Promise<Response> {
  const url = new URL(context.request.url);
  const wantsPng = url.searchParams.get("format") === "png";

  // What gets rasterized, and how it is fitted, is chosen by `sharePngSource`
  // (view defaulting, OGP letterboxing), where the raster-input guard runs it
  // over the whole corpus (TPL-1799). This handler only hands it to resvg.
  const source = wantsPng ? sharePngSource(url.searchParams) : renderSharePayload(url.searchParams);

  // SVG, or any error from the shared handler, passes through unchanged.
  if (!("svg" in source)) {
    return new Response(source.body, {
      status: source.status,
      headers: {
        "Content-Type": source.contentType,
        "Cache-Control": cacheControl(source.status),
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  try {
    const png = await rasterizeSharePng(source.svg, source, context.env.ASSETS, url.origin);
    return new Response(png, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": CACHE_OK,
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    return new Response(
      `PNG rasterization failed: ${err instanceof Error ? err.message : String(err)}`,
      {
        status: 500,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  }
}
