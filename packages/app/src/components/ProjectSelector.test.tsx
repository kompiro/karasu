// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render as rtlRender, fireEvent, cleanup } from "@testing-library/react";
import type { ReactElement } from "react";

afterEach(cleanup);
import { ProjectSelector } from "./ProjectSelector.js";
import { LocaleProvider } from "../i18n/index.js";
import type { Project } from "@karasu-tools/core";

// Wrap every render in a LocaleProvider so ProjectSelector can call
// useTranslation. Default to English — tests that need Japanese pass the
// locale explicitly.
function render(ui: ReactElement, initialLocale: "en" | "ja" = "en") {
  return rtlRender(<LocaleProvider initialLocale={initialLocale}>{ui}</LocaleProvider>);
}

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
    onImportProject: vi.fn<(file: File) => void>(),
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

describe("ProjectSelector — Create", () => {
  it("pressing Enter to create a new project does not also fire the Import file picker (Issue #948)", () => {
    const props = baseProps();
    const { getByRole } = render(<ProjectSelector {...props} />);

    // Spy on the hidden file input's click() — that's what would pop the
    // OS file picker if the Enter key bubbled down to the Import button.
    const fileInput = document.querySelector<HTMLInputElement>("input[type='file']")!;
    const fileClickSpy = vi.spyOn(fileInput, "click");

    fireEvent.click(getByRole("button", { name: /\+ New/ }));
    const input = getByRole("textbox");
    fireEvent.change(input, { target: { value: "My Project" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(props.onCreateProject).toHaveBeenCalledWith("My Project");
    expect(props.onImportProject).not.toHaveBeenCalled();
    expect(fileClickSpy).not.toHaveBeenCalled();
  });

  it("pressing Enter on the create input prevents default and stops propagation", () => {
    const props = baseProps();
    const { getByRole } = render(<ProjectSelector {...props} />);
    fireEvent.click(getByRole("button", { name: /\+ New/ }));
    const input = getByRole("textbox");
    fireEvent.change(input, { target: { value: "Foo" } });

    // Use the keydown event API so we can read defaultPrevented after dispatch.
    const event = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    });
    input.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
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

  it("is disabled when no project is selected", () => {
    const { getByRole } = render(<ProjectSelector {...baseProps(null)} />);
    expect(getByRole("button", { name: /Export/ })).toHaveProperty("disabled", true);
  });

  it("calls onExportProject when Export button is clicked", () => {
    const props = baseProps();
    const { getByRole } = render(<ProjectSelector {...props} />);
    fireEvent.click(getByRole("button", { name: /Export/ }));
    expect(props.onExportProject).toHaveBeenCalledOnce();
  });
});

describe("ProjectSelector — Import button", () => {
  it("shows Import button when a project is selected", () => {
    const { getByRole } = render(<ProjectSelector {...baseProps()} />);
    expect(getByRole("button", { name: /Import/ })).toBeTruthy();
  });

  it("is disabled when no project is selected", () => {
    const { getByRole } = render(<ProjectSelector {...baseProps(null)} />);
    expect(getByRole("button", { name: /Import/ })).toHaveProperty("disabled", true);
  });

  it("calls onImportProject with the selected File when a file is chosen", () => {
    const props = baseProps();
    const { container } = render(<ProjectSelector {...props} />);
    const input = container.querySelector<HTMLInputElement>("input[type='file']")!;
    const file = new File(["content"], "my-arch.zip", { type: "application/zip" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(props.onImportProject).toHaveBeenCalledWith(file);
  });

  it("Import button label contains ↑", () => {
    const { getByRole } = render(<ProjectSelector {...baseProps()} />);
    expect(getByRole("button", { name: /Import/ }).textContent).toContain("↑");
  });
});

describe("ProjectSelector — localization (Phase C3)", () => {
  it("renders English labels and tooltips when locale is 'en'", () => {
    const { getByRole, getByTitle } = render(<ProjectSelector {...baseProps()} />, "en");

    expect(getByRole("button", { name: /\+ New/ })).toBeTruthy();
    expect(getByRole("button", { name: /✎ Rename/ })).toBeTruthy();
    expect(getByRole("button", { name: /✕ Delete/ })).toBeTruthy();
    expect(getByRole("button", { name: /↓ Export/ })).toBeTruthy();
    expect(getByRole("button", { name: /↑ Import/ })).toBeTruthy();

    expect(getByTitle("New project")).toBeTruthy();
    expect(getByTitle("Rename project")).toBeTruthy();
    expect(getByTitle("Delete project")).toBeTruthy();
    expect(getByTitle("Export as ZIP")).toBeTruthy();
    expect(getByTitle("Import from ZIP")).toBeTruthy();
  });

  it("renders Japanese labels and tooltips when locale is 'ja'", () => {
    const { getByRole, getByTitle } = render(<ProjectSelector {...baseProps()} />, "ja");

    expect(getByRole("button", { name: /\+ 新規/ })).toBeTruthy();
    expect(getByRole("button", { name: /✎ リネーム/ })).toBeTruthy();
    expect(getByRole("button", { name: /✕ 削除/ })).toBeTruthy();
    expect(getByRole("button", { name: /↓ エクスポート/ })).toBeTruthy();
    expect(getByRole("button", { name: /↑ インポート/ })).toBeTruthy();

    expect(getByTitle("新規プロジェクト")).toBeTruthy();
    expect(getByTitle("プロジェクトをリネーム")).toBeTruthy();
    expect(getByTitle("プロジェクトを削除")).toBeTruthy();
    expect(getByTitle("ZIPとしてエクスポート")).toBeTruthy();
    expect(getByTitle("ZIPからインポート")).toBeTruthy();
  });

  it("uses the English delete confirmation when locale is 'en'", () => {
    const confirmSpy = vi.spyOn(globalThis, "confirm").mockReturnValue(false);
    try {
      const props = baseProps();
      const { getByRole } = render(<ProjectSelector {...props} />, "en");
      fireEvent.click(getByRole("button", { name: /✕ Delete/ }));
      expect(confirmSpy).toHaveBeenCalledWith('Delete "My Project"?');
    } finally {
      confirmSpy.mockRestore();
    }
  });

  it("uses the Japanese delete confirmation when locale is 'ja'", () => {
    const confirmSpy = vi.spyOn(globalThis, "confirm").mockReturnValue(false);
    try {
      const props = baseProps();
      const { getByRole } = render(<ProjectSelector {...props} />, "ja");
      fireEvent.click(getByRole("button", { name: /✕ 削除/ }));
      expect(confirmSpy).toHaveBeenCalledWith('"My Project" を削除しますか?');
    } finally {
      confirmSpy.mockRestore();
    }
  });

  it("uses OK/Cancel labels in English when creating a project", () => {
    const props = baseProps();
    const { getByRole } = render(<ProjectSelector {...props} />, "en");
    fireEvent.click(getByRole("button", { name: /\+ New/ }));
    expect(getByRole("button", { name: /^OK$/ })).toBeTruthy();
    expect(getByRole("button", { name: /^Cancel$/ })).toBeTruthy();
  });

  it("uses OK/キャンセル labels in Japanese when creating a project", () => {
    const props = baseProps();
    const { getByRole } = render(<ProjectSelector {...props} />, "ja");
    fireEvent.click(getByRole("button", { name: /\+ 新規/ }));
    expect(getByRole("button", { name: /^OK$/ })).toBeTruthy();
    expect(getByRole("button", { name: /^キャンセル$/ })).toBeTruthy();
  });
});
