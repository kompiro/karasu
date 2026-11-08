import {
  GETTING_STARTED_PROJECT,
  GETTING_STARTED_PROJECT_EN,
  PAYROLL_SPLIT_PROJECT,
  PAYROLL_SPLIT_PROJECT_EN,
  SERVICE_SPLIT_PROJECT,
  SERVICE_SPLIT_PROJECT_EN,
  type ExampleProject,
} from "@karasu-tools/core";
import type { Translations } from "@karasu-tools/i18n";
import type { ActiveView } from "../../state/app-reducer.js";
import {
  happenedSince,
  type AppSignals,
  type EventSignal,
  type ShowingSignal,
} from "../../state/app-signals.js";

/** A translation key whose value takes no parameters. */
type PhraseKey = {
  [K in keyof Translations]: Translations[K] extends string ? K : never;
}[keyof Translations];

/** The entries of the bundled samples the guides walk (examples/<lang>/). */
type SampleEntry = "index.krs" | "planned.krs" | "migrating.krs";

/**
 * What the app shows for one step: the entry to preview, the view, and
 * optionally the entry to diff it against. Entering a step applies its scene
 * through the reducer actions the user's own clicks use; nothing is locked,
 * so the user can wander off and Next / Back bring the scene back.
 */
export interface Scene {
  file: SampleEntry;
  view: ActiveView;
  /** The "before" side of the existing diff mode; the scene's `file` is "after". */
  compareWith?: SampleEntry;
  /** The node the step's text names, kept in view in the preview (#3583). */
  reveal?: string;
}

/**
 * What a step asks the visitor to do, as data, so a test can hold the node it
 * names against the sample (#3599). A step that asks for nothing has none.
 */
type StepCompletion =
  /** Drilled into `node` in that view: the view path holds it. */
  | { kind: "drilled"; view: "system"; node: string }
  /** The app is showing it now. */
  | { kind: "showing"; what: ShowingSignal }
  /** Any of these happened since the step's scene landed. */
  | { kind: "event"; any: readonly EventSignal[] };

export interface TourStep {
  scene: Scene;
  /** What the step asks for; the panel marks it done once the visitor did it. */
  completion?: StepCompletion;
  title: PhraseKey;
  body: PhraseKey;
  /** What the step wants the visitor to notice in the diagram. */
  notice?: PhraseKey;
  /** Questions to take to the team, under `firstRun.step.decision.questions`. */
  questions?: readonly PhraseKey[];
  /** Closing message on the last step. */
  done?: PhraseKey;
}

const SHARE_COMPLETION: StepCompletion = { kind: "event", any: ["share-opened", "svg-exported"] };

/**
 * The first-run guides (#3566, #3600). What each step tells the visitor to
 * notice is fenced against the samples in packages/core/src/examples.test.ts;
 * change the two together.
 */
const SERVICE_SPLIT_STEPS: readonly TourStep[] = [
  {
    scene: { file: "index.krs", view: "system", reveal: "CommerceApp" },
    completion: { kind: "drilled", view: "system", node: "CommerceApp" },
    title: "firstRun.step.current.title",
    body: "firstRun.step.current.body",
    notice: "firstRun.step.current.notice",
  },
  {
    scene: { file: "index.krs", view: "org" },
    completion: { kind: "showing", what: "team-dependencies" },
    title: "firstRun.step.org.title",
    body: "firstRun.step.org.body",
    notice: "firstRun.step.org.notice",
  },
  {
    scene: {
      file: "planned.krs",
      view: "system",
      compareWith: "index.krs",
      reveal: "BillingService",
    },
    title: "firstRun.step.target.title",
    body: "firstRun.step.target.body",
    notice: "firstRun.step.target.notice",
  },
  {
    scene: { file: "migrating.krs", view: "system", reveal: "BillingDB" },
    title: "firstRun.step.decision.title",
    body: "firstRun.step.decision.body",
    questions: [
      "firstRun.step.decision.q1",
      "firstRun.step.decision.q2",
      "firstRun.step.decision.q3",
      "firstRun.step.decision.q4",
    ],
  },
  {
    scene: { file: "migrating.krs", view: "system" },
    completion: SHARE_COMPLETION,
    title: "firstRun.step.share.title",
    body: "firstRun.step.share.body",
    done: "firstRun.step.share.done",
  },
];

