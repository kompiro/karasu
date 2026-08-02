/**
 * The slice of `cloudflare:workers` this package uses.
 *
 * Declared here rather than pulled from `@cloudflare/workers-types` so the
 * package stays dependency-free (see `README.md` — this is the deploy that
 * holds the App private key, and every added package is supply-chain surface
 * on it). Only `WorkflowEntrypoint` and the two shapes its `run` receives are
 * needed; wrangler supplies the real module at bundle time.
 */
declare module "cloudflare:workers" {
  export interface WorkflowEvent<Params> {
    payload: Params;
    instanceId: string;
  }

  export interface StepConfig {
    retries?: { limit: number; delay: string | number; backoff?: string };
    timeout?: string | number;
  }

  export interface WorkflowStep {
    /** Checkpointed and retried independently of the rest of the run. */
    do<T>(name: string, callback: () => Promise<T>): Promise<T>;
    do<T>(name: string, config: StepConfig, callback: () => Promise<T>): Promise<T>;
  }

  export abstract class WorkflowEntrypoint<Env = unknown, Params = unknown> {
    protected env: Env;
    abstract run(event: WorkflowEvent<Params>, step: WorkflowStep): Promise<unknown>;
  }
}
