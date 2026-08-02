/**
 * `GET /healthz` — liveness plus a readable summary of which bindings the
 * running deploy actually has.
 *
 * The summary reports presence as a boolean and never the value, so the
 * endpoint stays safe to leave open. It exists because the failure this
 * service is most likely to ship is "deployed without a secret": every other
 * route then fails at request time, and without this the only symptom is a
 * 503 with no way to tell which binding is missing.
 */
import type { NestEnv } from "../env.js";
import { json } from "../http.js";
import type { RouteContext } from "../router.js";

const REPORTED_BINDINGS = [
  "KRS_CACHE",
  "GITHUB_APP_ID",
  "GITHUB_APP_PRIVATE_KEY",
  "GITHUB_WEBHOOK_SECRET",
  "LLM_API_KEY",
  "GENERATE_WORKFLOW",
] as const satisfies readonly (keyof NestEnv)[];

function configuredBindings(env: NestEnv): Record<string, boolean> {
  const report: Record<string, boolean> = {};
  for (const name of REPORTED_BINDINGS) {
    const value = env[name];
    report[name] = value !== undefined && value !== null && value !== "";
  }
  return report;
}

export function health({ env }: RouteContext): Response {
  return json({
    service: "karasu-nest",
    status: "ok",
    environment: env.ENVIRONMENT ?? "unknown",
    bindings: configuredBindings(env),
  });
}
