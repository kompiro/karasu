/**
 * Sign in, sign out, and the callback in between.
 *
 * The gallery authenticates the **submitter**, and nothing more. It does not
 * check that anyone controls a repository, because a submission is not tied to
 * one (#2587): what a login buys is a handle that can be held responsible and
 * suspended. Anonymous submission was rejected for the absence of exactly
 * that — with it there is nobody to answer a withdrawal request and no way to
 * stop abuse.
 *
 * The `state` parameter is a double-submit: it is written to a short-lived
 * `__Host-` cookie on the way out and compared with the one GitHub hands back.
 * Without it, an attacker can complete a sign-in *of their own account* in a
 * victim's browser, and the victim then submits under the attacker's handle.
 */
import { requireBinding, type NestEnv } from "../env.js";
import { error, redirect } from "../http.js";
import { logError } from "../log.js";
import type { RouteContext } from "../router.js";
import { GalleryStore } from "../store/gallery-store.js";
import {
  authorizeUrl,
  exchangeCode,
  fetchUser,
  newOAuthState,
  OAuthError,
  type OAuthConfig,
} from "../auth/oauth.js";
import {
  clearCookie,
  oauthStateCookie,
  parseSessionCookie,
  readCookie,
  sameOrigin,
  sessionCookie,
  OAUTH_STATE_COOKIE,
  SESSION_COOKIE,
} from "../auth/session.js";

/** Where a signed-in submitter lands. The console arrives in #2589. */
const AFTER_SIGN_IN = "/console";

function oauthConfig(env: NestEnv): OAuthConfig {
  return {
    clientId: requireBinding(env, "GITHUB_OAUTH_CLIENT_ID"),
    clientSecret: requireBinding(env, "GITHUB_OAUTH_CLIENT_SECRET"),
    origin: requireBinding(env, "NEST_PUBLIC_ORIGIN"),
  };
}

/** `GET /auth/login` — start the round trip. */
export function signIn(context: RouteContext): Response {
  const config = oauthConfig(context.env);
  const state = newOAuthState();
  return redirect(authorizeUrl(config, state), { cookies: [oauthStateCookie(state)] });
}

/**
 * `GET /auth/callback` — finish it.
 *
 * Every failure clears the `state` cookie. A single-use value left in the
 * browser after a failed attempt is a value that can be replayed into the next
 * one, which is the whole thing `state` was there to prevent.
 */
export async function signInCallback(context: RouteContext): Promise<Response> {
  const { url, request, env } = context;
  const config = oauthConfig(env);
  const drop = [clearCookie(OAUTH_STATE_COOKIE)];

  const expected = readCookie(request, OAUTH_STATE_COOKIE);
  const returned = url.searchParams.get("state");
  // Absent counts as mismatched. Treating "no cookie" as "nothing to compare,
  // so allow" is how a double-submit check ends up defending nothing.
  if (expected === undefined || returned === null || returned !== expected) {
    return signInFailed("state_mismatch", "Sign-in could not be verified. Please try again.", drop);
  }

  const code = url.searchParams.get("code");
  if (code === null || code.length === 0) {
    // GitHub redirects here with `error=access_denied` when the submitter
    // declines on the consent screen. That is a decision, not a fault.
    const declined = url.searchParams.get("error") === "access_denied";
    return signInFailed(
      declined ? "declined" : "no_code",
      declined ? "Sign-in was cancelled." : "Sign-in did not complete. Please try again.",
      drop,
    );
  }

  let user: { id: number; login: string };
  try {
    user = await fetchUser(await exchangeCode(config, code));
  } catch (cause) {
    if (cause instanceof OAuthError) {
      // `reason` is a fixed vocabulary by construction, so it is safe to log.
      // It is not put in the response: a submitter cannot act on
      // `bad_verification_code`, and the operator reading logs can.
      logError(`karasu-nest sign-in failed: ${cause.reason}`);
      return signInFailed("provider_error", "Sign-in could not be completed.", drop);
    }
    throw cause;
  }

  const store = new GalleryStore(requireBinding(env, "NEST_STORE"));
  const now = new Date();
  await store.accounts.signIn(user.id, user.login, now);
  const { sessionId } = await store.sessions.issue(user.id, user.login, now);

  return redirect(AFTER_SIGN_IN, {
    cookies: [sessionCookie(String(user.id), sessionId), ...drop],
  });
}

function signInFailed(code: string, message: string, cookies: string[]): Response {
  const response = error(400, code, message);
  for (const cookie of cookies) response.headers.append("Set-Cookie", cookie);
  return response;
}

/**
 * `POST /auth/logout` — revoke this session and clear the cookie.
 *
 * A `POST`, so a link on another page cannot sign someone out. The `Origin`
 * check is the second layer behind `SameSite=Lax`; signing out is harmless
 * enough that it would survive either alone, but the console's destructive
 * routes use the same helper and it is worth exercising here.
 */
export async function signOut(context: RouteContext): Promise<Response> {
  const { request, env } = context;
  if (!sameOrigin(request, requireBinding(env, "NEST_PUBLIC_ORIGIN"))) {
    return error(403, "cross_origin", "This request did not come from the gallery.");
  }
  const cookie = parseSessionCookie(readCookie(request, SESSION_COOKIE));
  if (cookie !== undefined) {
    const store = new GalleryStore(requireBinding(env, "NEST_STORE"));
    // A cookie whose halves cannot form a key was never a session; there is
    // nothing to revoke and the clear below is the whole answer.
    await store.sessions.revoke(cookie.accountId, cookie.sessionId).catch(() => undefined);
  }
  return redirect("/", { cookies: [clearCookie(SESSION_COOKIE)] });
}
