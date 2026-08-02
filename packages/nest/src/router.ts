/**
 * A path router small enough to read in one sitting.
 *
 * karasu-nest needs `/<owner>/<repo>`-shaped routes next to fixed ones like
 * `/healthz`, which rules out a flat switch, but it does not need a framework:
 * a dependency here would be a supply-chain surface on the one deploy that
 * holds the GitHub App private key. Patterns support literal segments and
 * `:name` captures; that is the whole grammar.
 *
 * A path that matches but with the wrong method answers 405 with `Allow`,
 * rather than 404. The distinction matters for a public surface: 404 says "no
 * such repo", and saying that about a repo that does exist would leak.
 */
import type { NestEnv, NestExecutionContext } from "./env.js";
import { methodNotAllowed, notFound } from "./http.js";

export interface RouteContext {
  request: Request;
  env: NestEnv;
  ctx: NestExecutionContext;
  url: URL;
  params: Readonly<Record<string, string>>;
}

type RouteHandler = (context: RouteContext) => Response | Promise<Response>;

interface Route {
  method: string;
  segments: string[];
  handler: RouteHandler;
}

/** Split a path into segments, tolerating a leading and trailing slash. */
function segmentsOf(path: string): string[] {
  return path.split("/").filter((segment) => segment.length > 0);
}

function matchSegments(
  pattern: readonly string[],
  actual: readonly string[],
): Record<string, string> | undefined {
  if (pattern.length !== actual.length) return undefined;
  const params: Record<string, string> = {};
  for (const [index, patternSegment] of pattern.entries()) {
    const actualSegment = actual[index] as string;
    if (patternSegment.startsWith(":")) {
      // An empty capture would let `//healthz` match `/:owner/healthz`; the
      // segment filter above already drops empties, so this is belt-and-braces
      // against a pattern that captures nothing meaningful.
      if (actualSegment.length === 0) return undefined;
      params[patternSegment.slice(1)] = actualSegment;
      continue;
    }
    if (patternSegment !== actualSegment) return undefined;
  }
  return params;
}

export class Router {
  private readonly routes: Route[] = [];

  /** Register a handler. Registration order is match order. */
  add(method: string, pattern: string, handler: RouteHandler): this {
    this.routes.push({ method: method.toUpperCase(), segments: segmentsOf(pattern), handler });
    return this;
  }

  get(pattern: string, handler: RouteHandler): this {
    return this.add("GET", pattern, handler);
  }

  post(pattern: string, handler: RouteHandler): this {
    return this.add("POST", pattern, handler);
  }

  /**
   * Resolve a request to a handler.
   *
   * `HEAD` is served by the `GET` handler — the runtime strips the body — so a
   * health check or link checker does not get a spurious 405.
   */
  async handle(request: Request, env: NestEnv, ctx: NestExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const actual = segmentsOf(url.pathname);
    const method = request.method.toUpperCase();
    const effectiveMethod = method === "HEAD" ? "GET" : method;

    const allowed = new Set<string>();
    for (const route of this.routes) {
      const params = matchSegments(route.segments, actual);
      if (params === undefined) continue;
      if (route.method === effectiveMethod) {
        return await route.handler({ request, env, ctx, url, params });
      }
      allowed.add(route.method);
    }

    if (allowed.size > 0) {
      if (allowed.has("GET")) allowed.add("HEAD");
      return methodNotAllowed([...allowed].sort());
    }
    return notFound();
  }
}
