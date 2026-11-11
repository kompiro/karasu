import { describe, expect, it } from "vitest";
import {
  type Deps,
  type MergeJob,
  type Options,
  type PrState,
  awaitLowMerge,
} from "./await-low-merge-flow.ts";
import type { Verdict } from "./low-pr-merger-flow.ts";

const HEAD = "0123456789abcdef0123456789abcdef01234567";
const PUSHED = "fedcba9876543210fedcba9876543210fedcba98";
const MIN = 60_000;
const OPTS: Options = { pollMs: MIN, settleMs: 30 * MIN, pushWaitMs: 5 * MIN, budgetMs: 180 * MIN };

const open = (over: Partial<PrState> = {}): PrState => ({
  state: "open",
  merged: false,
  mergedAt: null,
  mergedBy: null,
  mergeSha: null,
  headSha: HEAD,
  headRef: "docs/adr-1",
  createdAt: "2026-11-11T10:00:00Z",
  autoMerge: false,
  ...over,
});
const merged = (over: Partial<PrState> = {}): PrState =>
  open({
    state: "closed",
    merged: true,
    mergedAt: "2026-11-11T10:20:00Z",
    mergedBy: "low-pr-merger[bot]",
    mergeSha: "abcabcabcabcabcabcabcabcabcabcabcabcabca",
    ...over,
  });
const job = (log: string, status = "completed"): MergeJob => ({
  status,
  conclusion: status === "completed" ? "success" : null,
  log: () => log,
});

/**
 * A fake GitHub on a fake clock: `sleep` moves the clock, and each read of the
 * PR or the verdict takes the next scripted value (the last one repeats).
 */
function fake(script: {
  pulls: PrState[];
  verdicts?: (Verdict | null)[];
  runs?: { id: number; url: string }[];
  jobs?: Record<number, (MergeJob | null)[]>;
  pushes?: string[][];
  branchExists?: boolean;
}) {
  let now = Date.parse("2026-11-11T10:10:00Z");
  const next = <T>(list: T[]): T => (list.length > 1 ? list.shift()! : list[0]!);
  const asked: { runsFrom?: string; runsTo?: string } = {};
  const deps: Deps = {
    pull: () => next(script.pulls),
    judge: () => next(script.verdicts ?? [null]),
    mergerRuns: (from, to) => {
      asked.runsFrom = from;
      asked.runsTo = to;
      return script.runs ?? [];
    },
    mergeJob: (id) => next(script.jobs?.[id] ?? [null]),
    pushWorkflows: () => next(script.pushes ?? [[]]),
    branchExists: () => script.branchExists ?? false,
    now: () => now,
    sleep: async (ms) => {
      now += ms;
    },
  };
  return { deps, asked };
}

const mergeVerdict = (sha = HEAD): Verdict => ({ pr: 7, sha, outcome: "merge" });
const waitVerdict = (reasons: string[], stalled: boolean): Verdict =>
  ({ pr: 7, sha: HEAD, outcome: "wait", reasons, details: ["Check"], stalled }) as Verdict;

