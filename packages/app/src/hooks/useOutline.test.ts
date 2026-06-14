// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import type { NodeMetadata } from "@karasu-tools/core";
import { useOutline } from "./useOutline.js";
import type { ActiveView } from "../state/app-reducer.js";

afterEach(cleanup);

function setup(
  activeView: ActiveView,
  {
    systemNodeMetadata = new Map<string, NodeMetadata>(),
    orgPathIndex = new Map<string, string[]>(),
  } = {},
) {
  const dispatch = vi.fn<() => void>();
  const navigateViewPath = vi.fn<(path: string[]) => void>();
  const { result } = renderHook(() =>
    useOutline({
      activeView,
      deployTree: [],
      organizations: [],
      resolvedSystems: [],
      systemNodeMetadata,
      orgPathIndex,
      dispatch,
      navigateViewPath,
    }),
  );
  return { result, dispatch, navigateViewPath };
}

describe("useOutline — onSelectNode (single click)", () => {
  it("highlights the node in the active view", () => {
    const { result, dispatch } = setup("system");
    act(() => result.current.onSelectNode("App"));
    expect(dispatch).toHaveBeenCalledWith({ type: "SET_HIGHLIGHTED_NODE", nodeId: "App" });
  });

  it("drops matrix clicks to the system view (matrix has no per-node highlight)", () => {
    const { result, dispatch } = setup("matrix");
    act(() => result.current.onSelectNode("App"));
    expect(dispatch).toHaveBeenCalledWith({
      type: "SET_ACTIVE_VIEW",
      activeView: "system",
      highlightNodeId: "App",
    });
  });
});

describe("useOutline — onActivateNode (double click drill)", () => {
  it("deploy: selects the top-level ancestor block and highlights the node", () => {
    const { result, dispatch } = setup("deploy");
    act(() => result.current.onActivateNode("appc", ["Prod", "inner"]));
    expect(dispatch).toHaveBeenCalledWith({ type: "SET_SELECTED_DEPLOY_BLOCK", id: "Prod" });
    expect(dispatch).toHaveBeenCalledWith({ type: "SET_HIGHLIGHTED_NODE", nodeId: "appc" });
  });

  it("deploy: falls back to the node id as the block when there is no ancestor", () => {
    const { result, dispatch } = setup("deploy");
    act(() => result.current.onActivateNode("Prod", []));
    expect(dispatch).toHaveBeenCalledWith({ type: "SET_SELECTED_DEPLOY_BLOCK", id: "Prod" });
  });

  it("org: walks orgPathIndex (node first, then ancestors) for the drill path", () => {
    const orgPathIndex = new Map<string, string[]>([["Team", ["Org"]]]);
    const { result, dispatch, navigateViewPath } = setup("org", { orgPathIndex });
    // The node itself has no path; its ancestor "Team" does.
    act(() => result.current.onActivateNode("Member", ["Org", "Team"]));
    expect(dispatch).toHaveBeenCalledWith({ type: "SET_HIGHLIGHTED_NODE", nodeId: "Member" });
    expect(navigateViewPath).toHaveBeenCalledWith(["Org"]);
  });

  it("system: walks systemNodeMetadata.viewPath, preferring the node's own path", () => {
    const systemNodeMetadata = new Map<string, NodeMetadata>([
      ["App", { viewPath: ["Sys", "App"] } as unknown as NodeMetadata],
    ]);
    const { result, dispatch, navigateViewPath } = setup("system", { systemNodeMetadata });
    act(() => result.current.onActivateNode("App", ["Sys"]));
    expect(dispatch).toHaveBeenCalledWith({ type: "SET_HIGHLIGHTED_NODE", nodeId: "App" });
    expect(navigateViewPath).toHaveBeenCalledWith(["Sys", "App"]);
  });

  it("system: navigates to an empty path when no candidate carries a viewPath", () => {
    const { result, navigateViewPath } = setup("system");
    act(() => result.current.onActivateNode("Unknown", []));
    expect(navigateViewPath).toHaveBeenCalledWith([]);
  });

  it("matrix: switches to the system view before drilling", () => {
    const systemNodeMetadata = new Map<string, NodeMetadata>([
      ["App", { viewPath: ["Sys"] } as unknown as NodeMetadata],
    ]);
    const { result, dispatch, navigateViewPath } = setup("matrix", { systemNodeMetadata });
    act(() => result.current.onActivateNode("App", []));
    expect(dispatch).toHaveBeenCalledWith({
      type: "SET_ACTIVE_VIEW",
      activeView: "system",
      highlightNodeId: "App",
    });
    expect(navigateViewPath).toHaveBeenCalledWith(["Sys"]);
  });
});
