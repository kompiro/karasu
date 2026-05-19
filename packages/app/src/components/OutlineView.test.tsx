// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { OutlineView, type OutlineNode } from "./OutlineView.js";
import { clearRegistry, loadAndRegisterIcon } from "@karasu-tools/core";

afterEach(() => {
  cleanup();
  clearRegistry();
});

function node(kind: string, id: string, children: OutlineNode[] = []): OutlineNode {
  return { kind, id, children };
}

/** A system with a nested service that owns a domain. */
const sampleNodes: OutlineNode[] = [
  node("system", "Shop", [node("service", "API", [node("domain", "Orders")])]),
];

function renderView(overrides: Partial<Parameters<typeof OutlineView>[0]> = {}) {
  const props: Parameters<typeof OutlineView>[0] = {
    nodes: sampleNodes,
    highlightedNodeId: null,
    onSelectNode: vi.fn<(id: string) => void>(),
    onActivateNode: vi.fn<(id: string, ancestors: string[]) => void>(),
    ...overrides,
  };
  return { ...render(<OutlineView {...props} />), props };
}

describe("OutlineView", () => {
  it("recursively renders nodes and their nested children", () => {
    renderView();
    expect(screen.getByText("Shop")).toBeTruthy();
    expect(screen.getByText("API")).toBeTruthy();
    expect(screen.getByText("Orders")).toBeTruthy();
  });

  it("shows an empty message when there is no structure", () => {
    const { container } = renderView({ nodes: [] });
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

  it("passes an empty ancestor chain when a top-level node is activated", () => {
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
    const labelled: OutlineNode = {
      kind: "system",
      id: "Shop",
      label: "Online Shop",
      children: [],
    };
    renderView({ nodes: [labelled] });
    expect(screen.getByText("Online Shop")).toBeTruthy();
  });

  it("renders deploy and org node kinds with a glyph fallback", () => {
    const { container } = renderView({
      nodes: [
        node("deploy-block", "prod", [node("lambda", "ingest")]),
        node("organization", "Corp", [node("team", "Platform", [node("member", "alice")])]),
      ],
    });
    // All these kinds lack an Icon Mode pictogram → glyph fallback, no <svg>.
    for (const id of ["prod", "ingest", "Corp", "Platform", "alice"]) {
      const item = [...container.querySelectorAll(".outline-item")].find((el) =>
        el.textContent?.includes(id),
      );
      expect(item?.querySelector(".outline-item__icon--glyph")).toBeTruthy();
    }
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
      nodes: [node("system", "Shop", [node("service", "API")])],
    });
    const apiItem = [...container.querySelectorAll(".outline-item")].find((el) =>
      el.textContent?.includes("API"),
    );
    // The service node shows a real <svg> pictogram, not the glyph fallback.
    expect(apiItem?.querySelector(".outline-item__icon svg")).toBeTruthy();
  });

  it("resolves a client subtype tag to the variant pictogram", () => {
    // Register only the `client-mobile` variant icon — not the base `client`.
    loadAndRegisterIcon(
      "client-mobile",
      `<svg viewBox="0 0 160 100"><g class="krs-pictogram">` +
        `<rect class="marker-client-mobile" width="4" height="4" fill="{{color}}"/></g></svg>`,
      true,
    );
    const { container } = renderView({
      nodes: [
        node("system", "Shop", [
          { kind: "client", id: "Phone", tags: ["mobile"], children: [] },
          { kind: "client", id: "Plain", tags: [], children: [] },
        ]),
      ],
    });
    const phone = [...container.querySelectorAll(".outline-item")].find((el) =>
      el.textContent?.includes("Phone"),
    );
    const plain = [...container.querySelectorAll(".outline-item")].find((el) =>
      el.textContent?.includes("Plain"),
    );
    // `client[mobile]` resolves to `client-mobile` and draws its pictogram.
    expect(phone?.querySelector(".marker-client-mobile")).toBeTruthy();
    // A plain `client` resolves to base `client`, which is unregistered → glyph.
    expect(plain?.querySelector(".outline-item__icon--glyph")).toBeTruthy();
  });

  it("resolves a resource variant tag to the variant pictogram", () => {
    loadAndRegisterIcon(
      "table",
      `<svg viewBox="0 0 160 100"><g class="krs-pictogram">` +
        `<rect class="marker-table" width="4" height="4" fill="{{color}}"/></g></svg>`,
      true,
    );
    const { container } = renderView({
      nodes: [
        node("system", "Shop", [{ kind: "resource", id: "Users", tags: ["table"], children: [] }]),
      ],
    });
    const users = [...container.querySelectorAll(".outline-item")].find((el) =>
      el.textContent?.includes("Users"),
    );
    // `resource[table]` resolves to the `table` pictogram, not base `resource`.
    expect(users?.querySelector(".marker-table")).toBeTruthy();
  });

  it("falls back to a glyph for kinds without a registered icon", () => {
    const { container } = renderView({ nodes: [node("system", "Shop")] });
    const systemItem = container.querySelector(".outline-item");
    expect(systemItem?.querySelector(".outline-item__icon--glyph")).toBeTruthy();
    expect(systemItem?.querySelector("svg")).toBeNull();
  });
});
