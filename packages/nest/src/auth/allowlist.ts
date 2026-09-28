/**
 * Who may sign in at all (#2969).
 *
 * The gallery is not open past its operator until the legal review in #2691 is
 * done (`docs/policy/nest-data-handling.md`, "未了"). Signing in is what writes
 * the first personal data about someone (their GitHub id and login) and what
 * lets them show a submission to third parties, so it is where "operator only"
 * has to hold. Before this list the documents were the only gate, and an
 * unadvertised URL is not one.
 *
 * The list holds GitHub **numeric** ids, not logins. A login can be renamed and
 * then claimed by someone else; the id cannot.
 */
import { MissingBindingError, requireBinding, type NestEnv } from "../env.js";

const BINDING = "NEST_SIGN_IN_ALLOWLIST";

/**
 * The GitHub user ids allowed to sign in.
 *
 * Fails closed in both directions a misconfiguration can take: an unset list
 * and a list with an entry that is not a positive integer each answer as "not
 * configured" rather than letting everyone in or silently dropping the entry.
 * A typo that dropped the operator would lock them out; a typo read as "no
 * list" would open the gallery. Neither should happen quietly.
 */
export function signInAllowlist(env: NestEnv): ReadonlySet<number> {
  const raw = requireBinding(env, BINDING);
  const ids = new Set<number>();
  for (const entry of raw.split(/[\s,]+/)) {
    if (entry === "") continue;
    if (!/^[1-9]\d*$/.test(entry)) throw new MissingBindingError(BINDING);
    ids.add(Number(entry));
  }
  if (ids.size === 0) throw new MissingBindingError(BINDING);
  return ids;
}
