// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import {
  useProjectNavigation,
  getProjectIdFromPath,
  buildProjectPath,
  LAST_PROJECT_KEY,
} from "./useProjectNavigation.js";
import type { Project } from "@karasu-tools/core";

afterEach(cleanup);

// ─── getProjectIdFromPath ──────────────────────────────────────────────────────

describe("getProjectIdFromPath", () => {
  afterEach(() => {
    history.replaceState(null, "", "/");
  });

  it("returns project ID from /projects/<id>", () => {
    history.replaceState(null, "", "/projects/abc-123");
    expect(getProjectIdFromPath()).toBe("abc-123");
  });

  it("returns project ID when hash is present", () => {
    history.replaceState(null, "", "/projects/abc-123#krs-system-root");
    expect(getProjectIdFromPath()).toBe("abc-123");
  });

  it("returns null for root path", () => {
    history.replaceState(null, "", "/");
    expect(getProjectIdFromPath()).toBeNull();
  });

  it("returns null for unrelated path", () => {
    history.replaceState(null, "", "/other/path");
    expect(getProjectIdFromPath()).toBeNull();
  });
});

// ─── buildProjectPath ─────────────────────────────────────────────────────────

describe("buildProjectPath", () => {
  it("builds path without hash", () => {
    expect(buildProjectPath("abc-123")).toBe("/projects/abc-123");
  });

  it("builds path with hash", () => {
    expect(buildProjectPath("abc-123", "#krs-system-root")).toBe(
      "/projects/abc-123#krs-system-root",
    );
  });
});

// ─── useProjectNavigation ─────────────────────────────────────────────────────

const makeProject = (id: string, name = `Project ${id}`): Project => ({
  id,
  name,
  rootPath: `/projects/${id}`,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
});

describe("useProjectNavigation", () => {
  const projectA = makeProject("aaa");
  const projectB = makeProject("bbb");
  const projects = [projectA, projectB];

  beforeEach(() => {
    history.replaceState(null, "", "/");
    localStorage.clear();
    vi.spyOn(history, "replaceState");
    vi.spyOn(history, "pushState");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    history.replaceState(null, "", "/");
  });

  describe("initialization", () => {
    it("selects project from URL path and normalizes URL", () => {
      history.replaceState(null, "", "/projects/bbb");
      const dispatch = vi.fn<() => void>();

      renderHook(() => useProjectNavigation(projects, null, dispatch));

      expect(dispatch).toHaveBeenCalledWith({ type: "SET_CURRENT_PROJECT", project: projectB });
      expect(history.replaceState).toHaveBeenCalledWith(null, "", "/projects/bbb");
    });

    it("falls back to localStorage when URL has no project", () => {
      localStorage.setItem(LAST_PROJECT_KEY, "bbb");
      const dispatch = vi.fn<() => void>();

      renderHook(() => useProjectNavigation(projects, null, dispatch));

      expect(dispatch).toHaveBeenCalledWith({ type: "SET_CURRENT_PROJECT", project: projectB });
    });

    it("falls back to first project when URL and localStorage are empty", () => {
      const dispatch = vi.fn<() => void>();

      renderHook(() => useProjectNavigation(projects, null, dispatch));

      expect(dispatch).toHaveBeenCalledWith({ type: "SET_CURRENT_PROJECT", project: projectA });
    });

    it("preserves hash when normalizing URL", () => {
      history.replaceState(null, "", "/projects/aaa#krs-system-Payment");
      const dispatch = vi.fn<() => void>();

      renderHook(() => useProjectNavigation(projects, null, dispatch));

      expect(history.replaceState).toHaveBeenCalledWith(
        null,
        "",
        "/projects/aaa#krs-system-Payment",
      );
    });

    it("does not run when projects list is empty", () => {
      const dispatch = vi.fn<() => void>();

      renderHook(() => useProjectNavigation([], null, dispatch));

      expect(dispatch).not.toHaveBeenCalled();
    });

    it("does not run twice when projects list updates", () => {
      const dispatch = vi.fn<() => void>();
      const { rerender } = renderHook(
        ({ projs }: { projs: Project[] }) => useProjectNavigation(projs, projectA, dispatch),
        { initialProps: { projs: projects } },
      );

      rerender({ projs: [...projects, makeProject("ccc")] });

      expect(dispatch).toHaveBeenCalledTimes(1);
    });
  });

  describe("navigateToProject", () => {
    it("calls pushState with project path + initial hash and dispatches SET_CURRENT_PROJECT", () => {
      const dispatch = vi.fn<() => void>();
      const { result } = renderHook(() => useProjectNavigation(projects, projectA, dispatch));

      act(() => {
        result.current.navigateToProject(projectB);
      });

      // SELECT_FILE が viewPath/activeView を system/root にリセットするため、
      // useHistoryNavigation Effect ③ との不一致を防ぐために #krs-system-root を含める
      expect(history.pushState).toHaveBeenCalledWith(null, "", "/projects/bbb#krs-system-root");
      expect(dispatch).toHaveBeenCalledWith({ type: "SET_CURRENT_PROJECT", project: projectB });
    });

    it("always navigates to system root when switching project", () => {
      history.replaceState(null, "", "/projects/aaa#krs-system-Payment");
      const dispatch = vi.fn<() => void>();
      const { result } = renderHook(() => useProjectNavigation(projects, projectA, dispatch));

      act(() => {
        result.current.navigateToProject(projectB);
      });

      // ドリルダウン状態は引き継がれず、system root にリセットされる
      expect(history.pushState).toHaveBeenCalledWith(null, "", "/projects/bbb#krs-system-root");
    });
  });

  describe("popstate", () => {
    it("dispatches SET_CURRENT_PROJECT when URL changes to different project", () => {
      const dispatch = vi.fn<() => void>();
      renderHook(() => useProjectNavigation(projects, projectA, dispatch));

      act(() => {
        history.replaceState(null, "", "/projects/bbb");
        window.dispatchEvent(new PopStateEvent("popstate"));
      });

      expect(dispatch).toHaveBeenCalledWith({ type: "SET_CURRENT_PROJECT", project: projectB });
    });

    it("does not dispatch when URL project matches currentProject", () => {
      history.replaceState(null, "", "/projects/aaa");
      const dispatch = vi.fn<() => void>();
      renderHook(() => useProjectNavigation(projects, projectA, dispatch));

      // initialization dispatch をクリア
      dispatch.mockClear();

      act(() => {
        window.dispatchEvent(new PopStateEvent("popstate"));
      });

      expect(dispatch).not.toHaveBeenCalled();
    });
  });
});
