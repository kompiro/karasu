/**
 * The console: where a submitter manages what they submitted.
 *
 * The purpose is to cut support load, so it is worth being precise about which
 * load it cuts. Withdrawal requests come from two parties and **only one of
 * them holds an account**: a submitter's "delete this" becomes a button and
 * never reaches a human, while a third party's complaint (impersonation,
 * rights, abuse) cannot be self-service by definition — the complainant has no
 * account. The console removes volume, not difficulty. What remains is the
 * cases that always needed judgement, which were always few and always heavy,
 * and they now get the time.
 *
 * **Unpublish sits in front of delete.** Most withdrawal requests mean "not
 * visible right now", not "gone". A reversible control absorbs those without a
 * deletion, and it generates no "I deleted it by mistake" follow-up — which
 * would be a new support request created by the feature meant to remove them.
 *
 * **Account deletion is one operation**, because otherwise the single most
 * tedious request ("remove everything and close my account") stays
 * human-handled, which is exactly what this route exists to prevent.
 *
 * Served from nest's own hostname rather than from a separate static origin
 * calling an API (ADR-2578 decision 5). Same-origin means the session cookie
 * needs no CORS and no cross-origin cookie design — on the first surface that
 * holds a session, that is a smaller entrance to defend.
 */
import { requireBinding } from "../env.js";
import { error, html, redirect } from "../http.js";
import type { RouteContext } from "../router.js";
import { currentViewer, type Viewer } from "../auth/current.js";
import { clearCookie, sameOrigin, SESSION_COOKIE } from "../auth/session.js";
import { GalleryStore } from "../store/gallery-store.js";
import {
  formatSubmissionId,
  InvalidGalleryRefError,
  parseSubmissionId,
} from "../store/gallery-keys.js";
import { MAX_TITLE_LENGTH, type Submission } from "../store/submissions.js";
import { escapeHtml, page } from "../gallery/html.js";
import { validateSubmission } from "../gallery/validate.js";

const SIGN_IN = "/auth/login";

interface Signed {
  store: GalleryStore;
  viewer: Viewer;
}

/**
 * Resolve the signed-in submitter, or a response saying what to do instead.
 *
 * A `GET` redirects to sign-in, because the visitor is a person who can follow
 * it. A `POST` answers 401: redirecting a form submission to a login page
 * loses the body, so the submitter would come back signed in and find their
 * work gone.
 */
async function signedIn(context: RouteContext): Promise<Signed | Response> {
  const { request, env } = context;
  const store = new GalleryStore(requireBinding(env, "KRS_CACHE"));
  const viewer = await currentViewer(request, env, store);
  if (viewer === undefined) {
    return request.method === "GET"
      ? redirect(SIGN_IN, { status: 302 })
      : error(401, "sign_in_required", "Sign in at /auth/login.");
  }
  return { store, viewer };
}

/** Both CSRF layers, checked once. `SameSite=Lax` is the other. */
function guardWrite(context: RouteContext): Response | undefined {
  return sameOrigin(context.request, requireBinding(context.env, "NEST_PUBLIC_ORIGIN"))
    ? undefined
    : error(403, "cross_origin", "This request did not come from the gallery.");
}

/**
 * The submission this URL names, **if the signed-in account owns it**.
 *
 * Ownership is decided by re-deriving the key from the id and checking the
 * account half against the session, not by trusting the id. An id names its
 * owner by construction (`gallery-keys.ts`), so a stranger's id simply looks
 * up nothing under the caller's account.
 */
async function ownSubmission(
  signed: Signed,
  rawId: string,
): Promise<{ id: string; submission: Submission } | undefined> {
  let ref: { accountId: string; slug: string };
  try {
    ref = parseSubmissionId(rawId);
  } catch (cause) {
    if (cause instanceof InvalidGalleryRefError) return undefined;
    throw cause;
  }
  if (ref.accountId !== signed.viewer.account.accountId) return undefined;
  const submission = await signed.store.submissions.get(ref.accountId, ref.slug);
  if (submission === undefined) return undefined;
  return { id: formatSubmissionId(ref.accountId, ref.slug), submission };
}

const nav = (login: string): string =>
  `<span class="tag">${escapeHtml(login)}</span>` +
  '<form method="post" action="/auth/logout"><button>Sign out</button></form>';

const notFound = (): Response => error(404, "not_found", "No submission with that id.");

