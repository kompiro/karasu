// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { NodeDetailPanel } from "./NodeDetailPanel.js";
import type { NodeMetadata } from "@karasu/core";

afterEach(cleanup);

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
