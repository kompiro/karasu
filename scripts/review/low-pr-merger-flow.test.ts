import { describe, expect, it } from "vitest";
import { BRANCH, MARKER } from "../adr/regenerate-pr-flow.ts";
import {
  type CheckRun,
  type Deps,
  type GitHub,
  type Pull,
  STALL_MS,
  type TierResult,
  type WorkflowRun,
  judge,
  judgeChecks,
  outOfScope,
  renderSummary,
} from "./low-pr-merger-flow.ts";

const REQUIRED = ["Check", "Validate"];
const NOW = Date.parse("2026-11-08T12:00:00Z");
const RECENT = "2026-11-08T11:55:00Z";

const pull = (over: Partial<Pull> & { number: number }): Pull => ({
  state: "open",
  draft: false,
  body: "",
  html_url: `https://github.com/kompiro/karasu/pull/${over.number}`,
  labels: [{ name: "risk: low" }],
  base: { ref: "main" },
  head: {
    ref: `docs/pr-${over.number}`,
    sha: `sha-${over.number}`,
    repo: { full_name: "kompiro/karasu" },
  },
  mergeable: true,
  mergeable_state: "clean",
  ...over,
});

let nextId = 1;
/** One workflow run and the check run it reports. */
function reported(
  name: string,
  conclusion: string | null,
  over: { path?: string; event?: string; runId?: number; checkId?: number; at?: string } = {},
): { run: CheckRun; workflow: WorkflowRun } {
  const runId = over.runId ?? nextId++;
  const workflow: WorkflowRun = {
    id: runId,
    path: over.path ?? `.github/workflows/${name.toLowerCase()}.yml`,
    event: over.event ?? "pull_request",
    check_suite_id: runId * 10,
  };
  const run: CheckRun = {
    id: over.checkId ?? nextId++,
    name,
    status: conclusion === null ? "in_progress" : "completed",
    conclusion,
    started_at: over.at ?? RECENT,
    completed_at: conclusion === null ? null : (over.at ?? RECENT),
    app: "github-actions",
    check_suite_id: workflow.check_suite_id,
  };
  return { run, workflow };
}

const split = (rs: { run: CheckRun; workflow: WorkflowRun }[]) => ({
  runs: rs.map((r) => r.run),
  workflows: rs.map((r) => r.workflow),
});
const passing = () => [reported("Check", "success"), reported("Validate", "success")];

function deps(init: {
  pulls: Pull[];
  checks?: (sha: string) => { run: CheckRun; workflow: WorkflowRun }[];
  tier?: (pr: number) => TierResult;
  required?: () => string[];
  pullFails?: number;
}): Deps & { tierCalls: number[] } {
  const tierCalls: number[] = [];
  // One set of runs per head, so the check runs and the workflow runs agree.
  const reports = new Map<string, ReturnType<typeof split>>();
  const reportsOf = (sha: string) => {
    if (!reports.has(sha)) reports.set(sha, split((init.checks ?? passing)(sha)));
    return reports.get(sha)!;
  };
  const github: GitHub = {
    // The list endpoint carries no `mergeable`.
    openPulls: () => init.pulls.map(({ mergeable: _m, mergeable_state: _s, ...p }) => p),
    pull: (n) => {
      if (n === init.pullFails) throw new Error(`gh api repos/kompiro/karasu/pulls/${n}: HTTP 502`);
      return structuredClone(init.pulls.find((p) => p.number === n)!);
    },
    requiredChecks: init.required ?? (() => REQUIRED),
    checkRuns: (sha) => reportsOf(sha).runs,
    workflowRuns: (sha) => reportsOf(sha).workflows,
  };
  return {
    github,
    checkTier: (pr) => {
      tierCalls.push(pr);
      return (init.tier ?? (() => ({ state: "pass" })))(pr);
    },
    now: () => NOW,
    tierCalls,
  };
}

describe("outOfScope", () => {
  it("takes an open, ready PR from this repository against main", () => {
    expect(outOfScope(pull({ number: 1 }))).toBeNull();
  });

  it.each([
    ["a draft", { draft: true }, "draft"],
    ["a closed PR", { state: "closed" }, "not open"],
    ["another base", { base: { ref: "spike/x" } }, "base is spike/x"],
  ] as const)("leaves out %s", (_, over, why) => {
    expect(outOfScope(pull({ number: 1, ...over }))).toBe(why);
  });

  it("leaves out a fork's PR, and one whose head repository is gone", () => {
    const fork = pull({ number: 1 });
    fork.head.repo = { full_name: "someone/karasu" };
    expect(outOfScope(fork)).toBe("head is not this repository");
    fork.head.repo = null;
    expect(outOfScope(fork)).toBe("head is not this repository");
  });

  it("leaves the regeneration PR to the routine", () => {
    const regen = pull({ number: 1, body: MARKER });
    regen.head.ref = BRANCH;
    expect(outOfScope(regen)).toMatch(/regeneration/);
  });
});

