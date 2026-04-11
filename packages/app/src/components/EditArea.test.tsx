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

  it("renders sidebar area with toggle button when sidebarContent is provided", () => {
    const { getByRole, getByText } = render(
      <EditArea {...defaultProps} sidebarContent={<div>File Tree</div>} />,
    );
    expect(getByText("File Tree")).toBeTruthy();
    expect(getByRole("button", { name: /Collapse sidebar/ })).toBeTruthy();
  });

  it("toggle button collapses sidebar when clicked", () => {
    const { getByRole, container } = render(
      <EditArea {...defaultProps} sidebarContent={<div>File Tree</div>} />,
    );
    const btn = getByRole("button", { name: /Collapse sidebar/ });
    fireEvent.click(btn);
    expect(container.querySelector(".edit-area.sidebar-collapsed")).toBeTruthy();
    expect(getByRole("button", { name: /Expand sidebar/ })).toBeTruthy();
  });

  it("toggle button expands sidebar when clicked again", () => {
    const { getByRole, container } = render(
      <EditArea {...defaultProps} sidebarContent={<div>File Tree</div>} />,
    );
    const btn = getByRole("button", { name: /Collapse sidebar/ });
    fireEvent.click(btn);
    fireEvent.click(getByRole("button", { name: /Expand sidebar/ }));
    expect(container.querySelector(".edit-area.sidebar-collapsed")).toBeNull();
  });

  it("hides toggle button when previewFocused is true", () => {
    const { queryByRole } = render(
      <EditArea {...defaultProps} previewFocused sidebarContent={<div>File Tree</div>} />,
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
