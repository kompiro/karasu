// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import {
  buildHash,
  parseHash,
  shareTargetToHash,
  useHistoryNavigation,
} from "./useHistoryNavigation.js";
import { anchorId } from "@karasu-tools/core";

afterEach(cleanup);

// ─── Cross-surface anchor parity (TPL-20260630-01, docs/spec/permalink.md) ─────
// The SPA hash (`buildHash`) and the static drill-down SVG (`anchorId` in core)
// must emit the SAME `krs-<view>-<sanitizeId(id)>` grammar so a deep permalink
// is portable between the two surfaces. If these drift, a shared link resolves
// on one surface and silently falls back to root on the other.
describe("anchor parity: buildHash ↔ core anchorId", () => {
  it.each([
    ["system", "Payment"],
    ["org", "ecTeam"],
    ["system", "weird id/with.chars"],
    ["org", "root"],
  ])("buildHash(%s,[%s]) base matches #anchorId", (view, id) => {
    const hash = buildHash(view as "system" | "org", [id]);
    expect(hash).toBe(`#${anchorId(view, id)}`);
  });

  it("root-level system/org hashes match anchorId(view,'root')", () => {
    expect(buildHash("system", [])).toBe(`#${anchorId("system", "root")}`);
    expect(buildHash("org", [])).toBe(`#${anchorId("org", "root")}`);
  });

  // Documented exception (docs/spec/permalink.md): deploy/matrix are single-level
  // whole-view tabs with a bare `#krs-<view>` token, NOT element anchors — they
  // intentionally do not share the `anchorId` leaf grammar.
  it("deploy/matrix use a bare #krs-<view> token (not the anchorId grammar)", () => {
    expect(buildHash("deploy", [])).toBe("#krs-deploy");
    expect(buildHash("matrix", [])).toBe("#krs-matrix");
    expect(buildHash("deploy", [])).not.toBe(`#${anchorId("deploy", "root")}`);
  });
});

// ─── shareTargetToHash (deep permalink → canonical hash, #1827) ────────────────
describe("shareTargetToHash", () => {
  it("maps a drilled node to #krs-<view>-<node>", () => {
    expect(shareTargetToHash({ view: "system", node: "Payment" })).toBe("#krs-system-Payment");
  });

  it("maps a view-only target to the view root", () => {
    expect(shareTargetToHash({ view: "deploy" })).toBe("#krs-deploy");
    expect(shareTargetToHash({ view: "system" })).toBe("#krs-system-root");
  });

  it("appends the highlight suffix and honors orgTree", () => {
    expect(shareTargetToHash({ view: "system", node: "Payment", highlight: "Api" })).toBe(
      "#krs-system-Payment:Api",
    );
    expect(shareTargetToHash({ view: "org", orgTree: true })).toBe("#krs-org-tree");
  });

  it("round-trips back through parseHash (view + node + highlight)", () => {
    const hash = shareTargetToHash({ view: "system", node: "Payment", highlight: "Api" });
    const parsed = parseHash(hash);
    expect(parsed).toMatchObject({
      activeView: "system",
      nodeId: "Payment",
      highlightNodeId: "Api",
    });
  });
});

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

  it("returns #krs-matrix for matrix view", () => {
    expect(buildHash("matrix", [])).toBe("#krs-matrix");
  });

  it("ignores viewPath for matrix view (matrix has no drill-down)", () => {
    expect(buildHash("matrix", ["ignored"])).toBe("#krs-matrix");
  });

  it("appends :highlightNodeId to matrix hash when provided", () => {
    expect(buildHash("matrix", [], false, "OrderTable")).toBe("#krs-matrix:OrderTable");
  });

  it("returns #krs-org-tree when isOrgTreeView is true", () => {
    expect(buildHash("org", [], true)).toBe("#krs-org-tree");
  });

  it("ignores isOrgTreeView when activeView is not org", () => {
    expect(buildHash("system", [], true)).toBe("#krs-system-root");
  });

  it("appends :highlightNodeId to deploy hash when provided", () => {
    expect(buildHash("deploy", [], false, "ECommerce")).toBe("#krs-deploy:ECommerce");
  });

  it("appends :highlightNodeId to org root hash when provided", () => {
    expect(buildHash("org", [], false, "ecTeam")).toBe("#krs-org-root:ecTeam");
  });

  it("appends :highlightNodeId to system hash when provided", () => {
    expect(buildHash("system", ["Payment"], false, "SomeNode")).toBe(
      "#krs-system-Payment:SomeNode",
    );
  });

  it("omits colon when highlightNodeId is null", () => {
    expect(buildHash("deploy", [], false, null)).toBe("#krs-deploy");
  });

  it("omits colon when highlightNodeId is undefined", () => {
    expect(buildHash("deploy", [], false, undefined)).toBe("#krs-deploy");
  });

  it("appends ?file= when filePath is provided (Issue #811)", () => {
    expect(buildHash("system", [], false, null, "/projects/p/before.krs")).toBe(
      "#krs-system-root?file=%2Fprojects%2Fp%2Fbefore.krs",
    );
  });

  it("combines highlight and file segments", () => {
    expect(buildHash("deploy", [], false, "ECommerce", "/p/index.krs")).toBe(
      "#krs-deploy:ECommerce?file=%2Fp%2Findex.krs",
    );
  });
});