/**
 * The same guide on the payroll sample (#3601), for a visitor who would rather
 * not read an online shop. The sample has the same shape role for role, so only
 * the nodes and the text that names the subject differ.
 */
const PAYROLL_SPLIT_STEPS: readonly TourStep[] = [
  {
    scene: { file: "index.krs", view: "system", reveal: "WorkforceApp" },
    completion: { kind: "drilled", view: "system", node: "WorkforceApp" },
    title: "firstRun.step.current.title",
    body: "firstRun.payroll.current.body",
    notice: "firstRun.payroll.current.notice",
  },
  {
    scene: { file: "index.krs", view: "org" },
    completion: { kind: "showing", what: "team-dependencies" },
    title: "firstRun.step.org.title",
    body: "firstRun.step.org.body",
    notice: "firstRun.payroll.org.notice",
  },
  {
    scene: {
      file: "planned.krs",
      view: "system",
      compareWith: "index.krs",
      reveal: "PayrollService",
    },
    title: "firstRun.step.target.title",
    body: "firstRun.payroll.target.body",
    notice: "firstRun.payroll.target.notice",
  },
  {
    scene: { file: "migrating.krs", view: "system", reveal: "PayrollDB" },
    title: "firstRun.step.decision.title",
    body: "firstRun.payroll.decision.body",
    questions: [
      "firstRun.payroll.decision.q1",
      "firstRun.step.decision.q2",
      "firstRun.step.decision.q3",
      "firstRun.step.decision.q4",
    ],
  },
  {
    scene: { file: "migrating.krs", view: "system" },
    completion: SHARE_COMPLETION,
    title: "firstRun.step.share.title",
    body: "firstRun.step.share.body",
    done: "firstRun.step.share.done",
  },
];

/** Reads the Getting Started sample from three sides. */
const UNDERSTAND_STEPS: readonly TourStep[] = [
  {
    scene: { file: "index.krs", view: "system", reveal: "ECommerce" },
    completion: { kind: "drilled", view: "system", node: "ECommerce" },
    title: "firstRun.understand.system.title",
    body: "firstRun.understand.system.body",
    notice: "firstRun.understand.system.notice",
  },
  {
    scene: { file: "index.krs", view: "deploy" },
    title: "firstRun.understand.deploy.title",
    body: "firstRun.understand.deploy.body",
    notice: "firstRun.understand.deploy.notice",
  },
  {
    scene: { file: "index.krs", view: "org" },
    title: "firstRun.understand.org.title",
    body: "firstRun.understand.org.body",
    notice: "firstRun.understand.org.notice",
  },
  {
    scene: { file: "index.krs", view: "system" },
    completion: SHARE_COMPLETION,
    title: "firstRun.step.share.title",
    body: "firstRun.step.share.body",
    done: "firstRun.understand.done",
  },
];

/** Follows the service-split sample's migration: against today, in the model, against the target. */
const EVOLVE_STEPS: readonly TourStep[] = [
  {
    scene: {
      file: "migrating.krs",
      view: "system",
      compareWith: "index.krs",
      reveal: "BillingService",
    },
    title: "firstRun.evolve.diff.title",
    body: "firstRun.evolve.diff.body",
    notice: "firstRun.evolve.diff.notice",
  },
  {
    scene: { file: "migrating.krs", view: "system", reveal: "BillingDB" },
    completion: { kind: "drilled", view: "system", node: "CommerceDB" },
    title: "firstRun.evolve.marks.title",
    body: "firstRun.evolve.marks.body",
    notice: "firstRun.evolve.marks.notice",
  },
  {
    scene: {
      file: "planned.krs",
      view: "system",
      compareWith: "migrating.krs",
      reveal: "BillingDB",
    },
    title: "firstRun.evolve.remaining.title",
    body: "firstRun.evolve.remaining.body",
    notice: "firstRun.evolve.remaining.notice",
  },
  {
    scene: { file: "migrating.krs", view: "system" },
    completion: SHARE_COMPLETION,
    title: "firstRun.step.share.title",
    body: "firstRun.step.share.body",
    done: "firstRun.evolve.done",
  },
];

