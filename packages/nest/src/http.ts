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
  return {
    "Content-Type": contentType,
    "Cache-Control": options.cacheControl ?? NO_STORE,
    ...options.headers,
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
