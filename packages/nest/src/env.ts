/**
 * The bindings and secrets the karasu-nest Worker expects, and the guard that
 * turns a missing one into a startup-shaped error instead of an `undefined is
 * not a function` deep inside a request.
 *
 * ADR-2578 decision 5 puts this service on its own deploy precisely so state
 * and secrets never enter the static Pages app. The gallery needs that more
 * than generation did, not less: the console is the first surface that holds a
 * session, and a session cannot live in a static deploy at all.
 *
 * Every field is optional in the type because Workers hands us whatever the
 * environment actually has — `requireBinding` is where "configured" is
 * asserted, once, at the edge of a handler that needs it.
 */

/** A minimal structural stand-in for the Workers `ExecutionContext`. */
export interface NestExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException?(): void;
}

/**
 * A KV namespace, narrowed to the operations this service uses. Declared
 * structurally rather than imported from `@cloudflare/workers-types` so the
 * package stays dependency-free and the store can be faked in unit tests with
 * an object literal.
 */
export interface KVNamespaceLike {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number; metadata?: unknown },
  ): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; cursor?: string; limit?: number }): Promise<{
    keys: { name: string; metadata?: unknown }[];
    list_complete: boolean;
    cursor?: string;
  }>;
}

export interface NestEnv {
  /**
   * Accounts, sessions and submissions. One namespace, separated by key
   * prefix (`acct/`, `sess/`, `sub/`) rather than by binding, because account
   * deletion has to see all three.
   */
  NEST_STORE?: KVNamespaceLike;
  /**
   * GitHub OAuth client id for submitter sign-in (#2586).
   *
   * A dedicated OAuth App. The GitHub App's own user-to-server credentials
   * would work identically, but #2590 retired the App, so there is nothing
   * left for it to be attached to.
   */
  GITHUB_OAUTH_CLIENT_ID?: string;
  /** GitHub OAuth client secret. Paired with the id above. */
  GITHUB_OAUTH_CLIENT_SECRET?: string;
  /**
   * The public origin this deploy answers on, e.g. `https://nest.example`.
   *
   * Not derived from the incoming request. It is the OAuth `redirect_uri` and
   * the value every state-changing request's `Origin` is checked against, and
   * both of those stop meaning anything if an attacker-supplied `Host` header
   * can decide them.
   */
  NEST_PUBLIC_ORIGIN?: string;
  /** Deploy environment name, surfaced by `/healthz` for smoke checks. */
  ENVIRONMENT?: string;
}

/** Thrown when a handler needs a binding the deploy did not provide. */
export class MissingBindingError extends Error {
  constructor(readonly binding: string) {
    super(`karasu-nest is missing the required binding or secret: ${binding}`);
    this.name = "MissingBindingError";
  }
}

/**
 * Assert that a binding was configured, and narrow it.
 *
 * Deliberately throws rather than returning a nullable: a service that quietly
 * degraded when its OAuth credentials were absent would send people to a
 * broken consent screen instead of saying which binding is missing.
 */
export function requireBinding<K extends keyof NestEnv>(
  env: NestEnv,
  key: K,
): NonNullable<NestEnv[K]> {
  const value = env[key];
  if (value === undefined || value === null || value === "") throw new MissingBindingError(key);
  return value as NonNullable<NestEnv[K]>;
}
