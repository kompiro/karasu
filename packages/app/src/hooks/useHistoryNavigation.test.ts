// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { buildHash, parseHash, shareTargetToHash } from "./history-hash.js";
import { useHistoryNavigation } from "./useHistoryNavigation.js";
import { anchorId } from "@karasu-tools/core";
import { useReducer } from "react";
import { appReducer, initialState, type AppAction } from "../state/app-reducer.js";
import type { FileSelectionStatus } from "./useFileSelection.js";
import { useCrossNavigation } from "./useCrossNavigation.js";

afterEach(cleanup);

// ─── Cross-surface anchor parity (TPL-1827, docs/spec/permalink.md) ─────
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

  // The entity sub-mode (#1907) reuses the same `anchorId("entity", <domainId>)`
  // grammar the core static bundle emits (drill-down-svg.ts), keyed by the
  // drilled domain — so the interactive hash and the static #krs-entity level
  // are one portable form.
  it.each([["Ordering"], ["weird id/with.chars"]])(
    "entity sub-mode buildHash matches #anchorId('entity', %s)",
    (id) => {
      expect(buildHash("system", [id], { entityView: true })).toBe(`#${anchorId("entity", id)}`);
    },
  );

  it("entity sub-mode falls back to the system anchor at the root (no domain drilled)", () => {
    expect(buildHash("system", [], { entityView: true })).toBe(`#${anchorId("system", "root")}`);
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

  it("honors the entityView sub-mode flag (#1907)", () => {
    expect(shareTargetToHash({ view: "system", node: "Ordering", entityView: true })).toBe(
      "#krs-entity-Ordering",
    );
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
    expect(buildHash("matrix", [], { highlight: "OrderTable" })).toBe("#krs-matrix:OrderTable");
  });

  it("returns #krs-org-tree when isOrgTreeView is true", () => {
    expect(buildHash("org", [], { orgTree: true })).toBe("#krs-org-tree");
  });

  it("ignores isOrgTreeView when activeView is not org", () => {
    expect(buildHash("system", [], { orgTree: true })).toBe("#krs-system-root");
  });

  it("appends :highlightNodeId to deploy hash when provided", () => {
    expect(buildHash("deploy", [], { highlight: "ECommerce" })).toBe("#krs-deploy:ECommerce");
  });

  it("appends :highlightNodeId to org root hash when provided", () => {
    expect(buildHash("org", [], { highlight: "ecTeam" })).toBe("#krs-org-root:ecTeam");
  });

  it("appends :highlightNodeId to system hash when provided", () => {
    expect(buildHash("system", ["Payment"], { highlight: "SomeNode" })).toBe(
      "#krs-system-Payment:SomeNode",
    );
  });

  it("omits colon when highlightNodeId is null", () => {
    expect(buildHash("deploy", [], { highlight: null })).toBe("#krs-deploy");
  });

  it("omits colon when highlightNodeId is undefined", () => {
    expect(buildHash("deploy", [], { highlight: undefined })).toBe("#krs-deploy");
  });

  it("appends ?file= when filePath is provided (Issue #811)", () => {
    expect(buildHash("system", [], { file: "/projects/p/before.krs" })).toBe(
      "#krs-system-root?file=%2Fprojects%2Fp%2Fbefore.krs",
    );
  });

  it("combines highlight and file segments", () => {
    expect(buildHash("deploy", [], { highlight: "ECommerce", file: "/p/index.krs" })).toBe(
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
      isEntityView: false,
      highlightNodeId: null,
      filePath: null,
    });
  });

  it("parses #krs-system-root", () => {
    expect(parseHash("#krs-system-root")).toEqual({
      activeView: "system",
      nodeId: null,
      isOrgTreeView: false,
      isEntityView: false,
      highlightNodeId: null,
      filePath: null,
    });
  });

  it("parses #krs-org-root", () => {
    expect(parseHash("#krs-org-root")).toEqual({
      activeView: "org",
      nodeId: null,
      isOrgTreeView: false,
      isEntityView: false,
      highlightNodeId: null,
      filePath: null,
    });
  });

  it("parses #krs-system-Payment", () => {
    expect(parseHash("#krs-system-Payment")).toEqual({
      activeView: "system",
      nodeId: "Payment",
      isOrgTreeView: false,
      isEntityView: false,
      highlightNodeId: null,
      filePath: null,
    });
  });

  it("parses #krs-entity-<domain> as system view with the entity sub-mode on (#1907)", () => {
    expect(parseHash("#krs-entity-Ordering")).toEqual({
      activeView: "system",
      nodeId: "Ordering",
      isOrgTreeView: false,
      isEntityView: true,
      highlightNodeId: null,
      filePath: null,
    });
  });

  it("round-trips the entity sub-mode through buildHash → parseHash", () => {
    const hash = buildHash("system", ["Ordering"], { entityView: true });
    const parsed = parseHash(hash);
    expect(parsed?.activeView).toBe("system");
    expect(parsed?.nodeId).toBe("Ordering");
    expect(parsed?.isEntityView).toBe(true);
  });

  it("parses #krs-org-backend", () => {
    expect(parseHash("#krs-org-backend")).toEqual({
      activeView: "org",
      nodeId: "backend",
      isOrgTreeView: false,
      isEntityView: false,
      highlightNodeId: null,
      filePath: null,
    });
  });

  it("parses #krs-matrix as matrix view (no nodeId, no tree-view)", () => {
    expect(parseHash("#krs-matrix")).toEqual({
      activeView: "matrix",
      nodeId: null,
      isOrgTreeView: false,
      isEntityView: false,
      highlightNodeId: null,
      filePath: null,
    });
  });

  it("parses #krs-matrix:OrderTable with highlight suffix", () => {
    expect(parseHash("#krs-matrix:OrderTable")).toEqual({
      activeView: "matrix",
      nodeId: null,
      isOrgTreeView: false,
      isEntityView: false,
      highlightNodeId: "OrderTable",
      filePath: null,
    });
  });

  it("parses #krs-matrix?file=... with file suffix", () => {
    expect(parseHash("#krs-matrix?file=%2Fp%2Findex.krs")).toEqual({
      activeView: "matrix",
      nodeId: null,
      isOrgTreeView: false,
      isEntityView: false,
      highlightNodeId: null,
      filePath: "/p/index.krs",
    });
  });

  it("round-trips matrix view through buildHash → parseHash", () => {
    expect(parseHash(buildHash("matrix", []))).toEqual({
      activeView: "matrix",
      nodeId: null,
      isOrgTreeView: false,
      isEntityView: false,
      highlightNodeId: null,
      filePath: null,
    });
  });

  it("parses #krs-org-tree as org Tree View mode", () => {
    expect(parseHash("#krs-org-tree")).toEqual({
      activeView: "org",
      nodeId: null,
      isOrgTreeView: true,
      isEntityView: false,
      highlightNodeId: null,
      filePath: null,
    });
  });

  it("parses #krs-deploy:ECommerce and extracts highlightNodeId", () => {
    expect(parseHash("#krs-deploy:ECommerce")).toEqual({
      activeView: "deploy",
      nodeId: null,
      isOrgTreeView: false,
      isEntityView: false,
      highlightNodeId: "ECommerce",
      filePath: null,
    });
  });

  it("parses #krs-org-root:ecTeam and extracts highlightNodeId", () => {
    expect(parseHash("#krs-org-root:ecTeam")).toEqual({
      activeView: "org",
      nodeId: null,
      isOrgTreeView: false,
      isEntityView: false,
      highlightNodeId: "ecTeam",
      filePath: null,
    });
  });

  it("parses #krs-system-Payment:SomeNode and extracts both nodeId and highlightNodeId", () => {
    expect(parseHash("#krs-system-Payment:SomeNode")).toEqual({
      activeView: "system",
      nodeId: "Payment",
      isOrgTreeView: false,
      isEntityView: false,
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
      isEntityView: false,
      highlightNodeId: null,
      filePath: "/p/before.krs",
    });
  });

  it("decodes filePath together with a highlightNodeId", () => {
    expect(parseHash("#krs-deploy:ECommerce?file=%2Fp%2Findex.krs")).toEqual({
      activeView: "deploy",
      nodeId: null,
      isOrgTreeView: false,
      isEntityView: false,
      highlightNodeId: "ECommerce",
      filePath: "/p/index.krs",
    });
  });
});

