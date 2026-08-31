/**
 * The session cookie: its name, its attributes, and how a request is read.
 *
 * The name carries the `__Host-` prefix, which browsers enforce rather than
 * merely suggest: a cookie so named is rejected unless it is `Secure`, has
 * `Path=/`, and carries **no `Domain`** — so it cannot be set by, or leak to,
 * any other host. Those are exactly the constraints ADR-2578 already accepted
 * when it decided nest serves the console from its own hostname rather than
 * having a separate static origin call an API. The prefix makes that decision
 * enforced by the browser instead of assumed by us.
 *
 * `SameSite=Lax` is the CSRF defence for the console's forms. A cross-site
 * `POST` does not carry a Lax cookie at all, so a form on someone else's page
 * cannot delete a submission. Requests that change state also check `Origin`
 * (`sameOrigin` below), because "the browser will not send it" is one layer
 * and a stated check is the other.
 *
 * The cookie's value is `<account>:<session>`. Sessions are keyed by account
 * first (`store/sessions.ts`), so both halves have to travel; carrying them in
 * the cookie means the store lookup is a single `get` rather than a search.
 */
import { SESSION_ABSOLUTE_TTL_SECONDS } from "../store/sessions.js";

export const SESSION_COOKIE = "__Host-nest_session";
export const OAUTH_STATE_COOKIE = "__Host-nest_oauth_state";

/**
 * The OAuth round trip is measured in seconds. Ten minutes covers a slow
 * authorize screen without leaving a usable replay window lying around.
 */
const OAUTH_STATE_TTL_SECONDS = 600;

export interface SessionCookieValue {
  accountId: string;
  sessionId: string;
}

/**
 * Read one cookie out of a `Cookie` header.
 *
 * Hand-parsed rather than via a dependency: this package holds itself to no
 * runtime dependencies, and the grammar that matters here is one `;`-separated
 * list. Values the gallery sets are tokens from a 32-character alphabet, so
 * there is nothing to unescape.
 */
export function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("Cookie");
  if (header === null) return undefined;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    const value = part.slice(separator + 1).trim();
    return value.length > 0 ? value : undefined;
  }
  return undefined;
}

/** Split the session cookie into the two halves the store key needs. */
export function parseSessionCookie(raw: string | undefined): SessionCookieValue | undefined {
  if (raw === undefined) return undefined;
  const separator = raw.indexOf(":");
  if (separator <= 0) return undefined;
  const accountId = raw.slice(0, separator);
  const sessionId = raw.slice(separator + 1);
  if (!/^[0-9]+$/.test(accountId) || sessionId.length === 0) return undefined;
  return { accountId, sessionId };
}

function serialize(name: string, value: string, maxAgeSeconds: number): string {
  return [
    `${name}=${value}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ].join("; ");
}

/**
 * `Max-Age` is the **absolute** cap, not the idle window.
 *
 * The store's window slides (#2655), and a cookie set once at sign-in cannot
 * slide with it — so a `Max-Age` of the idle window would have the browser
 * throw the cookie away thirty days after sign-in however much it was being
 * used, and sliding the record behind it would buy nothing. Re-issuing the
 * cookie on every refresh is the other way to fix that, and it would put a
 * `Set-Cookie` on responses all the way up from `currentViewer`.
 *
 * So the cookie states the longest its value could possibly be useful, and
 * the store decides everything shorter. A cookie whose session went idle is
 * left in the browser as an inert string — it names a record KV has already
 * dropped, which reads as "not signed in" like any other stale cookie.
 */
export function sessionCookie(accountId: string, sessionId: string): string {
  return serialize(SESSION_COOKIE, `${accountId}:${sessionId}`, SESSION_ABSOLUTE_TTL_SECONDS);
}

export function oauthStateCookie(state: string): string {
  return serialize(OAUTH_STATE_COOKIE, state, OAUTH_STATE_TTL_SECONDS);
}

/**
 * A cookie that clears one.
 *
 * The attributes are repeated because a browser matches the cookie to clear by
 * name, path and domain — an expiry sent with a different `Path` leaves the
 * original in place, and a session that survives sign-out is worse than one
 * that never existed.
 */
export const clearCookie = (name: string): string => serialize(name, "", 0);

/**
 * Whether a state-changing request came from our own pages.
 *
 * A request with no `Origin` header is refused rather than allowed. Browsers
 * send `Origin` on every `POST`, so the absent case is not a browser form —
 * and defaulting an absent header to "trusted" is how this check ends up
 * meaning nothing.
 */
export function sameOrigin(request: Request, expectedOrigin: string): boolean {
  return request.headers.get("Origin") === expectedOrigin;
}
