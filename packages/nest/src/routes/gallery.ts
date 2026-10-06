/**
 * `GET /g/<id>` — a submission, as a diagram.
 *
 * This is the gallery's public face, and rendering is the point of it. Since
 * #2998 the rendering happens in the reader's browser: the page is the app's
 * preview built as a standalone viewer (#2997), with the submission embedded,
 * served as a page-level CSP sandbox without `allow-same-origin`. The script
 * therefore runs in an opaque origin and never with the session this origin
 * holds (TPL-2993; `docs/design/gallery-client-side-rendering.md`, option D4).
 * The Worker no longer draws SVG for the page, only for `?format=svg`.
 *
 * [#2378](https://github.com/kompiro/karasu/pull/2378) found three problems
 * with `GET /<owner>/<repo>`; the gallery inherits exactly one of them, that a
 * face whose entries are only readable as source is not a gallery. The other
 * two (no authentication, and repositories without an installation being
 * structurally unreadable) stop existing when the submitter brings the model.
 *
 * **This route does not collide with `/:owner/:repo`.** `/g/:id` captures one
 * segment and the repository route captures two, and `Router.candidates`
 * selects the group with the fewest captures exclusively. #2590 removes the
 * repository route entirely; until then, both are reachable and neither
 * shadows the other.
 */
import { requireBinding } from "../env.js";
import { error, html, svg, text } from "../http.js";
import type { RouteContext } from "../router.js";
import { currentViewer } from "../auth/current.js";
import { GalleryStore } from "../store/gallery-store.js";
import { InvalidGalleryRefError, parseSubmissionId } from "../store/gallery-keys.js";
import type { Submission } from "../store/submissions.js";
import { renderSubmission } from "../gallery/render.js";
import { VIEWER_TEMPLATE_PATH } from "../gallery/viewer-assets.js";
import { viewerHeader, viewerPage } from "../gallery/viewer-page.js";
import { ogpMeta } from "../gallery/ogp.js";

/**
 * Ten minutes, and only for a submission its author published.
 *
 * `http.ts` answers `no-store` unless a caller says otherwise, because the
 * generation service's responses were derived from private code. A public
 * submission is the one thing here that genuinely is public — its author
 * chose that — so it is the one thing that may sit in a shared cache. Short,
 * because unpublishing has to take effect while someone is still waiting.
 */
const PUBLIC_CACHE = "public, max-age=600";

/**
 * The viewer page's sandbox: scripts may run, downloads (Export SVG) and
 * popups (the Reference window) are allowed, and nothing else. No
 * `allow-same-origin` — that one token is what would hand the page this
 * origin, and with it the session (TPL-2993). A CSP header rather than an
 * iframe, so the viewer has the whole window and a link opens it directly.
 */
const VIEWER_CSP = "sandbox allow-scripts allow-downloads allow-popups";

/** The same answer for "no such submission" and "not published". */
const NOT_FOUND = "No submission with that id.";

/**
 * Find a submission, if the viewer is allowed to see it.
 *
 * An `unlisted` submission answers exactly as a nonexistent one does, unless
 * its owner is asking. Distinguishing them would make this route an oracle for
 * "did this person submit something and take it down", which is the state a
 * submitter chose in order not to be seen. It is the same reasoning the
 * retired repository route applied to a private repository's model: the 404
 * for "not visible" has to be indistinguishable from the 404 for "not there".
 */
async function visibleSubmission(
  context: RouteContext,
  store: GalleryStore,
): Promise<{ submission: Submission; isOwner: boolean } | undefined> {
  let ref: { accountId: string; slug: string };
  try {
    ref = parseSubmissionId(context.params.id ?? "");
  } catch (cause) {
    if (cause instanceof InvalidGalleryRefError) return undefined;
    throw cause;
  }
  const submission = await store.submissions.get(ref.accountId, ref.slug);
  if (submission === undefined) return undefined;

  const viewer = await currentViewer(context.request, context.env, store);
  const isOwner = viewer?.account.accountId === submission.accountId;
  if (submission.visibility !== "public" && !isOwner) return undefined;
  return { submission, isOwner };
}

export async function submissionPage(context: RouteContext): Promise<Response> {
  const store = new GalleryStore(requireBinding(context.env, "NEST_STORE"));
  const found = await visibleSubmission(context, store);
  if (found === undefined) return error(404, "not_found", NOT_FOUND);
  const { submission, isOwner } = found;
  const id = context.params.id as string;

  const format = context.url.searchParams.get("format");
  // A caching decision, made once: only a published submission is cacheable,
  // and only ever as `public`. An owner's view of an unlisted one must not
  // land in a shared cache under the same URL a stranger would use.
  const cacheControl = submission.visibility === "public" && !isOwner ? PUBLIC_CACHE : undefined;

  if (format === "krs") {
    return text(submission.krs, {
      cacheControl,
      headers: { "Content-Disposition": `inline; filename="${id}.krs"` },
    });
  }

  if (format === "svg") {
    const rendered = renderSubmission(submission.krs, context.url.searchParams);
    // Through `http.ts`, like every other response here, so that "what may a
    // cache keep, and keyed by what" stays one decision in one place. A render
    // error is not the submission and does not inherit its cacheability: a
    // ten-minute `public` on `?view=nonsense` would pin a 400 no one asked to
    // keep.
    return rendered.status === 200
      ? svg(rendered.body, { cacheControl })
      : text(rendered.body, { status: rendered.status });
  }

  const template = await viewerTemplate(context);
  if (template === undefined) {
    return error(503, "viewer_unavailable", "The gallery viewer is not deployed.");
  }
  const submitter = await store.accounts.get(submission.accountId);
  const login = submitter?.login ?? "unknown";
  const origin = context.env.NEST_PUBLIC_ORIGIN;
  const body = viewerPage(template, {
    title: submission.title,
    // Only a public submission unfurls (#2995). The owner's own view of an
    // unlisted one gets none, so a link they paste does not describe it.
    head:
      submission.visibility === "public"
        ? ogpMeta({
            title: submission.title,
            description: submission.description,
            submitter: login,
            url: origin ? `${origin}/g/${id}` : undefined,
          })
        : undefined,
    header: viewerHeader({
      id,
      title: submission.title,
      submitter: login,
      submittedAt: submission.submittedAt,
      unlisted: submission.visibility !== "public",
      isOwner,
    }),
    krs: submission.krs,
  });
  return html(body, { cacheControl, headers: { "Content-Security-Policy": VIEWER_CSP } });
}

/**
 * The staged `viewer.html`, read through the `ASSETS` binding.
 *
 * Browsers cannot fetch it themselves: `wrangler.toml` routes every path but
 * `/assets/*` to this Worker first, so the template is only ever served here,
 * filled in and sandboxed (`gallery/viewer-assets.ts`).
 */
async function viewerTemplate(context: RouteContext): Promise<string | undefined> {
  const assets = requireBinding(context.env, "ASSETS");
  const response = await assets.fetch(new Request(new URL(VIEWER_TEMPLATE_PATH, context.url)));
  return response.ok ? response.text() : undefined;
}