// ─── parseHash ────────────────────────────────────────────────────────────────

describe("parseHash", () => {
  it("parses #krs-deploy", () => {
    expect(parseHash("#krs-deploy")).toEqual({
      activeView: "deploy",
      nodeId: null,
      isOrgTreeView: false,
      highlightNodeId: null,
      filePath: null,
    });
  });

  it("parses #krs-system-root", () => {
    expect(parseHash("#krs-system-root")).toEqual({
      activeView: "system",
      nodeId: null,
      isOrgTreeView: false,
      highlightNodeId: null,
      filePath: null,
    });
  });

  it("parses #krs-org-root", () => {
    expect(parseHash("#krs-org-root")).toEqual({
      activeView: "org",
      nodeId: null,
      isOrgTreeView: false,
      highlightNodeId: null,
      filePath: null,
    });
  });

  it("parses #krs-system-Payment", () => {
    expect(parseHash("#krs-system-Payment")).toEqual({
      activeView: "system",
      nodeId: "Payment",
      isOrgTreeView: false,
      highlightNodeId: null,
      filePath: null,
    });
  });

  it("parses #krs-org-backend", () => {
    expect(parseHash("#krs-org-backend")).toEqual({
      activeView: "org",
      nodeId: "backend",
      isOrgTreeView: false,
      highlightNodeId: null,
      filePath: null,
    });
  });

  it("parses #krs-matrix as matrix view (no nodeId, no tree-view)", () => {
    expect(parseHash("#krs-matrix")).toEqual({
      activeView: "matrix",
      nodeId: null,
      isOrgTreeView: false,
      highlightNodeId: null,
      filePath: null,
    });
  });

  it("parses #krs-matrix:OrderTable with highlight suffix", () => {
    expect(parseHash("#krs-matrix:OrderTable")).toEqual({
      activeView: "matrix",
      nodeId: null,
      isOrgTreeView: false,
      highlightNodeId: "OrderTable",
      filePath: null,
    });
  });

  it("parses #krs-matrix?file=... with file suffix", () => {
    expect(parseHash("#krs-matrix?file=%2Fp%2Findex.krs")).toEqual({
      activeView: "matrix",
      nodeId: null,
      isOrgTreeView: false,
      highlightNodeId: null,
      filePath: "/p/index.krs",
    });
  });

  it("round-trips matrix view through buildHash → parseHash", () => {
    expect(parseHash(buildHash("matrix", []))).toEqual({
      activeView: "matrix",
      nodeId: null,
      isOrgTreeView: false,
      highlightNodeId: null,
      filePath: null,
    });
  });

  it("parses #krs-org-tree as org Tree View mode", () => {
    expect(parseHash("#krs-org-tree")).toEqual({
      activeView: "org",
      nodeId: null,
      isOrgTreeView: true,
      highlightNodeId: null,
      filePath: null,
    });
  });

  it("parses #krs-deploy:ECommerce and extracts highlightNodeId", () => {
    expect(parseHash("#krs-deploy:ECommerce")).toEqual({
      activeView: "deploy",
      nodeId: null,
      isOrgTreeView: false,
      highlightNodeId: "ECommerce",
      filePath: null,
    });
  });

  it("parses #krs-org-root:ecTeam and extracts highlightNodeId", () => {
    expect(parseHash("#krs-org-root:ecTeam")).toEqual({
      activeView: "org",
      nodeId: null,
      isOrgTreeView: false,
      highlightNodeId: "ecTeam",
      filePath: null,
    });
  });

  it("parses #krs-system-Payment:SomeNode and extracts both nodeId and highlightNodeId", () => {
    expect(parseHash("#krs-system-Payment:SomeNode")).toEqual({
      activeView: "system",
      nodeId: "Payment",
      isOrgTreeView: false,
      highlightNodeId: "SomeNode",
      filePath: null,
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

  it("extracts filePath from the ?file= suffix (Issue #811)", () => {
    expect(parseHash("#krs-system-root?file=%2Fp%2Fbefore.krs")).toEqual({
      activeView: "system",
      nodeId: null,
      isOrgTreeView: false,
      highlightNodeId: null,
      filePath: "/p/before.krs",
    });
  });

  it("decodes filePath together with a highlightNodeId", () => {
    expect(parseHash("#krs-deploy:ECommerce?file=%2Fp%2Findex.krs")).toEqual({
      activeView: "deploy",
      nodeId: null,
      isOrgTreeView: false,
      highlightNodeId: "ECommerce",
      filePath: "/p/index.krs",
    });
  });
});

// ─── useHistoryNavigation ─────────────────────────────────────────────────────

function makeDispatch() {
  return vi.fn<() => void>();
}

function makeOptions(overrides: Partial<Parameters<typeof useHistoryNavigation>[0]> = {}) {
  return {
    activeView: "system" as const,
    viewPath: [] as string[],
    // Default null — most tests cover hash structure independently of the file
    // segment. Specific file/history tests override below.
    currentFilePath: null as string | null,
    nodePathIndex: new Map<string, string[]>(),
    dispatch: makeDispatch(),
    isOrgTreeView: false,
    setIsOrgTreeView: vi.fn<() => void>(),
    highlightedNodeId: null as string | null,
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
      expect(dispatch).toHaveBeenCalledWith({
        type: "SET_ACTIVE_VIEW",
        activeView: "org",
        highlightNodeId: null,
      });
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

    it("resolves pending org team nodeId via orgPathIndex on initial mount", async () => {
      history.replaceState(null, "", "#krs-org-platform-team");
      const dispatch = makeDispatch();
      let orgPathIndex = new Map<string, string[]>();

      const { rerender } = renderHook(() =>
        useHistoryNavigation(makeOptions({ dispatch, activeView: "org", orgPathIndex })),
      );

      dispatch.mockClear();

      // orgPathIndex now has data
      orgPathIndex = new Map([["platform-team", ["platform-team"]]]);
      await act(async () => {
        rerender();
      });

      expect(dispatch).toHaveBeenCalledWith({
        type: "SET_VIEW_PATH",
        path: ["platform-team"],
      });
    });

    it("falls back to root view when nodePathIndex does not contain the key", async () => {
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

      expect(dispatch).toHaveBeenCalledWith({ type: "SET_VIEW_PATH", path: [] });
    });
  });

  // Regression for #1842: on a shared open, the project-seed effect's
  // SELECT_FILE → VIEW_RESET runs after effect ① and wipes the highlight it
  // dispatched on mount. Effect ② must re-apply the highlight once the
  // model-derived index populates (which is guaranteed to be after that reset).
  // The growing index simulates the seed having loaded the file content.
  describe("pending highlight restoration (#1842)", () => {
    it("re-applies the highlight when nodePathIndex becomes available (node + highlight)", async () => {
      history.replaceState(null, "", "#krs-system-Payment:Api");
      const dispatch = makeDispatch();
      let nodePathIndex = new Map<string, string[]>();

      const { rerender } = renderHook(() =>
        useHistoryNavigation(makeOptions({ dispatch, nodePathIndex })),
      );

      // Effect ① fires the initial highlight; the seed's VIEW_RESET (not modeled
      // here) would clear it. Drop those mount dispatches and assert the deferred
      // re-application only.
      dispatch.mockClear();

      nodePathIndex = new Map([["Payment", ["Payment"]]]);
      await act(async () => {
        rerender();
      });

      expect(dispatch).toHaveBeenCalledWith({ type: "SET_VIEW_PATH", path: ["Payment"] });
      expect(dispatch).toHaveBeenCalledWith({ type: "SET_HIGHLIGHTED_NODE", nodeId: "Api" });
    });

    it("re-applies a highlight-only-at-root hash once the index populates", async () => {
      history.replaceState(null, "", "#krs-system-root:Api");
      const dispatch = makeDispatch();
      let nodePathIndex = new Map<string, string[]>();

      const { rerender } = renderHook(() =>
        useHistoryNavigation(makeOptions({ dispatch, nodePathIndex })),
      );

      // Empty index — no deferred re-application yet (would land before the
      // seed's VIEW_RESET).
      dispatch.mockClear();

      nodePathIndex = new Map([["Api", ["Api"]]]);
      await act(async () => {
        rerender();
      });

      expect(dispatch).toHaveBeenCalledWith({ type: "SET_HIGHLIGHTED_NODE", nodeId: "Api" });
    });

    it("re-applies the highlight only once across further index changes", async () => {
      history.replaceState(null, "", "#krs-system-Payment:Api");
      const dispatch = makeDispatch();
      let nodePathIndex = new Map([["Payment", ["Payment"]]]);

      const { rerender } = renderHook(() =>
        useHistoryNavigation(makeOptions({ dispatch, nodePathIndex })),
      );

      // Index already populated on mount — effect ② applies once. Clear, then
      // recompute the index (e.g. user edits the file) and assert no re-fire.
      await act(async () => {
        rerender();
      });
      dispatch.mockClear();

      nodePathIndex = new Map([
        ["Payment", ["Payment"]],
        ["Extra", ["Extra"]],
      ]);
      await act(async () => {
        rerender();
      });

      expect(dispatch).not.toHaveBeenCalledWith({ type: "SET_HIGHLIGHTED_NODE", nodeId: "Api" });
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

    it("appends :highlightNodeId to hash when highlightedNodeId is set", async () => {
      const opts = makeOptions({ activeView: "deploy" });
      history.replaceState(null, "", "#krs-deploy");

      const { rerender } = renderHook((p) => useHistoryNavigation(p), { initialProps: opts });

      await act(async () => {
        rerender({ ...opts, highlightedNodeId: "ECommerce" });
      });

      expect(location.hash).toBe("#krs-deploy:ECommerce");
    });

    it("removes :highlightNodeId from hash when highlightedNodeId becomes null", async () => {
      const opts = makeOptions({ activeView: "deploy", highlightedNodeId: "ECommerce" });
      history.replaceState(null, "", "#krs-deploy:ECommerce");

      const { rerender } = renderHook((p) => useHistoryNavigation(p), { initialProps: opts });

      await act(async () => {
        rerender({ ...opts, highlightedNodeId: null });
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

      expect(dispatch).toHaveBeenCalledWith({
        type: "SET_ACTIVE_VIEW",
        activeView: "deploy",
        highlightNodeId: null,
      });
    });

    it("passes highlightNodeId to SET_ACTIVE_VIEW when popstate hash has colon suffix", async () => {
      const dispatch = makeDispatch();
      renderHook(() => useHistoryNavigation(makeOptions({ dispatch, activeView: "system" })));
      dispatch.mockClear();

      history.replaceState(null, "", "#krs-deploy:ECommerce");
      await act(async () => {
        window.dispatchEvent(new PopStateEvent("popstate"));
      });

      expect(dispatch).toHaveBeenCalledWith({
        type: "SET_ACTIVE_VIEW",
        activeView: "deploy",
        highlightNodeId: "ECommerce",
      });
    });

    it("dispatches SET_HIGHLIGHTED_NODE when popstate stays on same view with highlight", async () => {
      const dispatch = makeDispatch();
      renderHook(() => useHistoryNavigation(makeOptions({ dispatch, activeView: "deploy" })));
      dispatch.mockClear();

      history.replaceState(null, "", "#krs-deploy:ECommerce");
      await act(async () => {
        window.dispatchEvent(new PopStateEvent("popstate"));
      });

      expect(dispatch).toHaveBeenCalledWith({ type: "SET_HIGHLIGHTED_NODE", nodeId: "ECommerce" });
    });

    it("dispatches SET_HIGHLIGHTED_NODE with null when popstate stays on same view without highlight", async () => {
      const dispatch = makeDispatch();
      renderHook(() =>
        useHistoryNavigation(
          makeOptions({ dispatch, activeView: "deploy", highlightedNodeId: "ECommerce" }),
        ),
      );
      dispatch.mockClear();

      history.replaceState(null, "", "#krs-deploy");
      await act(async () => {
        window.dispatchEvent(new PopStateEvent("popstate"));
      });

      expect(dispatch).toHaveBeenCalledWith({ type: "SET_HIGHLIGHTED_NODE", nodeId: null });
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

    it("falls back to root view on popstate when nodeId is not in nodePathIndex", async () => {
      const nodePathIndex = new Map([["Known", ["Known"]]]);
      const dispatch = makeDispatch();
      renderHook(() => useHistoryNavigation(makeOptions({ dispatch, nodePathIndex })));
      dispatch.mockClear();

      history.replaceState(null, "", "#krs-system-Unknown");
      await act(async () => {
        window.dispatchEvent(new PopStateEvent("popstate"));
      });

      expect(dispatch).toHaveBeenCalledWith({ type: "SET_VIEW_PATH", path: [] });
    });

    it("resolves org team nodeId via orgPathIndex on popstate", async () => {
      // "platform-team" is a top-level org team; its path is ["platform-team"]
      const orgPathIndex = new Map([
        ["ec-team", ["ec-team"]],
        ["platform-team", ["platform-team"]],
        ["oncall", ["platform-team", "oncall"]],
      ]);
      const dispatch = makeDispatch();
      renderHook(() =>
        useHistoryNavigation(makeOptions({ dispatch, activeView: "org", orgPathIndex })),
      );
      dispatch.mockClear();

      history.replaceState(null, "", "#krs-org-platform-team:oncall");
      await act(async () => {
        window.dispatchEvent(new PopStateEvent("popstate"));
      });

      expect(dispatch).toHaveBeenCalledWith({
        type: "SET_VIEW_PATH",
        path: ["platform-team"],
      });
      expect(dispatch).toHaveBeenCalledWith({
        type: "SET_HIGHLIGHTED_NODE",
        nodeId: "oncall",
      });
    });

    it("resolves sub-team nodeId via orgPathIndex on popstate (nested team)", async () => {
      // "oncall" is a sub-team under "platform-team"; viewPath = ["platform-team", "oncall"]
      const orgPathIndex = new Map([
        ["platform-team", ["platform-team"]],
        ["oncall", ["platform-team", "oncall"]],
      ]);
      const dispatch = makeDispatch();
      renderHook(() =>
        useHistoryNavigation(makeOptions({ dispatch, activeView: "org", orgPathIndex })),
      );
      dispatch.mockClear();

      history.replaceState(null, "", "#krs-org-oncall");
      await act(async () => {
        window.dispatchEvent(new PopStateEvent("popstate"));
      });

      expect(dispatch).toHaveBeenCalledWith({
        type: "SET_VIEW_PATH",
        path: ["platform-team", "oncall"],
      });
    });

    it("does not use orgPathIndex for system hashes on popstate", async () => {
      // System nodeId should still use nodePathIndex, not orgPathIndex
      const nodePathIndex = new Map([["EC", ["Payment", "EC"]]]);
      const orgPathIndex = new Map([["EC", ["wrong-path"]]]);
      const dispatch = makeDispatch();
      renderHook(() =>
        useHistoryNavigation(makeOptions({ dispatch, nodePathIndex, orgPathIndex })),
      );
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

  describe("file switch — URL hash (Issue #811)", () => {
    it("pushes a new hash entry encoding the file when currentFilePath changes", async () => {
      const opts = makeOptions({ currentFilePath: "/a.krs" });
      const { rerender } = renderHook((p) => useHistoryNavigation(p), { initialProps: opts });

      await act(async () => {
        rerender({ ...opts, currentFilePath: "/b.krs" });
      });

      expect(location.hash).toBe("#krs-system-root?file=%2Fb.krs");
    });

    it("encodes the file in the hash on initial mount when no hash is present", () => {
      renderHook(() => useHistoryNavigation(makeOptions({ currentFilePath: "/a.krs" })));
      expect(location.hash).toBe("#krs-system-root?file=%2Fa.krs");
    });

    it("calls onFileChange on initial mount when the hash specifies a different file", () => {
      history.replaceState(null, "", "#krs-system-root?file=%2Fwanted.krs");
      const onFileChange = vi.fn<(path: string) => Promise<void>>(async () => {});
      renderHook(() =>
        useHistoryNavigation(makeOptions({ currentFilePath: "/a.krs", onFileChange })),
      );
      expect(onFileChange).toHaveBeenCalledWith("/wanted.krs");
    });

    it("calls onFileChange on popstate when the hash specifies a different file", async () => {
      const onFileChange = vi.fn<(path: string) => Promise<void>>(async () => {});
      renderHook(() =>
        useHistoryNavigation(makeOptions({ currentFilePath: "/a.krs", onFileChange })),
      );
      onFileChange.mockClear();

      history.replaceState(null, "", "#krs-system-root?file=%2Fb.krs");
      await act(async () => {
        window.dispatchEvent(new PopStateEvent("popstate"));
      });

      expect(onFileChange).toHaveBeenCalledWith("/b.krs");
    });

    it("does not call onFileChange on popstate when the file is unchanged", async () => {
      const onFileChange = vi.fn<(path: string) => Promise<void>>(async () => {});
      renderHook(() =>
        useHistoryNavigation(makeOptions({ currentFilePath: "/a.krs", onFileChange })),
      );
      onFileChange.mockClear();

      history.replaceState(null, "", "#krs-system-Payment?file=%2Fa.krs");
      await act(async () => {
        window.dispatchEvent(new PopStateEvent("popstate"));
      });

      expect(onFileChange).not.toHaveBeenCalled();
    });

    it("does not push a history entry during a project-switch transient (currentFilePath: non-null → null)", async () => {
      const opts = makeOptions({ currentFilePath: "/a.krs" });
      const { rerender } = renderHook((p) => useHistoryNavigation(p), { initialProps: opts });

      const pushSpy = vi.spyOn(history, "pushState");
      const replaceSpy = vi.spyOn(history, "replaceState");
      pushSpy.mockClear();
      replaceSpy.mockClear();

      // SET_CURRENT_PROJECT reducer transiently sets currentFilePath to null.
      await act(async () => {
        rerender({ ...opts, currentFilePath: null });
      });

      expect(pushSpy).not.toHaveBeenCalled();
      expect(replaceSpy).not.toHaveBeenCalled();
      pushSpy.mockRestore();
      replaceSpy.mockRestore();
    });

    it("uses replaceState when the initial file is loaded after a project switch (null → non-null)", async () => {
      const opts = makeOptions({ currentFilePath: null });
      const { rerender } = renderHook((p) => useHistoryNavigation(p), { initialProps: opts });

      const pushSpy = vi.spyOn(history, "pushState");
      const replaceSpy = vi.spyOn(history, "replaceState");
      pushSpy.mockClear();
      replaceSpy.mockClear();

      // useProjectInitialization → selectFile(index.krs) — first non-null after
      // a project switch must replace, not push, or the forward stack is wiped.
      await act(async () => {
        rerender({ ...opts, currentFilePath: "/b/index.krs" });
      });

      expect(pushSpy).not.toHaveBeenCalled();
      expect(replaceSpy).toHaveBeenCalled();
      pushSpy.mockRestore();
      replaceSpy.mockRestore();
    });

    it("uses pushState when the user switches files within a project (non-null → non-null)", async () => {
      const opts = makeOptions({ currentFilePath: "/a.krs" });
      const { rerender } = renderHook((p) => useHistoryNavigation(p), { initialProps: opts });

      const pushSpy = vi.spyOn(history, "pushState");
      const replaceSpy = vi.spyOn(history, "replaceState");
      pushSpy.mockClear();
      replaceSpy.mockClear();

      await act(async () => {
        rerender({ ...opts, currentFilePath: "/b.krs" });
      });

      expect(pushSpy).toHaveBeenCalled();
      expect(replaceSpy).not.toHaveBeenCalled();
      pushSpy.mockRestore();
      replaceSpy.mockRestore();
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
      const setIsOrgTreeView = vi.fn<() => void>();

      renderHook(() =>
        useHistoryNavigation(makeOptions({ activeView: "system", setIsOrgTreeView })),
      );

      expect(setIsOrgTreeView).toHaveBeenCalledWith(true);
    });

    it("calls setIsOrgTreeView(true) when popstate navigates to #krs-org-tree", async () => {
      const setIsOrgTreeView = vi.fn<() => void>();
      renderHook(() => useHistoryNavigation(makeOptions({ setIsOrgTreeView })));
      setIsOrgTreeView.mockClear();

      history.replaceState(null, "", "#krs-org-tree");
      await act(async () => {
        window.dispatchEvent(new PopStateEvent("popstate"));
      });

      expect(setIsOrgTreeView).toHaveBeenCalledWith(true);
    });

    it("calls setIsOrgTreeView(false) when popstate navigates away from tree view", async () => {
      const setIsOrgTreeView = vi.fn<() => void>();
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