describe("awaitLowMerge: a merged PR", () => {
  it("reports a merge the merge job logged, once the job finished and the push workflows appeared", async () => {
    const { deps, asked } = fake({
      pulls: [merged()],
      runs: [
        { id: 2, url: "https://example.test/runs/2" },
        { id: 1, url: "https://example.test/runs/1" },
      ],
      jobs: {
        2: [job("", "in_progress"), job(`merged #8 at ${HEAD}\nmerged #7 at ${HEAD}\n`)],
        1: [null],
      },
      pushes: [[], ["Deploy", "Pages"]],
    });
    expect(await awaitLowMerge(deps, 7, OPTS)).toMatchObject({
      outcome: "merged-by-merger",
      run: "https://example.test/runs/2",
      mergedBy: "low-pr-merger[bot]",
      pushWorkflows: ["Deploy", "Pages"],
      branchDeleted: true,
    });
    // The hour before the merge, even before the PR existed: a run can start first.
    expect(asked).toEqual({ runsFrom: "2026-11-11T09:20:00Z", runsTo: "2026-11-11T10:20:00Z" });
  });

  it("keeps reading the push workflows until the list stops growing", async () => {
    const { deps } = fake({
      pulls: [merged()],
      runs: [{ id: 1, url: "u" }],
      jobs: { 1: [job(`merged #7 at ${HEAD}\n`)] },
      pushes: [["Deploy"], ["Deploy", "Pages"], ["Deploy", "Pages"]],
    });
    expect(await awaitLowMerge(deps, 7, OPTS)).toMatchObject({
      pushWorkflows: ["Deploy", "Pages"],
      waitedMin: 2,
    });
  });

  it("stops at the budget while a merge job is still running", async () => {
    const { deps } = fake({
      pulls: [merged()],
      runs: [{ id: 1, url: "https://example.test/runs/1" }],
      jobs: { 1: [job("", "in_progress")] },
    });
    expect(await awaitLowMerge(deps, 7, { ...OPTS, budgetMs: 10 * MIN })).toMatchObject({
      outcome: "timeout",
      last: "the merge job of https://example.test/runs/1 is still running",
      waitedMin: 10,
    });
  });

  it("does not take another PR's line for this one", async () => {
    const { deps } = fake({
      pulls: [merged({ mergedBy: "kompiro" })],
      runs: [{ id: 1, url: "u" }],
      jobs: { 1: [job(`merged #77 at ${HEAD}\n`)] },
    });
    expect(await awaitLowMerge(deps, 7, OPTS)).toMatchObject({
      outcome: "merged-otherwise",
      mergedBy: "kompiro",
    });
  });

  it("gives up on the push workflows after pushWaitMs, and still reports the merge", async () => {
    const { deps } = fake({
      pulls: [merged()],
      runs: [{ id: 1, url: "u" }],
      jobs: { 1: [job(`merged #7 at ${HEAD}\n`)] },
      pushes: [[]],
      branchExists: true,
    });
    expect(await awaitLowMerge(deps, 7, OPTS)).toMatchObject({
      outcome: "merged-by-merger",
      pushWorkflows: [],
      branchDeleted: false,
      waitedMin: 5,
    });
  });
});

describe("awaitLowMerge: what the session must do first", () => {
  it("stops on native auto-merge, which would merge before the merger", async () => {
    const { deps } = fake({ pulls: [open({ autoMerge: true })] });
    expect(await awaitLowMerge(deps, 7, OPTS)).toMatchObject({ outcome: "auto-merge-enabled" });
  });

  it("stops on a PR the merger does not judge", async () => {
    const { deps } = fake({ pulls: [open()], verdicts: [null] });
    expect(await awaitLowMerge(deps, 7, OPTS)).toMatchObject({
      outcome: "out-of-scope",
      why: "not labeled risk: low",
    });
  });

  it("hands a rejection back as something to fix on the PR", async () => {
    const reject: Verdict = {
      pr: 7,
      sha: HEAD,
      outcome: "reject",
      reasons: ["checks-failed"],
      details: ["Check: failure"],
    };
    const { deps } = fake({ pulls: [open()], verdicts: [reject] });
    expect(await awaitLowMerge(deps, 7, OPTS)).toMatchObject({
      outcome: "fix-pr",
      reasons: ["checks-failed"],
    });
  });

  it("reports checks that stalled, and keeps waiting while they only run", async () => {
    const { deps } = fake({
      pulls: [open()],
      verdicts: [waitVerdict(["checks-pending"], false), waitVerdict(["checks-stuck"], true)],
    });
    expect(await awaitLowMerge(deps, 7, OPTS)).toMatchObject({
      outcome: "checks-stuck",
      reasons: ["checks-stuck"],
      waitedMin: 1,
    });
  });

  it("reports a closed PR", async () => {
    const { deps } = fake({ pulls: [open({ state: "closed" })] });
    expect(await awaitLowMerge(deps, 7, OPTS)).toMatchObject({ outcome: "closed" });
  });
});