/** `GET /console` — everything this account owns. */
export async function consoleIndex(context: RouteContext): Promise<Response> {
  const signed = await signedIn(context);
  if (signed instanceof Response) return signed;
  const submissions = await signed.store.submissions.list(signed.viewer.account.accountId);

  const cards = submissions
    .map((submission) => {
      const id = formatSubmissionId(submission.accountId, submission.slug);
      return [
        '<div class="card">',
        `<h2><a href="/console/s/${escapeHtml(id)}">${escapeHtml(submission.title)}</a></h2>`,
        `<p class="meta">${escapeHtml(submission.submittedAt.slice(0, 10))} · `,
        `<span class="tag">${submission.visibility}</span></p>`,
        `<p class="actions"><a href="/g/${escapeHtml(id)}">View</a>`,
        `<a href="/console/s/${escapeHtml(id)}">Manage</a></p>`,
        "</div>",
      ].join("");
    })
    .join("");

  return html(
    page({
      title: "Your models",
      nav: nav(signed.viewer.account.login),
      body: [
        "<h1>Your models</h1>",
        submissions.length === 0 ? '<p class="empty">Nothing submitted yet.</p>' : cards,
        submitForm(),
        '<p class="actions"><a href="/console/account/delete">Delete my account</a></p>',
      ].join(""),
    }),
  );
}

/** The form that puts a `.krs` in, so a browser alone is enough to use this. */
function submitForm(): string {
  return [
    '<form method="post" action="/console/submit">',
    "<h2>Submit a model</h2>",
    `<label>Title <input type="text" name="title" maxlength="${MAX_TITLE_LENGTH}" required></label>`,
    '<label>.krs <textarea name="krs" required></textarea></label>',
    '<label><input type="checkbox" name="unlisted" value="on"> Keep it unlisted</label>',
    '<p class="actions"><button type="submit">Submit</button></p>',
    "</form>",
  ].join("");
}

/** `POST /console/submit` — the form's target. */
export async function consoleSubmit(context: RouteContext): Promise<Response> {
  const blocked = guardWrite(context);
  if (blocked) return blocked;
  const signed = await signedIn(context);
  if (signed instanceof Response) return signed;

  const form = await context.request.formData();
  const validated = validateSubmission(form.get("title"), form.get("krs"));
  if (!validated.ok) {
    return error(400, validated.rejection.code, validated.rejection.message);
  }
  const submission = await signed.store.submissions.create(
    signed.viewer.account.accountId,
    {
      title: validated.title,
      krs: validated.krs,
      visibility: form.get("unlisted") === "on" ? "unlisted" : "public",
    },
    new Date(),
  );
  return redirect(`/console/s/${formatSubmissionId(submission.accountId, submission.slug)}`);
}

/** `GET /console/s/<id>` — one submission, and the controls for it. */
export async function consoleSubmission(context: RouteContext): Promise<Response> {
  const signed = await signedIn(context);
  if (signed instanceof Response) return signed;
  const owned = await ownSubmission(signed, context.params.id ?? "");
  if (owned === undefined) return notFound();
  const { id, submission } = owned;
  const isPublic = submission.visibility === "public";

  return html(
    page({
      title: submission.title,
      nav: nav(signed.viewer.account.login),
      body: [
        `<h1>${escapeHtml(submission.title)}</h1>`,
        `<p class="meta">${escapeHtml(submission.submittedAt.slice(0, 10))} · `,
        `<span class="tag">${submission.visibility}</span> · `,
        `<a href="/g/${escapeHtml(id)}">View</a></p>`,
        // Unpublish before delete, and phrased as the state it produces
        // rather than as the verb, so the reversible option reads as the
        // ordinary one.
        `<form method="post" action="/console/s/${escapeHtml(id)}/visibility">`,
        `<input type="hidden" name="visibility" value="${isPublic ? "unlisted" : "public"}">`,
        `<p class="actions"><button type="submit">${
          isPublic ? "Make it unlisted" : "Publish it"
        }</button></p>`,
        "</form>",
        `<form method="post" action="/console/s/${escapeHtml(id)}/replace">`,
        "<h2>Replace</h2>",
        `<label>Title <input type="text" name="title" maxlength="${MAX_TITLE_LENGTH}" value="${escapeHtml(
          submission.title,
        )}" required></label>`,
        `<label>.krs <textarea name="krs" required>${escapeHtml(submission.krs)}</textarea></label>`,
        '<p class="actions"><button type="submit">Replace</button></p>',
        "</form>",
        `<p class="actions"><a href="/console/s/${escapeHtml(id)}/delete">Delete this model</a></p>`,
      ].join(""),
    }),
  );
}

