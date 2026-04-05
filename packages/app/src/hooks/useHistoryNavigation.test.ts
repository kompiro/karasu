// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { buildHash, parseHash, useHistoryNavigation } from "./useHistoryNavigation.js";

afterEach(cleanup);

// ─── buildHash ────────────────────────────────────────────────────────────────

describe("buildHash", () => {
  it("returns #krs-deploy for deploy view", () => {
    expect(buildHash("deploy", [])).toBe("#krs-deploy");
  });

  it("returns root hash for system with empty viewPath", () => {
    expect(buildHash("system", [])).toBe("#krs-system-root");
  });

  it("returns root hash for org with empty viewPath", () => {
    expect(buildHash("org", [])).toBe("#krs-org-root");
  });

  it("uses last segment of viewPath for system", () => {
    expect(buildHash("system", ["Payment"])).toBe("#krs-system-Payment");
  });

  it("uses only the last segment for deep viewPath", () => {
    expect(buildHash("system", ["Payment", "EC"])).toBe("#krs-system-EC");
  });

  it("uses last segment for org", () => {
    expect(buildHash("org", ["backend", "teamA"])).toBe("#krs-org-teamA");
  });

  it("sanitizes special characters in nodeId", () => {
    expect(buildHash("system", ["my service"])).toBe("#krs-system-my_service");
  });

  it("returns #krs-org-tree when isOrgTreeView is true", () => {
    expect(buildHash("org", [], true)).toBe("#krs-org-tree");
  });

  it("ignores isOrgTreeView when activeView is not org", () => {
    expect(buildHash("system", [], true)).toBe("#krs-system-root");
  });
});

// ─── parseHash ────────────────────────────────────────────────────────────────

describe("parseHash", () => {
  it("parses #krs-deploy", () => {
    expect(parseHash("#krs-deploy")).toEqual({
      activeView: "deploy",
      nodeId: null,
      isOrgTreeView: false,
    });
  });

  it("parses #krs-system-root", () => {
    expect(parseHash("#krs-system-root")).toEqual({
      activeView: "system",
      nodeId: null,
      isOrgTreeView: false,
    });
  });

  it("parses #krs-org-root", () => {
    expect(parseHash("#krs-org-root")).toEqual({
      activeView: "org",
      nodeId: null,
      isOrgTreeView: false,
    });
  });

  it("parses #krs-system-Payment", () => {
    expect(parseHash("#krs-system-Payment")).toEqual({
      activeView: "system",
      nodeId: "Payment",
      isOrgTreeView: false,
    });
  });

  it("parses #krs-org-backend", () => {
    expect(parseHash("#krs-org-backend")).toEqual({
      activeView: "org",
      nodeId: "backend",
      isOrgTreeView: false,
    });
  });

  it("parses #krs-org-tree as org Tree View mode", () => {
    expect(parseHash("#krs-org-tree")).toEqual({
      activeView: "org",
      nodeId: null,
      isOrgTreeView: true,
    });
  });

  it("returns null for empty string", () => {
    expect(parseHash("")).toBeNull();
  });

  it("returns null for unrelated hash", () => {
    expect(parseHash("#other-section")).toBeNull();
  });

  it("returns null for partial match", () => {
    expect(parseHash("#krs-system")).toBeNull();
  });
});

// ─── useHistoryNavigation ─────────────────────────────────────────────────────

function makeDispatch() {
  return vi.fn();
}

function makeOptions(overrides: Partial<Parameters<typeof useHistoryNavigation>[0]> = {}) {
  return {
    activeView: "system" as const,
    viewPath: [] as string[],
    currentFilePath: "/test/index.krs",
    nodePathIndex: new Map<string, string[]>(),
    dispatch: makeDispatch(),
    isOrgTreeView: false,
    setIsOrgTreeView: vi.fn(),
    ...overrides,
  };
}

