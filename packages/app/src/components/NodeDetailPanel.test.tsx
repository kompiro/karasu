// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { NodeDetailPanel } from "./NodeDetailPanel.js";
import type { NodeMetadata } from "@karasu/core";
import { clearRegistry, registerBuiltinShapes, loadAndRegisterIcon } from "@karasu/core";

// Minimal icon SVG with krs-pictogram for testing pictogram rendering
const MINIMAL_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100">
  <g class="krs-pictogram" transform="translate(6, 4)">
    <rect width="20" height="20" fill="{{color}}"/>
  </g>
  <text class="krs-label" x="30" y="19" text-anchor="start"/>
  <text class="krs-description" x="8" y="44" text-anchor="start"/>
</svg>`;

// Plain SVG without krs-pictogram group
const PLAIN_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <circle cx="12" cy="12" r="10" fill="red"/>
</svg>`;

afterEach(cleanup);

// Reset icon registry before each test so icon registration state is predictable
beforeEach(() => {
  clearRegistry();
  registerBuiltinShapes();
});

function baseMetadata(overrides: Partial<NodeMetadata> = {}): NodeMetadata {
  return {
    kind: "service",
    label: "My Service",
    description: "",
    links: [],
    tags: [],
    annotations: [],
    hasChildren: false,
    ...overrides,
  };
}

function baseProps(overrides: Partial<NodeMetadata> = {}) {
  return {
    nodeId: "test-node",
    metadata: baseMetadata(overrides),
    anchorX: 0,
    anchorY: 0,
    onClose: vi.fn(),
  };
}

