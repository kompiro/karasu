import { renderSharePayload } from "../packages/app/src/render/share-render.js";

/**
 * Cloudflare Pages Function: GET /render — static SVG for a karasu-nest share
 * payload, embeddable as an <img> (README / OGP). All logic lives in the
 * unit-tested `renderSharePayload`; this is a thin Workers-runtime adapter.
 *
 * Deployed alongside the SPA (packages/app/dist) — see .github/workflows/deploy.yml.
 */
export function onRequestGet(context: { request: Request }): Response {
  const url = new URL(context.request.url);
  const { status, contentType, body } = renderSharePayload(url.searchParams);
  return new Response(body, {
    status,
    headers: {
      "Content-Type": contentType,
      // Payloads are deterministic, so a 200 can be cached hard; errors aren't.
      "Cache-Control": status === 200 ? "public, max-age=600, immutable" : "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
