/**
 * Response helpers for the karasu-nest Worker.
 *
 * Everything defaults to `no-store`. This service's answers are derived from
 * someone else's private repository, so a response that lands in a shared
 * cache by omission is a data-trust incident, not a performance bug (ADR-1990
 * decision 6). Callers that have a cacheable answer say so explicitly.
 */

const NO_STORE = "no-store";

interface ResponseOptions {
  status?: number;
  cacheControl?: string;
  headers?: Record<string, string>;
}

function baseHeaders(contentType: string, options: ResponseOptions): Record<string, string> {
  // `Content-Type` and `Cache-Control` are written *after* the caller's extra
  // headers, so neither can be shadowed by one. Spreading them the other way
  // round would let an `options.headers` entry quietly re-introduce a
  // cacheable response, which is the one thing this module exists to prevent
  // — `cacheControl` is the only supported way to opt out of `no-store`.
  return {
    ...options.headers,
    "Content-Type": contentType,
    "Cache-Control": options.cacheControl ?? NO_STORE,
  };
}

export function json(body: unknown, options: ResponseOptions = {}): Response {
  return new Response(JSON.stringify(body), {
    status: options.status ?? 200,
    headers: baseHeaders("application/json; charset=utf-8", options),
  });
}

export function text(body: string, options: ResponseOptions = {}): Response {
  return new Response(body, {
    status: options.status ?? 200,
    headers: baseHeaders("text/plain; charset=utf-8", options),
  });
}

/**
 * An error response with a machine-readable `code`.
 *
 * The code is what callers branch on; `message` is for a human reading logs or
 * a terminal. Both are kept free of anything derived from repository contents.
 */
export function error(status: number, code: string, message: string): Response {
  return json({ error: { code, message } }, { status });
}

export const notFound = (message = "Not found."): Response => error(404, "not_found", message);

export const methodNotAllowed = (allowed: readonly string[]): Response =>
  json(
    { error: { code: "method_not_allowed", message: `Allowed: ${allowed.join(", ")}.` } },
    { status: 405, headers: { Allow: allowed.join(", ") } },
  );

/**
 * A redirect, optionally setting or clearing cookies.
 *
 * Cookies are a list rather than an entry in `headers` because a single
 * response often has to set one and clear another — the OAuth callback issues
 * the session and drops the `state` cookie in the same breath — and
 * `Set-Cookie` is the one header where a second value must not replace the
 * first. `Headers.append` is the only way to say that; a `Record<string,
 * string>` cannot.
 *
 * 303 rather than 302: it makes the follow-up a `GET` by definition, which is
 * what every redirect here wants after a form `POST`.
 */
export function redirect(
  location: string,
  options: { status?: number; cookies?: readonly string[] } = {},
): Response {
  const headers = new Headers({ Location: location, "Cache-Control": NO_STORE });
  for (const cookie of options.cookies ?? []) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: options.status ?? 303, headers });
}

/** An HTML response. `no-store` by default, like everything else here. */
export function html(body: string, options: ResponseOptions = {}): Response {
  return new Response(body, {
    status: options.status ?? 200,
    headers: baseHeaders("text/html; charset=utf-8", options),
  });
}
