import { useCallback, useMemo, type Dispatch } from "react";
import type { DisplayMode } from "@karasu-tools/core";
import type { AppAction } from "../state/app-reducer.js";

interface UseCrossNavigationArgs {
  dispatch: Dispatch<AppAction>;
  teamPathIndex: Map<string, string[]>;
  orgNodePathIndex: Map<string, string[]>;
  navigateViewPath: (path: string[]) => void;
}

export interface UseCrossNavigationResult {
  /** Click a container (group) in the system view → highlight it as a system node. */
  handleContainerClick: (containerId: string) => void;
  /** Click the deploy-badge button on a service → switch to deploy view with it highlighted. */
  handleDeployButtonClick: (serviceId: string) => void;
  /** Click the team-badge button on a service → switch to org view, navigate to the parent. */
  handleTeamButtonClick: (teamId: string) => void;
  /** Click an "owned by" service in the org view → switch to system view, navigate to it. */
  handleOwnedServiceClick: (serviceId: string) => void;
  handleDisplayModeChange: (mode: DisplayMode) => void;
  handleDeployBlockChange: (id: string) => void;
  clearHighlight: () => void;
}

/**
 * Thin dispatch wrappers that AppShell passes to child panes for cross-view
 * navigation (e.g. clicking a deploy badge in the system view switches to the
 * deploy view). Kept together here so AppShell stays focused on layout.
 */
export function useCrossNavigation({
  dispatch,
  teamPathIndex,
  orgNodePathIndex,
  navigateViewPath,
}: UseCrossNavigationArgs): UseCrossNavigationResult {
  const handleContainerClick = useCallback(
    (containerId: string) => {
      dispatch({ type: "SET_ACTIVE_VIEW", activeView: "system", highlightNodeId: containerId });
    },
    [dispatch],
  );

  const handleDeployButtonClick = useCallback(
    (serviceId: string) => {
      dispatch({ type: "SET_ACTIVE_VIEW", activeView: "deploy", highlightNodeId: serviceId });
    },
    [dispatch],
  );

  const handleTeamButtonClick = useCallback(
    (teamId: string) => {
      const parentPath = teamPathIndex.get(teamId) ?? [];
      dispatch({ type: "SET_ACTIVE_VIEW", activeView: "org", highlightNodeId: teamId });
      if (parentPath.length > 0) navigateViewPath(parentPath);
    },
    [dispatch, teamPathIndex, navigateViewPath],
  );

  const handleOwnedServiceClick = useCallback(
    (serviceId: string) => {
      const resolvedPath = orgNodePathIndex.get(serviceId);
      dispatch({ type: "SET_ACTIVE_VIEW", activeView: "system", highlightNodeId: serviceId });
      if (resolvedPath !== undefined) navigateViewPath(resolvedPath);
    },
    [dispatch, orgNodePathIndex, navigateViewPath],
  );

  const handleDisplayModeChange = useCallback(
    (mode: DisplayMode) => {
      dispatch({ type: "SET_DISPLAY_MODE", displayMode: mode });
    },
    [dispatch],
  );

  const handleDeployBlockChange = useCallback(
    (id: string) => {
      dispatch({ type: "SET_SELECTED_DEPLOY_BLOCK", id });
    },
    [dispatch],
  );

  const clearHighlight = useCallback(() => {
    dispatch({ type: "SET_HIGHLIGHTED_NODE", nodeId: null });
  }, [dispatch]);

  return useMemo(
    () => ({
      handleContainerClick,
      handleDeployButtonClick,
      handleTeamButtonClick,
      handleOwnedServiceClick,
      handleDisplayModeChange,
      handleDeployBlockChange,
      clearHighlight,
    }),
    [
      handleContainerClick,
      handleDeployButtonClick,
      handleTeamButtonClick,
      handleOwnedServiceClick,
      handleDisplayModeChange,
      handleDeployBlockChange,
      clearHighlight,
    ],
  );
}
