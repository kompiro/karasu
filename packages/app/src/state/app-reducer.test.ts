import { describe, it, expect } from "vitest";
import { appReducer, initialState } from "./app-reducer.js";
import type { AppState } from "./app-reducer.js";

const PROJECT = {
  id: "p1",
  name: "Project",
  rootPath: "/projects/p1",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

function stateWith(overrides: Partial<AppState>): AppState {
  return { ...initialState, ...overrides };
}

describe("appReducer — activeView / highlightedNodeId", () => {
  describe("SET_ACTIVE_VIEW", () => {
    it("updates activeView to deploy", () => {
      const next = appReducer(initialState, { type: "SET_ACTIVE_VIEW", activeView: "deploy" });
      expect(next.activeView).toBe("deploy");
    });

    it("updates activeView to org", () => {
      const next = appReducer(initialState, { type: "SET_ACTIVE_VIEW", activeView: "org" });
      expect(next.activeView).toBe("org");
    });

    it("resets viewPath to []", () => {
      const state = stateWith({ viewPath: ["SomeSystem"] });
      const next = appReducer(state, { type: "SET_ACTIVE_VIEW", activeView: "deploy" });
      expect(next.viewPath).toEqual([]);
    });

    it("clears highlightedNodeId when highlightNodeId is omitted", () => {
      const state = stateWith({ highlightedNodeId: "Payment" });
      const next = appReducer(state, { type: "SET_ACTIVE_VIEW", activeView: "system" });
      expect(next.highlightedNodeId).toBeNull();
    });

    it("sets highlightedNodeId atomically when highlightNodeId is provided", () => {
      const next = appReducer(initialState, {
        type: "SET_ACTIVE_VIEW",
        activeView: "deploy",
        highlightNodeId: "ECommerce",
      });
      expect(next.activeView).toBe("deploy");
      expect(next.highlightedNodeId).toBe("ECommerce");
    });

    it("clears highlightedNodeId when highlightNodeId is explicitly null", () => {
      const state = stateWith({ highlightedNodeId: "Payment" });
      const next = appReducer(state, {
        type: "SET_ACTIVE_VIEW",
        activeView: "deploy",
        highlightNodeId: null,
      });
      expect(next.highlightedNodeId).toBeNull();
    });

    it("resets viewPath when switching to org", () => {
      const state = stateWith({ viewPath: ["TeamA"] });
      const next = appReducer(state, { type: "SET_ACTIVE_VIEW", activeView: "org" });
      expect(next.viewPath).toEqual([]);
    });
  });

  describe("SET_HIGHLIGHTED_NODE", () => {
    it("sets highlightedNodeId", () => {
      const next = appReducer(initialState, { type: "SET_HIGHLIGHTED_NODE", nodeId: "Payment" });
      expect(next.highlightedNodeId).toBe("Payment");
    });

    it("clears highlightedNodeId when nodeId is null", () => {
      const state = stateWith({ highlightedNodeId: "Payment" });
      const next = appReducer(state, { type: "SET_HIGHLIGHTED_NODE", nodeId: null });
      expect(next.highlightedNodeId).toBeNull();
    });

    it("does not affect other state fields", () => {
      const state = stateWith({ activeView: "deploy", viewPath: ["A"] });
      const next = appReducer(state, { type: "SET_HIGHLIGHTED_NODE", nodeId: "X" });
      expect(next.activeView).toBe("deploy");
      expect(next.viewPath).toEqual(["A"]);
    });
  });

  describe("SELECT_FILE", () => {
    it("resets activeView to system", () => {
      const state = stateWith({ activeView: "deploy" });
      const next = appReducer(state, { type: "SELECT_FILE", path: "/p/index.krs", content: "" });
      expect(next.activeView).toBe("system");
    });

    it("clears highlightedNodeId", () => {
      const state = stateWith({ highlightedNodeId: "Payment" });
      const next = appReducer(state, { type: "SELECT_FILE", path: "/p/index.krs", content: "" });
      expect(next.highlightedNodeId).toBeNull();
    });

    it("resets viewPath to []", () => {
      const state = stateWith({ viewPath: ["SomeSystem"] });
      const next = appReducer(state, { type: "SELECT_FILE", path: "/p/index.krs", content: "" });
      expect(next.viewPath).toEqual([]);
    });

    describe("lastKrsFilePath (Issue #811)", () => {
      it("updates lastKrsFilePath when a .krs file is selected", () => {
        const state = stateWith({ lastKrsFilePath: null });
        const next = appReducer(state, {
          type: "SELECT_FILE",
          path: "/p/before.krs",
          content: "",
        });
        expect(next.lastKrsFilePath).toBe("/p/before.krs");
      });

      it("keeps lastKrsFilePath unchanged when a .krs.style file is selected", () => {
        const state = stateWith({ lastKrsFilePath: "/p/before.krs" });
        const next = appReducer(state, {
          type: "SELECT_FILE",
          path: "/p/styles.krs.style",
          content: "",
        });
        expect(next.lastKrsFilePath).toBe("/p/before.krs");
      });

      it("keeps lastKrsFilePath unchanged when a non-.krs file is selected", () => {
        const state = stateWith({ lastKrsFilePath: "/p/before.krs" });
        const next = appReducer(state, {
          type: "SELECT_FILE",
          path: "/p/README.md",
          content: "",
        });
        expect(next.lastKrsFilePath).toBe("/p/before.krs");
      });

      it("clears lastKrsFilePath when SELECT_FILE is dispatched with empty path (deselection)", () => {
        const state = stateWith({ lastKrsFilePath: "/p/before.krs" });
        const next = appReducer(state, { type: "SELECT_FILE", path: "", content: "" });
        expect(next.lastKrsFilePath).toBeNull();
      });
    });
  });

  describe("SET_CURRENT_PROJECT", () => {
    it("resets activeView to system", () => {
      const state = stateWith({ activeView: "deploy" });
      const next = appReducer(state, { type: "SET_CURRENT_PROJECT", project: PROJECT });
      expect(next.activeView).toBe("system");
    });

    it("clears highlightedNodeId", () => {
      const state = stateWith({ highlightedNodeId: "ECommerce" });
      const next = appReducer(state, { type: "SET_CURRENT_PROJECT", project: PROJECT });
      expect(next.highlightedNodeId).toBeNull();
    });

    it("resets lastKrsFilePath (Issue #811)", () => {
      const state = stateWith({ lastKrsFilePath: "/old-project/before.krs" });
      const next = appReducer(state, { type: "SET_CURRENT_PROJECT", project: PROJECT });
      expect(next.lastKrsFilePath).toBeNull();
    });
  });

  describe("SET_ALL_LAYERS_OPEN", () => {
    it("sets isAllLayersOpen to true", () => {
      const next = appReducer(initialState, { type: "SET_ALL_LAYERS_OPEN", isAllLayersOpen: true });
      expect(next.isAllLayersOpen).toBe(true);
    });

    it("sets isAllLayersOpen to false", () => {
      const state = stateWith({ isAllLayersOpen: true });
      const next = appReducer(state, { type: "SET_ALL_LAYERS_OPEN", isAllLayersOpen: false });
      expect(next.isAllLayersOpen).toBe(false);
    });

    it("does not affect other state fields", () => {
      const state = stateWith({ activeView: "org", viewPath: ["A"] });
      const next = appReducer(state, { type: "SET_ALL_LAYERS_OPEN", isAllLayersOpen: true });
      expect(next.activeView).toBe("org");
      expect(next.viewPath).toEqual(["A"]);
    });

    it("initialState has isAllLayersOpen=false", () => {
      expect(initialState.isAllLayersOpen).toBe(false);
    });
  });
});

describe("appReducer — diff swap (Issue #765)", () => {
  it("initial state has diffSwapped=false", () => {
    expect(initialState.diffSwapped).toBe(false);
  });

  it("TOGGLE_DIFF_SWAPPED flips the flag when a compare source is set", () => {
    const state = stateWith({
      compareSource: { kind: "file", path: "/p/before.krs" },
    });
    const next = appReducer(state, { type: "TOGGLE_DIFF_SWAPPED" });
    expect(next.diffSwapped).toBe(true);
    const back = appReducer(next, { type: "TOGGLE_DIFF_SWAPPED" });
    expect(back.diffSwapped).toBe(false);
  });

  it("TOGGLE_DIFF_SWAPPED is a no-op when no compare source is set", () => {
    const next = appReducer(initialState, { type: "TOGGLE_DIFF_SWAPPED" });
    expect(next.diffSwapped).toBe(false);
    expect(next).toBe(initialState);
  });

  it("SET_COMPARE_SOURCE resets diffSwapped to false", () => {
    const state = stateWith({
      compareSource: { kind: "file", path: "/p/a.krs" },
      diffSwapped: true,
    });
    const exited = appReducer(state, { type: "SET_COMPARE_SOURCE", source: null });
    expect(exited.diffSwapped).toBe(false);
    const switched = appReducer(state, {
      type: "SET_COMPARE_SOURCE",
      source: { kind: "file", path: "/p/b.krs" },
    });
    expect(switched.diffSwapped).toBe(false);
  });

  it("SET_CURRENT_PROJECT resets diffSwapped to false", () => {
    const state = stateWith({
      compareSource: { kind: "file", path: "/p/a.krs" },
      diffSwapped: true,
    });
    const next = appReducer(state, { type: "SET_CURRENT_PROJECT", project: PROJECT });
    expect(next.diffSwapped).toBe(false);
  });
});
