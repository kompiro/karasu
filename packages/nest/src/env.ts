/**
 * The bindings and secrets the karasu-nest Worker expects, and the guard that
 * turns a missing one into a startup-shaped error instead of a `undefined is
 * not a function` deep inside a request.
 *
 * ADR-1990 decision 5 puts this service on its own deploy precisely so these
 * secrets never enter the static Pages app. Every field is optional in the
 * type because Workers hands us whatever the environment actually has —
 * `requireBinding` is where "configured" is asserted, once, at the edge of a
 * handler that needs it.
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
  /** Cache of generated `.krs`, keyed per installation. Wired in #2284. */
  KRS_CACHE?: KVNamespaceLike;
  /** GitHub App id. Wired in #1992. */
  GITHUB_APP_ID?: string;
  /** GitHub App private key (PKCS#8 PEM). Wired in #1992. */
  GITHUB_APP_PRIVATE_KEY?: string;
  /** Shared secret for webhook signature verification. Wired in #2286. */
  GITHUB_WEBHOOK_SECRET?: string;
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
 * degrades when its GitHub App key is absent would answer requests it cannot
 * honestly serve, and ADR-1990 decision 6 makes "we could not verify" a reason
 * to refuse, not to guess.
 */
export function requireBinding<K extends keyof NestEnv>(
  env: NestEnv,
  key: K,
): NonNullable<NestEnv[K]> {
  const value = env[key];
  if (value === undefined || value === null || value === "") throw new MissingBindingError(key);
  return value as NonNullable<NestEnv[K]>;
}
