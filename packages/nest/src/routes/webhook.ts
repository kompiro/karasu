/**
 * `POST /webhooks/github` — the endpoint that makes "uninstall = purge" real.
 *
 * ADR-1990 decision 6 lists revocation among the conditions under which this
 * service may read other people's private code at all, and an installation
 * that cannot be revoked completely is the failure this route exists to
 * prevent. Everything here follows from that:
 *
 * - **Suspension purges too.** It is reversible and a purge is not, but the
 *   thing being deleted is a derived artifact that regenerates, whereas the
 *   thing being protected is someone's decision to cut off access. Keeping a
 *   diagram of a repository whose owner has just revoked reading rights is
 *   the wrong side to err on, and the cost of being wrong is one recompute.
 * - **Purge is idempotent**, so GitHub's at-least-once delivery and its
 *   redelivery button are both safe, and so is the re-run that
 *   `KrsCache.purgeInstallation` documents as necessary because KV's `list`
 *   is eventually consistent.
 * - **Unknown events acknowledge.** A 500 on an event we do not handle makes
 *   GitHub retry it forever and eventually disable the endpoint, taking the
 *   events we *do* handle down with it.
 *
 * **Out-of-order delivery is resolved towards deletion.** GitHub delivers at
 * least once and not in order, so a delayed `removed` can arrive after the
 * repository was re-added and republished, and purge something currently
 * valid. That is deliberate rather than unhandled: the two ways to be wrong
 * are not symmetric. Deleting a derived artifact too eagerly costs one
 * recompute; keeping one too long is the data-trust failure decision 6 exists
 * to prevent. Sequencing on the payload would trade a cheap, self-healing
 * error for an expensive, silent one.
 */
import { requireBinding } from "../env.js";
import { error, json } from "../http.js";
import { verifyWebhookSignature } from "../github/webhook-signature.js";
import { logError, logInfo } from "../log.js";
import { InvalidRefError } from "../store/keys.js";
import { NestStore, type PurgeResult } from "../store/nest-store.js";
import type { RouteContext } from "../router.js";

interface RepoName {
  owner: string;
  repo: string;
}

/** `full_name` is `owner/repo`; `name` alone is not enough to key on. */
function repoFromPayload(value: unknown): RepoName | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const fullName = (value as { full_name?: unknown }).full_name;
  if (typeof fullName !== "string") return undefined;
  const [owner, repo, ...rest] = fullName.split("/");
  if (owner === undefined || repo === undefined || rest.length > 0) return undefined;
  return { owner, repo };
}

function installationIdFromPayload(payload: Record<string, unknown>): string | undefined {
  const installation = payload.installation;
  if (typeof installation !== "object" || installation === null) return undefined;
  const id = (installation as { id?: unknown }).id;
  if (typeof id !== "number" && typeof id !== "string") return undefined;
  return String(id);
}

const PURGING_INSTALLATION_ACTIONS = new Set(["deleted", "suspend"]);

async function handleInstallation(
  store: NestStore,
  installationId: string,
  action: string,
): Promise<PurgeResult | undefined> {
  if (!PURGING_INSTALLATION_ACTIONS.has(action)) return undefined;
  return await store.purgeInstallation(installationId);
}

async function handleInstallationRepositories(
  store: NestStore,
  installationId: string,
  payload: Record<string, unknown>,
): Promise<PurgeResult | undefined> {
  const removed = payload.repositories_removed;
  if (!Array.isArray(removed)) return undefined;
  const total: PurgeResult = {
    documents: 0,
    pointers: 0,
    runs: 0,
    metrics: 0,
    reads: 0,
    quota: 0,
    failed: 0,
  };
  for (const raw of removed) {
    const name = repoFromPayload(raw);
    if (name === undefined) continue;
    try {
      const result = await store.purgeRepo({ installationId, ...name });
      total.documents += result.documents;
      total.pointers += result.pointers;
      total.runs += result.runs;
      total.metrics += result.metrics;
      total.reads += result.reads;
      total.quota += result.quota;
      total.failed += result.failed;
    } catch (cause) {
      // One unroutable name in the list must not abandon the rest of the
      // purge. Skipping it is safe because a name we cannot key on is a name
      // we never stored anything under.
      if (cause instanceof InvalidRefError) continue;
      throw cause;
    }
  }
  return total;
}

