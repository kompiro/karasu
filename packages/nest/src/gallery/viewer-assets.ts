/**
 * Where the gallery viewer's build lives in this deploy, and what may be served
 * from it directly (#2998).
 *
 * The viewer is `packages/app`'s separate build (`build:viewer`, #2997).
 * `scripts/stage-viewer.ts` copies it into `viewer-assets/`, which
 * `wrangler.toml` publishes as Workers static assets. Only `/assets/*` is
 * served straight from there; every other path, `/viewer.html` included, goes
 * to the Worker (`run_worker_first`).
 *
 * That split is the point. The template carries the viewer's script, and this
 * origin holds the session cookie: opened here as a page of its own, without
 * the sandbox `/g/<id>` adds, it would run with the session's authority
 * (TPL-2993). The Worker reads it through the `ASSETS` binding instead and
 * only ever serves it under that sandbox.
 */

/** The staged template, as the `ASSETS` binding addresses it. */
export const VIEWER_TEMPLATE_PATH = "/viewer.html";

/** The one prefix served directly from the static assets. */
export const VIEWER_ASSET_PREFIX = "/assets/";

/**
 * The `_headers` file staged beside the assets.
 *
 * `Access-Control-Allow-Origin: *` because the page that loads them has an
 * opaque origin: a sandboxed document fetches module scripts and stylesheets
 * in CORS mode, and without the header nothing starts (the #2993 spike). `*`
 * rather than a list, since the requester's origin is `null`, the files are
 * public, and no credentials ride on the request.
 */
export const VIEWER_ASSET_HEADERS = `${VIEWER_ASSET_PREFIX}*
  Access-Control-Allow-Origin: *
  X-Content-Type-Options: nosniff
`;
