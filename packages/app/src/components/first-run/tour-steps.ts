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

/** The entries of the bundled service-split sample (examples/<lang>/service-split). */
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

/**
 * The Design a service split guide (#3566). What each step tells the visitor
 * to notice is fenced against the sample in packages/core/src/examples.test.ts;
 * change the two together.
 */
export const SERVICE_SPLIT_TOUR: readonly TourStep[] = [
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
    completion: { kind: "event", any: ["share-opened", "svg-exported"] },
    title: "firstRun.step.share.title",
    body: "firstRun.step.share.body",
    done: "firstRun.step.share.done",
  },
];

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

/** The Track architecture evolution entry: the migration so far, as a diff against today. */
export const EVOLVE_SCENE: Scene = {
  file: "migrating.krs",
  view: "system",
  compareWith: "index.krs",
};
