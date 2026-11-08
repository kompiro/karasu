import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch } from "react";
import type { ExampleProject, Project } from "@karasu-tools/core";
import { useTranslation } from "../../i18n/index.js";
import { useCommand } from "../../keyboard/use-command.js";
import type { ActiveView, AppAction } from "../../state/app-reducer.js";
import { useAppSignals } from "../../state/app-signals.js";
import { TourPanel } from "./TourPanel.js";
import { WelcomeDialog, type WelcomeChoice } from "./WelcomeDialog.js";
import { TOURS, isStepDone, type TourId } from "./tour-steps.js";
import { useGuidedScene, type PendingScene } from "./use-guided-scene.js";
import { markWelcomeDismissed, shouldShowWelcome } from "./welcome-gate.js";
import { isNamedAfterExample } from "./project-matches-example.js";
import { readTourProject, writeTourProject } from "./tour-project.js";
import { clearTourProgress, writeTourProgress } from "./tour-progress.js";
import type { TourResume } from "./tour-resume.js";
import type { FileSelectionStatus } from "../../hooks/useFileSelection.js";

interface FirstRunExperienceProps {
  /** This boot seeded the default projects (`useProjectInitialization`). */
  seededDefaults: boolean;
  /** The URL the app was opened with, read before the app rewrites the hash. */
  initialLocation: Pick<Location, "search" | "hash">;
  /** What the boot decided about a recorded tour, before the app rewrote the URL (#3598). */
  tourResume: TourResume;
  projects: Project[];
  currentProject: Project | null;
  currentFilePath: string | null;
  /** The view and the drill, for a step that asks to drill in (#3599). */
  activeView: ActiveView;
  viewPath: readonly string[];
  navigateToProject: (project: Project) => void;
  selectFile: (path: string) => Promise<FileSelectionStatus>;
  keepOpenFile: () => void;
  /** Adds a copy of the sample to the projects, without opening it. */
  addBundledExample: (example: ExampleProject) => Promise<Project | null>;
  /** Whether the project still holds the sample's files unchanged (#3600). */
  matchesExample: (project: Project, example: ExampleProject) => Promise<boolean>;
  dispatch: Dispatch<AppAction>;
}

/** A running guide, in the project it opened. */
interface Guide {
  tour: TourId;
  projectId: string;
  root: string;
  step: number;
  run: number;
  /** Resumed at boot, until the visitor moves (#3598). */
  resumed?: boolean;
}

/** The guide each Welcome entry starts. */
const ENTRY_TOUR: Record<Exclude<WelcomeChoice, "editor">, TourId> = {
  design: "service-split",
  understand: "understand",
  evolve: "evolve",
};

/**
 * The first-run experience (#3563): the Welcome dialog (#3565) and the guided
 * tours its entries start (#3566, #3600). Mounted from `ProjectModeApp`, so it
 * only exists where there are projects to open samples into. Everything it
 * does goes through the actions the rest of the app uses: samples are new
 * projects, and a guide step is a file selection, a view, and the existing
 * diff mode. The tour's progress is recorded where it starts, moves and ends,
 * so a reload resumes the same step (#3598).
 */
