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

  it("leaves the dependency graph alone when Tree View is set to false", () => {
    // The permalink restore writes `false` on every navigation that is not a
    // tree link; treating that as "close whatever is open" would knock the user
    // out of the dependency mode on an unrelated drill.
    const { result } = renderHook(() => useOrgDisplayMode());
    act(() => result.current.toggleTeamDependencies());
    act(() => result.current.setOrgTreeView(false));
    expect(result.current.mode).toBe("dependencies");
  });
});
