// Classifies where a PR stands in its CodeRabbit rounds (Issue #2846).
//
// `docs/process.md` has the PR author run CodeRabbit's rounds until it approves.
// The rounds are driven by `.claude/skills/coderabbit-converge`; this module is
// the deterministic half of that loop: given a snapshot of what CodeRabbit has
// posted, it says whether the author has something to act on yet. It never
// reads a comment body as an instruction — bodies are only matched against the
// fixed markers below.
//
// Pure: `await-review.ts` fetches the snapshot and owns the clock.

/** REST reports the App as `coderabbitai[bot]`, GraphQL as `coderabbitai`. */
export const CODERABBIT_LOGINS: ReadonlySet<string> = new Set([
  "coderabbitai",
  "coderabbitai[bot]",
  "coderabbit[bot]",
]);

/**
 * Written into the PR summary comment when an automatic review hits the
 * allowance, together with "Next included review available in N minutes".
 * CodeRabbit does not retry once the allowance comes back (#2835, #2836).
 */
const RATE_LIMIT_MARKER = "rate limited by coderabbit.ai";
/** The bare answer to an `@coderabbitai review` command that hit the allowance. */
const COMMAND_RATE_LIMITED = "Review rate limited.";
/** Marks a reply to an `@coderabbitai review` / `resolve` command. */
const COMMAND_REPLY_MARKER = "CodeRabbit review command invocation";
/** A command reply is edited in place once the command settles. */
const COMMAND_SETTLED = ["Action performed", "Action not completed"];
/** Signals CodeRabbit posts while a review is still running. */
const IN_PROGRESS_MARKERS = [
  "review in progress by coderabbit.ai",
  "Come back again in a few minutes",
];

export interface CodeRabbitReview {
  state: string;
  commitId: string;
  submittedAt: string;
  body: string;
}

/**
 * CodeRabbit files an answer inside a review thread as a review of its own: state
 * `COMMENTED`, empty body. It says nothing about the commit, so it must not stand
 * in for the review of a push (#2847: one landed two seconds before the
 * rate-limit notice for that push). A real review is `CHANGES_REQUESTED`,
 * `APPROVED`, or `COMMENTED` with a body (findings outside the diff only).
 * `DISMISSED` is an approval GitHub withdrew when a later push arrived.
 */
function isCommitReview(r: CodeRabbitReview): boolean {
  if (r.state === "DISMISSED") return false;
  return !(r.state === "COMMENTED" && r.body.trim() === "");
}

/** A top-level PR comment by CodeRabbit (summary, command reply). */
export interface CodeRabbitComment {
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewThread {
  isResolved: boolean;
  /** Newest comment in the thread, used to see CodeRabbit answering in it. */
  lastCommentAt: string;
  lastCommentByCodeRabbit: boolean;
}

export interface Snapshot {
  headSha: string;
  /**
   * The author's last action on the PR — a push, a thread reply, a posted
   * command. Only CodeRabbit output at or after this instant answers it.
   */
  since: string;
  now: string;
  /** CodeRabbit's reviews only. */
  reviews: CodeRabbitReview[];
  /** CodeRabbit's top-level comments only. */
  comments: CodeRabbitComment[];
  /** Every review thread on the PR, whoever opened it. */
  threads: ReviewThread[];
}

export interface ClassifyOptions {
  /**
   * CodeRabbit answers one round as a burst — thread replies, COMMENTED
   * reviews, then APPROVED, seconds apart (#2840). The round is read only once
   * CodeRabbit has been silent this long.
   */
  quietMs: number;
  /** Wait after a bare `Review rate limited.` reply that names no ready time. */
  fallbackBackoffMs: number;
}

export const DEFAULT_CLASSIFY_OPTIONS: ClassifyOptions = {
  quietMs: 90_000,
  fallbackBackoffMs: 15 * 60_000,
};

export type ReviewState =
  /** Latest CodeRabbit review approves the head commit and no thread is open. */
  | { kind: "approved" }
  /** CodeRabbit answered the last action and threads are open: read and act. */
  | { kind: "changes"; unresolved: number }
  /** CodeRabbit answered, nothing is open, but it has not approved. */
  | { kind: "stalled" }
  /** Rate limited; the announced ready time has passed: re-request once. */
  | { kind: "limit_elapsed"; readyAt: string }
  /** Rate limited; wait until `readyAt`. */
  | { kind: "rate_limited"; readyAt: string }
  /** A review is running, or CodeRabbit's burst has not gone quiet yet. */
  | { kind: "in_progress" }
  /** Nothing from CodeRabbit since the last action. */
  | { kind: "waiting" };

/** States the author acts on; `await-review.ts` stops polling at these. */
export const ACTIONABLE_KINDS: ReadonlySet<ReviewState["kind"]> = new Set([
  "approved",
  "changes",
  "stalled",
  "limit_elapsed",
]);

const ms = (iso: string): number => Date.parse(iso);
const iso = (t: number): string => new Date(t).toISOString();

/**
 * "Next included review available in 39 minutes." → 39 minutes in ms. Accepts
 * an hour component in case the wait is announced that way. Null when the
 * notice names no duration.
 */
export function parseAnnouncedWaitMs(body: string): number | null {
  const m = /available in\s+(?:(\d+)\s+hours?)?(?:\s*(?:and\s+)?(\d+)\s+minutes?)?/i.exec(body);
  if (!m || (m[1] === undefined && m[2] === undefined)) return null;
  return (Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0)) * 60_000;
}

