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
 *
 * The work is handed to a Workflow rather than to `ctx.waitUntil`. `waitUntil`
 * buys about 30 seconds past the response — and the response is immediate, by
 * design — so it could never have hosted this; see `generate/dispatch.ts`.
 */
import { requireBinding } from "../env.js";
import { generationInstanceId } from "../generate/dispatch.js";
import { GitHubClient } from "../github/client.js";
import { error, json } from "../http.js";
import { logInfo } from "../log.js";
import { InvalidRefError, normaliseName } from "../store/keys.js";
import { NestStore } from "../store/nest-store.js";
import { isStale, RunStatusStore } from "../store/run-status.js";
import type { RouteContext } from "../router.js";

/** Canonicalise the path parameters, or explain why they cannot be. */
function repoFrom(params: Readonly<Record<string, string>>): { owner: string; repo: string } {
  return {
    owner: normaliseName(params.owner ?? "", "owner"),
    repo: normaliseName(params.repo ?? "", "repo"),
  };
}

export async function requestGeneration(context: RouteContext): Promise<Response> {
  const { params, env, url } = context;
  let owner: string;
  let repo: string;
  try {
    ({ owner, repo } = repoFrom(params));
  } catch (cause) {
    if (cause instanceof InvalidRefError) return error(400, "invalid_repo", `${cause.message}.`);
    throw cause;
  }

  const kv = requireBinding(env, "KRS_CACHE");
  const workflow = requireBinding(env, "GENERATE_WORKFLOW");
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
  const ref = { installationId, owner, repo };
  const location = `${url.origin}/${owner}/${repo}/status`;

  const existing = await runs.get(ref);
  if (existing !== undefined && existing.state === "running" && !isStale(existing, Date.now())) {
    // Two clicks a second apart must not buy two fifteen-minute runs. This is
    // a read-then-write, so a genuine race can still pass both — the Workflow
    // instance id below is what actually makes that harmless: the loser's
    // create fails and no second run starts.
    return json(
      { state: "running", sha: existing.sha, startedAt: existing.startedAt },
      { status: 202, headers: { Location: location } },
    );
  }
  if (existing !== undefined && isStale(existing, Date.now())) {
    // A record stuck on `running` because its run died. Refusing every retry
    // for a day on behalf of a job that is not executing is worse than
    // starting another one.
    logInfo(`karasu-nest retrying ${owner}/${repo}: previous run went stale`);
  }

  const sha = await github.defaultBranchSha(installationId, owner, repo);
  const instanceId = generationInstanceId({ installationId, owner, repo }, sha);
  try {
    await workflow.create({ id: instanceId, params: { installationId, owner, repo } });
  } catch {
    // A duplicate instance id means the platform already has this exact run.
    // That is the answer the caller wanted, not an error.
    return json({ state: "running", sha }, { status: 202, headers: { Location: location } });
  }

  return json({ state: "running", sha }, { status: 202, headers: { Location: location } });
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
  if (isStale(status, Date.now())) {
    // Reported honestly rather than as a run that is still going: a caller
    // polling this needs to know it can ask again.
    return json({ ...status, state: "failed", error: "the run stopped without finishing" });
  }
  return json(status);
}
