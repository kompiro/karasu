/**
 * `GET /<owner>/<repo>` on the **nest** hostname: the generated `.krs` this
 * service produced for that repository.
 *
 * This is not the permalink surface. `karasu.kompiro.dev/<owner>/<repo>`
 * resolves a `.krs` already committed to the repo and shows a signpost on a
 * miss; the two are not wired together at runtime and meet only at the repo,
 * when nest opens a pull request with what it generated (ADR-2249). Serving
 * the artifact rather than a rendering is what keeps that separation real: a
 * redirect into the app's share page would make the app's availability part of
 * this route's contract, and would silently cap the response at the inline
 * payload ceiling that ADR-2249 measured.
 *
 * The response is `no-store` even when the repository is public. This service
 * cannot tell the two apart from a cache key, and guessing in the direction of
 * "cacheable" is the wrong guess to be wrong about.
 */
import { error, json, text } from "../http.js";
import { logError } from "../log.js";
import { ReadCounter } from "../meter/reads.js";
import type { RouteContext } from "../router.js";
import { InvalidRefError, normaliseName } from "../store/keys.js";
import { NestStore } from "../store/nest-store.js";
import { requireBinding } from "../env.js";

/** How a caller reaches the state where this route has something to serve. */
const NOT_GENERATED_HINT =
  "karasu-nest has not generated a model for this repository. Install the GitHub App to have one generated, or build one locally with your own LLM: https://github.com/kompiro/karasu/blob/main/docs/guide/reverse-engineering-with-ai.md";

export async function repoKrs(context: RouteContext): Promise<Response> {
  const { params, url, env, ctx } = context;
  let owner: string;
  let repo: string;
  try {
    // Canonicalised before it becomes a key (TPL-168, TPL-2284). A name that
    // cannot be a GitHub name is a 400: it is a malformed request, not a
    // repository we have nothing for, and conflating them would tell a reader
    // to go install an App for a URL that can never work.
    owner = normaliseName(params.owner ?? "", "owner");
    repo = normaliseName(params.repo ?? "", "repo");
  } catch (cause) {
    if (cause instanceof InvalidRefError) {
      return error(400, "invalid_repo", `${cause.message}.`);
    }
    throw cause;
  }

  const store = new NestStore(requireBinding(env, "KRS_CACHE"));
  const published = await store.latest(owner, repo);
  if (published === undefined) {
    return error(404, "not_generated", NOT_GENERATED_HINT);
  }

  // Counted after the lookup succeeded, so the number means "a model was
  // served" rather than "someone typed a URL". Handed to `waitUntil` because
  // a reader must not wait on a metric, and swallowed because a lost count is
  // a worse report, not a worse response (#2226).
  ctx.waitUntil(
    new ReadCounter(requireBinding(env, "KRS_CACHE"))
      .increment({ installationId: published.installationId, owner, repo }, new Date())
      .catch((cause: unknown) => {
        logError("karasu-nest could not count a read", cause);
      }),
  );

  const provenance = {
    "X-Karasu-Source-Sha": published.sha,
    "X-Karasu-Generated-At": published.generatedAt,
  };

  if (url.searchParams.get("format") === "json") {
    return json(
      {
        owner,
        repo,
        sha: published.sha,
        generatedAt: published.generatedAt,
        krs: published.krs,
      },
      { headers: provenance },
    );
  }

  return text(published.krs, {
    headers: {
      ...provenance,
      // A generated model is a suggestion about someone else's repository.
      // Saying so in the response, not only in the docs, is the cheapest place
      // for it to be seen.
      "X-Karasu-Generated": "true",
      "Content-Disposition": `inline; filename="${owner}-${repo}.krs"`,
    },
  });
}
