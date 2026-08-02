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
 * The Workflow instance id for one *attempt*.
 *
 * Two properties have to hold at once, and the first version had only one.
 *
 * **Two callers racing on the same commit must collide**, so the platform
 * rejects the loser rather than starting a second fifteen-minute run. That is
 * what makes the route's read-then-write in-flight check safe.
 *
 * **A later attempt at the same commit must not collide**, because instance
 * ids stay unique for the platform's retention window, not just for the run's
 * lifetime. Keying on `(installation, repo, sha)` alone meant that once a
 * generation failed, every retry at that commit was refused by the platform
 * for as long as the id was retained — permanently, from a caller's point of
 * view, since nothing but a new commit would change the id. ADR-1994's cost
 * model assumes a caller can re-POST and spend another quota unit; that path
 * did not exist.
 *
 * `attempt` reconciles them. The route passes the value the quota charge
 * returned, which increments on every dispatch and therefore differs between
 * attempts while being identical for two callers who raced to the same charge.
 *
 * Owner and repo are deliberately absent. They are in `params` where the
 * Workflow can read them, and leaving them out keeps the id inside the
 * platform's 64-character limit for long repository names, while removing an
 * ambiguity: `-` is legal in both names, so `a-b`/`c` and `a`/`b-c` produced
 * the same id.
 */
/**
 * Characters a Workflow instance id may contain.
 *
 * The platform rejects anything else with `(instance.invalid_id)`, and it is
 * the only thing that enforces this: an id is a plain string to the type
 * system, and a test double takes whatever it is handed.
 *
 * Sanitising here rather than at the call site because this function owns the
 * contract with the platform. A caller composing a new discriminator should
 * not have to know the rule -- and the one below composes it from a calendar
 * period, which is exactly where a `.` came from.
 */
const DISALLOWED_IN_INSTANCE_ID = /[^A-Za-z0-9_-]/g;

/** The platform's ceiling on instance id length. */
export const MAX_INSTANCE_ID_LENGTH = 64;

export function generationInstanceId(
  params: GenerationParams,
  sha: string,
  attempt: string,
): string {
  const id = `${params.installationId}-${sha.slice(0, 12)}-${attempt}`.replace(
    DISALLOWED_IN_INSTANCE_ID,
    "-",
  );
  // Not truncated: a silently shortened id could collide with another
  // attempt's, and telling attempts apart is the whole reason `attempt` is
  // here. Exceeding the ceiling means the shape needs rethinking.
  if (id.length > MAX_INSTANCE_ID_LENGTH) {
    throw new Error(`generation instance id is too long for the platform: ${id.length} characters`);
  }
  return id;
}
}
