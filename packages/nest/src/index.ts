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

// Re-exported for tests and callers. The copy that matters to wrangler is on
// `worker.ts`, which is where a `[[workflows]]` class binding is resolved.
export { GenerateWorkflow } from "./generate/workflow.js";
export { handleRequest, createRouter } from "./app.js";
export type { NestEnv, NestExecutionContext } from "./env.js";
export { KrsCache, markGenerated } from "./store/krs-cache.js";
export { NestStore } from "./store/nest-store.js";
export type { PublishedKrs, PurgeResult } from "./store/nest-store.js";
export { RepoDirectory } from "./store/repo-directory.js";
export type { DirectoryEntry } from "./store/repo-directory.js";
export type { GeneratedKrs, KrsCacheEntry } from "./store/krs-cache.js";
export type { CachedRef, RepoRef } from "./store/keys.js";
export { GitHubClient, GitHubApiError } from "./github/client.js";
export type { GitHubClientOptions, RepoTree, TreeEntry } from "./github/client.js";
export { createAppJwt } from "./github/app-jwt.js";
export type { AppJwtOptions } from "./github/app-jwt.js";
export { toPkcs8, InvalidPrivateKeyError } from "./github/pem.js";
export {
  redact,
  redactFiles,
  assertStructureOnly,
  StructureOnlyViolation,
} from "./redact/redact.js";
export type { Finding, RedactionResult } from "./redact/redact.js";
export { REDACTION_RULES } from "./redact/rules.js";
export type { RedactionRule } from "./redact/rules.js";
export { pruneUnparseableLines } from "./reverse/prune.js";
export type { PruneResult } from "./reverse/prune.js";
export { reverseRepository, ReverseFailed } from "./reverse/pipeline.js";
export type { StructuralDiagnostic } from "./reverse/pipeline.js";
export type {
  RedactedRepo,
  ReverseOptions,
  ReverseResult,
  DomainSketch,
} from "./reverse/pipeline.js";
export { AnthropicClient, LlmError } from "./reverse/llm.js";
export type { LlmClient, LlmResponse, LlmUsage } from "./reverse/llm.js";
export { BOUNDED_CONTEXT_DIRECTIVE, repairPrompt } from "./reverse/prompts.js";
export type { RepairDiagnostic } from "./reverse/prompts.js";
export { generate, GenerateFailed } from "./generate/run.js";
export { generationInstanceId } from "./generate/dispatch.js";
export type { GenerationDispatcher, GenerationParams } from "./generate/dispatch.js";
export type { GenerateInput, GenerateDeps, GenerateOutcome } from "./generate/run.js";
// The cost surface (#2226): the numbers that decide #1994's quota level.
export { costUsd, isPricedModel, toCents, PRICING_AS_OF, UnknownModelError } from "./meter/cost.js";
export type { TokenUsage } from "./meter/cost.js";
export { MetricsStore } from "./meter/record.js";
export type { Aggregate, PassMetrics, RunMetrics } from "./meter/record.js";
export { ReadCounter, utcDay } from "./meter/reads.js";
export { RunStatusStore } from "./store/run-status.js";
export type { RunStatus, RunState } from "./store/run-status.js";
