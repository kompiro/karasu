/**
 * `POST /<owner>/<repo>/generate` — ask for a model, get an acknowledgement.
 *
 * Installation-gated, per ADR-2262: a generation runs only for a repository
 * some installation can read, so the unbillable-caller tension ADR-2249 handed
 * to this side does not occur rather than being mitigated. A visitor with no
 * installation gets 404, which is also the honest answer — we cannot see the
 * repository either.
 *
 * The response is **202 with a status URL**, never the model. The gate spike
 * measured 12-19 minutes for an 85-file repository; nothing about that fits in
 * an HTTP response, and holding a connection open for it would be a worse
 * answer than a poll.
 */
import { requireBinding } from "../env.js";
import { generate } from "../generate/run.js";
import { GitHubClient } from "../github/client.js";
import { error, json } from "../http.js";
import { logError, logInfo } from "../log.js";
import { AnthropicClient } from "../reverse/llm.js";
import { InvalidRefError, normaliseName } from "../store/keys.js";
import { NestStore } from "../store/nest-store.js";
import { RunStatusStore } from "../store/run-status.js";
import type { RouteContext } from "../router.js";

/** Canonicalise the path parameters, or explain why they cannot be. */
function repoFrom(params: Readonly<Record<string, string>>): { owner: string; repo: string } {
  return {
    owner: normaliseName(params.owner ?? "", "owner"),
    repo: normaliseName(params.repo ?? "", "repo"),
  };
}

export async function requestGeneration(context: RouteContext): Promise<Response> {
  const { params, env, ctx, url } = context;
  let owner: string;
  let repo: string;
  try {
    ({ owner, repo } = repoFrom(params));
  } catch (cause) {
    if (cause instanceof InvalidRefError) return error(400, "invalid_repo", `${cause.message}.`);
    throw cause;
  }

  const kv = requireBinding(env, "KRS_CACHE");
  const github = new GitHubClient({
    appId: requireBinding(env, "GITHUB_APP_ID"),
    privateKeyPem: requireBinding(env, "GITHUB_APP_PRIVATE_KEY"),
  });

  const installationId = await github.installationIdFor(owner, repo);
  if (installationId === undefined) {
    // Not installed, or not visible to us — the same answer either way, and
    // deliberately so: distinguishing them would tell an anonymous caller
    // whether a private repository exists.
    return error(
      404,
      "not_installed",
      "karasu-nest cannot read this repository. Install the GitHub App on it first.",
    );
  }

  const runs = new RunStatusStore(kv);
  const store = new NestStore(kv);
  const ref = { installationId, owner, repo };

  const existing = await runs.get(ref);
  if (existing?.state === "running") {
    // Idempotent by state rather than by lock: two requests a second apart
    // must not start two 15-minute runs against the same repository.
    return json(
      { state: "running", sha: existing.sha, startedAt: existing.startedAt },
      { status: 202, headers: { Location: `${url.origin}/${owner}/${repo}/status` } },
    );
  }

  const llm = new AnthropicClient({ apiKey: requireBinding(env, "LLM_API_KEY") });
  const started = generate(
    { installationId, owner, repo },
    {
      github,
      llm,
      store,
      runs,
      now: () => new Date(),
    },
  )
    .then((outcome) => {
      logInfo(
        `karasu-nest generated ${owner}/${repo}@${outcome.sha}: ` +
          `${outcome.redactions} redaction(s), ` +
          `${outcome.reverse.usage.inputTokens}/${outcome.reverse.usage.outputTokens} tokens` +
          (outcome.truncatedTree ? ", tree truncated" : ""),
      );
    })
    .catch((cause: unknown) => {
      // `generate` already recorded the failure; this is the operator-facing
      // half. The run must not surface as an unhandled rejection.
      logError(`karasu-nest generation failed for ${owner}/${repo}`, cause);
    });

  // The whole point of the 202: the work outlives the response.
  ctx.waitUntil(started);

  return json(
    { state: "running" },
    { status: 202, headers: { Location: `${url.origin}/${owner}/${repo}/status` } },
  );
}

/**
 * `GET /<owner>/<repo>/status` — which of the four states this repo is in.
 *
 * A bare 404 collapses "never asked", "running", "done" and "failed" into one
 * answer, leaving a caller polling a URL that may never change.
 */
export async function generationStatus(context: RouteContext): Promise<Response> {
  const { params, env } = context;
  let owner: string;
  let repo: string;
  try {
    ({ owner, repo } = repoFrom(params));
  } catch (cause) {
    if (cause instanceof InvalidRefError) return error(400, "invalid_repo", `${cause.message}.`);
    throw cause;
  }

  const kv = requireBinding(env, "KRS_CACHE");
  const published = await new NestStore(kv).latest(owner, repo);
  if (published !== undefined) {
    // A published document is the strongest statement available, and it does
    // not require an installation lookup to make.
    return json({
      state: "done",
      sha: published.sha,
      generatedAt: published.generatedAt,
      krs: `/${owner}/${repo}`,
    });
  }

  const github = new GitHubClient({
    appId: requireBinding(env, "GITHUB_APP_ID"),
    privateKeyPem: requireBinding(env, "GITHUB_APP_PRIVATE_KEY"),
  });
  const installationId = await github.installationIdFor(owner, repo);
  if (installationId === undefined) return json({ state: "not_installed" }, { status: 404 });

  const status = await new RunStatusStore(kv).get({ installationId, owner, repo });
  if (status === undefined) return json({ state: "never_requested" }, { status: 404 });
  return json(status);
}
