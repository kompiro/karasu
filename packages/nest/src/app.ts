/**
 * The karasu-nest request pipeline: build the router once, then run every
 * request through a single failure boundary.
 *
 * The boundary is the point of this module. A handler that throws must not
 * return a stack trace or a binding value. The reason has narrowed since
 * ADR-1990 decision 6 wrote it — the service no longer reads anyone's private
 * code, so there is nothing repository-derived to leak — but a session lives
 * here now, and a stack trace naming a key is a worse thing to hand a stranger
 * than a fixed code plus a server-side log.
 */
import { MissingBindingError, type NestEnv, type NestExecutionContext } from "./env.js";
import { error } from "./http.js";
import { logError } from "./log.js";
import { health } from "./routes/health.js";
import { signIn, signInCallback, signOut } from "./routes/auth.js";
import { submitKrs } from "./routes/submit.js";
import { submissionPage } from "./routes/gallery.js";
import {
  consoleConfirmAccountDelete,
  consoleConfirmDelete,
  consoleDelete,
  consoleDeleteAccount,
  consoleIndex,
  consoleReplace,
  consoleSetVisibility,
  consoleSubmission,
  consoleSubmit,
} from "./routes/console.js";
import { Router } from "./router.js";

export function createRouter(): Router {
  // Registration order is match order within a group, and `Router.candidates`
  // prefers the group with the fewest captures. Nothing in this table reaches
  // that tie-break: the literals and the two capture routes (`/g/:id`,
  // `/console/s/:id`) never match the same path, because no literal has `s` in
  // the segment `/console/s/:id` captures. Registering the literals first is
  // what keeps that easy to see; `router.test.ts` is what keeps the rule
  // itself honest for the next capture route added here.
  return new Router()
    .get("/healthz", health)
    .get("/auth/login", signIn)
    .get("/auth/callback", signInCallback)
    .post("/auth/logout", signOut)
    .post("/api/submissions", submitKrs)
    .get("/console", consoleIndex)
    .post("/console/submit", consoleSubmit)
    .get("/console/account/delete", consoleConfirmAccountDelete)
    .post("/console/account/delete", consoleDeleteAccount)
    .get("/console/s/:id", consoleSubmission)
    .post("/console/s/:id/visibility", consoleSetVisibility)
    .post("/console/s/:id/replace", consoleReplace)
    .get("/console/s/:id/delete", consoleConfirmDelete)
    .post("/console/s/:id/delete", consoleDelete)
    .get("/g/:id", submissionPage);
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