/** `POST /console/s/<id>/visibility` — publish or unpublish. */
export async function consoleSetVisibility(context: RouteContext): Promise<Response> {
  const blocked = guardWrite(context);
  if (blocked) return blocked;
  const signed = await signedIn(context);
  if (signed instanceof Response) return signed;
  const owned = await ownSubmission(signed, context.params.id ?? "");
  if (owned === undefined) return notFound();

  const wanted = (await context.request.formData()).get("visibility");
  if (wanted !== "public" && wanted !== "unlisted") {
    return error(400, "invalid_visibility", 'visibility must be "public" or "unlisted".');
  }
  await signed.store.submissions.update(
    owned.submission.accountId,
    owned.submission.slug,
    { visibility: wanted },
    new Date(),
  );
  return redirect(`/console/s/${owned.id}`);
}

/** `POST /console/s/<id>/replace` — a new document under the same id. */
export async function consoleReplace(context: RouteContext): Promise<Response> {
  const blocked = guardWrite(context);
  if (blocked) return blocked;
  const signed = await signedIn(context);
  if (signed instanceof Response) return signed;
  const owned = await ownSubmission(signed, context.params.id ?? "");
  if (owned === undefined) return notFound();

  const form = await context.request.formData();
  // The same two checks ingest runs. A replacement is a submission; letting it
  // in through a different door would make the door the thing being tested.
  const validated = validateSubmission(form.get("title"), form.get("krs"));
  if (!validated.ok) {
    return error(400, validated.rejection.code, validated.rejection.message);
  }
  await signed.store.submissions.update(
    owned.submission.accountId,
    owned.submission.slug,
    { title: validated.title, krs: validated.krs },
    new Date(),
  );
  return redirect(`/console/s/${owned.id}`);
}

/** `GET /console/s/<id>/delete` — say what is about to be irreversible. */
export async function consoleConfirmDelete(context: RouteContext): Promise<Response> {
  const signed = await signedIn(context);
  if (signed instanceof Response) return signed;
  const owned = await ownSubmission(signed, context.params.id ?? "");
  if (owned === undefined) return notFound();

  return html(
    page({
      title: `Delete ${owned.submission.title}`,
      nav: nav(signed.viewer.account.login),
      body: [
        `<h1>Delete “${escapeHtml(owned.submission.title)}”?</h1>`,
        "<p>This cannot be undone. If you only want it out of sight, ",
        `<a href="/console/s/${escapeHtml(owned.id)}">make it unlisted</a> instead.</p>`,
        `<form method="post" action="/console/s/${escapeHtml(owned.id)}/delete">`,
        '<p class="actions"><button type="submit" class="danger">Delete it</button>',
        `<a href="/console/s/${escapeHtml(owned.id)}">Cancel</a></p>`,
        "</form>",
      ].join(""),
    }),
  );
}

/** `POST /console/s/<id>/delete`. */
export async function consoleDelete(context: RouteContext): Promise<Response> {
  const blocked = guardWrite(context);
  if (blocked) return blocked;
  const signed = await signedIn(context);
  if (signed instanceof Response) return signed;
  const owned = await ownSubmission(signed, context.params.id ?? "");
  if (owned === undefined) return notFound();

  await signed.store.submissions.delete(owned.submission.accountId, owned.submission.slug);
  return redirect("/console");
}

/** `GET /console/account/delete` — the confirmation, with the count on it. */
export async function consoleConfirmAccountDelete(context: RouteContext): Promise<Response> {
  const signed = await signedIn(context);
  if (signed instanceof Response) return signed;
  const submissions = await signed.store.submissions.list(signed.viewer.account.accountId);

  return html(
    page({
      title: "Delete your account",
      nav: nav(signed.viewer.account.login),
      body: [
        "<h1>Delete your account?</h1>",
        `<p>This deletes <strong>${submissions.length}</strong> model(s), your account record `,
        "and every session you have open. It cannot be undone.</p>",
        '<form method="post" action="/console/account/delete">',
        '<p class="actions"><button type="submit" class="danger">Delete everything</button>',
        '<a href="/console">Cancel</a></p>',
        "</form>",
      ].join(""),
    }),
  );
}

/**
 * `POST /console/account/delete` — one operation over everything.
 *
 * This is the purge path, and the reason `GalleryStore` owns all three stores
 * rather than callers remembering them (TPL-2226).
 */
export async function consoleDeleteAccount(context: RouteContext): Promise<Response> {
  const blocked = guardWrite(context);
  if (blocked) return blocked;
  const signed = await signedIn(context);
  if (signed instanceof Response) return signed;

  await signed.store.purgeAccount(signed.viewer.account.accountId);
  // The purge already revoked every session; clearing the cookie stops the
  // browser sending a credential that now resolves to nothing.
  return redirect("/", { cookies: [clearCookie(SESSION_COOKIE)] });
}
