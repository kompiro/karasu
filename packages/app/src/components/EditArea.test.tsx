// @vitest-environment jsdom
import { useEffect } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";

afterEach(cleanup);

// Mock EditPane to avoid heavy Monaco Editor dependency
vi.mock("./EditPane.js", () => ({
  EditPane: ({ value }: { value: string }) => <div data-testid="edit-pane">{value}</div>,
}));

import { EditArea } from "./EditArea.js";
import { useSidebarCollapse } from "./sidebar-collapse-context.js";

const defaultProps = {
  previewFocused: false,
  value: "",
  currentFilePath: null,
  onChange: vi.fn<(value: string) => void>(),
  scopeLabel: "Root",
  viewPath: [] as string[],
  currentProjectId: null,
  resolvedSystems: [],
  onNavigateViewPath: vi.fn<(path: string[]) => void>(),
};

describe("EditArea", () => {
  it("renders EditPane without sidebar area when sidebarContent is not provided", () => {
    const { queryByTestId, queryByRole } = render(<EditArea {...defaultProps} />);
    expect(queryByTestId("edit-pane")).toBeTruthy();
    expect(queryByRole("button")).toBeNull();
  });

  it("renders sidebar area without an expand button when expanded", () => {
    const { queryByRole, getByText } = render(
      <EditArea {...defaultProps} sidebarContent={<div>File Tree</div>} />,
    );
    expect(getByText("File Tree")).toBeTruthy();
    // The collapse button is rendered inside FileTreeView (via context),
    // not by EditArea itself, so EditArea exposes no toggle when expanded.
    expect(queryByRole("button", { name: /sidebar/ })).toBeNull();
  });

  it("renders an expand button only when collapsed (via context consumer)", () => {
    function TogglingSidebar() {
      const ctx = useSidebarCollapse();
      return (
        <button data-testid="ctx-toggle" onClick={() => ctx?.toggle()}>
          File Tree
        </button>
      );
    }
    const { getByTestId, getByRole, queryByRole, container } = render(
      <EditArea {...defaultProps} sidebarContent={<TogglingSidebar />} />,
    );
    expect(queryByRole("button", { name: /Expand sidebar/ })).toBeNull();
    fireEvent.click(getByTestId("ctx-toggle"));
    expect(container.querySelector(".edit-area.sidebar-collapsed")).toBeTruthy();
    expect(getByRole("button", { name: /Expand sidebar/ })).toBeTruthy();
    fireEvent.click(getByRole("button", { name: /Expand sidebar/ }));
    expect(container.querySelector(".edit-area.sidebar-collapsed")).toBeNull();
  });

  it("hides expand button when previewFocused is true", () => {
    function ForceCollapsed() {
      const ctx = useSidebarCollapse();
      useEffect(() => {
        if (ctx && !ctx.collapsed) ctx.toggle();
      }, [ctx]);
      return <div>File Tree</div>;
    }
    const { queryByRole } = render(
      <EditArea {...defaultProps} previewFocused sidebarContent={<ForceCollapsed />} />,
    );
    expect(queryByRole("button", { name: /sidebar/ })).toBeNull();
  });

  it("adds has-sidebar class when sidebarContent is provided", () => {
    const { container } = render(
      <EditArea {...defaultProps} sidebarContent={<div>File Tree</div>} />,
    );
    expect(container.querySelector(".edit-area.has-sidebar")).toBeTruthy();
  });

  it("does not add has-sidebar class when sidebarContent is not provided", () => {
    const { container } = render(<EditArea {...defaultProps} />);
    expect(container.querySelector(".edit-area.has-sidebar")).toBeNull();
    expect(container.querySelector(".edit-area")).toBeTruthy();
  });
});
