// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";

afterEach(cleanup);

// Mock EditPane to avoid heavy Monaco Editor dependency
vi.mock("./EditPane.js", () => ({
  EditPane: ({ value }: { value: string }) => <div data-testid="edit-pane">{value}</div>,
}));

import { EditArea } from "./EditArea.js";

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
  it("renders EditPane without sidebar area or activity bar when sidebarContent is not provided", () => {
    const { queryByTestId, queryByRole, container } = render(<EditArea {...defaultProps} />);
    expect(queryByTestId("edit-pane")).toBeTruthy();
    expect(queryByRole("button")).toBeNull();
    expect(container.querySelector(".activity-bar")).toBeNull();
  });

  it("renders the activity bar Files toggle when sidebarContent is provided", () => {
    const { getByRole, getByText, container } = render(
      <EditArea {...defaultProps} sidebarContent={<div>File Tree</div>} />,
    );
    expect(getByText("File Tree")).toBeTruthy();
    expect(container.querySelector(".activity-bar")).toBeTruthy();
    // Expanded by default → button toggles to "Hide files".
    expect(getByRole("button", { name: /Hide files/ })).toBeTruthy();
  });

  it("activity bar button toggles the sidebar visibility", () => {
    const { getByRole, container } = render(
      <EditArea {...defaultProps} sidebarContent={<div>File Tree</div>} />,
    );
    fireEvent.click(getByRole("button", { name: /Hide files/ }));
    expect(container.querySelector(".edit-area.sidebar-collapsed")).toBeTruthy();
    expect(container.querySelector(".sidebar-area")).toBeNull();
    fireEvent.click(getByRole("button", { name: /Show files/ }));
    expect(container.querySelector(".edit-area.sidebar-collapsed")).toBeNull();
    expect(container.querySelector(".sidebar-area")).toBeTruthy();
  });

  it("hides the activity bar when previewFocused is true", () => {
    const { container, queryByRole } = render(
      <EditArea {...defaultProps} previewFocused sidebarContent={<div>File Tree</div>} />,
    );
    expect(container.querySelector(".activity-bar")).toBeNull();
    expect(queryByRole("button", { name: /files/ })).toBeNull();
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

  it("does not render the Outline activity-bar button when outlineContent is absent", () => {
    const { queryByRole } = render(
      <EditArea {...defaultProps} sidebarContent={<div>File Tree</div>} />,
    );
    expect(queryByRole("button", { name: /outline/i })).toBeNull();
  });

  it("renders the Outline button and switches the sidebar to the outline view", () => {
    const { getByRole, getByText, queryByText } = render(
      <EditArea
        {...defaultProps}
        sidebarContent={<div>File Tree</div>}
        outlineContent={<div>AST Outline</div>}
      />,
    );
    // Files view is active by default.
    expect(getByText("File Tree")).toBeTruthy();
    expect(queryByText("AST Outline")).toBeNull();
    // Clicking Outline switches the sidebar content.
    fireEvent.click(getByRole("button", { name: /Show outline/ }));
    expect(getByText("AST Outline")).toBeTruthy();
    expect(queryByText("File Tree")).toBeNull();
    // The Outline button now reflects the active state.
    expect(getByRole("button", { name: /Hide outline/ }).getAttribute("aria-pressed")).toBe("true");
    expect(getByRole("button", { name: /Show files/ }).getAttribute("aria-pressed")).toBe("false");
  });

  // TPL-20260518-01: an involutive toggle must render both result states.
  it("collapses and re-expands the sidebar when the active view button is re-clicked", () => {
    const { getByRole, container } = render(
      <EditArea
        {...defaultProps}
        sidebarContent={<div>File Tree</div>}
        outlineContent={<div>AST Outline</div>}
      />,
    );
    // Files (active) → collapse.
    fireEvent.click(getByRole("button", { name: /Hide files/ }));
    expect(container.querySelector(".sidebar-area")).toBeNull();
    // Files → expand again.
    fireEvent.click(getByRole("button", { name: /Show files/ }));
    expect(container.querySelector(".sidebar-area")).toBeTruthy();

    // Switch to Outline, then collapse / re-expand it too.
    fireEvent.click(getByRole("button", { name: /Show outline/ }));
    expect(container.querySelector(".sidebar-area")).toBeTruthy();
    fireEvent.click(getByRole("button", { name: /Hide outline/ }));
    expect(container.querySelector(".sidebar-area")).toBeNull();
    fireEvent.click(getByRole("button", { name: /Show outline/ }));
    expect(container.querySelector(".sidebar-area")).toBeTruthy();
  });

  it("expands the sidebar when switching views while collapsed", () => {
    const { getByRole, getByText, container } = render(
      <EditArea
        {...defaultProps}
        sidebarContent={<div>File Tree</div>}
        outlineContent={<div>AST Outline</div>}
      />,
    );
    // Collapse the (active) Files view.
    fireEvent.click(getByRole("button", { name: /Hide files/ }));
    expect(container.querySelector(".sidebar-area")).toBeNull();
    // Clicking the inactive Outline button re-opens the sidebar on that view.
    fireEvent.click(getByRole("button", { name: /Show outline/ }));
    expect(container.querySelector(".sidebar-area")).toBeTruthy();
    expect(getByText("AST Outline")).toBeTruthy();
  });
});
