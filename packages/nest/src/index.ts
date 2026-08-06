/**
 * Cloudflare Workers entry point for karasu-nest.
 *
 * A separate Worker from the Pages app on purpose (ADR-1990 decision 5): this
 * one holds state, the GitHub App private key and the webhook endpoint, and
 * none of those may move into the static app deploy. The app's existing
 * surfaces (inline `#s=` share, `/render`, `/s`, the repo-backed permalink)
 * stay exactly where they are and are not routed through here — ADR-2249 keeps
 * the two faces unconnected at runtime, meeting only at the repo.
 *
 * The entry is deliberately thin: everything testable lives in `app.ts` and
 * below, so the suite never needs a Workers runtime.
 */
import { handleRequest } from "./app.js";
import type { NestEnv, NestExecutionContext } from "./env.js";

export default {
  fetch(request: Request, env: NestEnv, ctx: NestExecutionContext): Promise<Response> {
    return handleRequest(request, env, ctx);
  },
};

export { handleRequest, createRouter } from "./app.js";
export type { NestEnv, NestExecutionContext } from "./env.js";
export { KrsCache, markGenerated } from "./store/krs-cache.js";
export type { GeneratedKrs, KrsCacheEntry } from "./store/krs-cache.js";
export type { CachedRef, RepoRef } from "./store/keys.js";
