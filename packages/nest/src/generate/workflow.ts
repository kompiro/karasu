/**
 * The durable host for a generation.
 *
 * `ctx.waitUntil` cannot run this: it extends a request by about 30 seconds
 * past a response that is sent immediately, and the gate spike measured 12-19
 * minutes. A Workflow instance is not bound to a request at all, and each
 * `step` is checkpointed — so a run that is interrupted resumes from the last
 * completed step rather than paying for the whole thing again.
 *
 * The body stays thin. `generate()` owns the pipeline and its status writes;
 * this class owns only "where does that run, what happens when the platform
 * interrupts it, and who gives the concurrency slot back".
 */
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { requireBinding, type NestEnv } from "../env.js";
import { GitHubClient } from "../github/client.js";
import { logError, logInfo } from "../log.js";
import { FailedDocumentStore } from "../meter/failed-document.js";
import { MetricsStore } from "../meter/record.js";
import { QuotaLedger } from "../quota/ledger.js";
import { AnthropicClient } from "../reverse/llm.js";
import { NestStore } from "../store/nest-store.js";
import { RunStatusStore } from "../store/run-status.js";
import type { GenerationParams } from "./dispatch.js";
import { generate } from "./run.js";

export class GenerateWorkflow extends WorkflowEntrypoint<NestEnv, GenerationParams> {
  async run(event: WorkflowEvent<GenerationParams>, step: WorkflowStep): Promise<void> {
    const { installationId, owner, repo } = event.payload;
    const env = this.env;
    const kv = requireBinding(env, "KRS_CACHE");
    const ledger = new QuotaLedger(kv);

    try {
      // One step, not several: the pipeline's own passes are not individually
      // resumable — a half-finished reverse has nothing to hand the next pass
      // — so splitting here would checkpoint state that cannot be restarted
      // from. What the step boundary does buy is a retry of the whole run on
      // a platform interruption, which is the failure this exists to survive.
      // The step returns nothing on purpose.
      //
      // A step's return value is checkpointed to Workflow storage. Returning
      // the outcome put the whole generated `.krs` there -- a payload that
      // grows with the repository, for a value used to write one log line. It
      // is also at odds with why this pipeline runs in a single step: source
      // and generated document stay inside one invocation's memory rather
      // than being persisted somewhere whose retention and purge are not the
      // documented ones (ADR-1990 decision 6).
      //
      // So the logging happens inside the step and the checkpoint stays empty.
      await step.do(
        "generate",
        // No retries. A retry re-runs the whole billed pipeline, so the
        // platform's default policy would multiply the cost of a failing
        // repository by the retry limit while ADR-1994 charges its quota
        // once. A caller who wants another attempt re-POSTs, which costs
        // them a quota unit -- the accounting the ADR describes.
        { retries: { limit: 0, delay: "10 seconds" } },
        async () => {
          const outcome = await generate(
            { installationId, owner, repo },
            {
              github: new GitHubClient({
                appId: requireBinding(env, "GITHUB_APP_ID"),
                privateKeyPem: requireBinding(env, "GITHUB_APP_PRIVATE_KEY"),
              }),
              llm: new AnthropicClient({ apiKey: requireBinding(env, "LLM_API_KEY") }),
              store: new NestStore(kv),
              runs: new RunStatusStore(kv),
              metrics: new MetricsStore(kv),
              failed: new FailedDocumentStore(kv),
              now: () => new Date(),
            },
          );

          logInfo(
            `karasu-nest generated ${owner}/${repo}@${outcome.sha}: ` +
              `${outcome.redactions} redaction(s), ` +
              `${outcome.reverse.usage.inputTokens}/${outcome.reverse.usage.outputTokens} tokens ` +
              `in ${Math.round(outcome.durationMs / 1000)}s` +
              (outcome.truncatedByCap ? ", stopped at our file cap" : ""),
          );
        },
      );
    } finally {
      // The slot goes back whether the run worked or not. `event.instanceId`
      // is the id the route used to take it, so this needs no knowledge of
      // how that id was built.
      //
      // A `finally` is not a guarantee — a platform interruption skips it —
      // which is why slots also expire. This is the fast path; the expiry is
      // the floor under it.
      try {
        await ledger.releaseSlot(installationId, event.instanceId);
      } catch (cause) {
        logError("karasu-nest could not release a concurrency slot", cause);
      }
    }
  }
}
