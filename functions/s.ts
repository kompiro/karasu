import { buildSharePage } from "../packages/app/src/render/share-page.js";

/**
 * Cloudflare Pages Function: GET /s — the server-rendered share page that makes
 * a karasu-nest share link unfurl with its `system` diagram (OGP). Issue #1801.
 *
 * The payload travels in the QUERY (`?s=…`) so a link crawler can see it (the
 * `#s=` fragment used elsewhere is never sent to the server). The page emits
 * OGP `<meta>` pointing at the existing `/render?...&format=png` image and
 * bounces a human visitor to `/#s=…` so the SPA restores the project. All logic
 * lives in the unit-tested `buildSharePage`; this function is the thin Workers
 * adapter (same split as functions/render.ts ↔ share-render.ts).
 */
export async function onRequestGet(context: { request: Request }): Promise<Response> {
  const url = new URL(context.request.url);
  const result = buildSharePage(url.searchParams, url.origin);
  return new Response(result.body, {
    status: result.status,
    headers: {
      "Content-Type": result.contentType,
      "Cache-Control": result.status === 200 ? "public, max-age=600" : "no-store",
    },
  });
}
