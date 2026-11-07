import { describe, expect, it } from "vitest";
import { en, ja, type Translations } from "@karasu-tools/i18n";
import { Parser, type ExampleProject } from "@karasu-tools/core";
import type { AppSignals } from "../../state/app-signals.js";
import { TOURS, isStepDone, isTourId, type CompletionInput, type TourId } from "./tour-steps.js";

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

const [current, org, target, decision, share] = TOURS["service-split"].steps;

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

describe("isTourId (#3600)", () => {
  it("accepts the guides and nothing else, including keys of the object's prototype", () => {
    for (const tour of Object.keys(TOURS)) expect(isTourId(tour)).toBe(true);
    for (const value of ["other", "constructor", "toString", 1, null]) {
      expect(isTourId(value)).toBe(false);
    }
  });
});

describe("the guides' shape (#3600)", () => {
  it.each(Object.entries(TOURS))("%s ends on sharing, and only there", (_tour, { steps }) => {
    const last = steps[steps.length - 1];
    expect(last.title).toBe("firstRun.step.share.title");
    expect(last.completion).toEqual({ kind: "event", any: ["share-opened", "svg-exported"] });
    expect(last.done).toBeDefined();
    expect(steps.slice(0, -1).filter((step) => step.done)).toEqual([]);
  });
});

describe("switching the subject (#3601)", () => {
  it("offers it on the Design guides only, each pointing at the other", () => {
    expect(TOURS["service-split"].switchTo?.tour).toBe("service-split-payroll");
    expect(TOURS["service-split-payroll"].switchTo?.tour).toBe("service-split");
    expect(TOURS.understand.switchTo).toBeUndefined();
    expect(TOURS.evolve.switchTo).toBeUndefined();
  });

  it("walks the same scenes on both subjects, so the guide has one shape", () => {
    const shape = (tour: TourId) =>
      TOURS[tour].steps.map(({ scene, completion }) => ({
        file: scene.file,
        view: scene.view,
        compareWith: scene.compareWith,
        asks: completion?.kind,
      }));
    expect(shape("service-split-payroll")).toEqual(shape("service-split"));
  });
});

// From TOURS, so a guide added there is held here without anyone remembering to.
const SAMPLES = (Object.keys(TOURS) as TourId[]).flatMap((tour) =>
  (["ja", "en"] as const).map((lang): [string, TourId, ExampleProject] => [
    lang,
    tour,
    TOURS[tour].example[lang],
  ]),
);

describe.each(SAMPLES)("%s %s: what the steps name exists (TPL-3113)", (_lang, tour, project) => {
  /** The ids of the system's nodes: what a step can reveal or ask to drill into. */
  const nodeIds = (path: string) => {
    const file = project.files.find((f) => f.path === path);
    const { systems } = Parser.parse(file?.content ?? "").value;
    return systems.flatMap((system) => system.children.map((node) => node.id));
  };

  it.each(TOURS[tour].steps.map((step, i) => [i + 1, step] as const))("step %i", (_n, step) => {
    const { file, compareWith, reveal } = step.scene;
    const paths = project.files.map((f) => f.path);
    expect(paths).toContain(file);
    expect(paths).toEqual(expect.arrayContaining(compareWith ? [compareWith] : []));
    const drilled = step.completion?.kind === "drilled" ? [step.completion.node] : [];
    const named = reveal ? [reveal, ...drilled] : drilled;
    expect(nodeIds(file)).toEqual(expect.arrayContaining(named));
  });
});

/**
 * What the guides' text calls a node must be what the diagram calls it: a
 * visitor looks for the name they just read. The ids are the sample's; the
 * labels come from the model, so renaming one in either place fails here.
 */
type Labelled = { id: string; label?: string; children?: readonly Labelled[] };
const labelsOf = (project: ExampleProject, path: string) => {
  const file = project.files.find((f) => f.path === path);
  const { systems, organizations } = Parser.parse(file?.content ?? "").value;
  const labels = new Map<string, string>();
  const walk = (nodes: readonly Labelled[]) => {
    for (const node of nodes) {
      labels.set(node.id, node.label ?? node.id);
      walk(node.children ?? []);
    }
  };
  walk(systems.flatMap((system) => system.children) as readonly Labelled[]);
  walk(organizations.flatMap((organization) => organization.teams) as readonly Labelled[]);
  return labels;
};

/** The file whose labels the guide's text is read against; it names every node. */
const LABELS_FROM: Record<TourId, string> = {
  "service-split": "migrating.krs",
  understand: "index.krs",
  evolve: "migrating.krs",
  "service-split-payroll": "migrating.krs",
};

const GUIDE_TEXT_NAMES: Record<TourId, [keyof Translations, string[]][]> = {
  "service-split": [
    ["firstRun.step.current.body", ["CommerceApp"]],
    ["firstRun.step.current.notice", ["Ordering", "Billing"]],
    ["firstRun.step.org.notice", ["billing", "Billing", "commerce"]],
    ["firstRun.step.target.body", ["Billing"]],
    ["firstRun.step.decision.body", ["BillingService"]],
    ["firstRun.step.decision.q1", ["BillingService"]],
  ],
  understand: [
    ["firstRun.understand.system.body", ["ECommerce"]],
    ["firstRun.understand.system.notice", ["Catalog", "Order"]],
    ["firstRun.understand.deploy.notice", ["ECommerce", "Notification", "Payment", "Inventory"]],
    ["firstRun.understand.org.notice", ["notification", "Notification", "commerce"]],
  ],
  evolve: [
    ["firstRun.evolve.diff.notice", ["BillingService", "Billing", "CommerceApp"]],
    ["firstRun.evolve.marks.body", ["BillingDB", "CommerceDB"]],
    ["firstRun.evolve.remaining.notice", ["BillingDB"]],
  ],
  "service-split-payroll": [
    ["firstRun.payroll.current.body", ["WorkforceApp"]],
    ["firstRun.payroll.current.notice", ["Attendance", "Payroll"]],
    ["firstRun.payroll.org.notice", ["payroll", "Payroll", "workforce"]],
    ["firstRun.payroll.target.body", ["Payroll"]],
    ["firstRun.payroll.decision.body", ["PayrollService"]],
    ["firstRun.payroll.decision.q1", ["PayrollService"]],
  ],
};

describe.each([
  ["ja", ja],
  ["en", en],
] as const)("%s: the guides' text uses the sample's labels (#3600)", (lang, phrases) => {
  const rows = (Object.keys(GUIDE_TEXT_NAMES) as TourId[]).flatMap((tour) =>
    GUIDE_TEXT_NAMES[tour].map(([key, ids]) => [key, tour, ids] as const),
  );
  it.each(rows)("%s (%s)", (key, tour, ids) => {
    const labels = labelsOf(TOURS[tour].example[lang], LABELS_FROM[tour]);
    const text = String(phrases[key]);
    const missing = ids.map((id) => labels.get(id) ?? id).filter((label) => !text.includes(label));
    expect(missing).toEqual([]);
  });
});
