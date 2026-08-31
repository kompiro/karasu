/**
 * `POST /api/submissions` — take a `.krs` from a signed-in submitter.
 *
 * The service never sees a repository on this path, and that is the whole
 * point of the pivot ADR-2578 recorded: the two problems server-side reverse
 * was chosen to solve (private repositories cannot be opened; repositories
 * rarely have a committed `.krs`) both stop existing when the submitter brings
 * the model. What arrives here is a document its author made and chose to
 * publish.
 *
 * Submissions get their **own id space** rather than reusing `owner/repo`, and
 * that follows from not being repository-bound rather than being an
 * independent choice — there is no repository for a key to name. It also keeps
 * resolution deterministic (TPL-2249): `owner/repo` goes on meaning "the `.krs`
 * committed to that repository" on the app's permalink face, and the gallery
 * sits beside it as a third face, so one address never resolves to two
 * different things.
 */
import { requireBinding } from "../env.js";
import { error, json } from "../http.js";
import type { RouteContext } from "../router.js";
import { currentViewer } from "../auth/current.js";
import { sameOrigin } from "../auth/session.js";
import { GalleryStore } from "../store/gallery-store.js";
import { formatSubmissionId } from "../store/gallery-keys.js";
import { validateSubmission } from "../gallery/validate.js";
import {
  declaredOverLimit,
  MAX_JSON_BODY_BYTES,
  payloadTooLarge,
  readCapped,
} from "../request-body.js";

export async function submitKrs(context: RouteContext): Promise<Response> {
  const { request, env } = context;
  if (!sameOrigin(request, requireBinding(env, "NEST_PUBLIC_ORIGIN"))) {
    return error(403, "cross_origin", "This request did not come from the gallery.");
  }

  const store = new GalleryStore(requireBinding(env, "NEST_STORE"));
  const viewer = await currentViewer(context, store);
  if (viewer === undefined) {
    // Anonymous submission was rejected because there would be nobody to
    // answer a withdrawal request and no way to stop abuse.
    return error(401, "sign_in_required", "Sign in at /auth/login to submit a model.");
  }

  // Checked twice, because the cheap check is not reliable on its own
  // (`request-body.ts` says why). The second one also keeps `JSON.parse` off a
  // body that was never going to be accepted.
  if (declaredOverLimit(request, MAX_JSON_BODY_BYTES)) return payloadTooLarge(MAX_JSON_BODY_BYTES);
  const raw = await readCapped(request.body, MAX_JSON_BODY_BYTES);
  if (raw === undefined) return payloadTooLarge(MAX_JSON_BODY_BYTES);

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return error(400, "invalid_body", "The request body must be JSON.");
  }
  if (typeof body !== "object" || body === null) {
    return error(400, "invalid_body", "The request body must be a JSON object.");
  }
  const { title, krs, visibility } = body as Record<string, unknown>;

  const validated = validateSubmission(title, krs);
  if (!validated.ok) {
    return error(400, validated.rejection.code, validated.rejection.message);
  }
  if (visibility !== undefined && visibility !== "public" && visibility !== "unlisted") {
    return error(400, "invalid_visibility", 'visibility must be "public" or "unlisted".');
  }

  const submission = await store.submissions.create(
    viewer.account.accountId,
    { title: validated.title, krs: validated.krs, visibility },
    new Date(),
  );

  const id = formatSubmissionId(submission.accountId, submission.slug);
  return json(
    {
      id,
      title: submission.title,
      visibility: submission.visibility,
      submittedAt: submission.submittedAt,
      // The address the submitter shares. Built here rather than left to be
      // assembled by a caller, so there is one spelling of it.
      url: `${requireBinding(env, "NEST_PUBLIC_ORIGIN")}/g/${id}`,
    },
    { status: 201 },
  );
}
