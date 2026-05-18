// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { OutlineView } from "./OutlineView.js";
import type { KrsNode, SystemNode } from "@karasu-tools/core";

afterEach(cleanup);

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

  it("calls onSelectNode with the node id when an entry is clicked", () => {
    const { props } = renderView();
    fireEvent.click(screen.getByText("Orders"));
    expect(props.onSelectNode).toHaveBeenCalledWith("Orders");
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
});