describe("awaitLowMerge: falling back to --auto", () => {
  it("falls back once the merger could merge for 30 minutes and did not", async () => {
    const { deps } = fake({ pulls: [open()], verdicts: [mergeVerdict()] });
    expect(await awaitLowMerge(deps, 7, OPTS)).toMatchObject({
      outcome: "fallback",
      verdict: "merge",
      waitedMin: 30,
    });
  });

  it("does not count the time while the PR still waited on its checks", async () => {
    const { deps } = fake({
      pulls: [open()],
      verdicts: [
        ...Array.from({ length: 20 }, () => waitVerdict(["checks-pending"], false)),
        mergeVerdict(),
      ],
    });
    expect(await awaitLowMerge(deps, 7, OPTS)).toMatchObject({
      outcome: "fallback",
      waitedMin: 50,
    });
  });

  it("starts the 30 minutes again when a push moves the head", async () => {
    const { deps } = fake({
      pulls: [...Array.from({ length: 20 }, () => open()), open({ headSha: PUSHED })],
      verdicts: [...Array.from({ length: 20 }, () => mergeVerdict()), mergeVerdict(PUSHED)],
    });
    expect(await awaitLowMerge(deps, 7, OPTS)).toMatchObject({
      outcome: "fallback",
      head: PUSHED,
      waitedMin: 50,
    });
  });

  it("falls back when the merger cannot decide the PR for 30 minutes", async () => {
    const undecided: Verdict = {
      pr: 7,
      sha: HEAD,
      outcome: "no-conclusion",
      details: ["check run 1 (Check) has no workflow run to belong to"],
    };
    const { deps } = fake({ pulls: [open()], verdicts: [undecided] });
    expect(await awaitLowMerge(deps, 7, OPTS)).toMatchObject({
      outcome: "fallback",
      verdict: "no-conclusion",
      details: undecided.details,
    });
  });

  it("reads again when a push lands between reading the PR and judging it", async () => {
    const { deps } = fake({
      pulls: [open(), open({ headSha: PUSHED })],
      verdicts: [
        { pr: 7, sha: PUSHED, outcome: "reject", reasons: ["tier"], details: ["no record"] },
      ],
    });
    expect(await awaitLowMerge(deps, 7, OPTS)).toMatchObject({
      outcome: "fix-pr",
      head: PUSHED,
      waitedMin: 1,
    });
  });

  it("ends with timeout when nothing settles within the budget", async () => {
    const { deps } = fake({ pulls: [open()], verdicts: [waitVerdict(["checks-pending"], false)] });
    expect(await awaitLowMerge(deps, 7, { ...OPTS, budgetMs: 0 })).toMatchObject({
      outcome: "timeout",
      last: "wait",
      waitedMin: 0,
    });
  });
});

describe("awaitLowMerge: failed reads", () => {
  it("reads again on the next poll after a failed read", async () => {
    const { deps } = fake({
      pulls: [merged()],
      runs: [{ id: 1, url: "u" }],
      pushes: [["Deploy"]],
    });
    const pull = deps.pull;
    let calls = 0;
    deps.pull = (n) => {
      if (calls++ === 0) throw new Error("gh api: HTTP 502");
      return pull(n);
    };
    deps.mergeJob = () => job(`merged #7 at ${HEAD}\n`);
    expect(await awaitLowMerge(deps, 7, OPTS)).toMatchObject({
      outcome: "merged-by-merger",
      // One poll to read again, one to see the push workflows settle.
      waitedMin: 2,
    });
  });

  it("reports the last failure when the budget runs out", async () => {
    const { deps } = fake({ pulls: [open()] });
    deps.pull = () => {
      throw new Error("gh api: HTTP 502");
    };
    expect(await awaitLowMerge(deps, 7, { ...OPTS, budgetMs: 0 })).toMatchObject({
      outcome: "timeout",
      last: "error: gh api: HTTP 502",
    });
  });
});
