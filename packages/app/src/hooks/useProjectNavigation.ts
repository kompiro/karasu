import { useEffect, useCallback, useRef } from "react";
import type { Dispatch } from "react";
import type { Project } from "@karasu-tools/core";
import type { AppAction } from "../state/app-reducer.js";
import { buildHash } from "./useHistoryNavigation.js";

export const LAST_PROJECT_KEY = "karasu-last-project-id";
const PROJECT_PATH_RE = /^\/projects\/([^/]+)/;

export function getProjectIdFromPath(): string | null {
  return location.pathname.match(PROJECT_PATH_RE)?.[1] ?? null;
}

export function buildProjectPath(projectId: string, hash = ""): string {
  return `/projects/${projectId}${hash}`;
}

/**
 * ProjectMode の URL ナビゲーションを管理するフック。
 *
 * - 初期化時: `/projects/<id>` からプロジェクトを復元し、URL を正規化する
 * - navigateToProject: プロジェクト切り替え時に pushState で URL を更新する
 * - popstate: ブラウザの戻る/進むでプロジェクトを同期する
 */
export function useProjectNavigation(
  projects: Project[],
  currentProject: Project | null,
  dispatch: Dispatch<AppAction>,
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

    dispatch({ type: "SET_CURRENT_PROJECT", project: target });
    // hash は保持しつつ URL を正規化する
    history.replaceState(null, "", buildProjectPath(target.id, location.hash));
  }, [projects, dispatch]);

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
