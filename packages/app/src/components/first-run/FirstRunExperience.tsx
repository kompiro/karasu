import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch } from "react";
import {
  GETTING_STARTED_PROJECT,
  GETTING_STARTED_PROJECT_EN,
  SERVICE_SPLIT_PROJECT,
  SERVICE_SPLIT_PROJECT_EN,
  type ExampleProject,
  type Project,
} from "@karasu-tools/core";
import { useTranslation } from "../../i18n/index.js";
import { useCommand } from "../../keyboard/use-command.js";
import type { ActiveView, AppAction } from "../../state/app-reducer.js";
import { useAppSignals } from "../../state/app-signals.js";
import { TourPanel } from "./TourPanel.js";
import { WelcomeDialog, type WelcomeChoice } from "./WelcomeDialog.js";
import { EVOLVE_SCENE, SERVICE_SPLIT_TOUR, isStepDone } from "./tour-steps.js";
import { useGuidedScene, type PendingScene } from "./use-guided-scene.js";
import { markWelcomeDismissed, shouldShowWelcome } from "./welcome-gate.js";
import { readTourProjectId, writeTourProjectId } from "./tour-project.js";
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
  openBundledExample: (example: ExampleProject) => Promise<Project | null>;
  dispatch: Dispatch<AppAction>;
}

/** A running guide or a one-off scene, in the project it opened. */
type Guide =
  | {
      kind: "tour";
      projectId: string;
      root: string;
      step: number;
      run: number;
      /** Resumed at boot, until the visitor moves (#3598). */
      resumed?: boolean;
    }
  | { kind: "scene"; root: string; run: number };

/**
 * The first-run experience (#3563): the Welcome dialog (#3565) and the
 * Design a service split tour (#3566). Mounted from `ProjectModeApp`, so it
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
  openBundledExample,
  dispatch,
}: FirstRunExperienceProps) {
  const { locale } = useTranslation();
  // A resumed tour is there from the first frame. `run` 0 is never a
  // started tour's, which count from 1, so its scene key is its own.
  const [guide, setGuide] = useState<Guide | null>(() =>
    tourResume.kind === "resume"
      ? {
          kind: "tour",
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

  const isJa = locale === "ja";
  const serviceSplit = isJa ? SERVICE_SPLIT_PROJECT : SERVICE_SPLIT_PROJECT_EN;

  const startTour = useCallback((project: Project) => {
    writeTourProjectId(project.id);
    writeTourProgress({ projectId: project.id, step: 0 });
    const run = ++runs.current;
    setGuide({ kind: "tour", projectId: project.id, root: project.rootPath, step: 0, run });
  }, []);

  // Opening a copy of the sample is an OPFS write. While one is in flight a
  // second open is ignored, and so is a restart (below), so no guide starts
  // meanwhile. The run check is a second line of defence for a future path
  // that starts a guide without this guard: the newer guide wins (TPL-1534).
  const opening = useRef(false);
  const openSample = useCallback(async (): Promise<Project | null> => {
    if (opening.current) return null;
    opening.current = true;
    const run = runs.current;
    const project = await openBundledExample(serviceSplit).finally(() => {
      opening.current = false;
    });
    return project && runs.current === run ? project : null;
  }, [openBundledExample, serviceSplit]);

  // Walks the guide again from step 1 (#3597), in the sample project the tour
  // opened before so a second run does not pile up copies; a new copy only
  // when that project is gone. It closes Welcome as a choice there would.
  const restartTour = useCallback(async () => {
    setGreeted(true);
    setRequested(false);
    markWelcomeDismissed();
    if (opening.current) return;
    const recorded = readTourProjectId();
    const existing = recorded === null ? undefined : projects.find((p) => p.id === recorded);
    if (existing) {
      if (existing.id !== currentProject?.id) navigateToProject(existing);
      startTour(existing);
      return;
    }
    const project = await openSample();
    if (project) startTour(project);
  }, [projects, currentProject, navigateToProject, openSample, startTour]);

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
      // A choice that starts no guide still outranks a sample still opening
      // for an earlier restart: the visitor chose to be elsewhere.
      if (choice === "editor" || choice === "understand") runs.current++;
      if (choice === "editor") return;

      if (choice === "understand") {
        const template = isJa ? GETTING_STARTED_PROJECT : GETTING_STARTED_PROJECT_EN;
        const seeded = projects.find((p) => p.name === template.name);
        // On a first visit the seeded project is already open: navigating to
        // it again would clear the open file without selecting it back.
        // A switch clears any diff; reselecting must leave the same state.
        if (seeded && seeded.id === currentProject?.id) {
          dispatch({ type: "SET_COMPARE_SOURCE", source: null });
          await selectFile(`${seeded.rootPath}/index.krs`);
        } else if (seeded) navigateToProject(seeded);
        else await openBundledExample(template);
        return;
      }

      const project = await openSample();
      if (!project) return;
      if (choice === "design") {
        startTour(project);
        return;
      }
      // Another guide replaces the tour, so a reload must not bring it back.
      clearTourProgress();
      setGuide({ kind: "scene", root: project.rootPath, run: ++runs.current });
    },
    [
      isJa,
      projects,
      currentProject,
      navigateToProject,
      selectFile,
      openBundledExample,
      dispatch,
      openSample,
      startTour,
    ],
  );

  const pending = useMemo<PendingScene | null>(() => {
    if (!guide) return null;
    if (guide.kind === "scene") {
      return {
        root: guide.root,
        scene: EVOLVE_SCENE,
        key: `scene:${guide.run}`,
        reapplyOnReturn: false,
      };
    }
    return {
      root: guide.root,
      scene: SERVICE_SPLIT_TOUR[guide.step].scene,
      key: `tour:${guide.run}:${guide.step}`,
      reapplyOnReturn: true,
      resumed: guide.resumed,
    };
  }, [guide]);

  const landedKey = useGuidedScene({
    pending,
    currentProject,
    currentFilePath,
    selectFile,
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
    guide?.kind === "tour" && pending !== null
      ? isStepDone({
          completion: SERVICE_SPLIT_TOUR[guide.step].completion,
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
      if (guide?.kind !== "tour") return;
      const step = Math.min(Math.max(guide.step + delta, 0), SERVICE_SPLIT_TOUR.length - 1);
      setGuide({ ...guide, step, resumed: false });
      writeTourProgress({ projectId: guide.projectId, step });
    },
    [guide],
  );

  // The diff a tour step opened is the tour's, so the editor starts without
  // it; a comparison the visitor opened on another step stays.
  const tourStep = guide?.kind === "tour" ? SERVICE_SPLIT_TOUR[guide.step] : null;
  const endTour = useCallback(() => {
    clearTourProgress();
    setGuide(null);
    if (tourStep?.scene.compareWith) dispatch({ type: "SET_COMPARE_SOURCE", source: null });
  }, [tourStep, dispatch]);

  // The panel belongs to the tour's project: switching away hides it, and
  // switching back shows it again at the same step.
  const showTour = guide?.kind === "tour" && currentProject?.rootPath === guide.root;

  return (
    <>
      <WelcomeDialog open={welcomeOpen} onChoose={(c) => void choose(c)} />
      {showTour && (
        <TourPanel
          step={SERVICE_SPLIT_TOUR[guide.step]}
          index={guide.step}
          total={SERVICE_SPLIT_TOUR.length}
          done={stepDone}
          landed={landing.key === pending?.key}
          onBack={() => moveStep(-1)}
          onNext={() => moveStep(1)}
          onClose={endTour}
        />
      )}
    </>
  );
}
