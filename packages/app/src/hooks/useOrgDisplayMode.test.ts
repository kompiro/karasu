// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useOrgDisplayMode } from "./useOrgDisplayMode.js";

afterEach(cleanup);

describe("useOrgDisplayMode", () => {
  it("opens on the grid, with neither mode flag set", () => {
    const { result } = renderHook(() => useOrgDisplayMode());
    expect(result.current.mode).toBe("grid");
    expect(result.current.isOrgTreeViewOpen).toBe(false);
    expect(result.current.isTeamDependenciesOpen).toBe(false);
  });

  it("never has two modes on at once", () => {
    const { result } = renderHook(() => useOrgDisplayMode());
    act(() => result.current.toggleOrgTreeView());
    act(() => result.current.toggleTeamDependencies());
    expect(result.current.isTeamDependenciesOpen).toBe(true);
    expect(result.current.isOrgTreeViewOpen).toBe(false);

    act(() => result.current.toggleOrgTreeView());
    expect(result.current.isOrgTreeViewOpen).toBe(true);
    expect(result.current.isTeamDependenciesOpen).toBe(false);
  });

  it("toggles a mode back to the grid when pressed again", () => {
    const { result } = renderHook(() => useOrgDisplayMode());
    act(() => result.current.toggleTeamDependencies());
    act(() => result.current.toggleTeamDependencies());
    expect(result.current.mode).toBe("grid");
  });

  it("accepts a boolean or updater for Tree View, as the permalink restore writes it", () => {
    const { result } = renderHook(() => useOrgDisplayMode());
    act(() => result.current.setOrgTreeView(true));
    expect(result.current.mode).toBe("tree");
    act(() => result.current.setOrgTreeView((v) => !v));
    expect(result.current.mode).toBe("grid");
  });

  it("returns to the grid when a history restore addresses a plain org hash", () => {
    // The restore passes `false` for a hash with no `#krs-org-tree` token. The
    // dependency mode has no token of its own, so leaving it drawn would make
    // the address bar and the pane disagree.
    const { result } = renderHook(() => useOrgDisplayMode());
    act(() => result.current.toggleTeamDependencies());
    act(() => result.current.setOrgTreeView(false));
    expect(result.current.mode).toBe("grid");
  });
});
