import { describe, expect, it } from "vitest";
import {
  classify,
  parseAnnouncedWaitMs,
  parseNoticeHeadSha,
  type CodeRabbitComment,
  type Snapshot,
} from "./review-state.ts";

const HEAD = "bd54f5b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6";
const OLD = "88c0551aa1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6";

function snapshot(over: Partial<Snapshot>): Snapshot {
  return {
    headSha: HEAD,
    since: "2026-09-15T14:00:00Z",
    now: "2026-09-15T14:30:00Z",
    reviews: [],
    comments: [],
    threads: [],
    ...over,
  };
}

/** Shape of the summary comment once an automatic review hits the allowance (#2843). */
function limitNotice(updatedAt: string, minutes: number, head = HEAD): CodeRabbitComment {
  return {
    createdAt: "2026-09-15T12:56:11Z",
    updatedAt,
    body: [
      "<!-- This is an auto-generated comment: summarize by coderabbit.ai -->",
      "<!-- This is an auto-generated comment: rate limited by coderabbit.ai -->",
      "> ## Review limit reached",
      `> **Next included review available in ${minutes} minutes.**`,
      `> Reviewing files that changed from the base of the PR and between 57394fc1a482adeda0c4de91868a056800414445 and ${head}.`,
      "<!-- end of auto-generated comment: rate limited by coderabbit.ai -->",
    ].join("\n"),
  };
}

/** Reply to `@coderabbitai review`, as CodeRabbit edits it in place (#2798). */
function commandReply(at: string, outcome: "limited" | "finished" | "running"): CodeRabbitComment {
  const details = {
    limited: "<summary>⚠️ Action not completed</summary>\n\nReview rate limited.",
    finished: "<summary>✅ Action performed</summary>\n\nReview finished.",
    running: "Review triggered.",
  }[outcome];
  return {
    createdAt: at,
    updatedAt: at,
    body: `<!-- This is an auto-generated reply by CodeRabbit -->\n<!-- CodeRabbit review command invocation: v2:abc -->\n${details}`,
  };
}

