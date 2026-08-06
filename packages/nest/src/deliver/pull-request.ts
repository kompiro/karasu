/**
 * Delivering a generated model by opening a pull request.
 *
 * This is the ratchet (#2228, ADR-1990 decision 4). A progress page or an
 * email would deliver the same bytes and leave the corrections nowhere: a
 * human who fixes a wrong boundary in a web view has fixed it for nobody. A
 * pull request puts the document where ADR-1829 says the record belongs and
 * where ADR-2249's permalink surface already reads from, so a correction is
 * made once and is then the thing everyone sees.
 *
 * It also costs no personal data. There is no email address to collect, and
 * GitHub's own notifications carry the "it is ready" message — which is what
 * makes a 12-19 minute latency stop mattering (#2262).
 *
 * **This needs `contents:write` and `pull_requests:write`,** which is more
 * than the `contents:read` that ADR-1990 decision 6 scoped the install
 * consent to. Widening what the App may do to someone's repository without
 * their having agreed to it is not a thing to do quietly, so delivery is
 * **off unless a deploy turns it on**, and #1996 owns the consent copy that
 * makes turning it on legitimate. The switch is checked by the caller; this
 * module is the mechanism, not the policy.
 */
import { GitHubApiError, type GitHubClient } from "../github/client.js";
import { redactFiles } from "../redact/redact.js";

export interface DeliveryInput {
  installationId: string;
  owner: string;
  repo: string;
  /** The commit the model was generated from. */
  sha: string;
  /** The generated document. Already structure-scanned by the pipeline. */
  krs: string;
  /** Domains the reverse identified, for the pull-request body. */
  domains: { name: string; summary: string; confidence?: string }[];
  /** How many redactions fired on the way in. Counts only, never values. */
  redactions: number;
  /** GitHub could not return the whole tree. */
  truncatedTree?: boolean;
  /** We stopped short of the whole tree ourselves, at the file cap. */
  truncatedByCap?: boolean;
}

/**
 * Whether a deploy has turned delivery on.
 *
 * A function rather than an inline comparison so the one control standing
 * between this service and writing to repositories it was given read consent
 * for is something a test can exercise. Exact match, so `ON`, `true`, `1` and
 * a stray space all fail closed — the safe direction for a switch whose wrong
 * setting writes to somebody else's repository (ADR-1990 decision 6, #1996).
 */
export function deliveryEnabled(env: { PR_DELIVERY?: string }): boolean {
  return env.PR_DELIVERY === "on";
}

export interface DeliveryResult {
  number: number;
  url: string;
  /** False when an open pull request was already there for this commit. */
  created: boolean;
  branch: string;
  path: string;
}

export class DeliveryFailed extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeliveryFailed";
  }
}

/**
 * Where the document lands.
 *
 * `docs/` because that is where a reader looks, and a fixed name because the
 * point of the ratchet is that the next reverse finds the corrected version
 * in a predictable place. A repository that wants it elsewhere moves the file
 * in the pull request, which is a correction like any other.
 */
export const KRS_PATH = "docs/architecture.krs";

/**
 * One branch per commit.
 *
 * Deriving the name from the commit is what makes re-generating the same SHA
 * idempotent: the branch is already there, the file already matches, and the
 * open pull request is found rather than duplicated. A timestamp or a counter
 * here would open a second pull request for the same content every time
 * anyone re-asked.
 */
export function deliveryBranch(sha: string): string {
  return `karasu-nest/model-${sha.slice(0, 12)}`;
}

/**
 * One table cell of model-written text.
 *
 * Three things happen here, and the second is the one that matters.
 *
 * Escaping `|` keeps the table a table. Collapsing newlines keeps the *body*
 * a body: a PR description is not inert on GitHub, and a newline in a domain
 * name is enough to inject `Closes #12` — which closes that issue when the
 * pull request merges — or an `@org/team` mention. The text comes from a
 * model that read a repository which may itself contain instructions aimed at
 * it, so it is untrusted input that happens to have taken a long route.
 *
 * And it is truncated, because a domain summary is a sentence and anything
 * much longer is a sign the pass went wrong.
 */
function cell(text: string, limit: number, onRedaction: () => void): string {
  // Redacted as well as escaped. Everything else that leaves this service has
  // been through a scan (`assertStructureOnly` for the `.krs`), and until this
  // module existed `domains` was internal — a summary is the first model text
  // to reach the outside world. Input redaction can miss; the output scan is
  // there because a miss must not ship (`redact/redact.ts`).
  const scanned = redactFiles([{ path: "pull-request-body", content: text }]);
  scanned.findings.forEach(onRedaction);
  const cleaned = scanned.files[0]?.content ?? text;
  const flattened = cleaned
    .replaceAll(/[\r\n]+/g, " ")
    .replaceAll("|", "\\|")
    .trim();
  return flattened.length <= limit ? flattened : `${flattened.slice(0, limit - 1)}…`;
}

