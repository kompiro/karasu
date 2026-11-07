import { useEffect, useRef, useState, type Dispatch, type RefObject } from "react";
import {
  CLIENT_MCP_PROJECT,
  EC_PLATFORM_PROJECTS,
  EC_PLATFORM_PROJECTS_EN,
  FEATURE_SAMPLES_PROJECT,
  FACET_STYLING_PROJECT,
  FACET_STYLING_PROJECT_EN,
  GETTING_STARTED_PROJECT,
  GETTING_STARTED_PROJECT_EN,
  MULTI_FILE_SYSTEM_PROJECT,
  MULTI_FILE_SYSTEM_PROJECT_EN,
  type FileSystemProvider,
  type Project,
} from "@karasu-tools/core";
import type { ProjectManager } from "../fs/project-manager.js";
import { resolveLocale } from "../i18n/locale.js";
import type { AppAction } from "../state/app-reducer.js";
import { LAST_PROJECT_KEY } from "./useProjectNavigation.js";

interface UseProjectInitializationArgs {
  pm: ProjectManager;
  fs: FileSystemProvider;
  dispatch: Dispatch<AppAction>;
  currentProject: Project | null;
  /**
   * `selectFile` from `useFileSelection` — invoked with the project's `index.krs` on switch,
   * or with the boot's file and `index.krs` as the fallback when it cannot be read.
   */
  selectFile: (path: string, fallback?: string) => Promise<unknown>;
  /**
   * The file the boot's URL hash names (`useProjectNavigation`), opened by
   * the boot's switch instead of `index.krs` (#3598).
   */
  bootFile?: RefObject<string | null>;
}

const PASTE_COMPARE_FILE = ".karasu-paste-compare.krs";

/**
 * Best-effort cleanup of stale paste-compare temp files (Issue #739).
 *
 * The runtime normally deletes the temp file when diff mode exits, but a tab
 * crash or a force-close with diff mode active leaves the file behind in
 * OPFS. Sweep on startup to keep the workspace tidy.
 */
async function cleanupPasteCompareTempFiles(
  fs: FileSystemProvider,
  projects: Project[],
): Promise<void> {
  for (const project of projects) {
    const path = `${project.rootPath}/${PASTE_COMPARE_FILE}`;
    try {
      if (await fs.exists(path)) {
        await fs.delete(path);
      }
    } catch {
      // Non-fatal; diff mode will overwrite on next use.
    }
  }
}

/**
 * Coordinates ProjectMode startup in a single explicit location:
 *
 * 1. **Bootstrap** (runs once): read the project list from OPFS. On first
 *    run the list is empty, so seed it with the Getting Started project,
 *    the ec-platform examples, the client-mcp sample, the multi-file-system
 *    sample, and the feature-samples catalog. Clear the loading flag when
 *    done.
 * 2. **On project switch**: persist `currentProject.id` to localStorage so
 *    the next session can restore it, and auto-select the project's
 *    `index.krs` as the active editor file. The boot's switch opens the file
 *    the URL hash names instead (#3598), so the file a deep link restores is
 *    the first one to land and nothing opens over it afterwards.
 *
 * It reports whether this boot seeded the defaults, which is the app's only
 * reliable sign of a first visit: the first-run Welcome keys on it (#3565).
 *
 * Previously these lived as three separate `useEffect`s in `ProjectModeApp`
 * whose ordering was implicit; consolidating them here makes the startup
 * sequence the single source of truth.
 */
