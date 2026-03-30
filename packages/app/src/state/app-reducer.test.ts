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

    it("clears highlightedNodeId", () => {
      const state = stateWith({ highlightedNodeId: "Payment" });
      const next = appReducer(state, { type: "SET_ACTIVE_VIEW", activeView: "system" });
      expect(next.highlightedNodeId).toBeNull();
    });

    it("resets orgPath when switching to org", () => {
      const state = stateWith({ orgPath: ["TeamA"] });
      const next = appReducer(state, { type: "SET_ACTIVE_VIEW", activeView: "org" });
      expect(next.orgPath).toEqual([]);
    });

    it("does not reset orgPath when switching to system", () => {
      const state = stateWith({ orgPath: ["TeamA"] });
      const next = appReducer(state, { type: "SET_ACTIVE_VIEW", activeView: "system" });
      expect(next.orgPath).toEqual(["TeamA"]);
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
  });

  describe("SET_FULL_VIEW", () => {
    it("sets isFullView to true", () => {
      const next = appReducer(initialState, { type: "SET_FULL_VIEW", isFullView: true });
      expect(next.isFullView).toBe(true);
    });

    it("sets isFullView to false", () => {
      const state = stateWith({ isFullView: true });
      const next = appReducer(state, { type: "SET_FULL_VIEW", isFullView: false });
      expect(next.isFullView).toBe(false);
    });

    it("does not affect other state fields", () => {
      const state = stateWith({ activeView: "org", viewPath: ["A"] });
      const next = appReducer(state, { type: "SET_FULL_VIEW", isFullView: true });
      expect(next.activeView).toBe("org");
      expect(next.viewPath).toEqual(["A"]);
    });

    it("initialState has isFullView=false", () => {
      expect(initialState.isFullView).toBe(false);
    });
  });
});
