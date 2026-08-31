/**
 * `GET /g/<id>` — a submission, as a diagram.
 *
 * This is the gallery's public face, and rendering is the point of it.
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
import { escapeHtml, page } from "../gallery/html.js";
import { renderSubmission } from "../gallery/render.js";

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

  const viewer = await currentViewer(context, store);
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

  const rendered = renderSubmission(submission.krs, context.url.searchParams);
  if (format === "svg") {
    // Through `http.ts`, like every other response here, so that "what may a
    // cache keep, and keyed by what" stays one decision in one place. A render
    // error is not the submission and does not inherit its cacheability: a
    // ten-minute `public` on `?view=nonsense` would pin a 400 no one asked to
    // keep.
    return rendered.status === 200
      ? svg(rendered.body, { cacheControl })
      : text(rendered.body, { status: rendered.status });
  }
  if (rendered.status !== 200) {
    return error(rendered.status, "cannot_render", rendered.body);
  }

  const submitter = await store.accounts.get(submission.accountId);
  return html(
    page({
      title: submission.title,
      body: [
        `<h1>${escapeHtml(submission.title)}</h1>`,
        `<p class="meta">${escapeHtml(submitter?.login ?? "unknown")}`,
        ` · ${escapeHtml(submission.submittedAt.slice(0, 10))}`,
        submission.visibility === "public" ? "" : ' · <span class="tag">unlisted</span>',
        "</p>",
        // The SVG is inlined rather than referenced through an <img>. An
        // <img> would make the bundled all-views diagram's `:target` tab
        // navigation inert, and the tabs are how a reader reaches the deploy
        // and org views at all.
        `<div class="figure">${rendered.body}</div>`,
        '<p class="actions">',
        `<a href="/g/${escapeHtml(id)}?format=krs">.krs</a>`,
        `<a href="/g/${escapeHtml(id)}?format=svg">SVG</a>`,
        isOwner ? `<a href="/console/s/${escapeHtml(id)}">Manage</a>` : "",
        "</p>",
      ].join(""),
    }),
    { cacheControl },
  );
}
