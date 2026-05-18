// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { OutlineView } from "./OutlineView.js";
import { clearRegistry, loadAndRegisterIcon } from "@karasu-tools/core";
import type { KrsNode, SystemNode } from "@karasu-tools/core";

afterEach(() => {
  cleanup();
  clearRegistry();
});

const LOC = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
};

function node(kind: KrsNode["kind"], id: string, children: KrsNode[] = []): KrsNode {
  return {
    kind,
    id,
    tags: [],
    annotations: [],
    children,
    edges: [],
    loc: LOC,
    properties: { links: [] },
  } as KrsNode;
}

/** A system with a nested service that owns a domain. */
const sampleSystems: SystemNode[] = [
  node("system", "Shop", [node("service", "API", [node("domain", "Orders")])]) as SystemNode,
];

function renderView(overrides: Partial<Parameters<typeof OutlineView>[0]> = {}) {
  const props: Parameters<typeof OutlineView>[0] = {
    systems: sampleSystems,
    highlightedNodeId: null,
    onSelectNode: vi.fn<(id: string) => void>(),
    onActivateNode: vi.fn<(id: string, ancestors: string[]) => void>(),
    ...overrides,
  };
  return { ...render(<OutlineView {...props} />), props };
}

describe("OutlineView", () => {
  it("recursively renders systems and their nested children", () => {
    renderView();
    expect(screen.getByText("Shop")).toBeTruthy();
    expect(screen.getByText("API")).toBeTruthy();
    expect(screen.getByText("Orders")).toBeTruthy();
  });

  it("shows an empty message when there is no structure", () => {
    const { container } = renderView({ systems: [] });
    expect(container.querySelector(".outline-empty")).toBeTruthy();
    expect(container.querySelector(".outline-item")).toBeNull();
  });

  it("calls onSelectNode with the node id on a single click", () => {
    const { props } = renderView();
    fireEvent.click(screen.getByText("Orders"));
    expect(props.onSelectNode).toHaveBeenCalledWith("Orders");
  });

  it("calls onActivateNode with the node id and ancestor chain on a double click", () => {
    const { props } = renderView();
    fireEvent.doubleClick(screen.getByText("Orders"));
    // Orders is a domain nested under service API under system Shop.
    expect(props.onActivateNode).toHaveBeenCalledWith("Orders", ["Shop", "API"]);
  });

  it("passes an empty ancestor chain when a top-level system is activated", () => {
    const { props } = renderView();
    fireEvent.doubleClick(screen.getByText("Shop"));
    expect(props.onActivateNode).toHaveBeenCalledWith("Shop", []);
  });

  it("marks the highlighted node as selected", () => {
    const { container } = renderView({ highlightedNodeId: "API" });
    const selected = container.querySelectorAll(".outline-item--selected");
    expect(selected.length).toBe(1);
    expect(selected[0]?.textContent).toContain("API");
  });

  it("prefers the label over the id when present", () => {
    const labelled = node("system", "Shop") as SystemNode;
    labelled.label = "Online Shop";
    renderView({ systems: [labelled] });
    expect(screen.getByText("Online Shop")).toBeTruthy();
  });

  it("renders the Icon Mode pictogram for a node kind whose icon is registered", () => {
    // Register a minimal `service` icon the way the app does at startup.
    loadAndRegisterIcon(
      "service",
      `<svg viewBox="0 0 160 100"><g class="krs-pictogram" transform="translate(6,4)">` +
        `<circle cx="10" cy="10" r="8" fill="{{color}}"/></g></svg>`,
      true,
    );
    const { container } = renderView({
      systems: [node("system", "Shop", [node("service", "API")]) as SystemNode],
    });
    const apiItem = [...container.querySelectorAll(".outline-item")].find((el) =>
      el.textContent?.includes("API"),
    );
    // The service node shows a real <svg> pictogram, not the glyph fallback.
    expect(apiItem?.querySelector(".outline-item__icon svg")).toBeTruthy();
  });

  it("falls back to a glyph for kinds without a registered icon", () => {
    const { container } = renderView({ systems: [node("system", "Shop") as SystemNode] });
    const systemItem = container.querySelector(".outline-item");
    expect(systemItem?.querySelector(".outline-item__icon--glyph")).toBeTruthy();
    expect(systemItem?.querySelector("svg")).toBeNull();
  });
});
