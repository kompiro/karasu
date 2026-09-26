import { describe, expect, it } from "vitest";
import {
  bodyFindingCount,
  bodyFindingIds,
  classify,
  parseAnnouncedWaitMs,
  parseNoticeHeadSha,
  unmarkedBodyFindings,
  type CodeRabbitComment,
  type Snapshot,
} from "./review-state.ts";

const HEAD = "bd54f5b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6";
const OLD = "88c0551aa1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6";
/** Body of a COMMENTED review that carries only findings outside the diff. */
const OUTSIDE_DIFF = "> [!CAUTION]\n> Some comments are outside the diff";

function snapshot(over: Partial<Snapshot>): Snapshot {
  return {
    headSha: HEAD,
    since: "2026-09-15T14:00:00Z",
    now: "2026-09-15T14:30:00Z",
    reviews: [],
    comments: [],
    authorComments: [],
    threads: [],
    ...over,
  };
}

/** The marker CodeRabbit closes one body finding with, as it appears in a review. */
const finding = (id: string): string => `> <!-- cr-comment:v1:${id} -->`;

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
        reviews: [
          { state: "APPROVED", commitId: HEAD, submittedAt: "2026-09-15T14:13:33Z", body: "" },
        ],
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
        reviews: [
          { state: "APPROVED", commitId: OLD, submittedAt: "2026-09-15T13:00:00Z", body: "" },
        ],
      }),
    );
    expect(state).toEqual({ kind: "waiting" });
  });

  it("waits for the burst to go quiet before reading a round (#2840)", () => {
    // A review with outside-diff findings, then a thread answer seconds later.
    const burst = snapshot({
      reviews: [
        {
          state: "CHANGES_REQUESTED",
          commitId: OLD,
          submittedAt: "2026-09-15T12:59:52Z",
          body: "",
        },
        {
          state: "COMMENTED",
          commitId: HEAD,
          submittedAt: "2026-09-15T14:11:24Z",
          body: OUTSIDE_DIFF,
        },
        { state: "COMMENTED", commitId: HEAD, submittedAt: "2026-09-15T14:13:28Z", body: "" },
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
          {
            state: "CHANGES_REQUESTED",
            commitId: HEAD,
            submittedAt: "2026-09-15T14:05:00Z",
            body: "",
          },
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
          {
            state: "CHANGES_REQUESTED",
            commitId: HEAD,
            submittedAt: "2026-09-15T13:00:00Z",
            body: "",
          },
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
          {
            state: "CHANGES_REQUESTED",
            commitId: HEAD,
            submittedAt: "2026-09-15T13:00:00Z",
            body: "",
          },
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
          {
            state: "CHANGES_REQUESTED",
            commitId: HEAD,
            submittedAt: "2026-09-15T14:05:00Z",
            body: "",
          },
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

  it("stays approved when CodeRabbit answers a thread after approving", () => {
    const state = classify(
      snapshot({
        reviews: [
          { state: "APPROVED", commitId: HEAD, submittedAt: "2026-09-15T14:13:33Z", body: "" },
          { state: "COMMENTED", commitId: HEAD, submittedAt: "2026-09-15T14:20:00Z", body: "" },
        ],
      }),
    );
    expect(state).toEqual({ kind: "approved" });
  });

  it("does not read a thread answer as the review of a push that has none yet", () => {
    const state = classify(
      snapshot({
        reviews: [
          {
            state: "CHANGES_REQUESTED",
            commitId: OLD,
            submittedAt: "2026-09-15T13:50:00Z",
            body: "x",
          },
          { state: "COMMENTED", commitId: HEAD, submittedAt: "2026-09-15T14:00:16Z", body: "" },
        ],
        threads: [
          {
            isResolved: true,
            lastCommentAt: "2026-09-15T14:00:16Z",
            lastCommentByCodeRabbit: true,
          },
        ],
      }),
    );
    expect(state).toEqual({ kind: "waiting" });
  });

  describe("rate limit", () => {
    // #2841: the last review covers an older commit, the push after it hit the limit.
    const limited = snapshot({
      since: "2026-09-15T14:26:00Z",
      reviews: [
        {
          state: "CHANGES_REQUESTED",
          commitId: "058da51",
          submittedAt: "2026-09-15T14:15:46Z",
          body: "",
        },
        { state: "COMMENTED", commitId: OLD, submittedAt: "2026-09-15T14:20:00Z", body: "" },
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

    it("is not hidden by a thread answer filed next to the notice (#2847)", () => {
      // The push at 15:31:13 hit the limit; CodeRabbit had just answered a thread
      // about the previous round, which GitHub records as a review of the head.
      const base = snapshot({
        since: "2026-09-15T15:31:13Z",
        reviews: [
          {
            state: "CHANGES_REQUESTED",
            commitId: OLD,
            submittedAt: "2026-09-15T15:25:40Z",
            body: "x",
          },
          { state: "COMMENTED", commitId: HEAD, submittedAt: "2026-09-15T15:31:29Z", body: "" },
        ],
        threads: [
          {
            isResolved: true,
            lastCommentAt: "2026-09-15T15:31:29Z",
            lastCommentByCodeRabbit: true,
          },
        ],
        now: "2026-09-15T15:33:37Z",
      });
      for (const noticeAt of ["2026-09-15T15:31:31Z", "2026-09-15T15:31:20Z"]) {
        const state = classify({ ...base, comments: [limitNotice(noticeAt, 20)] });
        expect(state.kind).toBe("rate_limited");
      }
    });

    it("lets a review of the head supersede the notice", () => {
      const state = classify({
        ...limited,
        reviews: [
          { state: "APPROVED", commitId: HEAD, submittedAt: "2026-09-15T15:10:00Z", body: "" },
        ],
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

describe("bodyFindingCount", () => {
  it("counts an outside-diff and a nitpick finding, by the id each one carries (#2847)", () => {
    const s = snapshot({
      since: "2026-09-15T16:07:16Z",
      reviews: [
        {
          state: "COMMENTED",
          commitId: HEAD,
          submittedAt: "2026-09-15T16:12:50Z",
          body: [
            "**⚠️ Outside diff range comments (2)**",
            finding("aaa1"),
            finding("aaa2"),
            "<summary>🧹 Nitpick comments (1)</summary>",
            finding("bbb1"),
          ].join("\n"),
        },
        { state: "APPROVED", commitId: HEAD, submittedAt: "2026-09-15T16:12:55Z", body: "" },
      ],
    });
    expect(bodyFindingIds(s).sort()).toEqual(["aaa1", "aaa2", "bbb1"]);
    expect(bodyFindingCount(s)).toBe(3);
    // The findings ride along an approval, which is why the count is reported
    // beside the outcome rather than gating it.
    expect(classify({ ...s, now: "2026-09-15T16:20:00Z" })).toEqual({ kind: "approved" });
  });

  it("keeps a finding once the push it was filed against stops being the head (#2909)", () => {
    const s = snapshot({
      // Both the commit and the round have moved on since the finding was filed.
      since: "2026-09-24T11:23:49Z",
      reviews: [
        {
          state: "CHANGES_REQUESTED",
          commitId: OLD,
          submittedAt: "2026-09-24T09:58:30Z",
          body: `**⚠️ Outside diff range comments (1)**\n${finding("61e81b7d")}`,
        },
        { state: "APPROVED", commitId: HEAD, submittedAt: "2026-09-24T12:16:53Z", body: "" },
      ],
    });
    expect(bodyFindingIds(s)).toEqual(["61e81b7d"]);
  });

  it("retires a finding the author answered by id, and only that one", () => {
    const s = snapshot({
      reviews: [
        {
          state: "COMMENTED",
          commitId: HEAD,
          submittedAt: "2026-09-15T14:05:00Z",
          body: `**⚠️ Outside diff range comments (2)**\n${finding("aaa1")}\n${finding("aaa2")}`,
        },
      ],
      authorComments: [
        "Fixed the first one in 9b66575f: the renderer now reads `hop.ry`. <!-- cr-comment:v1:aaa1 -->",
      ],
    });
    expect(bodyFindingIds(s)).toEqual(["aaa2"]);
    expect(bodyFindingCount(s)).toBe(1);
  });

  it("counts a finding repeated across rounds once", () => {
    const repeated = `**⚠️ Outside diff range comments (1)**\n${finding("aaa1")}`;
    const s = snapshot({
      reviews: [
        {
          state: "CHANGES_REQUESTED",
          commitId: OLD,
          submittedAt: "2026-09-15T15:00:00Z",
          body: repeated,
        },
        {
          state: "CHANGES_REQUESTED",
          commitId: HEAD,
          submittedAt: "2026-09-15T16:00:00Z",
          body: repeated,
        },
      ],
    });
    expect(bodyFindingIds(s)).toEqual(["aaa1"]);
  });

  it("does not let CodeRabbit's own echo of an id stand in for an answer", () => {
    const s = snapshot({
      reviews: [
        {
          state: "COMMENTED",
          commitId: HEAD,
          submittedAt: "2026-09-15T15:00:00Z",
          body: `**⚠️ Outside diff range comments (1)**\n${finding("aaa1")}`,
        },
      ],
      // The summary comment repeats the marker of everything it filed.
      comments: [
        {
          createdAt: "2026-09-15T15:00:01Z",
          updatedAt: "2026-09-15T15:00:01Z",
          body: `<!-- This is an auto-generated comment: summarize by coderabbit.ai -->\n${finding("aaa1")}`,
        },
      ],
    });
    expect(bodyFindingIds(s)).toEqual(["aaa1"]);
  });

  it("still counts a declared finding that carries no id, which no comment can retire", () => {
    const s = snapshot({
      reviews: [
        {
          state: "COMMENTED",
          commitId: HEAD,
          submittedAt: "2026-09-15T15:00:00Z",
          body: `**⚠️ Outside diff range comments (2)**\n${finding("aaa1")}`,
        },
      ],
      authorComments: [`Declined: pre-existing. ${finding("aaa1")}`],
    });
    expect(bodyFindingIds(s)).toEqual([]);
    expect(unmarkedBodyFindings(s)).toBe(1);
    // Above the id list: the round has to be read by hand.
    expect(bodyFindingCount(s)).toBe(1);
  });
});
