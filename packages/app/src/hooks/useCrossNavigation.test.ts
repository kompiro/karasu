// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useCrossNavigation } from "./useCrossNavigation.js";

afterEach(cleanup);

function setup({
  teamPathIndex = new Map<string, string[]>(),
  orgNodePathIndex = new Map<string, string[]>(),
} = {}) {
  const dispatch = vi.fn<() => void>();
  const navigateViewPath = vi.fn<(path: string[]) => void>();
  const { result } = renderHook(() =>
    useCrossNavigation({ dispatch, teamPathIndex, orgNodePathIndex, navigateViewPath }),
  );
  return { result, dispatch, navigateViewPath };
}

describe("useCrossNavigation", () => {
  it("handleContainerClick dispatches SET_ACTIVE_VIEW(system) with highlight", () => {
    const { result, dispatch } = setup();
    act(() => result.current.handleContainerClick("Web"));
    expect(dispatch).toHaveBeenCalledWith({
      type: "SET_ACTIVE_VIEW",
      activeView: "system",
      highlightNodeId: "Web",
    });
  });

  it("handleDeployButtonClick dispatches SET_ACTIVE_VIEW(deploy) with highlight", () => {
    const { result, dispatch } = setup();
    act(() => result.current.handleDeployButtonClick("api"));
    expect(dispatch).toHaveBeenCalledWith({
      type: "SET_ACTIVE_VIEW",
      activeView: "deploy",
      highlightNodeId: "api",
    });
  });

  describe("handleTeamButtonClick", () => {
    it("dispatches SET_ACTIVE_VIEW(org) and navigates to parent when parent path is non-empty", () => {
      const teamPathIndex = new Map([["sub", ["platform"]]]);
      const { result, dispatch, navigateViewPath } = setup({ teamPathIndex });
      act(() => result.current.handleTeamButtonClick("sub"));
      expect(dispatch).toHaveBeenCalledWith({
        type: "SET_ACTIVE_VIEW",
        activeView: "org",
        highlightNodeId: "sub",
      });
      expect(navigateViewPath).toHaveBeenCalledWith(["platform"]);
    });

    it("dispatches only when team is at root (empty parent path)", () => {
      const teamPathIndex = new Map([["platform", []]]);
      const { result, dispatch, navigateViewPath } = setup({ teamPathIndex });
      act(() => result.current.handleTeamButtonClick("platform"));
      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(navigateViewPath).not.toHaveBeenCalled();
    });

    it("treats unknown team ids as root", () => {
      const { result, navigateViewPath } = setup();
      act(() => result.current.handleTeamButtonClick("unknown"));
      expect(navigateViewPath).not.toHaveBeenCalled();
    });
  });

  describe("handleOwnedServiceClick", () => {
    it("navigates to resolved path when present", () => {
      const orgNodePathIndex = new Map([["api", ["Web", "api"]]]);
      const { result, dispatch, navigateViewPath } = setup({ orgNodePathIndex });
      act(() => result.current.handleOwnedServiceClick("api"));
      expect(dispatch).toHaveBeenCalledWith({
        type: "SET_ACTIVE_VIEW",
        activeView: "system",
        highlightNodeId: "api",
      });
      expect(navigateViewPath).toHaveBeenCalledWith(["Web", "api"]);
    });

    it("dispatches but does not navigate when id is unresolved", () => {
      const { result, dispatch, navigateViewPath } = setup();
      act(() => result.current.handleOwnedServiceClick("unknown"));
      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(navigateViewPath).not.toHaveBeenCalled();
    });
  });

  it("handleDisplayModeChange dispatches SET_DISPLAY_MODE", () => {
    const { result, dispatch } = setup();
    act(() => result.current.handleDisplayModeChange("icon"));
    expect(dispatch).toHaveBeenCalledWith({ type: "SET_DISPLAY_MODE", displayMode: "icon" });
  });

  it("handleDeployBlockChange dispatches SET_SELECTED_DEPLOY_BLOCK", () => {
    const { result, dispatch } = setup();
    act(() => result.current.handleDeployBlockChange("Prod"));
    expect(dispatch).toHaveBeenCalledWith({ type: "SET_SELECTED_DEPLOY_BLOCK", id: "Prod" });
  });

  it("clearHighlight dispatches SET_HIGHLIGHTED_NODE with null", () => {
    const { result, dispatch } = setup();
    act(() => result.current.clearHighlight());
    expect(dispatch).toHaveBeenCalledWith({ type: "SET_HIGHLIGHTED_NODE", nodeId: null });
  });
});
