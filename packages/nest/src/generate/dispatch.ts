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
/**
 * Characters a Workflow instance id may contain.
 *
 * The platform rejects anything else with `(instance.invalid_id)`, and it is
 * the only thing that enforces this: an id is a plain string to the type
 * system, and a test double takes whatever it is handed. Owner and repo names
 * reach this function from a URL, so the id is only as constrained as they
 * are.
 *
 * Sanitising here rather than at the call site because this function owns the
 * contract with the platform. A caller composing a new id component should
 * not have to know the rule.
 */
const DISALLOWED_IN_INSTANCE_ID = /[^A-Za-z0-9_-]/g;

/** The platform's ceiling on instance id length. */
export const MAX_INSTANCE_ID_LENGTH = 64;

export function generationInstanceId(params: GenerationParams, sha: string): string {
  const id = `${params.installationId}-${params.owner}-${params.repo}-${sha.slice(0, 12)}`.replace(
    DISALLOWED_IN_INSTANCE_ID,
    "-",
  );
  // Not truncated: a silently shortened id could collide with another run's,
  // and uniqueness is the one property this id exists to provide. Exceeding
  // the ceiling means the shape needs rethinking, not trimming.
  if (id.length > MAX_INSTANCE_ID_LENGTH) {
    throw new Error(`generation instance id is too long for the platform: ${id.length} characters`);
  }
  return id;
}
