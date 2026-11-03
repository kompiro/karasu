import { useCallback, useMemo, useRef, useState, type Dispatch } from "react";
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
import type { AppAction } from "../../state/app-reducer.js";
import { TourPanel } from "./TourPanel.js";
import { WelcomeDialog, type WelcomeChoice } from "./WelcomeDialog.js";
import { EVOLVE_SCENE, SERVICE_SPLIT_TOUR } from "./tour-steps.js";
import { useGuidedScene, type PendingScene } from "./use-guided-scene.js";
import { markWelcomeDismissed, shouldShowWelcome } from "./welcome-gate.js";

interface FirstRunExperienceProps {
  /** This boot seeded the default projects (`useProjectInitialization`). */
  seededDefaults: boolean;
  /** The URL the app was opened with, read before the app rewrites the hash. */
  initialLocation: Pick<Location, "search" | "hash">;
  projects: Project[];
  currentProject: Project | null;
  currentFilePath: string | null;
  navigateToProject: (project: Project) => void;
  selectFile: (path: string) => Promise<void>;
  openBundledExample: (example: ExampleProject) => Promise<Project | null>;
  dispatch: Dispatch<AppAction>;
}

/** A running guide or a one-off scene, in the project it opened. */
type Guide =
  | { kind: "tour"; root: string; step: number; run: number }
  | { kind: "scene"; root: string; run: number };

/**
 * The first-run experience (#3563): the Welcome dialog (#3565) and the
 * Design a service split tour (#3566). Mounted from `ProjectModeApp`, so it
 * only exists where there are projects to open samples into. Everything it
 * does goes through the actions the rest of the app uses: samples are new
 * projects, and a guide step is a file selection, a view, and the existing
 * diff mode.
 */
export function FirstRunExperience({
  seededDefaults,
  initialLocation,
  projects,
  currentProject,
  currentFilePath,
  navigateToProject,
  selectFile,
  openBundledExample,
  dispatch,
}: FirstRunExperienceProps) {
  const { locale } = useTranslation();
  const [guide, setGuide] = useState<Guide | null>(null);
  const runs = useRef(0);

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

  const choose = useCallback(
    async (choice: WelcomeChoice) => {
      setGreeted(true);
      setRequested(false);
      markWelcomeDismissed();
      if (choice === "editor") return;

      if (choice === "understand") {
        const template = isJa ? GETTING_STARTED_PROJECT : GETTING_STARTED_PROJECT_EN;
        const seeded = projects.find((p) => p.name === template.name);
        // On a first visit the seeded project is already open: navigating to
        // it again would clear the open file without selecting it back.
        // A switch clears any diff; reselecting must leave the same state.
        if (seeded && seeded.id === currentProject?.id) {
          await selectFile(`${seeded.rootPath}/index.krs`);
          dispatch({ type: "SET_COMPARE_SOURCE", source: null });
        } else if (seeded) navigateToProject(seeded);
        else await openBundledExample(template);
        return;
      }

      const project = await openBundledExample(
        isJa ? SERVICE_SPLIT_PROJECT : SERVICE_SPLIT_PROJECT_EN,
      );
      if (!project) return;
      const run = ++runs.current;
      setGuide(
        choice === "design"
          ? { kind: "tour", root: project.rootPath, step: 0, run }
          : { kind: "scene", root: project.rootPath, run },
      );
    },
    [isJa, projects, currentProject, navigateToProject, selectFile, openBundledExample, dispatch],
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
    };
  }, [guide]);

  useGuidedScene({ pending, currentProject, currentFilePath, selectFile, dispatch });

  const moveStep = useCallback((delta: number) => {
    setGuide((g) =>
      g?.kind === "tour"
        ? {
            ...g,
            step: Math.min(Math.max(g.step + delta, 0), SERVICE_SPLIT_TOUR.length - 1),
          }
        : g,
    );
  }, []);

  // The diff a tour step opened is the tour's, so the editor starts without
  // it; a comparison the visitor opened on another step stays.
  const tourStep = guide?.kind === "tour" ? SERVICE_SPLIT_TOUR[guide.step] : null;
  const endTour = useCallback(() => {
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
          onBack={() => moveStep(-1)}
          onNext={() => moveStep(1)}
          onClose={endTour}
        />
      )}
    </>
  );
}