/** The pull-request body. Says what it is, how sure it is, and how to fix it. */
export function pullRequestBody(input: DeliveryInput): string {
  // Counted rather than ignored: the body states how many redactions fired,
  // and a claim of "none" printed next to text nobody scanned would be a
  // false assurance in the most visible place this service has.
  let scrubbed = 0;
  const count = (): void => {
    scrubbed += 1;
  };
  const confidence = input.domains
    .map(
      (domain) =>
        `| ${cell(domain.name, 80, count)} | ${cell(domain.confidence ?? "unstated", 20, count)} | ${cell(domain.summary, 200, count)} |`,
    )
    .join("\n");
  const partial = input.truncatedTree === true || input.truncatedByCap === true;
  const redactions = input.redactions + scrubbed;

  return [
    `This is a generated architecture model of \`${input.owner}/${input.repo}\` at ${input.sha.slice(0, 7)}.`,
    "",
    "**It is a first draft, not a description of what you built.** karasu-nest read the",
    "repository and guessed at the boundaries; nodes it was unsure about carry `@draft`.",
    "The useful thing to do with it is disagree with it: correcting a boundary here is a",
    "correction everyone downstream sees, because this file is the record.",
    "",
    "## What it thinks your domains are",
    "",
    "| Domain | Confidence | Summary |",
    "| --- | --- | --- |",
    confidence.length === 0 ? "| (none identified) | | |" : confidence,
    "",
    "## How to correct it",
    "",
    `- Edit \`${KRS_PATH}\` in this branch. The syntax reference is at https://kompiro.github.io/karasu/spec/syntax`,
    "- Remove `@draft` from anything you have confirmed",
    "- Merge when it is right, or close this pull request if the model is not useful",
    "",
    "## What was read",
    "",
    `- Source files were read at ${input.sha.slice(0, 7)} and were **not** stored. Only this document was kept.`,
    partial
      ? "- **Not every file was read.** The scan stops at a file cap, so this model describes part of the repository rather than all of it."
      : "- Every eligible source file was read.",
    redactions === 0
      ? "- No credential-shaped strings were found in the source."
      : `- ${redactions} credential-shaped string(s) were redacted before anything reached the model.`,
    "",
    "<sub>Generated by [karasu-nest](https://github.com/kompiro/karasu). Uninstalling the App deletes everything it kept.</sub>",
  ].join("\n");
}

export interface DeliveryDeps {
  github: GitHubClient;
}

/**
 * Open (or find) the pull request carrying a generated model.
 *
 * Idempotent by commit: called twice for the same SHA, the second call
 * returns the first call's pull request rather than opening another. That is
 * a requirement rather than a nicety — the generation route can dispatch a
 * retry after a failure, and a repository owner who finds three identical
 * pull requests has been given a reason to uninstall.
 */
export async function deliverPullRequest(
  input: DeliveryInput,
  deps: DeliveryDeps,
): Promise<DeliveryResult> {
  const { github } = deps;
  const { installationId, owner, repo, sha } = input;
  const branch = deliveryBranch(sha);
  const ref = `heads/${branch}`;

  // Both the base and the owner's canonical login, in one request. The login
  // is needed before the duplicate check, because GitHub's head filter is
  // case-sensitive on it and everything here has been lower-cased.
  const { defaultBranch: base, ownerLogin } = await github.repoInfo(installationId, owner, repo);

  const existing = await github.openPullRequest(installationId, owner, repo, branch, ownerLogin);
  if (existing !== undefined) {
    return { ...existing, created: false, branch, path: KRS_PATH };
  }

  // The branch may exist from a delivery whose pull request was closed, or
  // from one that died part-way. Reusing it is right when it still points at
  // this commit; when it points somewhere else, the pull request's diff would
  // silently become that branch's whole history against the base, under a
  // title promising one generated file.
  const branchAt = await github.refSha(installationId, owner, repo, ref);
  if (branchAt !== undefined && branchAt !== sha) {
    throw new DeliveryFailed(`${branch} already exists and does not point at ${sha.slice(0, 7)}`);
  }
  let createdBranch = false;
  if (branchAt === undefined) {
    try {
      await github.createRef(installationId, owner, repo, ref, sha);
      createdBranch = true;
    } catch (cause) {
      if (!(cause instanceof GitHubApiError) || cause.status !== 422) throw cause;
      // 422 is "reference already exists" *or* a ruleset refusing branch
      // creation, and the body that would tell them apart is deliberately
      // dropped. Ask instead: if the ref is there, we lost a race and that is
      // the state we wanted; if it is not, the rule refused and saying so
      // beats a downstream 404 on a branch that does not exist.
      if ((await github.refSha(installationId, owner, repo, ref)) === undefined) throw cause;
    }
  }

  try {
    const currentFile = await github.fileSha(installationId, owner, repo, KRS_PATH, branch);
    await github.putFile(installationId, owner, repo, {
      path: KRS_PATH,
      content: input.krs,
      message: `docs: add a generated architecture model for ${sha.slice(0, 7)}`,
      branch,
      ...(currentFile === undefined ? {} : { sha: currentFile }),
    });

    const created = await github.createPullRequest(installationId, owner, repo, {
      title: `docs: generated architecture model (${sha.slice(0, 7)})`,
      head: branch,
      base,
      body: pullRequestBody(input),
    });
    return { ...created, created: true, branch, path: KRS_PATH };
  } catch (cause) {
    // A branch we pushed with no pull request attached is litter in someone
    // else's repository that nothing will ever tell them about, and the next
    // commit adds another. Only clean up what this call created: a branch
    // that was already there belongs to an earlier delivery.
    if (createdBranch) {
      try {
        await github.deleteRef(installationId, owner, repo, ref);
      } catch {
        // Leaving the branch is the lesser problem; the original failure is
        // the one worth reporting.
      }
    }
    throw cause;
  }
}