describe("useHistoryNavigation", () => {
  beforeEach(() => {
    // Reset hash before each test
    history.replaceState(null, "", "/");
  });

  describe("initial mount — no hash", () => {
    it("sets initial hash via replaceState when no hash is present", () => {
      const opts = makeOptions();
      renderHook(() => useHistoryNavigation(opts));
      expect(location.hash).toBe("#krs-system-root");
    });
  });

  describe("initial mount — with hash", () => {
    it("dispatches SET_VIEW_PATH([]) when hash is root", () => {
      history.replaceState(null, "", "#krs-system-root");
      const dispatch = makeDispatch();
      renderHook(() => useHistoryNavigation(makeOptions({ dispatch })));
      expect(dispatch).toHaveBeenCalledWith({ type: "SET_VIEW_PATH", path: [] });
    });

    it("dispatches SET_ACTIVE_VIEW when hash activeView differs", () => {
      history.replaceState(null, "", "#krs-org-root");
      const dispatch = makeDispatch();
      renderHook(() => useHistoryNavigation(makeOptions({ dispatch, activeView: "system" })));
      expect(dispatch).toHaveBeenCalledWith({ type: "SET_ACTIVE_VIEW", activeView: "org" });
    });
  });

  describe("pendingNodeId resolution", () => {
    it("resolves pending nodeId when nodePathIndex becomes available", async () => {
      history.replaceState(null, "", "#krs-system-EC");
      const dispatch = makeDispatch();
      let nodePathIndex = new Map<string, string[]>();

      const { rerender } = renderHook(() =>
        useHistoryNavigation(makeOptions({ dispatch, nodePathIndex })),
      );

      // nodePathIndex empty — no SET_VIEW_PATH yet (except for pending)
      dispatch.mockClear();

      // nodePathIndex now has data
      nodePathIndex = new Map([["EC", ["Payment", "EC"]]]);
      await act(async () => {
        rerender();
      });

      expect(dispatch).toHaveBeenCalledWith({
        type: "SET_VIEW_PATH",
        path: ["Payment", "EC"],
      });
    });

    it("falls back to [nodeId] when nodePathIndex does not contain the key", async () => {
      history.replaceState(null, "", "#krs-system-Unknown");
      const dispatch = makeDispatch();
      let nodePathIndex = new Map<string, string[]>();

      const { rerender } = renderHook(() =>
        useHistoryNavigation(makeOptions({ dispatch, nodePathIndex })),
      );

      dispatch.mockClear();

      nodePathIndex = new Map([["Other", ["Other"]]]);
      await act(async () => {
        rerender();
      });

      expect(dispatch).toHaveBeenCalledWith({ type: "SET_VIEW_PATH", path: ["Unknown"] });
    });
  });

  describe("state → hash sync", () => {
    it("pushes new hash when viewPath changes", async () => {
      const opts = makeOptions();
      const { rerender } = renderHook((p) => useHistoryNavigation(p), { initialProps: opts });

      const updated = { ...opts, viewPath: ["Payment"] };
      await act(async () => {
        rerender(updated);
      });

      expect(location.hash).toBe("#krs-system-Payment");
    });

    it("pushes new hash when activeView changes to deploy", async () => {
      const opts = makeOptions();
      const { rerender } = renderHook((p) => useHistoryNavigation(p), { initialProps: opts });

      const updated = { ...opts, activeView: "deploy" as const };
      await act(async () => {
        rerender(updated);
      });

      expect(location.hash).toBe("#krs-deploy");
    });
  });

  describe("popstate — browser back/forward", () => {
    it("dispatches SET_VIEW_PATH([]) when navigating to root hash", async () => {
      const dispatch = makeDispatch();
      renderHook(() => useHistoryNavigation(makeOptions({ dispatch })));
      dispatch.mockClear();

      history.replaceState(null, "", "#krs-system-root");
      await act(async () => {
        window.dispatchEvent(new PopStateEvent("popstate"));
      });

      expect(dispatch).toHaveBeenCalledWith({ type: "SET_VIEW_PATH", path: [] });
    });

    it("dispatches SET_ACTIVE_VIEW when switching to deploy via popstate", async () => {
      const dispatch = makeDispatch();
      renderHook(() => useHistoryNavigation(makeOptions({ dispatch, activeView: "system" })));
      dispatch.mockClear();

      history.replaceState(null, "", "#krs-deploy");
      await act(async () => {
        window.dispatchEvent(new PopStateEvent("popstate"));
      });

      expect(dispatch).toHaveBeenCalledWith({ type: "SET_ACTIVE_VIEW", activeView: "deploy" });
    });

    it("resolves nodeId via nodePathIndex in popstate", async () => {
      const nodePathIndex = new Map([["EC", ["Payment", "EC"]]]);
      const dispatch = makeDispatch();
      renderHook(() => useHistoryNavigation(makeOptions({ dispatch, nodePathIndex })));
      dispatch.mockClear();

      history.replaceState(null, "", "#krs-system-EC");
      await act(async () => {
        window.dispatchEvent(new PopStateEvent("popstate"));
      });

      expect(dispatch).toHaveBeenCalledWith({
        type: "SET_VIEW_PATH",
        path: ["Payment", "EC"],
      });
    });
  });

  describe("file switch — hash reset", () => {
    it("resets hash to system root when currentFilePath changes", async () => {
      const opts = makeOptions({ currentFilePath: "/a.krs", viewPath: ["Payment"] });
      history.replaceState(null, "", "#krs-system-Payment");

      const { rerender } = renderHook((p) => useHistoryNavigation(p), { initialProps: opts });

      await act(async () => {
        rerender({ ...opts, currentFilePath: "/b.krs", viewPath: [] });
      });

      expect(location.hash).toBe("#krs-system-root");
    });

    it("does not reset hash on initial mount", () => {
      history.replaceState(null, "", "#krs-system-Payment");
      renderHook(() =>
        useHistoryNavigation(makeOptions({ currentFilePath: "/a.krs", viewPath: ["Payment"] })),
      );
      // hash should not be reset to root on mount
      expect(location.hash).toBe("#krs-system-Payment");
    });
  });

  describe("feedback loop prevention", () => {
    it("does not push extra history entry after popstate", async () => {
      const dispatch = makeDispatch();
      renderHook(() => useHistoryNavigation(makeOptions({ dispatch })));

      const pushStateSpy = vi.spyOn(history, "pushState");
      pushStateSpy.mockClear();

      history.replaceState(null, "", "#krs-system-root");
      await act(async () => {
        window.dispatchEvent(new PopStateEvent("popstate"));
      });

      // Allow microtask queue to flush
      await act(async () => {
        await Promise.resolve();
      });

      expect(pushStateSpy).not.toHaveBeenCalled();
      pushStateSpy.mockRestore();
    });
  });

  describe("navigateActiveView / navigateViewPath", () => {
    it("navigateActiveView dispatches SET_ACTIVE_VIEW", () => {
      const dispatch = makeDispatch();
      const { result } = renderHook(() => useHistoryNavigation(makeOptions({ dispatch })));
      dispatch.mockClear();

      act(() => {
        result.current.navigateActiveView("org");
      });

      expect(dispatch).toHaveBeenCalledWith({ type: "SET_ACTIVE_VIEW", activeView: "org" });
    });

    it("navigateViewPath dispatches SET_VIEW_PATH", () => {
      const dispatch = makeDispatch();
      const { result } = renderHook(() => useHistoryNavigation(makeOptions({ dispatch })));
      dispatch.mockClear();

      act(() => {
        result.current.navigateViewPath(["Payment"]);
      });

      expect(dispatch).toHaveBeenCalledWith({ type: "SET_VIEW_PATH", path: ["Payment"] });
    });
  });

  describe("org tree view — URL sync", () => {
    it("updates hash to #krs-org-tree when isOrgTreeView becomes true on org tab", async () => {
      const opts = makeOptions({ activeView: "org", viewPath: [], isOrgTreeView: false });
      history.replaceState(null, "", "#krs-org-root");

      const { rerender } = renderHook((p) => useHistoryNavigation(p), { initialProps: opts });

      await act(async () => {
        rerender({ ...opts, isOrgTreeView: true });
      });

      expect(location.hash).toBe("#krs-org-tree");
    });

    it("restores to #krs-org-root hash when tree view is disabled", async () => {
      const opts = makeOptions({ activeView: "org", viewPath: [], isOrgTreeView: true });
      history.replaceState(null, "", "#krs-org-tree");

      const { rerender } = renderHook((p) => useHistoryNavigation(p), { initialProps: opts });

      await act(async () => {
        rerender({ ...opts, isOrgTreeView: false });
      });

      expect(location.hash).toBe("#krs-org-root");
    });

    it("calls setIsOrgTreeView(true) on initial mount when hash is #krs-org-tree", () => {
      history.replaceState(null, "", "#krs-org-tree");
      const setIsOrgTreeView = vi.fn();

      renderHook(() =>
        useHistoryNavigation(makeOptions({ activeView: "system", setIsOrgTreeView })),
      );

      expect(setIsOrgTreeView).toHaveBeenCalledWith(true);
    });

    it("calls setIsOrgTreeView(true) when popstate navigates to #krs-org-tree", async () => {
      const setIsOrgTreeView = vi.fn();
      renderHook(() => useHistoryNavigation(makeOptions({ setIsOrgTreeView })));
      setIsOrgTreeView.mockClear();

      history.replaceState(null, "", "#krs-org-tree");
      await act(async () => {
        window.dispatchEvent(new PopStateEvent("popstate"));
      });

      expect(setIsOrgTreeView).toHaveBeenCalledWith(true);
    });

    it("calls setIsOrgTreeView(false) when popstate navigates away from tree view", async () => {
      const setIsOrgTreeView = vi.fn();
      renderHook(() =>
        useHistoryNavigation(
          makeOptions({ activeView: "org", isOrgTreeView: true, setIsOrgTreeView }),
        ),
      );
      setIsOrgTreeView.mockClear();

      history.replaceState(null, "", "#krs-org-root");
      await act(async () => {
        window.dispatchEvent(new PopStateEvent("popstate"));
      });

      expect(setIsOrgTreeView).toHaveBeenCalledWith(false);
    });
  });
});
