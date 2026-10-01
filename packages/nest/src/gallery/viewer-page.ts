/**
 * `/g/<id>` as the gallery viewer: the built `viewer.html` with the submission
 * embedded (#2998).
 *
 * The template comes from `packages/app` (`viewer.html`, built by
 * `build:viewer`, #2997) and has three places this module fills, each of which
 * must appear exactly once: the `<title>`, `<!--GALLERY_HEADER-->` and
 * `<!--KRS_SOURCE-->`. A template that drifted from that contract fails loudly
 * here rather than rendering a page without its model.
 *
 * Everything written into the page is escaped. The route serves it under a CSP
 * sandbox without `allow-same-origin`, so the document has no origin and its
 * script cannot act with the session (TPL-2993) — but the page must still not
 * let a stranger's text become markup: the title and login are typed by
 * someone else, and the `.krs` is theirs entirely.
 */
import { escapeHtml } from "./html.js";

/** The template does not match what this module fills. A deploy problem, not a request one. */
export class ViewerTemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ViewerTemplateError";
  }
}

const TEMPLATE_TITLE = "<title>karasu</title>";
const HEADER_MARKER = "<!--GALLERY_HEADER-->";
const SOURCE_MARKER = "<!--KRS_SOURCE-->";

/** The id the viewer reads the source from (`packages/app/src/viewer/embedded-source.ts`). */
const EMBEDDED_SOURCE_ID = "krs-source";

function replaceOnce(template: string, marker: string, value: string): string {
  const parts = template.split(marker);
  if (parts.length !== 2) {
    throw new ViewerTemplateError(
      `viewer template must contain ${marker} exactly once, found ${parts.length - 1}`,
    );
  }
  // Joined rather than `String.replace`, whose replacement string treats `$&`
  // and friends as patterns. A submission is allowed to contain `$&`.
  return parts.join(value);
}

const LINE_SEPARATORS = new RegExp(`[${String.fromCharCode(0x2028, 0x2029)}]`, "g");
const escapeAsUnicode = (char: string): string =>
  "\\u" + char.charCodeAt(0).toString(16).padStart(4, "0");

/**
 * The source as a JSON data block.
 *
 * `<`, `>` and `&` become `<`-style escapes, so a submission containing
 * `</script>` (or `<!--`) cannot end the element early; JSON.parse turns them
 * back into the same characters. The line and paragraph separators are
 * escaped too, which a data block does not strictly need, so the embedded text
 * is also safe if something ever evaluates it as script.
 */
export function embedSource(krs: string): string {
  const json = JSON.stringify(krs)
    .replace(/[<>&]/g, escapeAsUnicode)
    .replace(LINE_SEPARATORS, escapeAsUnicode);
  return `<script type="application/json" id="${EMBEDDED_SOURCE_ID}">${json}</script>`;
}

export interface ViewerHeader {
  id: string;
  title: string;
  submitter: string;
  submittedAt: string;
  unlisted: boolean;
  /** Whether to link the owner's console page. */
  isOwner: boolean;
}

/**
 * The gallery's one line above the app: what this is, whose, and where to go.
 *
 * Links only, and all in the same tab. There is no `<form>`: one sent from
 * this opaque-origin page would carry `Origin: null` and fail `sameOrigin`, so
 * signing out and managing happen on the console page the link leads to. And
 * no `target="_blank"`: a popup would inherit the sandbox, and the console
 * would open without an origin, its forms refused the same way.
 *
 * Styled with the app's theme tokens (with fallbacks) so it follows the
 * viewer's own light/dark switch.
 */
export function viewerHeader(header: ViewerHeader): string {
  const id = escapeHtml(header.id);
  return [
    '<header class="gallery-bar">',
    `<style>${HEADER_STYLE}</style>`,
    '<a class="gallery-home" href="/">karasu gallery</a>',
    `<h1>${escapeHtml(header.title)}</h1>`,
    `<span class="gallery-meta">${escapeHtml(header.submitter)}`,
    ` · ${escapeHtml(header.submittedAt.slice(0, 10))}`,
    header.unlisted ? ' · <span class="gallery-tag">unlisted</span>' : "",
    "</span>",
    '<nav class="gallery-actions">',
    `<a href="/g/${id}?format=krs">.krs</a>`,
    `<a href="/g/${id}?format=svg">SVG</a>`,
    header.isOwner ? `<a href="/console/s/${id}">Manage</a>` : "",
    "</nav>",
    "</header>",
  ].join("");
}

const HEADER_STYLE = `
  .gallery-bar { display: flex; align-items: baseline; gap: 0.75rem; flex-wrap: wrap;
    padding: 0.5rem 1rem; border-bottom: 1px solid var(--border-subtle, #d7dbe0);
    background: var(--bg-base, #fff); color: var(--text-primary, #16181d);
    font: 14px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; }
  .gallery-bar a { color: var(--accent, #1f6feb); }
  .gallery-bar .gallery-home { color: inherit; font-weight: 600; text-decoration: none; }
  .gallery-bar h1 { font-size: 1rem; margin: 0; font-weight: 600; }
  .gallery-meta { color: var(--text-secondary, #5b616e); font-size: 0.8125rem; }
  .gallery-tag { border: 1px solid currentColor; border-radius: 999px; padding: 0 0.4rem; }
  .gallery-actions { display: flex; gap: 0.75rem; margin-left: auto; }
`;

export interface ViewerPage {
  title: string;
  /** Extra `<head>` markup after the title, already escaped (the OGP, #2995). */
  head?: string;
  header: string;
  krs: string;
}

/** Fill the viewer template for one submission. */
export function viewerPage(template: string, page: ViewerPage): string {
  let html = replaceOnce(
    template,
    TEMPLATE_TITLE,
    `<title>${escapeHtml(page.title)} · karasu gallery</title>` +
      (page.head ? `\n${page.head}` : ""),
  );
  html = replaceOnce(html, HEADER_MARKER, page.header);
  return replaceOnce(html, SOURCE_MARKER, embedSource(page.krs));
}
