/**
 * How a generation gets from an HTTP request to a machine that can run it for
 * a quarter of an hour.
 *
 * The first version of this used `ctx.waitUntil`, and it could not have
 * worked. `waitUntil` extends a request's lifetime by roughly **30 seconds**
 * after the response is sent — and a 202 is sent immediately, by design — so
 * every real run would have been cancelled a few blob reads in, silently,
 * with the status record left saying `running` forever. The gate spike
 * measured 12-19 minutes for an 85-file repository.
 *
 * The replacement is a **Workflow**: Cloudflare's durable-execution primitive,
 * where each `step` is checkpointed and retried independently and an instance
 * may live far longer than any request. The route becomes a producer, and the
 * only thing it does synchronously is hand over four strings.
 *
 * The binding is declared structurally rather than imported from
 * `@cloudflare/workers-types`, for the same reason `KVNamespaceLike` is: the
 * package stays dependency-free and the dispatcher can be faked with an
 * object literal.
 */

export interface GenerationParams {
  installationId: string;
  owner: string;
  repo: string;
}

/** The subset of the Workflow binding this service uses. */
export interface GenerationDispatcher {
  create(options: { id?: string; params: GenerationParams }): Promise<{ id: string }>;
}

/**
 * A deterministic instance id, so a duplicate dispatch is rejected by the
 * platform rather than by our read-then-write check alone.
 *
 * Workflow instance ids are unique: creating one that already exists fails.
 * That turns the check-then-act race in the route from "two runs, doubled
 * inference cost, last write wins" into "one run, one loser that gets the
 * same answer the winner would have given".
 */
export function generationInstanceId(params: GenerationParams, sha: string): string {
  return `${params.installationId}-${params.owner}-${params.repo}-${sha.slice(0, 12)}`;
}
