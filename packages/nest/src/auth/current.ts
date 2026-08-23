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
import { requireBinding, type NestEnv } from "../env.js";
import { GalleryStore } from "../store/gallery-store.js";
import type { Account } from "../store/accounts.js";
import type { Session } from "../store/sessions.js";
import { parseSessionCookie, readCookie, SESSION_COOKIE } from "./session.js";

export interface Viewer {
  account: Account;
  session: Session;
}

/** The signed-in account, or `undefined`. Never throws for a bad cookie. */
export async function currentViewer(
  request: Request,
  env: NestEnv,
  store = new GalleryStore(requireBinding(env, "NEST_STORE")),
): Promise<Viewer | undefined> {
  const cookie = parseSessionCookie(readCookie(request, SESSION_COOKIE));
  if (cookie === undefined) return undefined;
  return await store.authenticate(cookie.accountId, cookie.sessionId);
}