describe("NodeDetailPanel", () => {
  it("renders markdown description as HTML", () => {
    const { container } = render(
      <NodeDetailPanel {...baseProps({ description: "**bold text**" })} />,
    );
    expect(container.querySelector("strong")).not.toBeNull();
    expect(container.querySelector("strong")?.textContent).toBe("bold text");
  });

  it("sanitizes XSS in description — <script> tag is removed", () => {
    const { container } = render(
      <NodeDetailPanel {...baseProps({ description: "<script>alert(1)</script>safe text" })} />,
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector(".node-detail-description")?.textContent).toContain("safe text");
  });

  it("click inside the panel does not propagate to parent", () => {
    const outerClick = vi.fn();
    const { container } = render(
      <div onClick={outerClick}>
        <NodeDetailPanel {...baseProps()} />
      </div>,
    );
    fireEvent.click(container.querySelector(".node-detail-panel")!);
    expect(outerClick).not.toHaveBeenCalled();
  });

  it("clicking the Close button calls onClose", () => {
    const props = baseProps();
    const { getByRole } = render(<NodeDetailPanel {...props} />);
    fireEvent.click(getByRole("button", { name: "Close" }));
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it("renders deploy navigation button when hasDeployContainer is true", () => {
    const onNavigateToDeploy = vi.fn();
    const onClose = vi.fn();
    const { getByText } = render(
      <NodeDetailPanel
        {...baseProps({ hasDeployContainer: true })}
        onClose={onClose}
        onNavigateToDeploy={onNavigateToDeploy}
      />,
    );
    const btn = getByText(/Deploy 図で確認/);
    fireEvent.click(btn);
    expect(onNavigateToDeploy).toHaveBeenCalledWith("test-node");
    expect(onClose).toHaveBeenCalled();
  });

  it("does not render deploy button when hasDeployContainer is false", () => {
    const { queryByText } = render(
      <NodeDetailPanel {...baseProps({ hasDeployContainer: false })} />,
    );
    expect(queryByText(/Deploy 図で確認/)).toBeNull();
  });

  it("renders org navigation button when team is set and onNavigateToOrg is provided", () => {
    const onNavigateToOrg = vi.fn();
    const onClose = vi.fn();
    const { getByText } = render(
      <NodeDetailPanel
        {...baseProps({ team: "ec-team" })}
        onClose={onClose}
        onNavigateToOrg={onNavigateToOrg}
      />,
    );
    const btn = getByText(/ec-team/);
    fireEvent.click(btn);
    expect(onNavigateToOrg).toHaveBeenCalledWith("ec-team");
    expect(onClose).toHaveBeenCalled();
  });
});

describe("NodeDetailPanel — pictogram icon", () => {
  it("renders inline SVG pictogram when icon with krs-pictogram is registered", () => {
    // Register "service" icon — KIND_TO_ICON_NAME["service"] = "service"
    loadAndRegisterIcon("service", MINIMAL_ICON_SVG, true);

    const { container } = render(<NodeDetailPanel {...baseProps({ kind: "service" })} />);
    const iconEl = container.querySelector(".node-detail-icon");
    expect(iconEl?.querySelector("svg")).not.toBeNull();
  });

  it("rendered pictogram SVG has viewBox 0 0 20 20", () => {
    loadAndRegisterIcon("service", MINIMAL_ICON_SVG, true);

    const { container } = render(<NodeDetailPanel {...baseProps({ kind: "service" })} />);
    const svg = container.querySelector(".node-detail-icon svg");
    expect(svg?.getAttribute("viewBox")).toBe("0 0 20 20");
  });

  it("rendered pictogram SVG has width and height of 18", () => {
    loadAndRegisterIcon("service", MINIMAL_ICON_SVG, true);

    const { container } = render(<NodeDetailPanel {...baseProps({ kind: "service" })} />);
    const svg = container.querySelector(".node-detail-icon svg");
    expect(svg?.getAttribute("width")).toBe("18");
    expect(svg?.getAttribute("height")).toBe("18");
  });

  it("pictogram contains the krs-pictogram path content (rect from MINIMAL_ICON_SVG)", () => {
    loadAndRegisterIcon("service", MINIMAL_ICON_SVG, true);

    const { container } = render(<NodeDetailPanel {...baseProps({ kind: "service" })} />);
    const iconEl = container.querySelector(".node-detail-icon");
    expect(iconEl?.querySelector("rect")).not.toBeNull();
  });

  it("falls back to '■' when icon has no krs-pictogram group", () => {
    // PLAIN_ICON_SVG has no <g class="krs-pictogram">, so pictogramBody is undefined
    loadAndRegisterIcon("service", PLAIN_ICON_SVG, true);

    const { container } = render(<NodeDetailPanel {...baseProps({ kind: "service" })} />);
    const iconEl = container.querySelector(".node-detail-icon");
    expect(iconEl?.querySelector("svg")).toBeNull();
    expect(iconEl?.textContent).toBe("■");
  });

  it("falls back to '■' when icon is not registered (no entry in registry)", () => {
    // No "service" icon registered → renderPictogram returns undefined
    const { container } = render(<NodeDetailPanel {...baseProps({ kind: "service" })} />);
    const iconEl = container.querySelector(".node-detail-icon");
    expect(iconEl?.querySelector("svg")).toBeNull();
    expect(iconEl?.textContent).toBe("■");
  });

  it("shows '🏗' emoji for 'system' kind (not in KIND_TO_ICON_NAME, uses KIND_FALLBACK_ICONS)", () => {
    // "system" has no entry in KIND_TO_ICON_NAME, so falls back to KIND_FALLBACK_ICONS["system"]
    const { container } = render(
      <NodeDetailPanel {...baseProps({ kind: "system" as NodeMetadata["kind"] })} />,
    );
    const iconEl = container.querySelector(".node-detail-icon");
    expect(iconEl?.querySelector("svg")).toBeNull();
    expect(iconEl?.textContent).toBe("🏗");
  });

  it("renders user-card icon for 'user' kind (KIND_TO_ICON_NAME mapping)", () => {
    // KIND_TO_ICON_NAME["user"] = "user-card" — ensures correct mapping is used
    loadAndRegisterIcon("user-card", MINIMAL_ICON_SVG, true);

    const { container } = render(<NodeDetailPanel {...baseProps({ kind: "user" })} />);
    const iconEl = container.querySelector(".node-detail-icon");
    expect(iconEl?.querySelector("svg")).not.toBeNull();
  });
});
