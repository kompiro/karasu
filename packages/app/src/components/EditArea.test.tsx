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
});