describe("judgeChecks", () => {
  const judgeOf = (rs: { run: CheckRun; workflow: WorkflowRun }[]) => {
    const { runs, workflows } = split(rs);
    return judgeChecks(REQUIRED, runs, workflows);
  };

  it("passes when every required check succeeded", () => {
    expect(judgeOf(passing())).toEqual({ state: "pass" });
  });

  it("waits for a required check with no run yet, and for one still running", () => {
    expect(judgeOf([reported("Check", "success")])).toMatchObject({
      state: "pending",
      waiting: ["Validate"],
      stuck: false,
    });
    expect(judgeOf([reported("Check", null), reported("Validate", "success")])).toMatchObject({
      state: "pending",
      stuck: false,
    });
  });

  it("fails when one of the workflows that report a name failed", () => {
    // `Check` comes from ci.yml, ci-skip.yml and at-check-coverage.yml.
    const v = judgeOf([
      reported("Check", "success", { path: ".github/workflows/ci-skip.yml" }),
      reported("Check", "failure", { path: ".github/workflows/ci.yml" }),
      reported("Validate", "success"),
    ]);
    expect(v).toMatchObject({ state: "fail" });
    expect(JSON.stringify(v)).toContain("ci.yml");
  });

  it("does not pass a real workflow that ended skipped next to its stub's success (TPL-2643)", () => {
    const v = judgeOf([
      reported("Check", "skipped", { path: ".github/workflows/ci.yml" }),
      reported("Check", "success", { path: ".github/workflows/ci-skip.yml" }),
      reported("Validate", "success"),
    ]);
    expect(v).toMatchObject({ state: "pending", stuck: true });
  });

  it.each(["cancelled", "neutral"])("leaves a %s result waiting, not passing", (conclusion) => {
    expect(judgeOf([reported("Check", conclusion), reported("Validate", "success")])).toMatchObject(
      { state: "pending", stuck: true },
    );
  });

  it("reads the later workflow run, by run id, even when its start time is earlier (#3472)", () => {
    const v = judgeOf([
      reported("Check", "skipped", { runId: 100, at: "2026-11-08T11:59:00Z" }),
      reported("Check", "success", { runId: 101, at: "2026-11-08T11:58:00Z" }),
      reported("Validate", "success"),
    ]);
    expect(v).toEqual({ state: "pass" });
  });

  it("passes a re-run of the same workflow run that succeeded", () => {
    const first = reported("Check", "failure", { runId: 200, checkId: 900 });
    const rerun = reported("Check", "success", { runId: 200, checkId: 901 });
    expect(judgeOf([first, rerun, reported("Validate", "success")])).toEqual({ state: "pass" });
  });

  it("counts each event of a workflow on its own", () => {
    const v = judgeOf([
      reported("Check", "failure", { runId: 300, event: "pull_request" }),
      reported("Check", "success", { runId: 301, event: "push" }),
      reported("Validate", "success"),
    ]);
    expect(v).toMatchObject({ state: "fail" });
  });

  it("ignores a check of the same name from another app", () => {
    const other = reported("Validate", "failure");
    other.run.app = "some-app";
    expect(judgeOf([...passing(), other])).toEqual({ state: "pass" });
  });

  it("cannot decide when a check run belongs to no workflow run it read", () => {
    const { runs, workflows } = split(passing());
    expect(judgeChecks(REQUIRED, runs, workflows.slice(1))).toMatchObject({ state: "unknown" });
  });
});

