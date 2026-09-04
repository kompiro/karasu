/**
 * Cloudflare Workers entry point for karasu-nest, and the package's barrel.
 *
 * A separate Worker from the Pages app on purpose (ADR-2578 decision 5, carried
 * forward from ADR-1990): this one holds state and the session, and neither may
 * move into the static app deploy. The app's own surfaces (inline `#s=` share,
 * `/render`, `/s`, the repo-backed permalink) stay exactly where they are and
 * are not routed through here.
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

// The gallery's stores. Keyed account-first so account deletion is one sweep.
export { GalleryStore } from "./store/gallery-store.js";
export type { AccountPurgeResult } from "./store/gallery-store.js";
export { AccountStore } from "./store/accounts.js";
export type { Account } from "./store/accounts.js";
export {
  SessionStore,
  SESSION_IDLE_TTL_SECONDS,
  SESSION_ABSOLUTE_TTL_SECONDS,
  SESSION_REFRESH_AFTER_SECONDS,
} from "./store/sessions.js";
export type { Session } from "./store/sessions.js";
export { SubmissionStore, MAX_SUBMISSION_BYTES, MAX_TITLE_LENGTH } from "./store/submissions.js";
export type { NewSubmission, Submission, Visibility } from "./store/submissions.js";
export {
  formatSubmissionId,
  parseSubmissionId,
  InvalidGalleryRefError,
} from "./store/gallery-keys.js";

// Ingest and serving.
export { validateSubmission } from "./gallery/validate.js";
export type { SubmissionRejection, ValidationResult } from "./gallery/validate.js";
export { renderSubmission } from "./gallery/render.js";
export type { RenderResult } from "./gallery/render.js";

// The structure-only scan. It was the second half of an egress door; with no
// model to call it is the only scan, and it runs on ingress.
export { redact, assertStructureOnly, StructureOnlyViolation } from "./redact/redact.js";
export type { Finding, RedactionResult } from "./redact/redact.js";
export { REDACTION_RULES } from "./redact/rules.js";
export type { RedactionRule } from "./redact/rules.js";
