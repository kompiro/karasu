/**
 * GitHub sign-in, reduced to the three calls identity actually needs.
 *
 * This deliberately does **not** use `github/client.ts`. That client exists to
 * act as a GitHub App — it mints an App JWT, exchanges it for an installation
 * token and reads repositories with it — and #2590 deletes it along with the
 * rest of server-side generation. What the gallery needs is narrower and
 * outlives it: a user authorizes us once, we learn who they are, and we never
 * touch a repository. Building that on top of the App client would couple the
 * one surface that survives to the machinery being removed.
 *
 * **No scopes are requested.** `GET /user` returns the numeric id and the
 * login for a token with no scope at all, and those two fields are the entire
 * account record. Asking for more would be asking for access the gallery has
 * no use for, on a consent screen where the ask is the whole story a submitter
 * gets to read.
 */

const AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const TOKEN_URL = "https://github.com/login/oauth/access_token";
const USER_URL = "https://api.github.com/user";

/**
 * GitHub asks for this and rate-limits harder without it. It names the
 * service, not the repository being processed — there is no repository here.
 */
const USER_AGENT = "karasu-nest";

/** Thrown when sign-in cannot be completed. `reason` is a fixed vocabulary. */
export class OAuthError extends Error {
  constructor(readonly reason: string) {
    super(`GitHub sign-in failed: ${reason}`);
    this.name = "OAuthError";
  }
}

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  /** The public origin this deploy answers on, e.g. `https://nest.example`. */
  origin: string;
}

/** Where `GET /auth/callback` lives, derived rather than configured twice. */
export const redirectUri = (origin: string): string => `${origin}/auth/callback`;

/** The URL a sign-in redirects the browser to. */
export function authorizeUrl(config: OAuthConfig, state: string): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", redirectUri(config.origin));
  url.searchParams.set("state", state);
  // Explicitly empty. Omitting the parameter lets GitHub apply whatever the
  // app registration defaults to, which is a decision made in a web form
  // months ago rather than one visible here.
  url.searchParams.set("scope", "");
  return url.toString();
}

/**
 * Read a fixed-vocabulary error out of a GitHub response without letting its
 * prose escape.
 *
 * GitHub answers a bad `code` with **HTTP 200** and an `error` field, so the
 * status alone cannot tell success from failure here — the body has to be
 * read either way. The `error` field is a documented enum
 * (`bad_verification_code`, `incorrect_client_credentials`, …); the
 * `error_description` beside it is prose, and prose from a provider is exactly
 * what `reverse/llm.ts` learned to keep out of our own error surface.
 */
const ERROR_SHAPE = /^[a-z][a-z0-9_]{0,39}$/;

function providerError(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const value = (body as Record<string, unknown>).error;
  if (typeof value !== "string" || !ERROR_SHAPE.test(value)) return undefined;
  return value;
}

/** Exchange the callback's `code` for a user access token. */
export async function exchangeCode(config: OAuthConfig, code: string): Promise<string> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: redirectUri(config.origin),
    }).toString(),
  });

  // Read the body once, whatever the status, so nothing is left unconsumed —
  // and because a 200 here can still be a failure.
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new OAuthError(`token endpoint returned ${response.status} with an unreadable body`);
  }
  if (!response.ok) {
    const reason = providerError(payload);
    throw new OAuthError(
      reason === undefined
        ? `token endpoint returned ${response.status}`
        : `token endpoint returned ${response.status} (${reason})`,
    );
  }
  const reason = providerError(payload);
  if (reason !== undefined) throw new OAuthError(reason);

  const token = (payload as Record<string, unknown>).access_token;
  if (typeof token !== "string" || token.length === 0) {
    throw new OAuthError("token endpoint returned no access token");
  }
  return token;
}

export interface GitHubUser {
  /** Numeric user id. Stable across renames, so this is what keys are built on. */
  id: number;
  login: string;
}

/** Who the token belongs to. The id and the login, and nothing else. */
export async function fetchUser(token: string): Promise<GitHubUser> {
  const response = await fetch(USER_URL, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": USER_AGENT,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) {
    // Drained so no unread stream is left behind (the fault #2379 found on the
    // model-provider path, which has the same shape).
    await response.text().catch(() => undefined);
    throw new OAuthError(`user endpoint returned ${response.status}`);
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new OAuthError("user endpoint returned an unreadable body");
  }
  if (typeof payload !== "object" || payload === null) {
    throw new OAuthError("user endpoint returned an unexpected body");
  }
  const { id, login } = payload as Record<string, unknown>;
  if (typeof id !== "number" || !Number.isInteger(id) || id <= 0 || typeof login !== "string") {
    throw new OAuthError("user endpoint returned an unexpected body");
  }
  return { id, login };
}

/** A random `state`, from the same generator the store ids use. */
export { newSessionId as newOAuthState } from "../store/gallery-keys.js";
