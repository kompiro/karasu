/**
 * The OGP a published submission's page carries (#2995), so a `/g/<id>` link
 * unfurls with its title and description in Slack, X, GitHub and the like.
 *
 * Crawlers read only the HTML `<head>`; the viewer and its CSP sandbox (#2998)
 * do not reach them, so these tags are written by the Worker into the page it
 * already builds. Everything comes from the stored record: the description was
 * read from the document when it was submitted (`gallery/validate.ts`), so the
 * page never parses the `.krs` to fill them.
 *
 * Only a public submission gets them. An unlisted one is served to its owner
 * alone, and a card describing it would be a description of something its
 * author chose not to show.
 *
 * No image yet, so `twitter:card` is `summary`. The stored preview image is the
 * second half of #2995 and switches it to `summary_large_image`.
 */
import { escapeHtml } from "./html.js";

/** Keep `og:description` within what crawlers display. The same cap as the app's `/s` (ADR-1801). */
export const OGP_DESCRIPTION_MAX = 200;

const SITE_NAME = "karasu gallery";

export interface SubmissionOgp {
  title: string;
  /** The first system's description, if the document has one. */
  description?: string;
  /** Shown when there is no description. */
  submitter: string;
  /** The page's own canonical URL. Strict crawlers (LinkedIn) want one. */
  url?: string;
}

/**
 * Cut to `max` characters by code point, so an emoji or other astral character
 * at the boundary is kept or dropped whole rather than split into half a
 * surrogate pair that renders as U+FFFD on the card.
 */
function truncate(value: string, max: number): string {
  const chars = Array.from(value);
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : value;
}

/** The description a card shows: the document's own, or a line saying whose model it is. */
export function ogpDescription(ogp: Pick<SubmissionOgp, "description" | "submitter">): string {
  const own = ogp.description?.trim();
  return own
    ? truncate(own, OGP_DESCRIPTION_MAX)
    : `Architecture model by ${ogp.submitter} on ${SITE_NAME}`;
}

/** The `<meta>` tags for `<head>`, every value escaped. */
export function ogpMeta(ogp: SubmissionOgp): string {
  const title = escapeHtml(ogp.title);
  const description = escapeHtml(ogpDescription(ogp));
  return [
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${SITE_NAME}">`,
    ogp.url === undefined ? "" : `<meta property="og:url" content="${escapeHtml(ogp.url)}">`,
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${description}">`,
    `<meta name="description" content="${description}">`,
    `<meta name="twitter:card" content="summary">`,
    `<meta name="twitter:title" content="${title}">`,
    `<meta name="twitter:description" content="${description}">`,
  ]
    .filter((line) => line !== "")
    .join("\n");
}
