/**
 * "Who is asking", in one place.
 *
 * Ingest (#2587), the submission page (#2588) and the console (#2589) all need
 * the same three steps: read the cookie, resolve it against the store, and
 * treat every way it can fail as "not signed in". Three copies of that would
 * be three chances for one of them to distinguish an expired session from a
 * forged one in a response — which would tell a stranger whether an account
 * exists.
 */
import { requireBinding, type NestEnv, type NestExecutionContext } from "../env.js";
import { GalleryStore } from "../store/gallery-store.js";
import type { Account } from "../store/accounts.js";
import type { Session } from "../store/sessions.js";
import { parseSessionCookie, readCookie, SESSION_COOKIE } from "./session.js";

export interface Viewer {
  account: Account;
  session: Session;
}

/**
 * What resolving a viewer needs from the request.
 *
 * Structural rather than `RouteContext` from `../router.js`: every caller is
 * a route handler and passes one, but naming the router type here would point
 * `auth/` at the module that mounts the routes that use `auth/`. The shape is
 * three fields, and `RouteContext` satisfies it.
 */
export interface ViewerContext {
  request: Request;
  env: NestEnv;
  ctx: NestExecutionContext;
}

/**
 * The signed-in account, or `undefined`. Never throws for a bad cookie.
 *
 * `ctx` is here because resolving a viewer is what slides the session's
 * expiry (#2655), and that write belongs off the response path.
 */
export async function currentViewer(
  context: ViewerContext,
  store = new GalleryStore(requireBinding(context.env, "NEST_STORE")),
): Promise<Viewer | undefined> {
  const cookie = parseSessionCookie(readCookie(context.request, SESSION_COOKIE));
  if (cookie === undefined) return undefined;
  return await store.authenticate(cookie.accountId, cookie.sessionId, {
    waitUntil: (promise) => {
      context.ctx.waitUntil(promise);
    },
  });
}
