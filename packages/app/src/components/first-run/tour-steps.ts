import type { Translations } from "@karasu-tools/i18n";
import type { ActiveView } from "../../state/app-reducer.js";

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

export interface TourStep {
  scene: Scene;
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
    title: "firstRun.step.current.title",
    body: "firstRun.step.current.body",
    notice: "firstRun.step.current.notice",
  },
  {
    scene: { file: "index.krs", view: "org" },
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
    title: "firstRun.step.share.title",
    body: "firstRun.step.share.body",
    done: "firstRun.step.share.done",
  },
];

/** The Track architecture evolution entry: the migration so far, as a diff against today. */
export const EVOLVE_SCENE: Scene = {
  file: "migrating.krs",
  view: "system",
  compareWith: "index.krs",
};
