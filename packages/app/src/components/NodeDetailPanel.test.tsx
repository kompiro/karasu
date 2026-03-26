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
});
