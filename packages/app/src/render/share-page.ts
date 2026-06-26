import { compile } from "@karasu-tools/core";
import { decodeShare } from "../utils/inline-share.js";

/**
 * Server-rendered share page for karasu-nest OGP unfurl (design:
 * docs/adr/20260626-01-karasu-nest-hosted-preview.md follow-up, Issue #1801).
 *
 * The inline-share payload normally lives in the URL *fragment* (`#s=`), which
 * OGP crawlers never send to the server — so a `#s=` link cannot produce a
 * per-share `og:image`. This page lives at `/s?s=<payload>` (query, server
 * visible) and emits OGP `<meta>` pointing the crawler at the existing
 * `/render?...&format=png` image. A human visitor is bounced to `/#s=<payload>`
 * so the SPA restores the project through the unchanged fragment path
 * (`readSharedProjectFromHash`) — no new SPA wiring.
 *
 * Framework-agnostic (mirrors share-render.ts): returns a plain result that the
 * Cloudflare Pages Function (`functions/s.ts`) maps onto a `Response`, so the
 * logic is unit-testable without the Workers runtime.
 *
 * Security (TPL-20260510-17): the payload crosses a trust boundary into
 * server-rendered HTML. `s` is validated against the base64url charset before
 * being echoed into the image URL / bounce / noscript — base64url excludes
 * `" < > & '`, so injection there is structurally impossible. The dynamic
 * og:title / og:description are decoded from the payload (arbitrary text, NOT
 * covered by the charset check) so they are HTML-escaped unconditionally.
 */
interface SharePageResult {
  status: number;
  contentType: string;
  body: string;
}

const HTML = "text/html; charset=utf-8";
const PLAIN = "text/plain; charset=utf-8";

/** base64url alphabet — the only shape `encodeShare` ever produces. */
const BASE64URL = /^[A-Za-z0-9_-]+$/;

/** Synthetic system that wraps top-level orphans; never a real project name. */
const UNASSIGNED_SYSTEM_ID = "__unassigned__";

const STATIC_TITLE = "karasu — shared architecture diagram";
const STATIC_DESCRIPTION = "An architecture diagram shared with karasu-nest.";
/** Keep og:description within the length crawlers display. */
const DESCRIPTION_MAX = 200;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function truncate(value: string, max: number): string {
  const trimmed = value.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

/**
 * Best-effort title / description from the first real system in the payload.
 * Any failure (corrupt payload, compile error, no system) falls back to the
 * static strings — this page never errors on a bad payload, it just unfurls
 * with generic text (and the image, served by `/render`, may itself be empty).
 */
function extractMeta(s: string): { title: string; description: string } {
  try {
    const payload = decodeShare(s);
    if (payload === null) return { title: STATIC_TITLE, description: STATIC_DESCRIPTION };
    const result = compile(payload.krs, { diagramType: "system", styleSource: payload.style });
    if (result.diagramType !== "system") {
      return { title: STATIC_TITLE, description: STATIC_DESCRIPTION };
    }
    const system = result.systems.find((sys) => sys.id !== UNASSIGNED_SYSTEM_ID);
    if (!system) return { title: STATIC_TITLE, description: STATIC_DESCRIPTION };
    const title = system.label ?? system.id;
    const description = system.properties.description;
    return {
      title: title || STATIC_TITLE,
      description: description ? truncate(description, DESCRIPTION_MAX) : STATIC_DESCRIPTION,
    };
  } catch {
    return { title: STATIC_TITLE, description: STATIC_DESCRIPTION };
  }
}

function renderHtml(s: string, origin: string): string {
  const { title, description } = extractMeta(s);
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description);
  // `s` is base64url-validated (no quote / angle-bracket / ampersand), but the
  // `&` query separators are NOT — they must be escaped to `&amp;` in the HTML
  // attribute, or strict OGP crawlers truncate the image URL at the first `&`
  // (dropping `format=png` → an SVG they can't preview, so no image unfurls).
  // OGP cards crop to ~1.91:1 and karasu diagrams are often portrait, so
  // `fit=contain` letterboxes the whole diagram into the 1200×630 frame —
  // scaled to fit, nothing cropped.
  const imageUrl = escapeHtml(
    `${origin}/render?s=${s}&view=system&format=png&width=1200&height=630&fit=contain`,
  );
  // In the `#s=` fragment URL there are no `&` separators, so it is attribute-
  // and JS-safe as-is (the bounce uses JSON.stringify for the script context).
  const fragmentUrl = `${origin}/#s=${s}`;
  // Canonical URL of this share page itself. LinkedIn (and other strict
  // crawlers) treat a card without `og:url` as incomplete and refuse the
  // preview; `?s=` has no `&` separators so it needs no entity-escaping.
  const pageUrl = `${origin}/s?s=${s}`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${safeTitle}</title>
<meta property="og:type" content="website">
<meta property="og:url" content="${pageUrl}">
<meta property="og:title" content="${safeTitle}">
<meta property="og:description" content="${safeDescription}">
<meta property="og:image" content="${imageUrl}">
<meta property="og:image:secure_url" content="${imageUrl}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${safeTitle}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${safeTitle}">
<meta name="twitter:description" content="${safeDescription}">
<meta name="twitter:image" content="${imageUrl}">
<script>location.replace(${JSON.stringify(fragmentUrl)});</script>
</head>
<body>
<p>Opening the shared diagram… If it does not load, <a href="${fragmentUrl}">click here</a>.</p>
</body>
</html>
`;
}

/**
 * Build the share-page HTML for `/s?s=<payload>`.
 *
 * Query params: `s` (required, base64url-encoded share payload). Status: 200
 * HTML, 400 missing / malformed `s`.
 */
export function buildSharePage(params: URLSearchParams, origin: string): SharePageResult {
  const s = params.get("s");
  if (!s) return { status: 400, contentType: PLAIN, body: "Missing 's' query parameter." };
  if (!BASE64URL.test(s)) {
    return { status: 400, contentType: PLAIN, body: "Invalid 's' payload." };
  }
  return { status: 200, contentType: HTML, body: renderHtml(s, origin) };
}
