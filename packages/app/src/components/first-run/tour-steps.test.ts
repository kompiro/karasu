import { describe, expect, it } from "vitest";
import { Parser, SERVICE_SPLIT_PROJECT, SERVICE_SPLIT_PROJECT_EN } from "@karasu-tools/core";
import type { AppSignals } from "../../state/app-signals.js";
import { SERVICE_SPLIT_TOUR, isStepDone, type CompletionInput } from "./tour-steps.js";

const none: AppSignals = { showing: new Set(), lastEvent: {}, seq: 0 };

function input(over: Partial<CompletionInput>): CompletionInput {
  return {
    completion: undefined,
    key: "tour:1:0",
    landedKey: "tour:1:0",
    completed: new Set(),
    activeView: "system",
    viewPath: [],
    signals: none,
    sinceSeq: 0,
    ...over,
  };
}

const [current, org, target, decision, share] = SERVICE_SPLIT_TOUR;

describe("isStepDone (#3599)", () => {
  it("is done once the visitor drilled into the node the step names", () => {
    const step = input({ completion: current.completion });
    expect(isStepDone(step)).toBe(false);
    expect(isStepDone({ ...step, viewPath: ["CommerceApp"] })).toBe(true);
    // The view path is the full path to the drilled node.
    expect(isStepDone({ ...step, viewPath: ["CommerceApp", "Ordering"] })).toBe(true);
    // The same path in another view is not the ask.
    expect(isStepDone({ ...step, activeView: "org", viewPath: ["CommerceApp"] })).toBe(false);
  });

  it("is done while the team dependencies are on screen, including from before the step", () => {
    const step = input({ completion: org.completion });
    expect(isStepDone(step)).toBe(false);
    const showing: AppSignals = { ...none, showing: new Set(["team-dependencies"]) };
    expect(isStepDone({ ...step, signals: showing })).toBe(true);
  });

  it("counts a share or an SVG export only after the scene landed", () => {
    const step = input({ completion: share.completion, sinceSeq: 2 });
    const before: AppSignals = { ...none, lastEvent: { "share-opened": 2 }, seq: 2 };
    expect(isStepDone({ ...step, signals: before })).toBe(false);
    for (const kind of ["share-opened", "svg-exported"] as const) {
      const after: AppSignals = { ...none, lastEvent: { [kind]: 3 }, seq: 3 };
      expect(isStepDone({ ...step, signals: after })).toBe(true);
    }
  });

  it("judges nothing before the step's own scene has landed (TPL-1534)", () => {
    // Right after Back from step 2, the view path is still the drill made there.
    const step = input({
      completion: current.completion,
      key: "tour:1:0",
      landedKey: "tour:1:1",
      viewPath: ["CommerceApp"],
    });
    expect(isStepDone(step)).toBe(false);
    expect(isStepDone({ ...step, landedKey: null })).toBe(false);
  });

  it("keeps a step done under its key after the condition goes away, and only under it", () => {
    const step = input({ completion: current.completion, completed: new Set(["tour:1:0"]) });
    expect(isStepDone(step)).toBe(true);
    // Before landing too: Back onto a step already done shows it done.
    expect(isStepDone({ ...step, landedKey: null })).toBe(true);
    // A restart is a new run, so a new key that starts undone.
    expect(isStepDone({ ...step, key: "tour:2:0", landedKey: "tour:2:0" })).toBe(false);
  });

  it("marks nothing on the steps that ask for nothing", () => {
    expect(target.completion).toBeUndefined();
    expect(decision.completion).toBeUndefined();
    const everything: AppSignals = {
      showing: new Set(["team-dependencies"]),
      lastEvent: { "share-opened": 1, "svg-exported": 1 },
      seq: 1,
    };
    expect(isStepDone(input({ signals: everything, viewPath: ["CommerceApp"] }))).toBe(false);
  });
});

describe.each([
  ["ja", SERVICE_SPLIT_PROJECT],
  ["en", SERVICE_SPLIT_PROJECT_EN],
] as const)(
  "service-split (%s): the nodes the steps ask for exist (TPL-3113)",
  (_lang, project) => {
    it.each(SERVICE_SPLIT_TOUR.map((step, i) => [i + 1, step] as const))("step %i", (_n, step) => {
      if (step.completion?.kind !== "drilled") return;
      const file = project.files.find((f) => f.path === step.scene.file);
      expect(file).toBeDefined();
      const index = Parser.parse(file?.content ?? "").value.nodePathIndex;
      expect(index.get(step.completion.node)).toContain(step.completion.node);
    });
  },
);
