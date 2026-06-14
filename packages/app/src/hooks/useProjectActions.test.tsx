// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import type { ReactNode } from "react";
import type { Project } from "@karasu-tools/core";
import { LocaleProvider } from "../i18n/index.js";
import { useProjectActions } from "./useProjectActions.js";

const { exportMock, parseMock } = vi.hoisted(() => ({
  exportMock: vi.fn<(...a: unknown[]) => Promise<void>>(),
  parseMock:
    vi.fn<
      (b: Uint8Array) => { files: { path: string; content: string }[]; detectedName?: string }
    >(),
}));
vi.mock("../utils/export-project-zip.js", () => ({ exportProjectAsZip: exportMock }));
vi.mock("../utils/import-project-zip.js", () => ({
  parseZipForImport: parseMock,
  disambiguateName: (base: string) => base,
}));

afterEach(() => {
  cleanup();
  exportMock.mockReset();
  parseMock.mockReset();
});

function wrapper({ children }: { children: ReactNode }) {
  return <LocaleProvider initialLocale="en">{children}</LocaleProvider>;
}

const proj = (id: string): Project => ({ id, name: id, rootPath: `/${id}` }) as Project;

function setup(overrides: { projects?: Project[]; currentProject?: Project | null } = {}) {
  const pm = {
    createProject: vi.fn<(name: string, files?: unknown) => Promise<Project>>(),
    renameProject: vi.fn<(id: string, name: string) => Promise<Project>>(),
    deleteProject: vi.fn<(id: string) => Promise<void>>(),
  };
  const dispatch = vi.fn<(a: unknown) => void>();
  const navigateToProject = vi.fn<(p: Project) => void>();
  const reportError = vi.fn<(m: string) => void>();
  const fs = {} as never;
  const { result } = renderHook(
    () =>
      useProjectActions({
        pm: pm as never,
        fs,
        projects: overrides.projects ?? [],
        currentProject:
          "currentProject" in overrides ? (overrides.currentProject ?? null) : proj("p1"),
        dispatch,
        navigateToProject,
        reportError,
      }),
    { wrapper },
  );
  return { result, pm, dispatch, navigateToProject, reportError };
}

describe("useProjectActions — success", () => {
  it("createProject dispatches ADD_PROJECT and navigates", async () => {
    const { result, pm, dispatch, navigateToProject, reportError } = setup();
    pm.createProject.mockResolvedValue(proj("new"));
    await act(async () => await result.current.createProject("new"));
    expect(dispatch).toHaveBeenCalledWith({ type: "ADD_PROJECT", project: proj("new") });
    expect(navigateToProject).toHaveBeenCalledWith(proj("new"));
    expect(reportError).not.toHaveBeenCalled();
  });

  it("deleteProject removes and navigates to the first remaining project", async () => {
    const { result, pm, dispatch, navigateToProject } = setup({
      projects: [proj("p1"), proj("p2")],
    });
    pm.deleteProject.mockResolvedValue(undefined);
    await act(async () => await result.current.deleteProject("p1"));
    expect(dispatch).toHaveBeenCalledWith({ type: "REMOVE_PROJECT", id: "p1" });
    expect(navigateToProject).toHaveBeenCalledWith(proj("p2"));
  });
});

describe("useProjectActions — failures surface via reportError (#1532)", () => {
  it("createProject failure reports an error and does not dispatch", async () => {
    const { result, pm, dispatch, reportError } = setup();
    pm.createProject.mockRejectedValue(new Error("quota exceeded"));
    await act(async () => await result.current.createProject("x"));
    expect(dispatch).not.toHaveBeenCalled();
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError.mock.calls[0][0]).toContain("quota exceeded");
  });

  it("renameProject failure reports an error", async () => {
    const { result, pm, reportError } = setup();
    pm.renameProject.mockRejectedValue(new Error("name taken"));
    await act(async () => await result.current.renameProject("p1", "dup"));
    expect(reportError.mock.calls[0][0]).toContain("name taken");
  });

  it("exportProject failure reports an error", async () => {
    const { result, reportError } = setup();
    exportMock.mockRejectedValue(new Error("OPFS read failed"));
    await act(async () => await result.current.exportProject());
    expect(reportError.mock.calls[0][0]).toContain("OPFS read failed");
  });

  it("importProject failure (corrupt ZIP) reports an error and does not dispatch", async () => {
    const { result, dispatch, reportError } = setup();
    parseMock.mockImplementation(() => {
      throw new Error("not a zip");
    });
    const file = new File([new Uint8Array([1, 2, 3])], "bad.zip");
    await act(async () => await result.current.importProject(file));
    expect(dispatch).not.toHaveBeenCalled();
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError.mock.calls[0][0]).toContain("not a zip");
  });

  it("exportProject is a no-op when there is no current project", async () => {
    const { result, reportError } = setup({ currentProject: null });
    await act(async () => await result.current.exportProject());
    expect(exportMock).not.toHaveBeenCalled();
    expect(reportError).not.toHaveBeenCalled();
  });
});
