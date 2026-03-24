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

describe("appReducer — diagramType / highlightedNodeId", () => {
  describe("SET_DIAGRAM_TYPE", () => {
    it("updates diagramType", () => {
      const next = appReducer(initialState, { type: "SET_DIAGRAM_TYPE", diagramType: "deploy" });
      expect(next.diagramType).toBe("deploy");
    });

    it("resets viewPath to []", () => {
      const state = stateWith({ viewPath: ["SomeSystem"] });
      const next = appReducer(state, { type: "SET_DIAGRAM_TYPE", diagramType: "deploy" });
      expect(next.viewPath).toEqual([]);
    });

    it("clears highlightedNodeId", () => {
      const state = stateWith({ highlightedNodeId: "Payment" });
      const next = appReducer(state, { type: "SET_DIAGRAM_TYPE", diagramType: "system" });
      expect(next.highlightedNodeId).toBeNull();
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
      const state = stateWith({ diagramType: "deploy", viewPath: ["A"] });
      const next = appReducer(state, { type: "SET_HIGHLIGHTED_NODE", nodeId: "X" });
      expect(next.diagramType).toBe("deploy");
      expect(next.viewPath).toEqual(["A"]);
    });
  });

  describe("SELECT_FILE", () => {
    it("resets diagramType to system", () => {
      const state = stateWith({ diagramType: "deploy" });
      const next = appReducer(state, { type: "SELECT_FILE", path: "/p/index.krs", content: "" });
      expect(next.diagramType).toBe("system");
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
    it("resets diagramType to system", () => {
      const state = stateWith({ diagramType: "deploy" });
      const next = appReducer(state, { type: "SET_CURRENT_PROJECT", project: PROJECT });
      expect(next.diagramType).toBe("system");
    });

    it("clears highlightedNodeId", () => {
      const state = stateWith({ highlightedNodeId: "ECommerce" });
      const next = appReducer(state, { type: "SET_CURRENT_PROJECT", project: PROJECT });
      expect(next.highlightedNodeId).toBeNull();
    });
  });
});
