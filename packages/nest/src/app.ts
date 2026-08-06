/**
 * The karasu-nest request pipeline: build the router once, then run every
 * request through a single failure boundary.
 *
 * The boundary is the point of this module. A handler that throws must not
 * return a stack trace, a binding value, or anything derived from the
 * repository being processed — this service's inputs are other people's
 * private code (ADR-1990 decision 6). So the boundary answers with a fixed
 * code and logs the detail server-side instead.
 */
import { MissingBindingError, type NestEnv, type NestExecutionContext } from "./env.js";
import { error } from "./http.js";
import { logError } from "./log.js";
import { health } from "./routes/health.js";
import { repoKrs } from "./routes/repo.js";
import { Router } from "./router.js";

export function createRouter(): Router {
  // Registration order is match order, so the literal routes go first and the
  // `/:owner/:repo` catch-all cannot shadow them.
  return new Router().get("/healthz", health).get("/:owner/:repo", repoKrs);
}

const router = createRouter();

export async function handleRequest(
  request: Request,
  env: NestEnv,
  ctx: NestExecutionContext,
  routes: Router = router,
): Promise<Response> {
  try {
    return await routes.handle(request, env, ctx);
  } catch (cause) {
    if (cause instanceof MissingBindingError) {
      // Naming the binding is safe (it is our own configuration, not the
      // caller's data) and turns a mystery 503 into a one-line fix.
      logError(`karasu-nest misconfigured: ${cause.binding} is not set`);
      return error(503, "not_configured", `This deploy is missing the ${cause.binding} binding.`);
    }
    logError("karasu-nest request failed", cause);
    return error(500, "internal_error", "The request could not be completed.");
  }
}
