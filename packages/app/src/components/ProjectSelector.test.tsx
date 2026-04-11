// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";

afterEach(cleanup);
import { ProjectSelector } from "./ProjectSelector.js";
import type { Project } from "@karasu-tools/core";

function makeProject(overrides?: Partial<Project>): Project {
  return {
    id: "proj-1",
    name: "My Project",
    rootPath: "/projects/proj-1",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function baseProps(currentProject: Project | null = makeProject()) {
  return {
    projects: currentProject ? [currentProject] : [],
    currentProject,
    onSelectProject: vi.fn<(project: Project) => void>(),
    onCreateProject: vi.fn<(name: string) => void>(),
    onRenameProject: vi.fn<(id: string, newName: string) => void>(),
    onDeleteProject: vi.fn<(id: string) => void>(),
    onExportProject: vi.fn<() => void>(),
  };
}

describe("ProjectSelector — Rename", () => {
  it("shows ✎ Rename button when a project is selected", () => {
    const { getByRole } = render(<ProjectSelector {...baseProps()} />);
    expect(getByRole("button", { name: /Rename/ })).toBeTruthy();
  });

  it("does not show Rename button when no project is selected", () => {
    const { queryByRole } = render(<ProjectSelector {...baseProps(null)} />);
    expect(queryByRole("button", { name: /Rename/ })).toBeNull();
  });

  it("clicking Rename shows inline input with current name pre-filled", () => {
    const project = makeProject({ name: "My Project" });
    const { getByRole } = render(<ProjectSelector {...baseProps(project)} />);
    fireEvent.click(getByRole("button", { name: /Rename/ }));
    const input = getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("My Project");
  });

  it("OK button is disabled when input is empty", () => {
    const { getByRole } = render(<ProjectSelector {...baseProps()} />);
    fireEvent.click(getByRole("button", { name: /Rename/ }));
    const input = getByRole("textbox");
    fireEvent.change(input, { target: { value: "" } });
    expect(getByRole("button", { name: "OK" })).toHaveProperty("disabled", true);
  });

  it("OK button is disabled when name is unchanged", () => {
    const project = makeProject({ name: "My Project" });
    const { getByRole } = render(<ProjectSelector {...baseProps(project)} />);
    fireEvent.click(getByRole("button", { name: /Rename/ }));
    // value is already "My Project" — no change
    expect(getByRole("button", { name: "OK" })).toHaveProperty("disabled", true);
  });

  it("OK button is enabled when name is changed to non-empty value", () => {
    const project = makeProject({ name: "My Project" });
    const { getByRole } = render(<ProjectSelector {...baseProps(project)} />);
    fireEvent.click(getByRole("button", { name: /Rename/ }));
    fireEvent.change(getByRole("textbox"), { target: { value: "New Name" } });
    expect(getByRole("button", { name: "OK" })).toHaveProperty("disabled", false);
  });

  it("pressing Enter calls onRenameProject with new name", () => {
    const project = makeProject({ name: "My Project" });
    const props = baseProps(project);
    const { getByRole } = render(<ProjectSelector {...props} />);
    fireEvent.click(getByRole("button", { name: /Rename/ }));
    const input = getByRole("textbox");
    fireEvent.change(input, { target: { value: "Renamed Project" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(props.onRenameProject).toHaveBeenCalledWith("proj-1", "Renamed Project");
  });

  it("clicking OK calls onRenameProject with trimmed new name", () => {
    const project = makeProject({ name: "My Project" });
    const props = baseProps(project);
    const { getByRole } = render(<ProjectSelector {...props} />);
    fireEvent.click(getByRole("button", { name: /Rename/ }));
    fireEvent.change(getByRole("textbox"), { target: { value: "  Trimmed  " } });
    fireEvent.click(getByRole("button", { name: "OK" }));
    expect(props.onRenameProject).toHaveBeenCalledWith("proj-1", "Trimmed");
  });

  it("pressing Escape cancels rename and does not call onRenameProject", () => {
    const project = makeProject({ name: "My Project" });
    const props = baseProps(project);
    const { getByRole, queryByRole } = render(<ProjectSelector {...props} />);
    fireEvent.click(getByRole("button", { name: /Rename/ }));
    const input = getByRole("textbox");
    fireEvent.change(input, { target: { value: "New Name" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(props.onRenameProject).not.toHaveBeenCalled();
    expect(queryByRole("textbox")).toBeNull();
  });

  it("clicking Cancel cancels rename and does not call onRenameProject", () => {
    const project = makeProject({ name: "My Project" });
    const props = baseProps(project);
    const { getByRole, queryByRole } = render(<ProjectSelector {...props} />);
    fireEvent.click(getByRole("button", { name: /Rename/ }));
    fireEvent.change(getByRole("textbox"), { target: { value: "New Name" } });
    fireEvent.click(getByRole("button", { name: "Cancel" }));
    expect(props.onRenameProject).not.toHaveBeenCalled();
    expect(queryByRole("textbox")).toBeNull();
  });

  it("pressing Enter with unchanged name does not close the rename UI", () => {
    const project = makeProject({ name: "My Project" });
    const props = baseProps(project);
    const { getByRole } = render(<ProjectSelector {...props} />);
    fireEvent.click(getByRole("button", { name: /Rename/ }));
    const input = getByRole("textbox");
    // name is unchanged — Enter should be a no-op
    fireEvent.keyDown(input, { key: "Enter" });
    expect(props.onRenameProject).not.toHaveBeenCalled();
    expect(getByRole("textbox")).toBeTruthy();
  });

  it("pressing Enter with empty input does not close the rename UI", () => {
    const project = makeProject({ name: "My Project" });
    const props = baseProps(project);
    const { getByRole } = render(<ProjectSelector {...props} />);
    fireEvent.click(getByRole("button", { name: /Rename/ }));
    const input = getByRole("textbox");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(props.onRenameProject).not.toHaveBeenCalled();
    expect(getByRole("textbox")).toBeTruthy();
  });
});

describe("ProjectSelector — Delete button label", () => {
  it("Delete button label contains ✕", () => {
    const { getByRole } = render(<ProjectSelector {...baseProps()} />);
    const btn = getByRole("button", { name: /Delete/ });
    expect(btn.textContent).toContain("✕");
  });
});

describe("ProjectSelector — Export button", () => {
  it("shows Export button when a project is selected", () => {
    const { getByRole } = render(<ProjectSelector {...baseProps()} />);
    expect(getByRole("button", { name: /Export/ })).toBeTruthy();
  });

  it("does not show Export button when no project is selected", () => {
    const { queryByRole } = render(<ProjectSelector {...baseProps(null)} />);
    expect(queryByRole("button", { name: /Export/ })).toBeNull();
  });

  it("calls onExportProject when Export button is clicked", () => {
    const props = baseProps();
    const { getByRole } = render(<ProjectSelector {...props} />);
    fireEvent.click(getByRole("button", { name: /Export/ }));
    expect(props.onExportProject).toHaveBeenCalledOnce();
  });
});