export function useProjectInitialization({
  pm,
  fs,
  dispatch,
  currentProject,
  selectFile,
  bootFile,
}: UseProjectInitializationArgs): { seededDefaults: boolean } {
  const [seededDefaults, setSeededDefaults] = useState(false);
  // Guards against re-seeding when the effect runs twice (React StrictMode
  // double-invokes effects in dev, and both runs would otherwise observe an
  // empty list and seed the defaults twice). Survives the double-invoke because
  // a ref persists across it (#1530).
  const bootstrapStarted = useRef(false);

  // Bootstrap: load the project list. If empty, seed the default projects.
  useEffect(() => {
    if (bootstrapStarted.current) return;
    bootstrapStarted.current = true;

    (async () => {
      try {
        const projectList = await pm.listProjects();

        if (projectList.length === 0) {
          const initialProjects: Project[] = [];
          // Pick the locale-matching content (Getting Started, ec-platform,
          // multi-file-system) at seed time. Once seeded it is user content — we
          // do not re-seed when the locale changes later. Users whose browser is
          // Japanese get the Japanese variants; everyone else gets English.
          const isJa = resolveLocale() === "ja";
          const gsTemplate = isJa ? GETTING_STARTED_PROJECT : GETTING_STARTED_PROJECT_EN;
          const gsProject = await pm.createProject(gsTemplate.name, gsTemplate.files);
          initialProjects.push(gsProject);
          const ecPlatformProjects = isJa ? EC_PLATFORM_PROJECTS : EC_PLATFORM_PROJECTS_EN;
          for (const example of ecPlatformProjects) {
            const project = await pm.createProject(example.name, example.files);
            initialProjects.push(project);
          }
          const clientMcpProject = await pm.createProject(
            CLIENT_MCP_PROJECT.name,
            CLIENT_MCP_PROJECT.files,
          );
          initialProjects.push(clientMcpProject);
          const mfsTemplate = isJa ? MULTI_FILE_SYSTEM_PROJECT : MULTI_FILE_SYSTEM_PROJECT_EN;
          const multiFileSystemProject = await pm.createProject(
            mfsTemplate.name,
            mfsTemplate.files,
          );
          initialProjects.push(multiFileSystemProject);
          const featureSamplesProject = await pm.createProject(
            FEATURE_SAMPLES_PROJECT.name,
            FEATURE_SAMPLES_PROJECT.files,
          );
          initialProjects.push(featureSamplesProject);
          // Seeded as a pair: the `.krs` alone shows nothing of what this
          // example is about, since the whole demonstration lives in the
          // `.krs.style` it imports (#2175).
          const facetStylingTemplate = isJa ? FACET_STYLING_PROJECT : FACET_STYLING_PROJECT_EN;
          const facetStylingProject = await pm.createProject(
            facetStylingTemplate.name,
            facetStylingTemplate.files,
          );
          initialProjects.push(facetStylingProject);
          setSeededDefaults(true);
          dispatch({ type: "SET_PROJECTS", projects: initialProjects });
        } else {
          dispatch({ type: "SET_PROJECTS", projects: projectList });
          // `useProjectNavigation` initialization reads URL / localStorage to restore the selection.
          await cleanupPasteCompareTempFiles(fs, projectList);
        }
      } catch (err) {
        // Without this, a throw (OPFS unavailable / quota exceeded / corrupt
        // metadata) would leave SET_LOADING unfired and the app stuck on
        // "Loading…" forever (#1530). Surface an error screen instead.
        const message = err instanceof Error ? err.message : String(err);
        dispatch({ type: "SET_INIT_ERROR", error: message });
      } finally {
        dispatch({ type: "SET_LOADING", loading: false });
      }
    })();
  }, [pm, fs, dispatch]);

  // On project switch: persist to localStorage + auto-select index.krs. The
  // boot's file is handed over rather than read back from the URL, which a
  // child's effect may already have rewritten in the same commit.
  const booted = useRef(false);
  useEffect(() => {
    if (!currentProject) return;
    localStorage.setItem(LAST_PROJECT_KEY, currentProject.id);
    const hashFile = booted.current ? null : bootFile?.current;
    booted.current = true;
    const index = `${currentProject.rootPath}/index.krs`;
    // A boot file that exists but cannot be read leaves the editor on index.krs.
    void (hashFile ? selectFile(hashFile, index) : selectFile(index));
  }, [currentProject, selectFile, bootFile]);

  return { seededDefaults };
}