/** "...between <base> and <head>." in the notice's Commits section → head. */
export function parseNoticeHeadSha(body: string): string | null {
  const m = /between\s+[0-9a-f]{7,40}\s+and\s+([0-9a-f]{7,40})/i.exec(body);
  return m ? m[1] : null;
}

/**
 * `notAfter`: the latest commit review of the head. A notice older than that was
 * followed by the review it announced, and a notice older than `since` was
 * answered by the author's re-request; neither describes the PR any more.
 */
function rateLimitReadyAt(s: Snapshot, opts: ClassifyOptions, notAfter: number): number | null {
  const since = ms(s.since);
  let readyAt: number | null = null;

  for (const c of s.comments) {
    if (ms(c.updatedAt) < since || ms(c.updatedAt) <= notAfter) continue;

    if (c.body.includes(RATE_LIMIT_MARKER)) {
      const noticeHead = parseNoticeHeadSha(c.body);
      if (
        noticeHead !== null &&
        !s.headSha.startsWith(noticeHead) &&
        !noticeHead.startsWith(s.headSha)
      ) {
        continue;
      }
      const wait = parseAnnouncedWaitMs(c.body) ?? opts.fallbackBackoffMs;
      readyAt = Math.max(readyAt ?? 0, ms(c.updatedAt) + wait);
    } else if (c.body.includes(COMMAND_REPLY_MARKER) && c.body.includes(COMMAND_RATE_LIMITED)) {
      readyAt = Math.max(readyAt ?? 0, ms(c.updatedAt) + opts.fallbackBackoffMs);
    }
  }
  return readyAt;
}

function reviewRunning(s: Snapshot): boolean {
  const since = ms(s.since);
  return s.comments.some((c) => {
    if (ms(c.updatedAt) < since) return false;
    if (IN_PROGRESS_MARKERS.some((m) => c.body.includes(m))) return true;
    // `@coderabbitai review` accepted: the reply stays unsettled until it ends.
    return (
      c.body.includes(COMMAND_REPLY_MARKER) && !COMMAND_SETTLED.some((m) => c.body.includes(m))
    );
  });
}

/**
 * Findings CodeRabbit can only put in a review body: those outside the diff, and
 * nitpicks. No review thread tracks them, and CodeRabbit approves regardless
 * (#2847: "Outside diff range comments (2)" five seconds before APPROVED), so the
 * thread count alone would end a round with them unread.
 */
const BODY_FINDING_SECTIONS = [
  /Outside diff range comments \((\d+)\)/,
  /Nitpick comments \((\d+)\)/,
];

/** Body-only findings in the reviews of the head filed since the last action. */
export function bodyFindingCount(s: Snapshot): number {
  const since = ms(s.since);
  return (
    s.reviews
      // A dismissed review's findings were set aside by whoever dismissed it.
      .filter((r) => isCommitReview(r) && r.commitId === s.headSha && ms(r.submittedAt) >= since)
      .reduce(
        (n, r) =>
          n + BODY_FINDING_SECTIONS.reduce((m, re) => m + Number(re.exec(r.body)?.[1] ?? 0), 0),
        0,
      )
  );
}

export function classify(
  s: Snapshot,
  opts: ClassifyOptions = DEFAULT_CLASSIFY_OPTIONS,
): ReviewState {
  const since = ms(s.since);
  const now = ms(s.now);
  const unresolved = s.threads.filter((t) => !t.isResolved).length;
  const reviews = [...s.reviews].sort((a, b) => ms(a.submittedAt) - ms(b.submittedAt));
  const onHead = (r: CodeRabbitReview) => r.commitId === s.headSha;
  const commitReviews = reviews.filter(isCommitReview);
  const latest = commitReviews.at(-1);

  if (latest && onHead(latest) && latest.state === "APPROVED" && unresolved === 0) {
    return { kind: "approved" };
  }

  const headReviews = commitReviews.filter(onHead);
  const answeredByReview = headReviews.some((r) => ms(r.submittedAt) >= since);
  // An answer in a thread settles a reply-only round. After a push it may be
  // CodeRabbit replying to what was posted before the push, so it counts only
  // once the head itself has been reviewed.
  const answeredInThread =
    headReviews.length > 0 &&
    s.threads.some((t) => t.lastCommentByCodeRabbit && ms(t.lastCommentAt) >= since);

  // Checked before the limit: an accepted re-request can leave the old notice in
  // the summary until the review it started has finished.
  if (reviewRunning(s)) return { kind: "in_progress" };

  const lastHeadReview = Math.max(-Infinity, ...headReviews.map((r) => ms(r.submittedAt)));
  const readyAt = rateLimitReadyAt(s, opts, lastHeadReview);
  if (readyAt !== null) {
    return now >= readyAt
      ? { kind: "limit_elapsed", readyAt: iso(readyAt) }
      : { kind: "rate_limited", readyAt: iso(readyAt) };
  }

  if (!answeredByReview && !answeredInThread) return { kind: "waiting" };

  const lastActivity = Math.max(
    ...reviews.map((r) => ms(r.submittedAt)),
    ...s.comments.map((c) => ms(c.updatedAt)),
    ...s.threads.filter((t) => t.lastCommentByCodeRabbit).map((t) => ms(t.lastCommentAt)),
  );
  if (now - lastActivity < opts.quietMs) return { kind: "in_progress" };

  return unresolved > 0 ? { kind: "changes", unresolved } : { kind: "stalled" };
}
