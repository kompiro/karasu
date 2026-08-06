/**
 * A stand-in for the `cloudflare:workers` runtime module, for tests.
 *
 * wrangler supplies the real module at bundle time; vitest cannot resolve it
 * at all, so any test that loads a file importing it fails at import. That
 * would leave the Workers entry — the one module whose *export shape* is
 * load-bearing (see `worker.ts`) — untestable by the only means that catches
 * a bad shape: actually loading it.
 *
 * So the alias in `vitest.config.ts` points here. `WorkflowEntrypoint` is a
 * base class with no behaviour, which is all the entry needs to be a valid
 * class export, and all a future test of `GenerateWorkflow` would need to
 * construct one.
 */

export abstract class WorkflowEntrypoint<Env = unknown, Params = unknown> {
  constructor(
    protected ctx: unknown,
    protected env: Env,
  ) {}

  abstract run(event: { payload: Params; instanceId: string }, step: unknown): Promise<unknown>;
}