describe("judge", () => {
  it("lets a PR that meets every condition merge, on the head it judged", () => {
    expect(judge(deps({ pulls: [pull({ number: 1 })] }))).toEqual([
      { pr: 1, sha: "sha-1", outcome: "merge" },
    ]);
  });

  it("judges only PRs labeled risk: low", () => {
    const d = deps({ pulls: [pull({ number: 1, labels: [{ name: "risk: high" }] })] });
    expect(judge(d)).toEqual([]);
    expect(d.tierCalls).toEqual([]);
  });

  it("reports an out-of-scope PR without running the tier check", () => {
    const d = deps({ pulls: [pull({ number: 1, draft: true })] });
    expect(judge(d)).toEqual([{ pr: 1, sha: "sha-1", outcome: "out-of-scope", why: "draft" }]);
    expect(d.tierCalls).toEqual([]);
  });

  it("rejects a PR that also carries another tier label", () => {
    const labels = [{ name: "risk: low" }, { name: "risk: high" }];
    expect(judge(deps({ pulls: [pull({ number: 1, labels })] }))[0]).toMatchObject({
      outcome: "reject",
      reasons: ["labels"],
    });
  });

  it("rejects what the tier check rejects, with its errors", () => {
    const tier = (): TierResult => ({ state: "fail", errors: ["no local review record"] });
    expect(judge(deps({ pulls: [pull({ number: 1 })], tier }))[0]).toEqual({
      pr: 1,
      sha: "sha-1",
      outcome: "reject",
      reasons: ["tier"],
      details: ["no local review record"],
    });
  });

  it("rejects a failed required check", () => {
    const checks = () => [reported("Check", "failure"), reported("Validate", "success")];
    expect(judge(deps({ pulls: [pull({ number: 1 })], checks }))[0]).toMatchObject({
      outcome: "reject",
      reasons: ["checks-failed"],
    });
  });

  it("rejects a conflict even while its checks wait: the checks would never come", () => {
    const checks = () => [reported("Check", "success")];
    const pulls = [pull({ number: 1, mergeable: false, mergeable_state: "dirty" })];
    expect(judge(deps({ pulls, checks }))[0]).toMatchObject({
      outcome: "reject",
      reasons: ["conflict"],
    });
  });

  it("waits while GitHub computes mergeability", () => {
    expect(judge(deps({ pulls: [pull({ number: 1, mergeable: null })] }))[0]).toMatchObject({
      outcome: "wait",
      reasons: ["mergeable-unknown"],
    });
  });

  it("waits when a push moved the head during the judging", () => {
    const tier = (): TierResult => ({ state: "moved" });
    expect(judge(deps({ pulls: [pull({ number: 1 })], tier }))[0]).toMatchObject({
      outcome: "wait",
      reasons: ["head-moved"],
    });
  });

  it("reports a wait as stalled once the head has been quiet for 30 minutes", () => {
    const at = (ms: number) => new Date(NOW - ms).toISOString();
    const waitingSince = (ms: number) => () => [
      reported("Check", "skipped", { at: at(ms) }),
      reported("Validate", "success", { at: at(ms) }),
    ];
    const verdict = (ms: number) =>
      judge(deps({ pulls: [pull({ number: 1 })], checks: waitingSince(ms) }))[0];
    expect(verdict(STALL_MS - 1000)).toMatchObject({ outcome: "wait", stalled: false });
    expect(verdict(STALL_MS)).toMatchObject({
      outcome: "wait",
      reasons: ["checks-stuck"],
      stalled: true,
    });
  });

  it("has no conclusion when the tier check could not read something", () => {
    const tier = (): TierResult => ({ state: "unreadable", messages: ["closes #9: HTTP 502"] });
    expect(judge(deps({ pulls: [pull({ number: 1 })], tier }))[0]).toEqual({
      pr: 1,
      sha: "sha-1",
      outcome: "no-conclusion",
      details: ["closes #9: HTTP 502"],
    });
  });

  it("still rejects a PR it could not fully read when what it did read rejects it", () => {
    const tier = (): TierResult => ({ state: "unreadable", messages: ["HTTP 502"] });
    const pulls = [pull({ number: 1, mergeable: false })];
    expect(judge(deps({ pulls, tier }))[0]).toMatchObject({
      outcome: "reject",
      reasons: ["conflict"],
    });
  });

  it("goes on judging the other PRs when one fails", () => {
    const verdicts = judge(
      deps({ pulls: [pull({ number: 1 }), pull({ number: 2 })], pullFails: 1 }),
    );
    expect(verdicts.map((v) => v.outcome)).toEqual(["no-conclusion", "merge"]);
    expect(verdicts[0]).toMatchObject({ details: [expect.stringContaining("HTTP 502")] });
  });

  it("decides nothing when the ruleset requires no check, or cannot be read", () => {
    for (const required of [
      () => [],
      () => {
        throw new Error("HTTP 403");
      },
    ]) {
      const d = deps({ pulls: [pull({ number: 1 })], required });
      expect(judge(d)).toMatchObject([{ pr: 1, outcome: "no-conclusion" }]);
      expect(d.tierCalls).toEqual([]);
    }
  });
});

describe("renderSummary", () => {
  it("keeps every PR on one table row", () => {
    const text = renderSummary([
      { pr: 1, sha: "0123456789", outcome: "reject", reasons: ["tier"], details: ["a | b\nc"] },
    ]);
    expect(text).toContain("| #1 | `0123456` | reject | tier: a \\| b c |");
  });

  it("says so when there is no Low PR", () => {
    expect(renderSummary([])).toContain("No open PR is labeled `risk: low`.");
  });
});