export type TourId = "service-split" | "understand" | "evolve" | "service-split-payroll";

export interface TourDefinition {
  /** The panel's heading: the Welcome entry the guide belongs to. */
  heading: PhraseKey;
  steps: readonly TourStep[];
  /** The sample the guide walks, in each language the samples come in. */
  example: { en: ExampleProject; ja: ExampleProject };
  /**
   * Starting the guide uses an unedited copy of its sample when there is one
   * (#3600). Without this it opens a new copy every time.
   */
  reusesCopy?: boolean;
  /** The guide on the other subject, offered on step 1 (#3601). */
  switchTo?: { tour: TourId; label: PhraseKey };
}

const SERVICE_SPLIT_SAMPLE = { en: SERVICE_SPLIT_PROJECT_EN, ja: SERVICE_SPLIT_PROJECT };

export const TOURS: Record<TourId, TourDefinition> = {
  "service-split": {
    heading: "firstRun.welcome.design.title",
    steps: SERVICE_SPLIT_STEPS,
    example: SERVICE_SPLIT_SAMPLE,
    switchTo: { tour: "service-split-payroll", label: "firstRun.tour.switchToPayroll" },
  },
  understand: {
    heading: "firstRun.welcome.understand.title",
    steps: UNDERSTAND_STEPS,
    example: { en: GETTING_STARTED_PROJECT_EN, ja: GETTING_STARTED_PROJECT },
    reusesCopy: true,
  },
  evolve: {
    heading: "firstRun.welcome.evolve.title",
    steps: EVOLVE_STEPS,
    example: SERVICE_SPLIT_SAMPLE,
  },
  // No Welcome entry of its own: it is reached by switching, so Restart opening
  // it again follows the switch's rule.
  "service-split-payroll": {
    heading: "firstRun.welcome.design.title",
    steps: PAYROLL_SPLIT_STEPS,
    example: { en: PAYROLL_SPLIT_PROJECT_EN, ja: PAYROLL_SPLIT_PROJECT },
    reusesCopy: true,
    switchTo: { tour: "service-split", label: "firstRun.tour.switchToShop" },
  },
};

/** A value read from storage names a guide, not just any key of the object's prototype. */
export function isTourId(value: unknown): value is TourId {
  return typeof value === "string" && Object.hasOwn(TOURS, value);
}

export interface CompletionInput {
  completion: StepCompletion | undefined;
  /** The scene key of the step on screen (`tour:<run>:<step>`). */
  key: string;
  /** The scene that has landed in the tour's project, or null while none has. */
  landedKey: string | null;
  /** The scene keys already marked done. */
  completed: ReadonlySet<string>;
  activeView: ActiveView;
  viewPath: readonly string[];
  signals: AppSignals;
  /** Only events after this seq count: the seq when the scene landed. */
  sinceSeq: number;
}

/**
 * Whether the step's ask is done (#3599). Once done it stays done for that
 * scene key, so drilling back out or closing the dependencies does not take
 * the mark away. Nothing is judged before the step's own scene has landed in
 * the tour's project: right after Back or a restart, the view path still
 * belongs to the previous scene (TPL-1534).
 */
export function isStepDone(input: CompletionInput): boolean {
  const { completion, key } = input;
  if (!completion) return false;
  if (input.completed.has(key)) return true;
  if (input.landedKey !== key) return false;
  switch (completion.kind) {
    case "drilled":
      return input.activeView === completion.view && input.viewPath.includes(completion.node);
    case "showing":
      return input.signals.showing.has(completion.what);
    case "event":
      return happenedSince(input.signals, completion.any, input.sinceSeq);
  }
}
