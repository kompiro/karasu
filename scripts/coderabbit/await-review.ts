/* eslint-disable no-console -- CLI entry point; stdout/stderr reporting is the whole job */
import { execFileSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import {
  ACTIONABLE_KINDS,
  CODERABBIT_LOGINS,
  DEFAULT_CLASSIFY_OPTIONS,
  classify,
  type CodeRabbitComment,
  type CodeRabbitReview,
  type ReviewState,
  type ReviewThread,
  type Snapshot,
} from "./review-state.ts";

// Reads a PR's CodeRabbit state and, unless `--once`, polls until the author has
// something to act on (Issue #2846). Read-only: it never posts, pushes or
// resolves — `.claude/skills/coderabbit-converge` does that.
//
//   pnpm exec tsx scripts/coderabbit/await-review.ts <pr> --once
//   pnpm exec tsx scripts/coderabbit/await-review.ts <pr> --since <iso> [--timeout-min 30] [--limit-budget-min 120]
//
// Invoke it through `pnpm exec tsx`, not a `pnpm run` alias: flags after `--`
// do not reliably reach the script that way (TPL-2046).
//
// stdout is one JSON line: { pr, headSha, since, state, waitedMin, limitWaitedMin, outcome }.
// `outcome` is the state kind, or `timeout` / `limit_budget_exceeded` when a
// budget ran out first (the last observed `state` is still reported).

const REPO = "kompiro/karasu";
const POLL_MS = 60_000;

function gh(args: string[]): string {
  return execFileSync("gh", args, { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 });
}

/** `gh api --paginate --slurp` wraps each page in an outer array. */
function ghPages<T>(args: string[]): T[] {
  return JSON.parse(gh(["api", "--paginate", "--slurp", ...args])) as T[];
}

interface RestReview {
  user: { login: string } | null;
  state: string;
  commit_id: string;
  submitted_at: string | null;
}

interface RestComment {
  user: { login: string } | null;
  body: string;
  created_at: string;
  updated_at: string;
}

interface ThreadPage {
  data: {
    repository: {
      pullRequest: {
        reviewThreads: {
          nodes: {
            isResolved: boolean;
            comments: { nodes: { author: { login: string } | null; createdAt: string }[] };
          }[];
        };
      };
    };
  };
}

const THREADS_QUERY = `query($owner: String!, $name: String!, $pr: Int!, $endCursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $pr) {
      reviewThreads(first: 100, after: $endCursor) {
        nodes {
          isResolved
          comments(last: 1) { nodes { author { login } createdAt } }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
}`;

const byCodeRabbit = (login: string | undefined): boolean =>
  login !== undefined && CODERABBIT_LOGINS.has(login);

interface PrHead {
  headSha: string;
  headCommittedAt: string;
}

function fetchHead(pr: number): PrHead {
  const view = JSON.parse(
    gh(["pr", "view", String(pr), "--repo", REPO, "--json", "headRefOid,commits"]),
  ) as {
    headRefOid: string;
    commits: { oid: string; committedDate: string }[];
  };
  const head = view.commits.find((c) => c.oid === view.headRefOid);
  return {
    headSha: view.headRefOid,
    headCommittedAt: head?.committedDate ?? new Date(0).toISOString(),
  };
}

function fetchSnapshot(pr: number, since: string | undefined): Snapshot {
  const { headSha, headCommittedAt } = fetchHead(pr);
  const [owner, name] = REPO.split("/");

  const reviews: CodeRabbitReview[] = ghPages<RestReview[]>([`repos/${REPO}/pulls/${pr}/reviews`])
    .flat()
    .filter((r) => byCodeRabbit(r.user?.login) && r.submitted_at !== null)
    .map((r) => ({ state: r.state, commitId: r.commit_id, submittedAt: r.submitted_at as string }));

  const comments: CodeRabbitComment[] = ghPages<RestComment[]>([
    `repos/${REPO}/issues/${pr}/comments`,
  ])
    .flat()
    .filter((c) => byCodeRabbit(c.user?.login))
    .map((c) => ({ body: c.body, createdAt: c.created_at, updatedAt: c.updated_at }));

  const threads: ReviewThread[] = ghPages<ThreadPage>([
    "graphql",
    "-F",
    `owner=${owner}`,
    "-F",
    `name=${name}`,
    "-F",
    `pr=${pr}`,
    "-f",
    `query=${THREADS_QUERY}`,
  ]).flatMap((page) =>
    page.data.repository.pullRequest.reviewThreads.nodes.map((t) => {
      const last = t.comments.nodes.at(-1);
      return {
        isResolved: t.isResolved,
        lastCommentAt: last?.createdAt ?? new Date(0).toISOString(),
        lastCommentByCodeRabbit: byCodeRabbit(last?.author?.login),
      };
    }),
  );

  return {
    headSha,
    since: since ?? headCommittedAt,
    now: new Date().toISOString(),
    reviews,
    comments,
    threads,
  };
}

interface Args {
  pr: number;
  since?: string;
  once: boolean;
  timeoutMin: number;
  limitBudgetMin: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { pr: Number.NaN, once: false, timeoutMin: 30, limitBudgetMin: 120 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--once") args.once = true;
    else if (a === "--since") args.since = argv[++i];
    else if (a === "--timeout-min") args.timeoutMin = Number(argv[++i]);
    else if (a === "--limit-budget-min") args.limitBudgetMin = Number(argv[++i]);
    else if (/^\d+$/.test(a)) args.pr = Number(a);
    else throw new Error(`unknown argument: ${a}`);
  }
  if (!Number.isInteger(args.pr))
    throw new Error("usage: await-review.ts <pr> [--once] [--since <iso>] ...");
  if (args.since !== undefined && Number.isNaN(Date.parse(args.since))) {
    throw new Error(`--since is not a timestamp: ${args.since}`);
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  let waitedMs = 0;
  let limitWaitedMs = 0;

  const report = (snap: Snapshot, state: ReviewState, outcome: string) => {
    console.log(
      JSON.stringify({
        pr: args.pr,
        headSha: snap.headSha,
        since: snap.since,
        state,
        waitedMin: Math.round(waitedMs / 60_000),
        limitWaitedMin: Math.round(limitWaitedMs / 60_000),
        outcome,
      }),
    );
  };

  for (;;) {
    const snap = fetchSnapshot(args.pr, args.since);
    const state = classify(snap, DEFAULT_CLASSIFY_OPTIONS);

    if (args.once || ACTIONABLE_KINDS.has(state.kind)) return report(snap, state, state.kind);

    if (state.kind === "rate_limited") {
      if (limitWaitedMs >= args.limitBudgetMin * 60_000)
        return report(snap, state, "limit_budget_exceeded");
      // Sleep to the announced time rather than polling through it; re-check a
      // little early in case the review is re-requested from elsewhere.
      const untilReady = Math.max(Date.parse(state.readyAt) - Date.now(), 0);
      const step = Math.min(untilReady + 5_000, 10 * POLL_MS);
      console.error(
        `#${args.pr} rate limited until ${state.readyAt}; sleeping ${Math.round(step / 1000)}s`,
      );
      await sleep(step);
      limitWaitedMs += step;
      continue;
    }

    if (waitedMs >= args.timeoutMin * 60_000) return report(snap, state, "timeout");
    console.error(`#${args.pr} ${state.kind}; polling again in ${POLL_MS / 1000}s`);
    await sleep(POLL_MS);
    waitedMs += POLL_MS;
  }
}

if (process.argv[1]?.endsWith("await-review.ts")) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(2);
  });
}
