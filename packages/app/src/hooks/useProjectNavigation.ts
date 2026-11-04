import { useEffect, useCallback, useRef } from "react";
import type { Dispatch } from "react";
import type { Project } from "@karasu-tools/core";
import type { AppAction } from "../state/app-reducer.js";
import { buildHash } from "./history-hash.js";
import { PROJECTS_SEGMENT } from "../routes.js";

export const LAST_PROJECT_KEY = "karasu-last-project-id";
// Derived from the shared route table so the bare-permalink guard and this
// hook can never disagree about which segment ProjectMode owns (#1961).
const PROJECT_PATH_RE = new RegExp(`^/${PROJECTS_SEGMENT}/([^/]+)`);

export function getProjectIdFromPath(pathname = location.pathname): string | null {
  return pathname.match(PROJECT_PATH_RE)?.[1] ?? null;
}

/**
 * Decides the hash the boot opens `target` with, given the project list and
 * the last project id it read; `null` keeps the URL's own hash. Called once,
 * before the boot writes the URL (#3598).
 */
export type DecideInitialHash = (
  target: Project,
  projects: Project[],
  lastProjectId: string | null,
) => string | null;

export function buildProjectPath(projectId: string, hash = ""): string {
  return `/${PROJECTS_SEGMENT}/${projectId}${hash}`;
}

/**
 * ProjectMode の URL ナビゲーションを管理するフック。
 *
 * - 初期化時: `/projects/<id>` からプロジェクトを復元し、URL を正規化する。
 *   `decideInitialHash` があれば、その hash で起動する（#3598）
 * - navigateToProject: プロジェクト切り替え時に pushState で URL を更新する
 * - popstate: ブラウザの戻る/進むでプロジェクトを同期する
 */
export function useProjectNavigation(
  projects: Project[],
  currentProject: Project | null,
  dispatch: Dispatch<AppAction>,
  decideInitialHash?: DecideInitialHash,
) {
  const initialized = useRef(false);

  // 初期化: projects が確定した後に URL を解析してプロジェクトを復元する
  useEffect(() => {
    if (projects.length === 0 || initialized.current) return;
    initialized.current = true;

    const urlId = getProjectIdFromPath();
    const lastId = localStorage.getItem(LAST_PROJECT_KEY);
    const target =
      projects.find((p) => p.id === urlId) ?? projects.find((p) => p.id === lastId) ?? projects[0];

    const hash = decideInitialHash?.(target, projects, lastId) ?? location.hash;
    dispatch({ type: "SET_CURRENT_PROJECT", project: target });
    // hash は保持しつつ URL を正規化する
    history.replaceState(null, "", buildProjectPath(target.id, hash));
  }, [projects, dispatch, decideInitialHash]);

  // プロジェクト切り替え: pushState で URL を更新する。
  // SELECT_FILE が viewPath/activeView を system/root にリセットするため、
  // その後 useHistoryNavigation Effect ③ が発火したときに hash の不一致で
  // 余分な history エントリを生成しないよう、初期 hash を同時に push する。
  const navigateToProject = useCallback(
    (project: Project) => {
      const initialHash = buildHash("system", []);
      history.pushState(null, "", buildProjectPath(project.id, initialHash));
      dispatch({ type: "SET_CURRENT_PROJECT", project });
    },
    [dispatch],
  );

  // popstate: URL が変わったらプロジェクトを同期する
  useEffect(() => {
    const handlePopState = () => {
      const id = getProjectIdFromPath();
      if (id && id !== currentProject?.id) {
        const project = projects.find((p) => p.id === id);
        if (project) dispatch({ type: "SET_CURRENT_PROJECT", project });
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [projects, currentProject, dispatch]);

  return { navigateToProject };
}
