import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BRANCH,
  type CheckRun,
  DEADLINE_MS,
  EXIT_CODES,
  type GitHub,
  LOW_LABEL,
  MARKER,
  type MergeResult,
  type Pull,
  type Workspace,
  findRegenerationPr,
  judgeChecks,
  labelEdits,
  labelsAreLow,
  prBody,
  regeneratePr,
} from "./regenerate-pr-flow.ts";

const CONFIG = readFileSync(resolve(__dirname, "../../adr.config.json"), "utf-8");
const REQUIRED = ["Check", "Validate", "Reference docs", "Playwright", "verify"];
const GENERATED_ONLY = "M\0docs/adr/effective.md\0";

const pull = (over: Partial<Pull> & { number: number }): Pull => ({
  state: "open",
  body: prBody(),
  html_url: `https://github.com/kompiro/karasu/pull/${over.number}`,
  labels: [{ name: LOW_LABEL }],
  base: { ref: "main" },
  head: { ref: BRANCH, sha: "old-head", repo: { full_name: "kompiro/karasu" } },
  ...over,
});

const run = (name: string, conclusion: string | null, extra: Partial<CheckRun> = {}): CheckRun => ({
  name,
  status: conclusion === null ? "in_progress" : "completed",
  conclusion,
  started_at: "2026-10-31T00:00:00Z",
  app: "github-actions",
  ...extra,
});
const allPass = (): CheckRun[] => [...REQUIRED, "Review tier"].map((n) => run(n, "success"));

/** A GitHub that keeps its state in memory and records every write. */
function fakeGitHub(init: { pulls?: Pull[]; branch?: string | null; runs?: () => CheckRun[] }) {
  const pulls = new Map((init.pulls ?? []).map((p) => [p.number, p]));
  const calls: string[] = [];
  let branch = init.branch ?? null;
  let nextNumber = 100;
  const mergeResults: MergeResult[] = [];
  const github: GitHub = {
    openPulls: () => [...pulls.values()].filter((p) => p.state === "open"),
    pull: (n) => structuredClone(pulls.get(n)!),
    createPull: (body) => {
      const p = pull({
        number: nextNumber++,
        body,
        labels: [],
        head: { ...pull({ number: 0 }).head, sha: branch! },
      });
      pulls.set(p.number, p);
      calls.push(`create #${p.number}`);
      return structuredClone(p);
    },
    closePull: (n) => {
      pulls.get(n)!.state = "closed";
      calls.push(`close #${n}`);
    },
    addLabel: (n, name) => {
      pulls.get(n)!.labels.push({ name });
      calls.push(`label+ #${n} ${name}`);
    },
    removeLabel: (n, name) => {
      const p = pulls.get(n)!;
      p.labels = p.labels.filter((l) => l.name !== name);
      calls.push(`label- #${n} ${name}`);
    },
    branchSha: () => branch,
    requiredChecks: () => REQUIRED,
    checkRuns: () => (init.runs ?? allPass)(),
    merge: (n, sha) => {
      calls.push(`merge #${n} ${sha}`);
      const result = mergeResults.shift() ?? { ok: true };
      if (result.ok) {
        pulls.get(n)!.state = "closed";
        branch = null; // delete_branch_on_merge
      }
      return result;
    },
  };
  return {
    github,
    calls,
    mergeResults,
    pulls,
    setBranch: (sha: string | null) => {
      branch = sha;
      for (const p of pulls.values()) if (p.state === "open") p.head.sha = sha ?? p.head.sha;
    },
  };
}

/** A workspace whose regeneration produces `commit` (or nothing when null). */
function fakeWorkspace(opts: {
  commit: string | null;
  exists?: boolean;
  onPush?: (lease: string | null, commit: string) => void;
  configAt?: (rev: string) => string | null;
  nameStatus?: string;
}) {
  const calls: string[] = [];
  const workspace: Workspace = {
    fetchMain: () => void calls.push("fetchMain"),
    fetchPull: (n) => {
      calls.push(`fetchPull #${n}`);
      return "old-head";
    },
    config: (rev) => (opts.configAt ? opts.configAt(rev) : CONFIG),
    mergeBase: () => "base",
    nameStatus: () => opts.nameStatus ?? GENERATED_ONLY,
    worktreeExists: () => opts.exists ?? false,
    addWorktree: () => void calls.push("addWorktree"),
    regenerate: () => void calls.push("regenerate"),
    commitGenerated: () => {
      calls.push("commit");
      return opts.commit;
    },
    push: (lease) => {
      calls.push(`push lease=${lease ?? ""}`);
      opts.onPush?.(lease, opts.commit!);
    },
    removeWorktree: () => void calls.push("removeWorktree"),
  };
  return { workspace, calls };
}

function fakeClock() {
  let t = 0;
  return { now: () => t, sleep: (ms: number) => void (t += ms) };
}