/**
 * A ceiling on the body this endpoint will buffer.
 *
 * The signature cannot be checked until the whole body is in memory, so an
 * unauthenticated caller gets to decide how much this Worker allocates. Real
 * `installation` payloads are a few kilobytes and the largest plausible
 * `installation_repositories` list is far inside this, so the cap costs
 * nothing legitimate and closes the one pre-auth resource an unsigned request
 * can consume.
 */
const MAX_BODY_BYTES = 1024 * 1024;

export async function githubWebhook(context: RouteContext): Promise<Response> {
  const { request, env } = context;
  const secret = requireBinding(env, "GITHUB_WEBHOOK_SECRET");

  const declaredLength = Number(request.headers.get("Content-Length") ?? "");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return error(
      413,
      "payload_too_large",
      "The webhook body is larger than this endpoint accepts.",
    );
  }

  // Read once, as text. The signature covers these exact bytes; verifying a
  // re-serialised parse would verify a different document.
  const body = await request.text();
  // Re-checked after reading: `Content-Length` is the sender's claim, and a
  // chunked request does not carry one at all.
  if (body.length > MAX_BODY_BYTES) {
    return error(
      413,
      "payload_too_large",
      "The webhook body is larger than this endpoint accepts.",
    );
  }
  const signature = request.headers.get("X-Hub-Signature-256");
  if (!(await verifyWebhookSignature(secret, signature, body))) {
    // No detail. A prober has no legitimate use for knowing which half of the
    // handshake it got wrong.
    return error(401, "bad_signature", "The webhook signature did not verify.");
  }

  let payload: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(body);
    // `typeof [] === "object"`, and an array payload would flow on with no
    // `action` and be silently acknowledged as an event we do not handle.
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("not an object");
    }
    payload = parsed as Record<string, unknown>;
  } catch {
    return error(400, "bad_payload", "The webhook body was not a JSON object.");
  }

  const event = request.headers.get("X-GitHub-Event") ?? "";
  const action = typeof payload.action === "string" ? payload.action : "";
  const installationId = installationIdFromPayload(payload);
  const store = new NestStore(requireBinding(env, "KRS_CACHE"));

  let purged: PurgeResult | undefined;
  if (installationId !== undefined) {
    try {
      if (event === "installation") {
        purged = await handleInstallation(store, installationId, action);
      } else if (event === "installation_repositories" && action === "removed") {
        purged = await handleInstallationRepositories(store, installationId, payload);
      }
    } catch (cause) {
      // A failed purge must be visible and must be retried, so this is the one
      // place the route reports failure rather than acknowledging. GitHub
      // retries a 5xx, and purge is idempotent, so a retry is the correct
      // response to a partial delete.
      logError(`karasu-nest purge failed for installation ${installationId}`, cause);
      return error(500, "purge_failed", "The purge did not complete; retry this delivery.");
    }
  }

  if (purged !== undefined) {
    // Logged so an uninstall leaves a trace that it ran. The counts are our
    // own bookkeeping about our own store; no repository content is involved.
    logInfo(
      `karasu-nest purged installation ${installationId}: ${purged.documents} document(s), ${purged.pointers} pointer(s), ${purged.runs} run record(s)`,
    );
  }

  // Everything else is acknowledged. Retrying an event we do not handle would
  // eventually get the endpoint disabled, taking the ones we do handle with it.
  return json({ event, action, purged: purged ?? null }, { status: 200 });
}
