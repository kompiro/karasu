/**
 * A public submission's OGP image (#2995): `GET /g/<id>/og.png`.
 *
 * Drawn on request and kept in the edge cache (the Cache API), not stored
 * (`docs/design/gallery-ogp-preview-image.md`, T3 + S3 + P1). Nothing here is
 * written to KV, so the account-deletion promise (ADR-2592 decision 5) has no
 * new data to cover. What keeps a cached image of a deleted or unlisted
 * submission from being served is that the route reads the submission before
 * every cache lookup; what removes the bytes is the one-day lifetime.
 *
 * The image is the same for every reader, so the route never reads the
 * session. Its callers are mostly unfurl crawlers, which carry none, and a
 * signed-in browser loading it as a thumbnail would otherwise trigger the
 * session refresh write (`GalleryStore.authenticate`) for an answer that does
 * not depend on who asked.
 *
 * Pure values and functions only: `scripts/stage-viewer.ts` imports the font
 * list from here under Node.
 */

/** The frame a `summary_large_image` card displays (~1.91:1). Same as the app's `/s` (ADR-1801). */
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

/** The letterbox colour around the diagram. Same as the app's `/s`. */
export const OG_IMAGE_BACKGROUND = "#ffffff";

/**
 * Bumped whenever what the image looks like changes for the same document:
 * fonts, theme, frame, renderer options. Part of the cache key, so a change
 * takes effect without waiting out the one-day lifetime.
 */
export const OG_RENDER_VERSION = 1;

/** How long a drawn image stays in a data center's cache. The upper bound on how long its bytes outlive a deletion. */
export const OG_EDGE_CACHE_SECONDS = 24 * 60 * 60;

/**
 * The fonts resvg needs, staged from `packages/app/public/fonts/`.
 *
 * Exactly the set the app's `/render` loads (`functions/render.ts`), which
 * `png-font-coverage.test.ts` checks against every glyph the renderer emits
 * (TPL-1799). `og-image.test.ts` keeps this list equal to that one.
 */
export const OG_FONT_FILES = [
  "NotoSans-Regular.ttf",
  "NotoSansJP-Regular.otf",
  "NotoEmoji.ttf",
  "NotoSansSymbols2-Regular.ttf",
] as const;

/**
 * Where the fonts are staged in `viewer-assets/`. Outside `/assets/*`, so
 * `wrangler.toml` routes requests for them to the Worker, which has no such
 * route: they are read through the `ASSETS` binding and never served.
 */
export const OG_FONT_PREFIX = "/og-fonts/";

export const OG_FONT_PATHS: readonly string[] = OG_FONT_FILES.map(
  (file) => `${OG_FONT_PREFIX}${file}`,
);

/** `updatedAt` as the number both URLs carry. */
const version = (updatedAt: string): number => Date.parse(updatedAt);

/**
 * The `og:image` URL a page advertises.
 *
 * `?v=` changes when the submission is replaced, so a crawler or browser that
 * keyed its own cache on the URL fetches the new image. The route ignores it.
 */
export function ogImageUrl(origin: string, id: string, updatedAt: string): string {
  return `${origin}/g/${id}/og.png?v=${version(updatedAt)}`;
}

/**
 * The edge-cache key for one version of one submission's image.
 *
 * Built from the stored record, never from the request: a key that followed
 * the request's query would let anyone miss the cache at will and make the
 * Worker draw again.
 */
export function ogImageCacheKey(origin: string, id: string, updatedAt: string): Request {
  return new Request(`${origin}/g/${id}/og.png?v=${version(updatedAt)}&r=${OG_RENDER_VERSION}`);
}

/** The Cache API, narrowed to what the route uses. */
export interface EdgeCacheLike {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

/**
 * `caches.default`, where the runtime has one.
 *
 * It does on this deploy's custom domain (ADR-3020). Elsewhere (unit tests, a
 * `wrangler dev` without it) there is none, and the route draws every time:
 * slower, never wrong.
 */
export function edgeCache(): EdgeCacheLike | undefined {
  return (globalThis as { caches?: { default?: EdgeCacheLike } }).caches?.default;
}

/**
 * The response the cache keeps.
 *
 * Built here rather than through `http.ts`: that module adds `Vary: Cookie`
 * to anything cacheable, which this image does not vary on, and the cache must
 * hold the one-day lifetime while readers get the page's ten minutes. No
 * `Set-Cookie`, which would make the Cache API refuse it.
 */
export function ogImageCacheEntry(png: Uint8Array<ArrayBuffer>): Response {
  return new Response(png, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": `public, max-age=${OG_EDGE_CACHE_SECONDS}`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