describe("findRegenerationPr", () => {
  it("finds the PR that has all four marks", () => {
    expect(findRegenerationPr([pull({ number: 1 })])).toEqual({
      pr: pull({ number: 1 }),
      errors: [],
    });
  });

  it("fails on a PR from our branch without the marker or with another base", () => {
    expect(findRegenerationPr([pull({ number: 1, body: "hand-made" })]).errors[0]).toMatch(/#1/);
    expect(findRegenerationPr([pull({ number: 2, base: { ref: "release" } })]).errors[0]).toMatch(
      /#2/,
    );
  });

  it("ignores a fork's branch of the same name", () => {
    const fork = pull({
      number: 3,
      head: { ref: BRANCH, sha: "x", repo: { full_name: "someone/karasu" } },
    });
    expect(findRegenerationPr([fork])).toEqual({ pr: null, errors: [] });
  });
});

describe("labels", () => {
  it("accepts exactly risk: low among the tier labels", () => {
    expect(labelsAreLow([LOW_LABEL, "documentation"])).toBe(true);
    expect(labelsAreLow([])).toBe(false);
    expect(labelsAreLow([LOW_LABEL, "risk: high"])).toBe(false);
    expect(labelsAreLow(["risk:low"])).toBe(false);
  });

  it("plans the edits that leave exactly risk: low", () => {
    expect(labelEdits(["risk: high", "risk:low", "docs"])).toEqual({
      remove: ["risk: high", "risk:low"],
      add: [LOW_LABEL],
    });
    expect(labelEdits([LOW_LABEL])).toEqual({ remove: [], add: [] });
  });
});

describe("judgeChecks", () => {
  it("passes when every name has only passing runs", () => {
    expect(judgeChecks(["Check"], [run("Check", "success"), run("Check", "skipped")])).toEqual({
      state: "pass",
    });
    expect(judgeChecks(["Check"], [run("Check", "neutral")]).state).toBe("pass");
  });

  it("waits for a name with no run or an unfinished run", () => {
    expect(judgeChecks(["Check", "Validate"], [run("Check", "success")])).toEqual({
      state: "pending",
      waiting: ["Validate"],
    });
    expect(judgeChecks(["Check"], [run("Check", null)]).state).toBe("pending");
  });

  it("fails when any run of a name fails, even beside a passing one", () => {
    expect(judgeChecks(["Check"], [run("Check", "success"), run("Check", "failure")]).state).toBe(
      "fail",
    );
  });

  it("drops a cancelled run that a later run of the same name replaced", () => {
    const runs = [
      run("Review tier", "cancelled", { started_at: "2026-10-31T00:00:00Z" }),
      run("Review tier", "success", { started_at: "2026-10-31T00:00:05Z" }),
    ];
    expect(judgeChecks(["Review tier"], runs).state).toBe("pass");
    expect(judgeChecks(["Review tier"], [run("Review tier", "cancelled")]).state).toBe("fail");
  });

  it("ignores runs from apps other than GitHub Actions", () => {
    expect(judgeChecks(["Check"], [run("Check", "success", { app: "someone" })]).state).toBe(
      "pending",
    );
  });
});

describe("regeneratePr", () => {
  const go = (gh: ReturnType<typeof fakeGitHub>, ws: ReturnType<typeof fakeWorkspace>) =>
    regeneratePr({ github: gh.github, workspace: ws.workspace, clock: fakeClock(), log: () => {} });

  it("does nothing when main is current", () => {
    const gh = fakeGitHub({});
    const ws = fakeWorkspace({ commit: null });
    expect(go(gh, ws).outcome).toBe("nothing");
    expect(gh.calls).toEqual([]);
    expect(ws.calls.at(-1)).toBe("removeWorktree");
  });

  it("opens a PR with an empty lease, labels it Low, and merges the pushed head", () => {
    const gh = fakeGitHub({});
    const ws = fakeWorkspace({ commit: "new-head", onPush: (_, c) => gh.setBranch(c) });
    const result = go(gh, ws);
    expect(result).toMatchObject({ outcome: "merged", pr: expect.stringContaining("/pull/100") });
    expect(ws.calls).toContain("push lease=");
    expect(gh.calls).toEqual(["create #100", `label+ #100 ${LOW_LABEL}`, "merge #100 new-head"]);
    expect(gh.pulls.get(100)!.body).toContain(MARKER);
  });

  it("pushes over a branch a closed PR left with that branch's SHA as the lease", () => {
    const gh = fakeGitHub({ branch: "leftover" });
    const ws = fakeWorkspace({ commit: "new-head", onPush: (_, c) => gh.setBranch(c) });
    go(gh, ws);
    expect(ws.calls).toContain("push lease=leftover");
  });

  it("leaves the PR open and exits 3 when the checks do not finish in time", () => {
    const gh = fakeGitHub({ runs: () => [run("Check", null)] });
    const ws = fakeWorkspace({ commit: "new-head", onPush: (_, c) => gh.setBranch(c) });
    const result = go(gh, ws);
    expect(result.outcome).toBe("waited");
    expect(EXIT_CODES[result.outcome]).toBe(3);
    expect(gh.calls.some((c) => c.startsWith("merge"))).toBe(false);
    expect(gh.pulls.get(100)!.state).toBe("open");
    expect(ws.calls.at(-1)).toBe("removeWorktree");
  });

  it("does not merge when a check fails", () => {
    const gh = fakeGitHub({ runs: () => [...allPass(), run("Validate", "failure")] });
    const ws = fakeWorkspace({ commit: "new-head", onPush: (_, c) => gh.setBranch(c) });
    expect(go(gh, ws)).toMatchObject({
      outcome: "failed",
      message: expect.stringMatching(/Validate/),
    });
    expect(gh.calls.some((c) => c.startsWith("merge"))).toBe(false);
  });

  it("does not merge when someone relabels the PR while it waits", () => {
    let polls = 0;
    const gh = fakeGitHub({
      runs: () => {
        if (++polls === 2) gh.pulls.get(100)!.labels.push({ name: "risk: high" });
        return polls < 3 ? [run("Check", null)] : allPass();
      },
    });
    const ws = fakeWorkspace({ commit: "new-head", onPush: (_, c) => gh.setBranch(c) });
    expect(go(gh, ws)).toMatchObject({
      outcome: "failed",
      message: expect.stringMatching(/labels/),
    });
  });

  it("merges yesterday's ready PR first, waits for its branch to go, then regenerates", () => {
    const gh = fakeGitHub({ pulls: [pull({ number: 7 })], branch: "old-head" });
    const ws = fakeWorkspace({ commit: null });
    const result = go(gh, ws);
    expect(result).toMatchObject({
      outcome: "merged",
      pickedUp: expect.stringContaining("/pull/7"),
    });
    expect(gh.calls).toEqual(["merge #7 old-head"]);
    expect(ws.calls.filter((c) => c === "fetchMain")).toHaveLength(2);
  });

  it("regenerates over yesterday's PR when it cannot be merged", () => {
    const gh = fakeGitHub({ pulls: [pull({ number: 7 })], branch: "old-head" });
    gh.mergeResults.push({ ok: false, message: "405 not mergeable" });
    const ws = fakeWorkspace({ commit: "new-head", onPush: (_, c) => gh.setBranch(c) });
    const result = go(gh, ws);
    expect(result).toMatchObject({ outcome: "merged", pr: expect.stringContaining("/pull/7") });
    expect(ws.calls).toContain("push lease=old-head");
    expect(gh.calls).toEqual(["merge #7 old-head", "merge #7 new-head"]);
  });

  it("closes the open PR when main is already current", () => {
    const gh = fakeGitHub({ pulls: [pull({ number: 7, labels: [] })], branch: "old-head" });
    const ws = fakeWorkspace({ commit: null });
    expect(go(gh, ws).outcome).toBe("closed");
    expect(gh.calls).toEqual(["close #7"]);
  });

  it("does not pick up yesterday's PR when the outputs changed on main", () => {
    const moved = JSON.stringify({
      paths: { adrDir: "docs/adr", outputs: { effective: "effective.md" } },
    });
    const gh = fakeGitHub({ pulls: [pull({ number: 7 })], branch: "old-head" });
    const ws = fakeWorkspace({
      commit: null,
      configAt: (rev) => (rev === "origin/main" ? moved : CONFIG),
    });
    go(gh, ws);
    expect(gh.calls.some((c) => c.startsWith("merge"))).toBe(false);
  });

  it("refuses to touch a hand-made PR on the branch", () => {
    const gh = fakeGitHub({ pulls: [pull({ number: 7, body: "hand-made" })] });
    const ws = fakeWorkspace({ commit: "new-head" });
    expect(go(gh, ws).outcome).toBe("failed");
    expect(gh.calls).toEqual([]);
    expect(ws.calls).not.toContain("addWorktree");
  });

  it("fails without touching an existing worktree", () => {
    const gh = fakeGitHub({});
    const ws = fakeWorkspace({ commit: "new-head", exists: true });
    expect(go(gh, ws).outcome).toBe("failed");
    expect(ws.calls).toEqual([]);
  });

  it("refuses a regenerated commit that is not a generated-only diff", () => {
    const gh = fakeGitHub({});
    const ws = fakeWorkspace({
      commit: "new-head",
      nameStatus: `${GENERATED_ONLY}M\0package.json\0`,
    });
    expect(go(gh, ws).outcome).toBe("failed");
    expect(ws.calls).not.toContainEqual(expect.stringMatching(/^push/));
  });

  it("stops within the deadline", () => {
    const clock = fakeClock();
    const gh = fakeGitHub({ runs: () => [run("Check", null)] });
    const ws = fakeWorkspace({ commit: "new-head", onPush: (_, c) => gh.setBranch(c) });
    regeneratePr({ github: gh.github, workspace: ws.workspace, clock, log: () => {} });
    expect(clock.now()).toBeLessThanOrEqual(DEADLINE_MS);
  });
});