describe("classify", () => {
  it("is approved when the latest review approves the head and nothing is open", () => {
    const state = classify(
      snapshot({
        reviews: [{ state: "APPROVED", commitId: HEAD, submittedAt: "2026-09-15T14:13:33Z" }],
        threads: [
          {
            isResolved: true,
            lastCommentAt: "2026-09-15T14:07:10Z",
            lastCommentByCodeRabbit: true,
          },
        ],
      }),
    );
    expect(state).toEqual({ kind: "approved" });
  });

  it("does not call an approval of an older commit approved", () => {
    const state = classify(
      snapshot({
        reviews: [{ state: "APPROVED", commitId: OLD, submittedAt: "2026-09-15T13:00:00Z" }],
      }),
    );
    expect(state).toEqual({ kind: "waiting" });
  });

  it("waits for the burst to go quiet before reading a round (#2840)", () => {
    // Thread reply, then COMMENTED reviews seconds before the approval lands.
    const burst = snapshot({
      reviews: [
        { state: "CHANGES_REQUESTED", commitId: OLD, submittedAt: "2026-09-15T12:59:52Z" },
        { state: "COMMENTED", commitId: HEAD, submittedAt: "2026-09-15T14:11:24Z" },
        { state: "COMMENTED", commitId: HEAD, submittedAt: "2026-09-15T14:13:28Z" },
      ],
      threads: [
        { isResolved: false, lastCommentAt: "2026-09-15T14:13:28Z", lastCommentByCodeRabbit: true },
      ],
      now: "2026-09-15T14:13:30Z",
    });
    expect(classify(burst)).toEqual({ kind: "in_progress" });
    expect(classify({ ...burst, now: "2026-09-15T14:20:00Z" })).toEqual({
      kind: "changes",
      unresolved: 1,
    });
  });

  it("reports changes when CodeRabbit reviewed the head after the last action", () => {
    const state = classify(
      snapshot({
        reviews: [
          { state: "CHANGES_REQUESTED", commitId: HEAD, submittedAt: "2026-09-15T14:05:00Z" },
        ],
        threads: [
          {
            isResolved: false,
            lastCommentAt: "2026-09-15T14:05:00Z",
            lastCommentByCodeRabbit: true,
          },
          {
            isResolved: false,
            lastCommentAt: "2026-09-15T14:05:00Z",
            lastCommentByCodeRabbit: true,
          },
          {
            isResolved: true,
            lastCommentAt: "2026-09-15T13:00:00Z",
            lastCommentByCodeRabbit: false,
          },
        ],
      }),
    );
    expect(state).toEqual({ kind: "changes", unresolved: 2 });
  });

  it("counts a CodeRabbit answer inside a thread as a response to a reply-only round", () => {
    const state = classify(
      snapshot({
        reviews: [
          { state: "CHANGES_REQUESTED", commitId: HEAD, submittedAt: "2026-09-15T13:00:00Z" },
        ],
        threads: [
          {
            isResolved: false,
            lastCommentAt: "2026-09-15T14:07:10Z",
            lastCommentByCodeRabbit: true,
          },
        ],
      }),
    );
    expect(state).toEqual({ kind: "changes", unresolved: 1 });
  });

  it("is waiting when the only CodeRabbit output predates the last action", () => {
    const state = classify(
      snapshot({
        reviews: [
          { state: "CHANGES_REQUESTED", commitId: HEAD, submittedAt: "2026-09-15T13:00:00Z" },
        ],
        threads: [
          {
            isResolved: false,
            lastCommentAt: "2026-09-15T13:00:00Z",
            lastCommentByCodeRabbit: true,
          },
        ],
      }),
    );
    expect(state).toEqual({ kind: "waiting" });
  });

  it("is stalled when CodeRabbit answered, nothing is open, but it did not approve", () => {
    const state = classify(
      snapshot({
        reviews: [
          { state: "CHANGES_REQUESTED", commitId: HEAD, submittedAt: "2026-09-15T14:05:00Z" },
        ],
        threads: [
          {
            isResolved: true,
            lastCommentAt: "2026-09-15T14:05:00Z",
            lastCommentByCodeRabbit: true,
          },
        ],
      }),
    );
    expect(state).toEqual({ kind: "stalled" });
  });

  describe("rate limit", () => {
    // #2841: the last review covers an older commit, the push after it hit the limit.
    const limited = snapshot({
      since: "2026-09-15T14:26:00Z",
      reviews: [
        { state: "CHANGES_REQUESTED", commitId: "058da51", submittedAt: "2026-09-15T14:15:46Z" },
        { state: "COMMENTED", commitId: OLD, submittedAt: "2026-09-15T14:20:00Z" },
      ],
      comments: [limitNotice("2026-09-15T14:27:57Z", 39)],
      now: "2026-09-15T14:30:00Z",
    });

    it("waits until the announced ready time", () => {
      expect(classify(limited)).toEqual({
        kind: "rate_limited",
        readyAt: "2026-09-15T15:06:57.000Z",
      });
    });

    it("asks for the re-request once the ready time has passed", () => {
      expect(classify({ ...limited, now: "2026-09-15T15:07:00Z" })).toEqual({
        kind: "limit_elapsed",
        readyAt: "2026-09-15T15:06:57.000Z",
      });
    });

    it("ignores a notice about a different head commit", () => {
      const other = { ...limited, comments: [limitNotice("2026-09-15T14:27:57Z", 39, "0123abc")] };
      expect(classify(other)).toEqual({ kind: "waiting" });
    });

    it("ignores a notice the author already answered with a re-request", () => {
      const answered = { ...limited, since: "2026-09-15T15:07:30Z", now: "2026-09-15T15:08:00Z" };
      expect(classify(answered)).toEqual({ kind: "waiting" });
    });

    it("backs off by the fixed interval after a bare `Review rate limited.` reply", () => {
      const state = classify(
        snapshot({
          since: "2026-09-15T15:07:30Z",
          comments: [commandReply("2026-09-15T15:07:40Z", "limited")],
          now: "2026-09-15T15:08:00Z",
        }),
      );
      expect(state).toEqual({ kind: "rate_limited", readyAt: "2026-09-15T15:22:40.000Z" });
    });

    it("treats an accepted re-request as running even while the old notice is still shown", () => {
      const state = classify({
        ...limited,
        since: "2026-09-15T15:07:30Z",
        comments: [
          limitNotice("2026-09-15T15:07:35Z", 39),
          commandReply("2026-09-15T15:07:36Z", "running"),
        ],
        now: "2026-09-15T15:08:00Z",
      });
      expect(state).toEqual({ kind: "in_progress" });
    });

    it("lets a review of the head supersede the notice", () => {
      const state = classify({
        ...limited,
        reviews: [{ state: "APPROVED", commitId: HEAD, submittedAt: "2026-09-15T15:10:00Z" }],
        comments: [
          limitNotice("2026-09-15T14:27:57Z", 39),
          commandReply("2026-09-15T15:07:36Z", "finished"),
        ],
        now: "2026-09-15T15:20:00Z",
      });
      expect(state).toEqual({ kind: "approved" });
    });
  });
});

describe("parseAnnouncedWaitMs", () => {
  it("reads minutes and hours", () => {
    expect(parseAnnouncedWaitMs("Next included review available in 39 minutes.")).toBe(39 * 60_000);
    expect(parseAnnouncedWaitMs("available in 1 minute")).toBe(60_000);
    expect(parseAnnouncedWaitMs("available in 1 hour and 5 minutes")).toBe(65 * 60_000);
  });

  it("is null when no duration is named", () => {
    expect(parseAnnouncedWaitMs("Review limit reached")).toBeNull();
  });
});

describe("parseNoticeHeadSha", () => {
  it("reads the head of the reviewed range", () => {
    expect(
      parseNoticeHeadSha(
        "between 0462d16891a04c63042b47f8494146d75e91d404 and 76760ff79a099fcf2ef091187a4dfaa5c19c6f73.",
      ),
    ).toBe("76760ff79a099fcf2ef091187a4dfaa5c19c6f73");
  });
});
