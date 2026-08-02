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
 * this class owns only "where does that run, and what happens when the
 * platform interrupts it".
 */
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { requireBinding, type NestEnv } from "../env.js";
import { GitHubClient } from "../github/client.js";
import { AnthropicClient } from "../reverse/llm.js";
import { NestStore } from "../store/nest-store.js";
import { RunStatusStore } from "../store/run-status.js";
import type { GenerationParams } from "./dispatch.js";
import { generate } from "./run.js";
import { logInfo } from "../log.js";

export class GenerateWorkflow extends WorkflowEntrypoint<NestEnv, GenerationParams> {
  async run(event: WorkflowEvent<GenerationParams>, step: WorkflowStep): Promise<void> {
    const { installationId, owner, repo } = event.payload;
    const env = this.env;

    // One step, not several: the pipeline's own passes are not individually
    // resumable — a half-finished reverse has nothing to hand the next pass —
    // so splitting here would checkpoint state that cannot be restarted from.
    // What the step boundary does buy is a retry of the whole run on a
    // platform interruption, which is the failure this exists to survive.
    const outcome = await step.do("generate", async () =>
      generate(
        { installationId, owner, repo },
        {
          github: new GitHubClient({
            appId: requireBinding(env, "GITHUB_APP_ID"),
            privateKeyPem: requireBinding(env, "GITHUB_APP_PRIVATE_KEY"),
          }),
          llm: new AnthropicClient({ apiKey: requireBinding(env, "LLM_API_KEY") }),
          store: new NestStore(requireBinding(env, "KRS_CACHE")),
          runs: new RunStatusStore(requireBinding(env, "KRS_CACHE")),
          now: () => new Date(),
        },
      ),
    );

    logInfo(
      `karasu-nest generated ${owner}/${repo}@${outcome.sha}: ` +
        `${outcome.redactions} redaction(s), ${outcome.unreadableFiles} unreadable, ` +
        `${outcome.reverse.usage.inputTokens}/${outcome.reverse.usage.outputTokens} tokens` +
        (outcome.truncatedTree ? ", tree truncated by GitHub" : "") +
        (outcome.truncatedByCap ? ", tree truncated by our file cap" : ""),
    );
  }
}
