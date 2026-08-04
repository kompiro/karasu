import { bareTargetForLegacyPrefix } from "../../packages/app/src/render/bare-route.js";

/**
 * Cloudflare Pages Function: GET /r/… — the retired permalink prefix (ADR-1961).
 *
 * `/r/<owner>/<repo>[/<path>][@<ref>]` was the original repo-backed permalink
 * form (ADR-1828). It is retired because it breaks the property the bare form
 * exists for: swapping `github.com` for the karasu host should be the whole
 * transformation, and a prefix makes it karasu-specific knowledge instead.
 *
 * No `/r/` permalink was ever published from this repo — no ADR carries one —
 * so nothing here is load-bearing. Links may exist outside the repo (chat,
 * articles, shortened URLs) and those cannot be observed, so the prefix survives
 * as a redirect rather than disappearing. It costs a thin function and one extra
 * hop; the resolver itself lives only on the bare route
 * (`functions/[[path]].ts`), so there is no second copy to keep in step.
 *
 * 301 (not 302): the move is permanent, so caches and crawlers can stop asking.
 */
export function onRequestGet(context: { request: Request }): Response {
  const url = new URL(context.request.url);
  // Keep the query string. The fragment never reaches the server — the browser
  // reapplies it to the redirect target, so a `#krs-…` deep anchor survives.
  const target = `${url.origin}${bareTargetForLegacyPrefix(url.pathname)}${url.search}`;
  return new Response(null, {
    status: 301,
    headers: { Location: target, "Cache-Control": "public, max-age=86400" },
  });
}
