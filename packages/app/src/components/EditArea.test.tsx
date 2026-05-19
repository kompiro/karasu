// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import type { ReactElement } from "react";

afterEach(cleanup);

// Mock EditPane to avoid heavy Monaco Editor dependency
vi.mock("./EditPane.js", () => ({
  EditPane: ({ value }: { value: string }) => <div data-testid="edit-pane">{value}</div>,
}));

import { EditArea } from "./EditArea.js";
import { CommandProvider } from "../keyboard/command-context.js";
import { KeyboardShortcutDispatcher } from "../keyboard/KeyboardShortcutDispatcher.js";

/** Wrap with the keyboard-shortcut infrastructure so `mod+B` is live. */
function renderWithShortcuts(ui: ReactElement) {
  return render(
    <CommandProvider>
      <KeyboardShortcutDispatcher />
      {ui}
    </CommandProvider>,
  );
}

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

  // TPL-20260518-01: an involutive toggle must render both result states.
  it("toggles the sidebar with the mod+B shortcut", () => {
    const { container } = renderWithShortcuts(
      <EditArea {...defaultProps} sidebarContent={<div>File Tree</div>} />,
    );
    // Collapse.
    fireEvent.keyDown(document, { key: "b", ctrlKey: true });
    expect(container.querySelector(".sidebar-area")).toBeNull();
    // Expand.
    fireEvent.keyDown(document, { key: "b", ctrlKey: true });
    expect(container.querySelector(".sidebar-area")).toBeTruthy();
  });

  it("ignores the mod+B shortcut while a text input is focused", () => {
    const { container } = renderWithShortcuts(
      <EditArea {...defaultProps} sidebarContent={<div>File Tree</div>} />,
    );
    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    textarea.focus();
    fireEvent.keyDown(document, { key: "b", ctrlKey: true });
    expect(container.querySelector(".sidebar-area")).toBeTruthy(); // unchanged
    textarea.remove();
  });

  it("switches the sidebar to the Outline view with the mod+shift+O shortcut", () => {
    const { getByText, queryByText } = renderWithShortcuts(
      <EditArea
        {...defaultProps}
        sidebarContent={<div>File Tree</div>}
        outlineContent={<div>AST Outline</div>}
      />,
    );
    expect(getByText("File Tree")).toBeTruthy();
    fireEvent.keyDown(document, { key: "o", ctrlKey: true, shiftKey: true });
    expect(getByText("AST Outline")).toBeTruthy();
    expect(queryByText("File Tree")).toBeNull();
  });

  it("switches the sidebar back to the Files view with the mod+shift+E shortcut", () => {
    const { getByRole, getByText, queryByText } = renderWithShortcuts(
      <EditArea
        {...defaultProps}
        sidebarContent={<div>File Tree</div>}
        outlineContent={<div>AST Outline</div>}
      />,
    );
    fireEvent.click(getByRole("button", { name: /Show outline/ }));
    expect(getByText("AST Outline")).toBeTruthy();
    fireEvent.keyDown(document, { key: "e", ctrlKey: true, shiftKey: true });
    expect(getByText("File Tree")).toBeTruthy();
    expect(queryByText("AST Outline")).toBeNull();
  });

  it("expands a collapsed sidebar when a view shortcut fires", () => {
    const { container, getByText } = renderWithShortcuts(
      <EditArea
        {...defaultProps}
        sidebarContent={<div>File Tree</div>}
        outlineContent={<div>AST Outline</div>}
      />,
    );
    fireEvent.keyDown(document, { key: "b", ctrlKey: true });
    expect(container.querySelector(".sidebar-area")).toBeNull();
    fireEvent.keyDown(document, { key: "o", ctrlKey: true, shiftKey: true });
    expect(container.querySelector(".sidebar-area")).toBeTruthy();
    expect(getByText("AST Outline")).toBeTruthy();
  });

  // TPL-20260519-01: global shortcuts must not fire while a text input is focused.
  it("ignores the view shortcuts while a text input is focused", () => {
    const { getByText } = renderWithShortcuts(
      <EditArea
        {...defaultProps}
        sidebarContent={<div>File Tree</div>}
        outlineContent={<div>AST Outline</div>}
      />,
    );
    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    textarea.focus();
    fireEvent.keyDown(document, { key: "o", ctrlKey: true, shiftKey: true });
    expect(getByText("File Tree")).toBeTruthy(); // unchanged
    textarea.remove();
  });

  it("does not register the Outline shortcut when outlineContent is absent", () => {
    const { getByText } = renderWithShortcuts(
      <EditArea {...defaultProps} sidebarContent={<div>File Tree</div>} />,
    );
    fireEvent.keyDown(document, { key: "o", ctrlKey: true, shiftKey: true });
    expect(getByText("File Tree")).toBeTruthy(); // no-op, no outline view to switch to
  });

  it("restores the previously active sidebar view after a shortcut collapse/expand", () => {
    const { container, getByRole, getByText } = renderWithShortcuts(
      <EditArea
        {...defaultProps}
        sidebarContent={<div>File Tree</div>}
        outlineContent={<div>AST Outline</div>}
      />,
    );
    fireEvent.click(getByRole("button", { name: /Show outline/ }));
    expect(getByText("AST Outline")).toBeTruthy();
    // Collapse then expand via the shortcut.
    fireEvent.keyDown(document, { key: "b", ctrlKey: true });
    expect(container.querySelector(".sidebar-area")).toBeNull();
    fireEvent.keyDown(document, { key: "b", ctrlKey: true });
    expect(getByText("AST Outline")).toBeTruthy();
  });
});