export function FirstRunExperience({
  seededDefaults,
  initialLocation,
  tourResume,
  projects,
  currentProject,
  currentFilePath,
  activeView,
  viewPath,
  navigateToProject,
  selectFile,
  keepOpenFile,
  addBundledExample,
  matchesExample,
  dispatch,
}: FirstRunExperienceProps) {
  const { locale, t } = useTranslation();
  // A resumed tour is there from the first frame. `run` 0 is never a
  // started tour's, which count from 1, so its scene key is its own.
  const [guide, setGuide] = useState<Guide | null>(() =>
    tourResume.kind === "resume"
      ? {
          tour: tourResume.tour,
          projectId: tourResume.projectId,
          root: tourResume.root,
          step: tourResume.step,
          run: 0,
          resumed: true,
        }
      : null,
  );
  const runs = useRef(0);
  useEffect(() => {
    if (tourResume.kind === "discard") clearTourProgress();
  }, [tourResume]);

  // Welcome greets a first visit until the visitor chooses, and opens again
  // whenever the command asks. Deciding the greeting reads storage once, when
  // seeding is known; the choice stores the flag, so it never greets twice.
  const greets = useMemo(
    () => shouldShowWelcome({ seededDefaults, location: initialLocation }),
    [seededDefaults, initialLocation],
  );
  const [greeted, setGreeted] = useState(false);
  const [requested, setRequested] = useState(false);
  const welcomeOpen = (greets && !greeted) || requested;

  useCommand({
    id: "view.showWelcome",
    title: "Show Welcome…",
    run: () => setRequested(true),
  });

  const startTour = useCallback((tour: TourId, project: Project) => {
    writeTourProject({ tour, projectId: project.id });
    writeTourProgress({ tour, projectId: project.id, step: 0 });
    const run = ++runs.current;
    setGuide({ tour, projectId: project.id, root: project.rootPath, step: 0, run });
  }, []);

  // The open project, read after an await.
  const openProjectId = useRef(currentProject?.id);
  useEffect(() => {
    openProjectId.current = currentProject?.id;
  }, [currentProject]);

  // The project a guide starts in (#3600). Design and Evolve add a new copy of
  // their sample. A guide that reuses one takes a copy that still says what the
  // sample says, so a first visit does not get a second Getting Started and
  // switching back and forth does not pile up copies (#3601). An edited one
  // would make the guide's text false, so it gets a new copy, unless the visitor
  // chose otherwise during the read.
  const resolveProject = useCallback(
    async (tour: TourId, reuse: boolean, wanted: () => boolean) => {
      const example = TOURS[tour].example[locale === "ja" ? "ja" : "en"];
      if (reuse) {
        // The open one first: moving away from it would be for nothing.
        const candidates = projects
          .filter((p) => isNamedAfterExample(p, example))
          .sort(
            (a, b) =>
              Number(b.id === openProjectId.current) - Number(a.id === openProjectId.current),
          );
        for (const candidate of candidates) {
          if (await matchesExample(candidate, example)) return candidate;
        }
        if (!wanted()) return null;
      }
      return addBundledExample(example);
    },
    [locale, projects, matchesExample, addBundledExample],
  );

  // Adding a copy of the sample is an OPFS write. While one is in flight a
  // second start is ignored, so no guide starts meanwhile. The newer choice wins
  // (TPL-1534): choosing the editor, ending the guide or opening another project
  // meanwhile drops the start, before it moves the visitor anywhere. A copy
  // already written stays in the project list.
  const opening = useRef(false);
  const enterTour = useCallback(
    async (tour: TourId, reuse = TOURS[tour].reusesCopy ?? false) => {
      if (opening.current) return;
      opening.current = true;
      const run = runs.current;
      const from = openProjectId.current;
      const wanted = () =>
        runs.current === run && (from === undefined || openProjectId.current === from);
      const project = await resolveProject(tour, reuse, wanted).finally(() => {
        opening.current = false;
      });
      if (!project || !wanted()) return;
      // Navigating to the open project again would clear the open file without
      // selecting it back.
      if (project.id !== openProjectId.current) navigateToProject(project);
      startTour(tour, project);
    },
    [resolveProject, navigateToProject, startTour],
  );

  // Moves to the guide on the other subject (#3601). The panel can be pressed
  // while the project resolves, unlike Welcome, so it stays locked until then.
  const [switching, setSwitching] = useState(false);
  const switchSample = useCallback(
    async (tour: TourId) => {
      setSwitching(true);
      await enterTour(tour, true).finally(() => setSwitching(false));
    },
    [enterTour],
  );

  // Walks the last guide started again from step 1 (#3597, #3600), in the
  // project it opened so a second run does not pile up copies; opened the way
  // its entry does when that project is gone, and the Design guide when none
  // has started. It closes Welcome as a choice there would.
  const restartTour = useCallback(async () => {
    setGreeted(true);
    setRequested(false);
    markWelcomeDismissed();
    if (opening.current) return;
    const recorded = readTourProject();
    const existing = recorded && projects.find((p) => p.id === recorded.projectId);
    if (recorded && existing) {
      if (existing.id !== currentProject?.id) navigateToProject(existing);
      startTour(recorded.tour, existing);
      return;
    }
    await enterTour(recorded?.tour ?? "service-split");
  }, [projects, currentProject, navigateToProject, enterTour, startTour]);

  useCommand({
    id: "view.restartTour",
    title: "Restart Guided Tour…",
    run: () => void restartTour(),
  });

  const choose = useCallback(
    async (choice: WelcomeChoice) => {
      setGreeted(true);
      setRequested(false);
      markWelcomeDismissed();
      if (choice === "editor") {
        // Outranks a sample still opening for an earlier start: the visitor
        // chose to be elsewhere.
        runs.current++;
        return;
      }
      await enterTour(ENTRY_TOUR[choice]);
    },
    [enterTour],
  );

  const steps = guide ? TOURS[guide.tour].steps : null;
  const tourStep = guide && steps ? steps[guide.step] : null;

  const pending = useMemo<PendingScene | null>(() => {
    if (!guide) return null;
    return {
      root: guide.root,
      scene: TOURS[guide.tour].steps[guide.step].scene,
      key: `tour:${guide.run}:${guide.step}`,
      resumed: guide.resumed,
    };
  }, [guide]);

  const landedKey = useGuidedScene({
    pending,
    currentProject,
    currentFilePath,
    selectFile,
    keepOpenFile,
    dispatch,
  });

  // A step's ask is judged once its scene has landed, from that point on
  // (#3599): an event counts only after the latest landing, so a share made in
  // another project, or before coming back, does not mark the step. A step
  // marked done keeps its mark under its scene key, for Back and coming back;
  // a restart has new keys, so it starts with none done.
  const signals = useAppSignals();
  const [landing, setLanding] = useState<{ key: string | null; seq: number }>({
    key: null,
    seq: 0,
  });
  if (landing.key !== landedKey) setLanding({ key: landedKey, seq: signals.seq });
  const [completed, setCompleted] = useState<ReadonlySet<string>>(() => new Set());
  const stepDone =
    tourStep && pending
      ? isStepDone({
          completion: tourStep.completion,
          key: pending.key,
          landedKey: landing.key,
          completed,
          activeView,
          viewPath,
          signals,
          sinceSeq: landing.seq,
        })
      : false;
  if (stepDone && pending && !completed.has(pending.key)) {
    setCompleted(new Set(completed).add(pending.key));
  }

  // The step is computed here rather than in an updater, which StrictMode
  // runs twice, so the record is written once, from the step shown.
  const moveStep = useCallback(
    (delta: number) => {
      if (!guide) return;
      const step = Math.min(Math.max(guide.step + delta, 0), TOURS[guide.tour].steps.length - 1);
      setGuide({ ...guide, step, resumed: false });
      writeTourProgress({ tour: guide.tour, projectId: guide.projectId, step });
    },
    [guide],
  );

  // The diff a tour step opened is the tour's, so the editor starts without
  // it; a comparison the visitor opened on another step stays.
  const endTour = useCallback(() => {
    // Outranks a guide still opening for a restart: it must not come back.
    runs.current++;
    clearTourProgress();
    setGuide(null);
    if (tourStep?.scene.compareWith) dispatch({ type: "SET_COMPARE_SOURCE", source: null });
  }, [tourStep, dispatch]);

  // The panel belongs to the tour's project: switching away hides it, and
  // switching back shows it again at the same step.
  const showTour = guide && tourStep && steps && currentProject?.rootPath === guide.root;
  const switchTo = guide?.step === 0 ? TOURS[guide.tour].switchTo : undefined;

  return (
    <>
      <WelcomeDialog open={welcomeOpen} onChoose={(c) => void choose(c)} />
      {showTour && (
        <TourPanel
          heading={t(TOURS[guide.tour].heading)}
          step={tourStep}
          index={guide.step}
          total={steps.length}
          done={stepDone}
          landed={landing.key === pending?.key}
          onBack={() => moveStep(-1)}
          onNext={() => moveStep(1)}
          onClose={endTour}
          switchLabel={switchTo && t(switchTo.label)}
          onSwitch={switchTo && (() => void switchSample(switchTo.tour))}
          switching={switching}
        />
      )}
    </>
  );
}
