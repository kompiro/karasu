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
 * The incoming `#krs-…` deep anchor is carried through the `/s` bounce to a
 * drilled/focused SPA open (#1958): the browser applies the original request's
 * fragment onto this 302 target, and `/s` moves it into a `?krs=` query the SPA
 * normalizes (share-page.ts ↔ App.resolveDeepLinkHash).
 *
 * Caching (#1958): an immutable `@<sha>` 302 is cached `immutable` (1y) via the
 * Cloudflare Cache API; a mutable `HEAD`/branch 302 gets a short TTL. This is an
 * ephemeral CDN cache, not a new store — stateless per ADR-1783. The
 * cache key excludes the URL fragment, so one cached `@<sha>` 302 serves every
 * `#krs-…` anchor variant (the anchor is applied client-side).
 */
export async function onRequestGet(context: {
  request: Request;
  params: { path: string | string[] };
  waitUntil(promise: Promise<unknown>): void;
}): Promise<Response> {
  const { request } = context;
  const cache = caches.default;
  const hit = await cache.match(request);
  if (hit) return hit;

  const url = new URL(request.url);

  const raw = context.params.path;
  const rest = Array.isArray(raw) ? raw.join("/") : raw;
  let permalink: string;
  try {
    permalink = decodeURIComponent(rest);
  } catch {
    // Malformed percent-encoding (e.g. a stray `%`) — decodeURIComponent throws
    // URIError. Return a clean 400 instead of letting it bubble to a generic 500.
    return new Response("Invalid permalink encoding.", {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  // Bind `fetch` to the global scope before handing it off: the Workers runtime
  // throws "Illegal invocation" if the global `fetch` is later called as a bare
  // reference (detached `this`), which is exactly what the resolver's provider
  // does (`this.fetchImpl(url)`). Node's fetch tolerates this, so the unit tests
  // don't catch it — the wrapper is the boundary guard.
  const boundFetch: typeof fetch = (input, init) => fetch(input, init);
  const result = await resolveRepoPermalink(permalink, boundFetch);

  if (result.status === 200 && result.encodedPayload) {
    const target = `${url.origin}/s?s=${result.encodedPayload}`;
    // Immutable `@<sha>`: cache 1y everywhere (content can't change). Mutable
    // `HEAD`/branch: let the shared CDN cache hold it briefly (`s-maxage`) to
    // shield GitHub raw, but keep the visitor's browser from replaying a stale
    // redirect (`max-age=0, must-revalidate`) — the Cloudflare Cache API honors
    // `s-maxage` over `max-age`, so this still caches at the edge.
    const cacheControl = result.immutable
      ? "public, max-age=31536000, immutable"
      : "public, s-maxage=60, max-age=0, must-revalidate";
    const response = new Response(null, {
      status: 302,
      headers: { Location: target, "Cache-Control": cacheControl },
    });
    // Populate the cache off the response path; a put failure must not break the
    // redirect (e.g. an environment where the Cache API is a no-op).
    context.waitUntil(cache.put(request, response.clone()).catch(() => {}));
    return response;
  }

  return new Response(result.message ?? "Error.", {
    status: result.status,
    headers: { "Content-Type": result.contentType, "Cache-Control": "no-store" },
  });
}
