import { resolveRepoPermalink } from "../../packages/app/src/render/repo-permalink.js";

/**
 * Cloudflare Pages Function: GET /r/<owner>/<repo>[/<path>]@<ref> — the
 * repo-backed + ref-pinned permalink resolver (karasu-nest Phase 2, Issue
 * #1828). Fetches the repo's committed `.krs` at the pinned ref, flattens it to
 * an inline share payload, and 302-redirects to the existing `/s` page so the
 * whole surface reuses the inline-share render + OGP + human-bounce path.
 *
 * The `/r/` prefix scopes the catch-all so it can't shadow `/s`, `/render`, or
 * the SPA's static routes (Pages Functions take precedence over static assets —
 * a bare `/<owner>/<repo>` catch-all would break the SPA; design doc § route
 * precedence). All logic lives in the unit-tested `resolveRepoPermalink`; this
 * function is the thin Workers adapter (same split as functions/s.ts ↔
 * share-page.ts).
 *
 * The browser carries the incoming `#krs-…` fragment onto the 302 target
 * automatically, but `/s` overwrites the fragment when it bounces to `/#s=…`,
 * so deep-anchor drill is a separate follow-up slice — this opens the whole
 * model.
 */
export async function onRequestGet(context: {
  request: Request;
  params: { path: string | string[] };
}): Promise<Response> {
  const url = new URL(context.request.url);

  const raw = context.params.path;
  const rest = Array.isArray(raw) ? raw.join("/") : raw;
  const permalink = decodeURIComponent(rest);

  const result = await resolveRepoPermalink(permalink, fetch);

  if (result.status === 200 && result.encodedPayload) {
    const target = `${url.origin}/s?s=${result.encodedPayload}`;
    return new Response(null, {
      status: 302,
      headers: { Location: target, "Cache-Control": "no-store" },
    });
  }

  return new Response(result.message ?? "Error.", {
    status: result.status,
    headers: { "Content-Type": result.contentType, "Cache-Control": "no-store" },
  });
}