// ─── useHistoryNavigation ─────────────────────────────────────────────────────

function makeDispatch() {
  return vi.fn<() => void>();
}

/** The `type` of every action `dispatch` received, in order. */
function dispatchedTypes(dispatch: ReturnType<typeof makeDispatch>): string[] {
  return (dispatch.mock.calls as unknown as [{ type: string }][]).map(([action]) => action.type);
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
    isEntityView: false,
    setIsEntityView: vi.fn<() => void>(),
    highlightedNodeId: null as string | null,
    ...overrides,
  };
}

/**
 * The hook on the real `appReducer`, with a node-path index that is empty
 * until a file is loaded. With `withSeed` the index fills in the seed's own
 * render; without it, only after `indexNow()` (a model compiled a render
 * later).
 */
function renderWithReducer(withSeed: boolean) {
  let indexed = false;
  const hook = renderHook(() => {
    const [state, dispatch] = useReducer(appReducer, initialState);
    const nodePathIndex =
      state.fileContent && (withSeed || indexed)
        ? new Map([["A", ["A"]]])
        : new Map<string, string[]>();
    useHistoryNavigation(
      makeOptions({
        dispatch,
        nodePathIndex,
        activeView: state.activeView,
        viewPath: state.viewPath,
        currentFilePath: state.currentFilePath,
        highlightedNodeId: state.highlightedNodeId,
      }),
    );
    return { state, dispatch };
  });
  return {
    ...hook,
    indexNow: () => {
      indexed = true;
    },
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
        highlightAttribute: "data-node-id",
      });
    });

    // #2818: the hash carries no id space, so restoration names the attribute
    // by view. A deploy `:<highlight>` is what the deploy-jump button and a
    // share link write, a node id, which the deploy view marks on the
    // realizing container.
    it("restores a deploy hash highlight on data-realized-node-id", () => {
      history.replaceState(null, "", "#krs-deploy:ECommerce");
      const dispatch = makeDispatch();
      renderHook(() => useHistoryNavigation(makeOptions({ dispatch, activeView: "system" })));
      expect(dispatch).toHaveBeenCalledWith({
        type: "SET_ACTIVE_VIEW",
        activeView: "deploy",
        highlightNodeId: "ECommerce",
        highlightAttribute: "data-realized-node-id",
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
  // #3208: on a cold boot the seed's SELECT_FILE spreads VIEW_RESET
  // (`activeView: "system"`) after effect ① restored the tab, so a Deploy /
  // Org / CRUD hash landed on System. Effect ② re-applies the view, like the
  // node and highlight (TPL-1842).
  describe("pending view restoration (#3208)", () => {
    it.each([
      ["#krs-deploy", "deploy"],
      ["#krs-org-root", "org"],
      ["#krs-matrix", "matrix"],
    ] as const)("re-applies %s once the index populates", async (hash, view) => {
      history.replaceState(null, "", hash);
      const dispatch = makeDispatch();
      let nodePathIndex = new Map<string, string[]>();

      const { rerender } = renderHook(() =>
        useHistoryNavigation(makeOptions({ dispatch, nodePathIndex })),
      );

      // Effect ① restored the tab; the seed's VIEW_RESET (not modeled here)
      // then wipes it. Only the deferred re-application is asserted.
      dispatch.mockClear();

      nodePathIndex = new Map([["Payment", ["Payment"]]]);
      await act(async () => {
        rerender();
      });

      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: "SET_ACTIVE_VIEW", activeView: view }),
      );
    });

    it("does not re-apply before the index is ready, nor more than once", async () => {
      history.replaceState(null, "", "#krs-deploy");
      const dispatch = makeDispatch();
      let nodePathIndex = new Map<string, string[]>();

      const { rerender } = renderHook(() =>
        useHistoryNavigation(makeOptions({ dispatch, nodePathIndex })),
      );
      dispatch.mockClear();

      // Still empty: re-applying now would land before the seed's reset.
      await act(async () => {
        rerender();
      });
      expect(dispatch).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: "SET_ACTIVE_VIEW" }),
      );

      nodePathIndex = new Map([["Payment", ["Payment"]]]);
      await act(async () => {
        rerender();
      });
      nodePathIndex = new Map([
        ["Payment", ["Payment"]],
        ["Api", ["Api"]],
      ]);
      await act(async () => {
        rerender();
      });
      expect(dispatchedTypes(dispatch).filter((t) => t === "SET_ACTIVE_VIEW")).toHaveLength(1);
    });

    it("applies the view before the org drill it resolves", async () => {
      history.replaceState(null, "", "#krs-org-backend");
      const dispatch = makeDispatch();
      let orgPathIndex = new Map<string, string[]>();

      const { rerender } = renderHook(() =>
        useHistoryNavigation(makeOptions({ dispatch, orgPathIndex })),
      );
      dispatch.mockClear();

      orgPathIndex = new Map([["backend", ["eng", "backend"]]]);
      await act(async () => {
        rerender();
      });

      const types = dispatchedTypes(dispatch);
      expect(types.indexOf("SET_ACTIVE_VIEW")).toBeGreaterThanOrEqual(0);
      expect(types.indexOf("SET_ACTIVE_VIEW")).toBeLessThan(types.indexOf("SET_VIEW_PATH"));
      expect(dispatch).toHaveBeenCalledWith({ type: "SET_VIEW_PATH", path: ["eng", "backend"] });
    });

    it("carries the hash's highlight with the re-applied view", async () => {
      history.replaceState(null, "", "#krs-deploy:ECommerce");
      const dispatch = makeDispatch();
      let nodePathIndex = new Map<string, string[]>();

      const { rerender } = renderHook(() =>
        useHistoryNavigation(makeOptions({ dispatch, nodePathIndex })),
      );
      dispatch.mockClear();

      nodePathIndex = new Map([["ECommerce", ["ECommerce"]]]);
      await act(async () => {
        rerender();
      });

      expect(dispatch).toHaveBeenCalledWith({
        type: "SET_ACTIVE_VIEW",
        activeView: "deploy",
        highlightNodeId: "ECommerce",
        highlightAttribute: "data-realized-node-id",
      });
    });

    it("leaves a system hash alone: the reset already lands on System", async () => {
      history.replaceState(null, "", "#krs-system-root");
      const dispatch = makeDispatch();
      let nodePathIndex = new Map<string, string[]>();

      const { rerender } = renderHook(() =>
        useHistoryNavigation(makeOptions({ dispatch, nodePathIndex })),
      );
      dispatch.mockClear();

      nodePathIndex = new Map([["Payment", ["Payment"]]]);
      await act(async () => {
        rerender();
      });
      expect(dispatch).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: "SET_ACTIVE_VIEW" }),
      );
    });

    // With the real reducer: the seed's SELECT_FILE resets the view, effect ②
    // re-applies it. The commit in between still holds `system`; writing it
    // and then pushing the restored hash left a System entry right behind
    // the deep link, so Back landed on System.
    it.each([
      ["in the seed's render", true],
      ["a render after the seed", false],
    ])(
      "re-applies the view without adding a history entry when the index fills %s",
      async (_when, withSeed) => {
        history.replaceState(null, "", "#krs-deploy?file=%2Findex.krs");
        let indexed = false;
        const { result, rerender } = renderHook(() => {
          const [state, dispatch] = useReducer(appReducer, initialState);
          const nodePathIndex =
            state.fileContent && (withSeed || indexed)
              ? new Map([["A", ["A"]]])
              : new Map<string, string[]>();
          useHistoryNavigation(
            makeOptions({
              dispatch,
              nodePathIndex,
              activeView: state.activeView,
              viewPath: state.viewPath,
              currentFilePath: state.currentFilePath,
              highlightedNodeId: state.highlightedNodeId,
            }),
          );
          return { state, dispatch };
        });
        // Only what the seed and the restoration write; the mount's own writes are not this fix's.
        const pushState = vi.spyOn(history, "pushState");
        const replaceState = vi.spyOn(history, "replaceState");
        pushState.mockClear();
        replaceState.mockClear();

        await act(async () => {
          result.current.dispatch({
            type: "SELECT_FILE",
            path: "/index.krs",
            content: "system S {\n  service A {}\n}\n",
          });
        });
        indexed = true;
        await act(async () => {
          rerender();
        });

        expect(result.current.state.activeView).toBe("deploy");
        expect(pushState).not.toHaveBeenCalled();
        expect(replaceState.mock.calls.at(-1)?.[2]).toBe("#krs-deploy?file=%2Findex.krs");
        expect(location.hash).toBe("#krs-deploy?file=%2Findex.krs");
        pushState.mockRestore();
        replaceState.mockRestore();
      },
    );
  });

  // #3284: from mount until the restored state commits, effect ③ sees
  // pre-restore states (the mount's `system` root, the seed's reset, the
  // commit before effect ②'s dispatches land). Pushing any of them put an
  // entry between the deep link and the page that linked to it.
  describe("a cold boot on a deep link adds no history entry (#3284)", () => {
    it.each([
      ["#krs-deploy?file=%2Findex.krs", true],
      ["#krs-deploy?file=%2Findex.krs", false],
      ["#krs-system-A?file=%2Findex.krs", true],
      ["#krs-system-A?file=%2Findex.krs", false],
      ["#krs-system-root:A?file=%2Findex.krs", true],
      ["#krs-system-A:A?file=%2Findex.krs", false],
      ["#krs-system-A", true],
      ["#krs-system-root?file=%2Findex.krs", true],
    ])("%s (index fills in the seed's render: %s)", async (hash, withSeed) => {
      history.replaceState(null, "", hash);
      const pushState = vi.spyOn(history, "pushState");
      const { result, rerender, indexNow } = renderWithReducer(withSeed);

      await act(async () => {
        result.current.dispatch({
          type: "SELECT_FILE",
          path: "/index.krs",
          content: "system S {\n  service A {}\n}\n",
        });
      });
      indexNow();
      await act(async () => {
        rerender();
      });

      expect(pushState).not.toHaveBeenCalled();
      // The entry the link opened now holds the restored state.
      const expected = hash.includes("?") ? hash : `${hash}?file=%2Findex.krs`;
      expect(location.hash).toBe(expected);

      // Once restored, the user's navigation pushes again.
      await act(async () => {
        result.current.dispatch({ type: "SET_ACTIVE_VIEW", activeView: "org" });
      });
      expect(pushState).toHaveBeenCalledTimes(1);
      expect(pushState.mock.calls[0]?.[2]).toBe("#krs-org-root?file=%2Findex.krs");
      pushState.mockRestore();
    });

    it("pushes the first navigation after a boot with the index ready at mount", async () => {
      // Memory / Serve mode: no deferral is pending, so the restoration
      // settles as soon as the file is in.
      history.replaceState(null, "", "#krs-system-root?file=%2Findex.krs");
      const pushState = vi.spyOn(history, "pushState");
      const { result } = renderWithReducer(true);
      await act(async () => {
        result.current.dispatch({
          type: "SELECT_FILE",
          path: "/index.krs",
          content: "system S {\n  service A {}\n}\n",
        });
      });
      expect(pushState).not.toHaveBeenCalled();

      await act(async () => {
        result.current.dispatch({ type: "SET_VIEW_PATH", path: ["A"] });
      });
      expect(pushState).toHaveBeenCalledTimes(1);
      expect(pushState.mock.calls[0]?.[2]).toBe("#krs-system-A?file=%2Findex.krs");
      pushState.mockRestore();
    });

    it("pushes the first navigation when the restored value was already in the state", async () => {
      // A node the model does not have resolves to the root path the reset
      // already shows; a target equal to the state must not hold the
      // restoration open past the boot.
      history.replaceState(null, "", "#krs-system-Missing?file=%2Findex.krs");
      const pushState = vi.spyOn(history, "pushState");
      const { result, rerender, indexNow } = renderWithReducer(false);
      await act(async () => {
        result.current.dispatch({
          type: "SELECT_FILE",
          path: "/index.krs",
          content: "system S {\n  service A {}\n}\n",
        });
      });
      indexNow();
      await act(async () => {
        rerender();
      });
      expect(pushState).not.toHaveBeenCalled();
      expect(location.hash).toBe("#krs-system-root?file=%2Findex.krs");
      await act(async () => {
        result.current.dispatch({ type: "SET_ACTIVE_VIEW", activeView: "deploy" });
      });
      expect(pushState).toHaveBeenCalledTimes(1);
      pushState.mockRestore();
    });
  });

  // #3598: a hash may name a file other than the `index.krs` a project switch
  // opens. The restoration waits for that file, and re-applies the view and
  // the drill over it rather than over the file open before it, so the file
  // landing late neither pushes an entry nor resets what was restored.
  describe("a deep link naming another file adds no history entry (#3598)", () => {
    const KRS = "system S {\n  service A {}\n}\n";

    /** The path index a compile of `content` yields: one entry per service. */
    const indexOf = (content: string) =>
      new Map([...content.matchAll(/service (\w+)/g)].map(([, id]) => [id, [id]]));

    /**
     * The hook on the real reducer, with `onFileChange` resolved by the test.
     * By default `/index.krs` is already open (a switch that opened it before
     * the named file); `openAtMount: null` boots from no file, as the app
     * does. With `withSeed` the path index is compiled in the render a file
     * lands in; without it, the previous file's index stays until
     * `compileNow()`, as the debounced compile leaves it.
     */
    function renderOnIndexKrs(
      withSeed: boolean,
      {
        openAtMount = "/index.krs" as string | null,
        mountContent = KRS,
        fileRoot = null as string | null,
      } = {},
    ) {
      let compiled = { path: openAtMount, content: openAtMount ? mountContent : "" };
      // The entry whose compile last settled, with errors or not.
      let settled = openAtMount;
      const reads = new Map<string, (status: FileSelectionStatus, content: string) => void>();
      const dispatchRef: { current: ((action: AppAction) => void) | null } = { current: null };
      const onFileChange = vi.fn<(path: string) => Promise<FileSelectionStatus>>(
        (path) =>
          new Promise((resolve) => {
            reads.set(path, (status, content) => {
              if (status === "opened")
                dispatchRef.current?.({ type: "SELECT_FILE", path, content });
              resolve(status);
            });
          }),
      );
      const hook = renderHook(() => {
        const [state, dispatch] = useReducer(appReducer, {
          ...initialState,
          currentFilePath: openAtMount,
          fileContent: openAtMount ? mountContent : "",
        });
        dispatchRef.current = dispatch;
        if (withSeed) {
          compiled = { path: state.currentFilePath, content: state.fileContent };
          settled = state.currentFilePath;
        }
        const nodePathIndex = indexOf(compiled.content);
        const nav = useHistoryNavigation(
          makeOptions({
            dispatch,
            nodePathIndex,
            orgPathIndex: nodePathIndex,
            activeView: state.activeView,
            viewPath: state.viewPath,
            currentFilePath: state.currentFilePath,
            highlightedNodeId: state.highlightedNodeId,
            onFileChange,
            fileRoot,
            pathIndexState:
              compiled.path === state.currentFilePath
                ? "current"
                : settled === state.currentFilePath
                  ? "failed"
                  : "compiling",
          }),
        );
        const cross = useCrossNavigation({
          dispatch,
          teamPathIndex: new Map(),
          orgNodePathIndex: nodePathIndex,
          navigateViewPath: nav.navigateViewPath,
        });
        return { state, dispatch, nav, cross };
      });
      return {
        ...hook,
        onFileChange,
        open: async (path: string, status: FileSelectionStatus = "opened", content = KRS) => {
          await act(async () => reads.get(path)?.(status, content));
        },
        compileNow: async () => {
          const { currentFilePath, fileContent } = hook.result.current.state;
          compiled = { path: currentFilePath, content: fileContent };
          settled = currentFilePath;
          await act(async () => hook.rerender());
        },
        /** The open entry's compile settles with errors; its index stays the previous one. */
        failNow: async () => {
          settled = hook.result.current.state.currentFilePath;
          await act(async () => hook.rerender());
        },
      };
    }

    it.each([
      ["#krs-org-root?file=%2Fplanned.krs", true, "org", []],
      ["#krs-org-root?file=%2Fplanned.krs", false, "org", []],
      ["#krs-system-A?file=%2Fplanned.krs", true, "system", ["A"]],
      ["#krs-system-A?file=%2Fplanned.krs", false, "system", ["A"]],
      ["#krs-system-root?file=%2Fplanned.krs", true, "system", []],
    ] as const)(
      "%s restores on the named file (index fills in its render: %s)",
      async (hash, withSeed, view, path) => {
        history.replaceState(null, "", hash);
        const pushState = vi.spyOn(history, "pushState");
        const { result, onFileChange, open, compileNow } = renderOnIndexKrs(withSeed);
        expect(onFileChange).toHaveBeenCalledWith("/planned.krs");

        // The file open before the named one has its index; nothing ends yet.
        await compileNow();
        await open("/planned.krs");
        await compileNow();

        expect(result.current.state.currentFilePath).toBe("/planned.krs");
        expect(result.current.state.activeView).toBe(view);
        expect(result.current.state.viewPath).toEqual(path);
        expect(pushState).not.toHaveBeenCalled();
        expect(location.hash).toBe(hash);

        await act(async () => {
          result.current.dispatch({ type: "SET_ACTIVE_VIEW", activeView: "deploy" });
        });
        expect(pushState).toHaveBeenCalledTimes(1);
        pushState.mockRestore();
      },
    );

    // The named file opened, but as an empty buffer (a missing file) whose
    // index never fills, so the drill stays pending. Opening another file is
    // the visitor's navigation: it must not leave the restoration on, which
    // turned every later navigation into a replace for the whole session.
    it("ends the restoration when the visitor leaves a named file whose index stays empty", async () => {
      history.replaceState(null, "", "#krs-system-A?file=%2Fmissing.krs");
      const pushState = vi.spyOn(history, "pushState");
      const { result, open } = renderOnIndexKrs(true);
      await open("/missing.krs", "opened", "");
      expect(result.current.state.currentFilePath).toBe("/missing.krs");
      expect(pushState).not.toHaveBeenCalled();

      await act(async () => {
        result.current.dispatch({ type: "SELECT_FILE", path: "/index.krs", content: KRS });
      });
      expect(pushState).toHaveBeenCalledTimes(1);
      expect(pushState.mock.calls[0]?.[2]).toBe("#krs-system-root?file=%2Findex.krs");

      await act(async () => {
        result.current.dispatch({ type: "SET_ACTIVE_VIEW", activeView: "org" });
      });
      expect(pushState).toHaveBeenCalledTimes(2);
      pushState.mockRestore();
    });

    it.each([true, false])(
      "restores a boot from no file open on the named file (index in its render: %s)",
      async (withSeed) => {
        history.replaceState(null, "", "#krs-org-root?file=%2Fplanned.krs");
        const pushState = vi.spyOn(history, "pushState");
        const { result, open, compileNow } = renderOnIndexKrs(withSeed, { openAtMount: null });
        await open("/planned.krs");
        await compileNow();

        expect(result.current.state.activeView).toBe("org");
        expect(pushState).not.toHaveBeenCalled();
        expect(location.hash).toBe("#krs-org-root?file=%2Fplanned.krs");
        await act(async () => result.current.nav.navigateActiveView("deploy"));
        expect(pushState).toHaveBeenCalledTimes(1);
        pushState.mockRestore();
      },
    );

    // The previous file's index stays until the debounced compile lands; a
    // drill resolved against it in the commit the named file lands would end
    // the restoration without the drill.
    it("resolves the drill against the named file's own index, not the one before it", async () => {
      history.replaceState(null, "", "#krs-system-A?file=%2Fplanned.krs");
      const pushState = vi.spyOn(history, "pushState");
      const { result, open, compileNow } = renderOnIndexKrs(false, {
        mountContent: "system S {\n  service B {}\n}\n",
      });
      await compileNow();
      await open("/planned.krs");
      expect(result.current.state.viewPath).toEqual([]);

      await compileNow();
      expect(result.current.state.viewPath).toEqual(["A"]);
      expect(pushState).not.toHaveBeenCalled();
      expect(location.hash).toBe("#krs-system-A?file=%2Fplanned.krs");
      pushState.mockRestore();
    });

    // Picking another file before the named one lands is the visitor's own
    // navigation, like leaving it after it opened: the hash's drill is not
    // applied to the file they chose.
    it("ends the restoration when the visitor opens another file before the named one", async () => {
      history.replaceState(null, "", "#krs-system-A?file=%2Fplanned.krs");
      const pushState = vi.spyOn(history, "pushState");
      const { result, open, compileNow } = renderOnIndexKrs(true, { openAtMount: null });
      await act(async () => {
        result.current.dispatch({ type: "SELECT_FILE", path: "/other.krs", content: KRS });
      });
      await open("/planned.krs", "superseded");
      await compileNow();

      expect(result.current.state.currentFilePath).toBe("/other.krs");
      expect(result.current.state.viewPath).toEqual([]);
      await act(async () => result.current.nav.navigateViewPath(["A"]));
      expect(pushState).toHaveBeenCalledTimes(1);
      pushState.mockRestore();
    });

    // The order the app sees: the named file's read is superseded (its
    // promise settles) before the file the visitor picked lands.
    it("ends the restoration when the named read is superseded before the visitor's file lands", async () => {
      history.replaceState(null, "", "#krs-system-A?file=%2Fplanned.krs");
      const pushState = vi.spyOn(history, "pushState");
      const { result, open, compileNow } = renderOnIndexKrs(true, { openAtMount: null });
      await open("/planned.krs", "superseded");
      await act(async () => {
        result.current.dispatch({ type: "SELECT_FILE", path: "/other.krs", content: KRS });
      });
      await compileNow();

      expect(result.current.state.currentFilePath).toBe("/other.krs");
      expect(result.current.state.viewPath).toEqual([]);
      await act(async () => result.current.nav.navigateViewPath(["A"]));
      expect(pushState).toHaveBeenCalledTimes(1);
      pushState.mockRestore();
    });

    // A compile with errors keeps the previous file's index, so waiting for a
    // current one would hold the restoration for as long as the error stays.
    // An empty previous index shows the tab is applied without one; one that
    // has `A` shows the drill is not resolved against another file's index.
    it.each([
      ["#krs-deploy:A?file=%2Fplanned.krs", "system S {}\n", "deploy", "A"],
      ["#krs-system-A?file=%2Fplanned.krs", KRS, "system", null],
    ] as const)(
      "%s applies the tab and the highlight, and drops the drill, when the named file's compile fails",
      async (hash, mountContent, view, highlight) => {
        history.replaceState(null, "", hash);
        const pushState = vi.spyOn(history, "pushState");
        const { result, open, failNow } = renderOnIndexKrs(false, { mountContent });
        await open("/planned.krs");
        expect(result.current.state.activeView).toBe("system");

        await failNow();
        expect(result.current.state.activeView).toBe(view);
        expect(result.current.state.highlightedNodeId).toBe(highlight);
        expect(result.current.state.viewPath).toEqual([]);
        expect(pushState).not.toHaveBeenCalled();

        await act(async () => result.current.nav.navigateActiveView("org"));
        expect(pushState).toHaveBeenCalledTimes(1);
        pushState.mockRestore();
      },
    );

    it("ends the restoration on a cross-view jump", async () => {
      history.replaceState(null, "", "#krs-deploy?file=%2Fmissing.krs");
      const { result, open, compileNow } = renderOnIndexKrs(true, { openAtMount: null });
      await open("/missing.krs", "opened", "");
      const pushState = vi.spyOn(history, "pushState");
      await act(async () => result.current.cross.handleContainerClick("A"));
      expect(pushState).toHaveBeenCalledTimes(1);
      await act(async () => {
        result.current.dispatch({ type: "UPDATE_FILE_CONTENT", content: KRS });
      });
      await compileNow();
      // The link's Deploy tab, still pending, did not land over the jump.
      expect(result.current.state.activeView).toBe("system");
      pushState.mockRestore();
    });

    it("ends the restoration on Back or Forward", async () => {
      history.replaceState(null, "", "#krs-deploy?file=%2Fmissing.krs");
      const { result, open, compileNow } = renderOnIndexKrs(true, { openAtMount: null });
      await open("/missing.krs", "opened", "");
      history.pushState(null, "", "#krs-org-root?file=%2Fmissing.krs");
      await act(async () => {
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
      expect(result.current.state.activeView).toBe("org");
      await act(async () => {
        result.current.dispatch({ type: "UPDATE_FILE_CONTENT", content: KRS });
      });
      await compileNow();
      expect(result.current.state.activeView).toBe("org");

      const pushState = vi.spyOn(history, "pushState");
      await act(async () => result.current.nav.navigateActiveView("system"));
      expect(pushState).toHaveBeenCalledTimes(1);
      pushState.mockRestore();
    });

    // The named file opened as an empty buffer, so the hash's tab waits for
    // an index that never comes while the visitor stays in the file. Their
    // tab clicks and drills are pushed, and the tab is not applied later over
    // where they went once the file fills.
    it("ends the restoration on the visitor's own tab click or drill in the named file", async () => {
      history.replaceState(null, "", "#krs-deploy?file=%2Fmissing.krs");
      const pushState = vi.spyOn(history, "pushState");
      const { result, open, compileNow } = renderOnIndexKrs(true, { openAtMount: null });
      await open("/missing.krs", "opened", "");
      expect(pushState).not.toHaveBeenCalled();

      await act(async () => result.current.nav.navigateActiveView("org"));
      expect(pushState).toHaveBeenCalledTimes(1);
      await act(async () => {
        result.current.dispatch({ type: "UPDATE_FILE_CONTENT", content: KRS });
      });
      await compileNow();
      expect(result.current.state.activeView).toBe("org");

      await act(async () => result.current.nav.navigateActiveView("system"));
      await act(async () => result.current.nav.navigateViewPath(["A"]));
      expect(pushState).toHaveBeenCalledTimes(3);
      pushState.mockRestore();
    });

    it("does not open a named file outside the open project", async () => {
      history.replaceState(null, "", "#krs-system-root?file=%2Fprojects%2Fother%2Fx.krs");
      const pushState = vi.spyOn(history, "pushState");
      const { result, onFileChange } = renderOnIndexKrs(true, {
        openAtMount: "/projects/p/index.krs",
        fileRoot: "/projects/p",
      });
      expect(onFileChange).not.toHaveBeenCalled();
      expect(location.hash).toBe("#krs-system-root?file=%2Fprojects%2Fp%2Findex.krs");
      await act(async () => result.current.nav.navigateActiveView("org"));
      expect(pushState).toHaveBeenCalledTimes(1);
      pushState.mockRestore();
    });

    it("stops waiting for the named file when it does not open", async () => {
      history.replaceState(null, "", "#krs-system-root?file=%2Fbroken.krs");
      const pushState = vi.spyOn(history, "pushState");
      const { result, open } = renderOnIndexKrs(true);
      await open("/broken.krs", "failed");

      expect(result.current.state.currentFilePath).toBe("/index.krs");
      expect(pushState).not.toHaveBeenCalled();
      await act(async () => {
        result.current.dispatch({ type: "SET_ACTIVE_VIEW", activeView: "org" });
      });
      expect(pushState).toHaveBeenCalledTimes(1);
      pushState.mockRestore();
    });
  });

  describe("pending highlight restoration (#1842)", () => {
    // #2818: with the index already populated on mount (Memory / Serve mode),
    // effect ② re-applies in the same flush as effect ①'s SET_ACTIVE_VIEW.
    // The attribute must come from the hash's view, not from the activeView
    // ref, which still holds the view being left; otherwise the deferred
    // dispatch overwrites `data-realized-node-id` with `data-node-id` and the
    // deploy container the hash names never lights.
    it("re-applies a deploy hash highlight on data-realized-node-id when the index is ready at mount", () => {
      history.replaceState(null, "", "#krs-deploy:ECommerce");
      const dispatch = makeDispatch();
      const nodePathIndex = new Map([["ECommerce", ["ECommerce"]]]);
      renderHook(() =>
        useHistoryNavigation(makeOptions({ dispatch, activeView: "system", nodePathIndex })),
      );

      expect(dispatch).toHaveBeenCalledWith({
        type: "SET_HIGHLIGHTED_NODE",
        nodeId: "ECommerce",
        highlightAttribute: "data-realized-node-id",
      });
      expect(dispatch).not.toHaveBeenCalledWith(
        expect.objectContaining({
          type: "SET_HIGHLIGHTED_NODE",
          highlightAttribute: "data-node-id",
        }),
      );
    });

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
      expect(dispatch).toHaveBeenCalledWith({
        type: "SET_HIGHLIGHTED_NODE",
        nodeId: "Api",
        highlightAttribute: "data-node-id",
      });
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

      expect(dispatch).toHaveBeenCalledWith({
        type: "SET_HIGHLIGHTED_NODE",
        nodeId: "Api",
        highlightAttribute: "data-node-id",
      });
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

      expect(dispatch).not.toHaveBeenCalledWith({
        type: "SET_HIGHLIGHTED_NODE",
        nodeId: "Api",
        highlightAttribute: "data-node-id",
      });
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
        highlightAttribute: "data-realized-node-id",
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
        highlightAttribute: "data-realized-node-id",
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

      expect(dispatch).toHaveBeenCalledWith({
        type: "SET_HIGHLIGHTED_NODE",
        nodeId: "ECommerce",
        highlightAttribute: "data-realized-node-id",
      });
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

      expect(dispatch).toHaveBeenCalledWith({
        type: "SET_HIGHLIGHTED_NODE",
        nodeId: null,
        highlightAttribute: "data-realized-node-id",
      });
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
        highlightAttribute: "data-node-id",
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
      const onFileChange = vi.fn<(path: string) => Promise<FileSelectionStatus>>(
        async () => "opened",
      );
      renderHook(() =>
        useHistoryNavigation(makeOptions({ currentFilePath: "/a.krs", onFileChange })),
      );
      expect(onFileChange).toHaveBeenCalledWith("/wanted.krs");
    });

    it("calls onFileChange on popstate when the hash specifies a different file", async () => {
      const onFileChange = vi.fn<(path: string) => Promise<FileSelectionStatus>>(
        async () => "opened",
      );
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
      const onFileChange = vi.fn<(path: string) => Promise<FileSelectionStatus>>(
        async () => "opened",
      );
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
