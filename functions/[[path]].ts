import {
  classifyResolveOutcome,
  decodePathname,
  hasExplicitRef,
  matchBarePermalink,
  redirectCacheControl,
} from "../packages/app/src/render/bare-route.js";
import { buildNoKrsPage } from "../packages/app/src/render/no-krs-page.js";
import { resolveRepoPermalink } from "../packages/app/src/render/repo-permalink.js";

/**
 * Cloudflare Pages Function: GET /<owner>/<repo>[/<path>][@<ref>] — the bare
 * repo-backed permalink (ADR-1961, Issue #1961).
 *
 * A GitHub URL becomes a karasu URL by swapping the host alone, with no prefix
 * to remember. The price is that this root-level catch-all runs *before* static
 * assets, so it sees every request `_routes.json` did not exclude and must hand
 * back anything that is not a permalink via `context.next()` — the SPA and the
 * `_redirects` fallback only get their turn if this function declines.
 *
 * All routing decisions live in the unit-tested `bare-route.ts`; this file is
 * the Workers adapter (same split as functions/s.ts ↔ share-page.ts).
 *
 * The `#krs-…` deep anchor rides through untouched: the browser applies the
 * original request's fragment to the 302 target, and `/s` moves it into a
 * `?krs=` query the SPA normalizes (share-page.ts ↔ App.resolveDeepLinkHash).
 *
 * Caching (ADR-1828): an immutable `@<sha>` 302 is cached for a year; a mutable
 * `HEAD`/branch 302 gets a short shared-cache TTL. The signpost page is cached
 * briefly too, so a crawler walking unknown two-segment paths cannot amplify
 * into repeated GitHub raw fetches. This is an ephemeral CDN cache, not a new
 * store — the Pages surface stays stateless (ADR-2249). The cache key excludes
 * the URL fragment, so one cached 302 serves every `#krs-…` anchor variant.
 */
export async function onRequest(context: {
  request: Request;
  params: { path: string | string[] };
  next(): Promise<Response>;
  waitUntil(promise: Promise<unknown>): void;
}): Promise<Response> {
  const { request } = context;
  const url = new URL(request.url);

  const decoded = request.method === "GET" ? decodePathname(url.pathname) : null;
  const match = decoded === null ? null : matchBarePermalink(decoded);
  if (decoded === null || match === null) {
    // Not a permalink (or not a GET) — hand it back to the static-asset pipeline
    // so the SPA and the `_redirects` fallback behave exactly as before.
    return context.next();
  }

  const cache = caches.default;
  const hit = await cache.match(request);
  if (hit) return hit;

  // Bind `fetch` to the global scope before handing it off: the Workers runtime
  // throws "Illegal invocation" if the global `fetch` is later called as a bare
  // reference (detached `this`), which is exactly what the resolver's provider
  // does (`this.fetchImpl(url)`). Node's fetch tolerates this, so the unit tests
  // don't catch it — the wrapper is the boundary guard.
  const boundFetch: typeof fetch = (input, init) => fetch(input, init);
  const permalink = decoded.replace(/^\/+/, "");
  const result = await resolveRepoPermalink(permalink, boundFetch);

  const outcome = classifyResolveOutcome(result, hasExplicitRef(decoded));
  // The path parsed as `<owner>/<repo>` but was never a permalink (a path not
  // ending in `.krs`, say) — give it back to the SPA, which is where it went
  // before this route existed.
  if (outcome === "passthrough") return context.next();

  const response = buildResponse(outcome, result, url.origin, match);
  // Populate the cache off the response path; a put failure must not break the
  // response (e.g. an environment where the Cache API is a no-op).
  if (response.headers.get("Cache-Control")?.startsWith("public")) {
    context.waitUntil(cache.put(request, response.clone()).catch(() => {}));
  }
  return response;
}

function buildResponse(
  outcome: Exclude<ReturnType<typeof classifyResolveOutcome>, "passthrough">,
  result: Awaited<ReturnType<typeof resolveRepoPermalink>>,
  origin: string,
  match: { owner: string; repo: string },
): Response {
  switch (outcome) {
    case "redirect":
      return new Response(null, {
        status: 302,
        headers: {
          Location: `${origin}/s?s=${result.encodedPayload}`,
          "Cache-Control": redirectCacheControl(result.immutable),
        },
      });
    case "signpost": {
      const page = buildNoKrsPage(match.owner, match.repo);
      return new Response(page.body, {
        status: page.status,
        headers: {
          "Content-Type": page.contentType,
          // Short TTL: a repo without a `.krs` today may commit one tomorrow.
          "Cache-Control": "public, s-maxage=300, max-age=0, must-revalidate",
        },
      });
    }
    default:
      return new Response(result.message ?? "Error.", {
        status: result.status,
        headers: { "Content-Type": result.contentType, "Cache-Control": "no-store" },
      });
  }
}
