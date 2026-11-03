import { describe, expect, it } from "vitest";
import {
  type Artifact,
  type Io,
  label,
  LABEL,
  pickArtifact,
  type Pull,
  readVerdict,
  type Run,
  targetPull,
} from "./label.ts";

const SHA = "b".repeat(40);
const REPO = "kompiro/karasu";

const run = (conclusion: string | null = "success"): Run => ({
  conclusion,
  headSha: SHA,
  headRepo: REPO,
  headBranch: "feat/x",
});

const pull = (over: Partial<Pull> = {}): Pull => ({
  number: 10,
  headSha: SHA,
  headRepo: REPO,
  labels: [],
  ...over,
});

const artifact = (over: Partial<Artifact> = {}): Artifact => ({
  id: 1,
  name: "render-equivalence",
  expired: false,
  size: 500,
  ...over,
});

const verdict = (status: string, differences: number, extra: object = {}): string =>
  JSON.stringify({ version: 1, status, refactor: false, differences, keys: [], ...extra });

describe("readVerdict", () => {
  it.each([
    [verdict("equal", 0), "equal"],
    [verdict("different", 3), "changed"],
    [verdict("incomparable", 0), "changed"],
  ])("reads %s as %j", (text, expected) => {
    expect(readVerdict(text)).toBe(expected);
  });

  it.each([
    ["missing", null],
    ["not JSON", "{"],
    ["not an object", "[]"],
    ["null", "null"],
    ["another version", JSON.stringify({ version: 2, status: "equal", differences: 0 })],
    ["an unknown status", verdict("same", 0)],
    ["equal with differences", verdict("equal", 2)],
    ["different without differences", verdict("different", 0)],
    ["incomparable with differences", verdict("incomparable", 1)],
    ["a string count", JSON.stringify({ version: 1, status: "equal", differences: "0" })],
    ["a fractional count", verdict("different", 1.5)],
    ["a negative count", verdict("different", -1)],
  ])("rejects %s", (_name, text) => {
    expect(readVerdict(text)).toBeNull();
  });
});

describe("targetPull", () => {
  it("picks the open PR whose head is the run's commit in the run's repository", () => {
    expect(targetPull(run(), [pull()])?.number).toBe(10);
  });

  it.each([
    ["no PR", []],
    ["a PR pushed since the run", [pull({ headSha: "c".repeat(40) })]],
    ["a fork's branch of the same name", [pull({ headRepo: "someone/karasu" })]],
    ["a PR whose fork was deleted", [pull({ headRepo: null })]],
    ["two PRs with the same head", [pull(), pull({ number: 11 })]],
  ])("finds none for %s", (_name, pulls) => {
    expect(targetPull(run(), pulls)).toBeNull();
  });
});

describe("pickArtifact", () => {
  it("picks the run's one verdict artifact", () => {
    expect(pickArtifact([artifact(), artifact({ id: 2, name: "other" })])?.id).toBe(1);
  });

  it.each([
    ["none", []],
    ["only other names", [artifact({ name: "render-equivalence-x" })]],
    ["two", [artifact(), artifact({ id: 2 })]],
    ["an expired one", [artifact({ expired: true })]],
    ["one too large to be a verdict", [artifact({ size: 2 * 1024 * 1024 })]],
  ])("picks nothing from %s", (_name, artifacts) => {
    expect(pickArtifact(artifacts)).toBeNull();
  });
});

interface Fake {
  io: Io;
  calls: { setLabel: [number, boolean][]; verdictRead: number; pullsRead: number };
}

function fake(
  options: {
    run?: Run;
    pulls?: Pull[];
    artifacts?: Artifact[];
    verdict?: string | null;
  } = {},
): Fake {
  const calls: Fake["calls"] = { setLabel: [], verdictRead: 0, pullsRead: 0 };
  const io: Io = {
    run: () => options.run ?? run(),
    pulls: () => {
      calls.pullsRead++;
      return options.pulls ?? [pull()];
    },
    artifacts: () => options.artifacts ?? [artifact()],
    verdict: () => {
      calls.verdictRead++;
      return options.verdict === undefined ? verdict("equal", 0) : options.verdict;
    },
    setLabel: (n, on) => {
      calls.setLabel.push([n, on]);
    },
    log: () => {},
  };
  return { io, calls };
}

describe("label", () => {
  it.each(["skipped", "cancelled", "action_required", "stale", "neutral", null])(
    "leaves the label alone when the run concluded %j",
    (conclusion) => {
      const { io, calls } = fake({ run: run(conclusion), verdict: verdict("different", 1) });
      label(io);
      expect(calls.setLabel).toEqual([]);
      expect(calls.pullsRead).toBe(0);
    },
  );

  it.each(["success", "failure", "timed_out", "startup_failure", "a_new_conclusion"])(
    "reads the verdict when the run concluded %j",
    (conclusion) => {
      const { io, calls } = fake({ run: run(conclusion), verdict: verdict("different", 1) });
      label(io);
      expect(calls.setLabel).toEqual([[10, true]]);
    },
  );

  it("adds the label when the rendering differs", () => {
    const { io, calls } = fake({ verdict: verdict("different", 4) });
    label(io);
    expect(calls.setLabel).toEqual([[10, true]]);
  });

  it("adds the label when the comparison did not finish", () => {
    const { io, calls } = fake({ verdict: verdict("incomparable", 0) });
    label(io);
    expect(calls.setLabel).toEqual([[10, true]]);
  });

  it("removes the label when nothing differs", () => {
    const { io, calls } = fake({ pulls: [pull({ labels: [LABEL] })] });
    label(io);
    expect(calls.setLabel).toEqual([[10, false]]);
  });

  it("changes nothing when the label already says the same", () => {
    const on = fake({ pulls: [pull({ labels: [LABEL] })], verdict: verdict("different", 1) });
    label(on.io);
    const off = fake();
    label(off.io);
    expect([...on.calls.setLabel, ...off.calls.setLabel]).toEqual([]);
  });

  it.each([
    ["no artifact", { artifacts: [] }],
    ["two artifacts", { artifacts: [artifact(), artifact({ id: 2 })] }],
    ["an unreadable verdict.json", { verdict: null }],
    ["a verdict of another shape", { verdict: '{"status":"equal"}' }],
  ])("adds the label for %s", (_name, options) => {
    const { io, calls } = fake({ ...options, pulls: [pull({ labels: [] })] });
    label(io);
    expect(calls.setLabel).toEqual([[10, true]]);
  });

  it("does not open the artifact when there is not exactly one", () => {
    const { io, calls } = fake({ artifacts: [artifact(), artifact({ id: 2 })] });
    label(io);
    expect(calls.verdictRead).toBe(0);
  });

  it("labels the PR found from the run, whatever PR the artifact names", () => {
    const { io, calls } = fake({
      pulls: [pull({ number: 10 })],
      verdict: verdict("different", 1, { pr: 99, number: 99 }),
    });
    label(io);
    expect(calls.setLabel).toEqual([[10, true]]);
  });

  it("leaves the label alone when the PR's head has moved past the run", () => {
    const { io, calls } = fake({
      pulls: [pull({ headSha: "c".repeat(40), labels: [LABEL] })],
      verdict: verdict("equal", 0),
    });
    label(io);
    expect(calls.setLabel).toEqual([]);
    expect(calls.verdictRead).toBe(0);
  });
});
