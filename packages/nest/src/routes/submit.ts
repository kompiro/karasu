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
import { MAX_SUBMISSION_BYTES } from "../store/submissions.js";
import { validateSubmission } from "../gallery/validate.js";

/**
 * A generous ceiling on the request body, twice the document cap so the JSON
 * envelope has room.
 *
 * Checked twice, because the cheap check is not reliable. `Content-Length` is
 * absent on a chunked request and can simply be understated, and an absent
 * header reads as `0` rather than as "unknown" — so a header check alone lets
 * an arbitrarily large body through. The declared length is still worth
 * refusing on when it is present and honest (it costs nothing and stops the
 * transfer earliest); the body's real size is then counted as it arrives, by
 * `readCapped`.
 */
const MAX_BODY_BYTES = MAX_SUBMISSION_BYTES * 2;

/**
 * Read the body with the cap applied **while** it arrives, or `undefined` once
 * it goes past.
 *
 * `request.text()` buffers the whole body first and asks about its size
 * afterwards, which makes the check a statement about memory already spent: a
 * Worker gets 128MB for everything it does, and a request that understates its
 * length or declares none is exactly the request this cap exists to refuse.
 * Counting as the chunks come in means the refusal happens at the byte that
 * crosses the line, and cancelling the reader tells the runtime to stop pulling
 * the rest instead of draining a body nobody will read.
 *
 * Decoding as it goes also removes a second full copy: the size used to be
 * measured by re-encoding the finished string, so an accepted body existed
 * twice at once, and an oversized one was materialised twice before the 413.
 */
async function readCapped(
  body: ReadableStream<Uint8Array> | null,
  limit: number,
): Promise<string | undefined> {
  // No body at all is not oversized; it fails as JSON a few lines later, which
  // is the truthful thing to say about it.
  if (body === null) return "";
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done || value === undefined) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        return undefined;
      }
      // `stream: true`: a multi-byte character split across two chunks is
      // ordinary here (`.krs` files carry Japanese labels), and decoding each
      // chunk on its own would replace the halves with U+FFFD.
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
  return text + decoder.decode();
}

/**
 * The transport-level refusal, with a code of its own.
 *
 * `too_large` already means "the document exceeds its cap", returned as 400 by
 * the validator. Reusing it here would make one code mean two statuses, which
 * `http.ts` says callers branch on — `routes/webhook.ts` split the same way
 * with `payload_too_large`.
 */
const oversized = (): Response =>
  error(413, "payload_too_large", `A submission request must be at most ${MAX_BODY_BYTES} bytes.`);

export async function submitKrs(context: RouteContext): Promise<Response> {
  const { request, env } = context;
  if (!sameOrigin(request, requireBinding(env, "NEST_PUBLIC_ORIGIN"))) {
    return error(403, "cross_origin", "This request did not come from the gallery.");
  }

  const store = new GalleryStore(requireBinding(env, "KRS_CACHE"));
  const viewer = await currentViewer(request, env, store);
  if (viewer === undefined) {
    // Anonymous submission was rejected because there would be nobody to
    // answer a withdrawal request and no way to stop abuse.
    return error(401, "sign_in_required", "Sign in at /auth/login to submit a model.");
  }

  const declaredHeader = request.headers.get("Content-Length");
  const declared = declaredHeader === null ? undefined : Number(declaredHeader);
  if (declared !== undefined && Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return oversized();
  }

  // The size check that actually holds. It also keeps `JSON.parse` off a body
  // that was never going to be accepted.
  const raw = await readCapped(request.body, MAX_BODY_BYTES);
  if (raw === undefined) return oversized();

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
