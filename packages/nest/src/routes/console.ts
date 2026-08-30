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
 * **A refusal comes back as the page, not as JSON.** Every other surface this
 * Worker serves is answered by a program, so `error()` returning JSON is right
 * there and wrong here: these are plain forms with no client script, so a JSON
 * body is literally what the submitter reads. A `.krs` with a syntax error is
 * the routine failure rather than an exotic one, and answering it with a page
 * of braces — the document they just typed nowhere on it — manufactures the
 * support request this console exists to remove. The form comes back with the
 * reason above it and the text still in it.
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
import { readFormBody } from "../request-body.js";

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
 * work gone. This one stays JSON where the rejections below do not — it is
 * answered before there is a page of theirs to put a message on.
 */
async function signedIn(context: RouteContext): Promise<Signed | Response> {
  const { request, env } = context;
  const store = new GalleryStore(requireBinding(env, "NEST_STORE"));
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

/** The reason a form was refused, above the form it was refused from. */
const problem = (message: string): string =>
  `<p class="problem" role="alert">${escapeHtml(message)}</p>`;

/**
 * A textarea whose content survives the round trip.
 *
 * The newline after the opening tag is deliberate: an HTML parser drops one
 * newline in exactly that position, so without a spare of our own a `.krs`
 * beginning with a blank line would lose it every time the submitter opened
 * the page. (The other half of the round trip — a browser rewriting every line
 * ending to CRLF on the way back — is normalised in `gallery/validate.ts`.)
 */
const krsField = (value: string): string =>
  `<label>.krs <textarea name="krs" required>\n${escapeHtml(value)}</textarea></label>`;

const titleField = (value: string): string =>
  `<label>Title <input type="text" name="title" maxlength="${MAX_TITLE_LENGTH}" value="${escapeHtml(
    value,
  )}" required></label>`;

/**
 * "No submission with that id", as a page.
 *
 * Deliberately the same answer for a submission that never existed, one that
 * was deleted, and one that belongs to someone else — saying which would make
 * the console an oracle for what a stranger has posted.
 */
const notFound = (signed: Signed): Response =>
  html(
    page({
      title: "Not found",
      nav: nav(signed.viewer.account.login),
      body: [
        "<h1>No model with that id</h1>",
        "<p>It may have been deleted, or it may belong to someone else. ",
        '<a href="/console">Your models</a>.</p>',
      ].join(""),
    }),
    { status: 404 },
  );

/** What the submit form holds: empty on arrival, the refused text on a retry. */
interface SubmitDraft {
  title: string;
  krs: string;
  unlisted: boolean;
  message?: string;
}

const EMPTY_DRAFT: SubmitDraft = { title: "", krs: "", unlisted: false };

/** The form that puts a `.krs` in, so a browser alone is enough to use this. */
function submitForm(draft: SubmitDraft): string {
  return [
    '<form method="post" action="/console/submit">',
    "<h2>Submit a model</h2>",
    draft.message === undefined ? "" : problem(draft.message),
    titleField(draft.title),
    krsField(draft.krs),
    `<label><input type="checkbox" name="unlisted" value="on"${
      draft.unlisted ? " checked" : ""
    }> Keep it unlisted</label>`,
    '<p class="actions"><button type="submit">Submit</button></p>',
    "</form>",
  ].join("");
}

/** Everything this account owns, with the submit form under it. */
async function indexPage(
  signed: Signed,
  draft: SubmitDraft = EMPTY_DRAFT,
  status = 200,
): Promise<Response> {
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
        submitForm(draft),
        '<p class="actions"><a href="/console/account/delete">Delete my account</a></p>',
      ].join(""),
    }),
    { status },
  );
}

/** `GET /console` — everything this account owns. */
export async function consoleIndex(context: RouteContext): Promise<Response> {
  const signed = await signedIn(context);
  if (signed instanceof Response) return signed;
  return await indexPage(signed);
}

/** `POST /console/submit` — the form's target. */
export async function consoleSubmit(context: RouteContext): Promise<Response> {
  const blocked = guardWrite(context);
  if (blocked) return blocked;
  const signed = await signedIn(context);
  if (signed instanceof Response) return signed;

  const form = await readFormBody(context.request);
  if (form instanceof Response) return form;
  const draft: SubmitDraft = {
    title: form.get("title") ?? "",
    krs: form.get("krs") ?? "",
    unlisted: form.get("unlisted") === "on",
  };

  const validated = validateSubmission(draft.title, draft.krs);
  if (!validated.ok) {
    return await indexPage(signed, { ...draft, message: validated.rejection.message }, 400);
  }
  const submission = await signed.store.submissions.create(
    signed.viewer.account.accountId,
    {
      title: validated.title,
      krs: validated.krs,
      visibility: draft.unlisted ? "unlisted" : "public",
    },
    new Date(),
  );
  return redirect(`/console/s/${formatSubmissionId(submission.accountId, submission.slug)}`);
}

/** What the replace form holds: the stored document, or the refused edit. */
interface ReplaceDraft {
  title: string;
  krs: string;
  message?: string;
}

/** `GET /console/s/<id>` — one submission, and the controls for it. */
function submissionPage(
  signed: Signed,
  id: string,
  submission: Submission,
  draft?: ReplaceDraft,
  status = 200,
): Response {
  const isPublic = submission.visibility === "public";
  const replace = draft ?? { title: submission.title, krs: submission.krs };

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
        replace.message === undefined ? "" : problem(replace.message),
        titleField(replace.title),
        krsField(replace.krs),
        '<p class="actions"><button type="submit">Replace</button></p>',
        "</form>",
        `<p class="actions"><a href="/console/s/${escapeHtml(id)}/delete">Delete this model</a></p>`,
      ].join(""),
    }),
    { status },
  );
}

export async function consoleSubmission(context: RouteContext): Promise<Response> {
  const signed = await signedIn(context);
  if (signed instanceof Response) return signed;
  const owned = await ownSubmission(signed, context.params.id ?? "");
  if (owned === undefined) return notFound(signed);
  return submissionPage(signed, owned.id, owned.submission);
}

/** `POST /console/s/<id>/visibility` — publish or unpublish. */
export async function consoleSetVisibility(context: RouteContext): Promise<Response> {
  const blocked = guardWrite(context);
  if (blocked) return blocked;
  const signed = await signedIn(context);
  if (signed instanceof Response) return signed;
  const owned = await ownSubmission(signed, context.params.id ?? "");
  if (owned === undefined) return notFound(signed);

  const form = await readFormBody(context.request);
  if (form instanceof Response) return form;
  const wanted = form.get("visibility");
  if (wanted !== "public" && wanted !== "unlisted") {
    // JSON, unlike the rejections above: the value is a hidden field this
    // module writes, so nothing a browser does with our own page reaches here.
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
  if (owned === undefined) return notFound(signed);

  const form = await readFormBody(context.request);
  if (form instanceof Response) return form;
  const draft: ReplaceDraft = { title: form.get("title") ?? "", krs: form.get("krs") ?? "" };

  // The same two checks ingest runs. A replacement is a submission; letting it
  // in through a different door would make the door the thing being tested.
  const validated = validateSubmission(draft.title, draft.krs);
  if (!validated.ok) {
    // The edit comes back, not the stored document: overwriting the textarea
    // with what is already saved would throw away the work being rejected.
    return submissionPage(
      signed,
      owned.id,
      owned.submission,
      { ...draft, message: validated.rejection.message },
      400,
    );
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
  if (owned === undefined) return notFound(signed);

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
  if (owned === undefined) return notFound(signed);

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
