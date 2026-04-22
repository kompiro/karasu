// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { renderHook, cleanup, waitFor } from "@testing-library/react";
import {
  EC_PLATFORM_PROJECTS,
  GETTING_STARTED_PROJECT,
  GETTING_STARTED_PROJECT_EN,
  InMemoryFileSystemProvider,
  type Project,
} from "@karasu-tools/core";
import { useProjectInitialization } from "./useProjectInitialization.js";
import { LAST_PROJECT_KEY } from "./useProjectNavigation.js";
import type { ProjectManager } from "../fs/project-manager.js";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function makeProject(id: string, name = `Project ${id}`): Project {
  return {
    id,
    name,
    rootPath: `/projects/${id}`,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

function makePm(listResult: Project[] = []): ProjectManager {
  let counter = 0;
  return {
    listProjects: vi.fn<() => Promise<Project[]>>(async () => listResult),
    createProject: vi.fn<(name: string, files?: unknown) => Promise<Project>>(async (name) => {
      counter += 1;
      return makeProject(`p${counter}`, name);
    }),
    renameProject: vi.fn<() => Promise<Project>>(),
    deleteProject: vi.fn<() => Promise<void>>(),
  } as unknown as ProjectManager;
}

describe("useProjectInitialization — bootstrap", () => {
  it("seeds the Japanese Getting Started + ec-platform when locale is 'ja'", async () => {
    localStorage.setItem("karasu-locale", "ja");
    const pm = makePm([]);
    const dispatch = vi.fn<(action: unknown) => void>();
    const selectFile = vi.fn<(path: string) => Promise<void>>(async () => {});

    renderHook(() =>
      useProjectInitialization({
        pm,
        fs: new InMemoryFileSystemProvider(),
        dispatch,
        currentProject: null,
        selectFile,
      }),
    );

    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "SET_PROJECTS" })),
    );

    // Getting Started first, then one createProject per ec-platform example.
    const expectedCalls = 1 + EC_PLATFORM_PROJECTS.length;
    expect(pm.createProject).toHaveBeenCalledTimes(expectedCalls);
    expect(pm.createProject).toHaveBeenNthCalledWith(
      1,
      GETTING_STARTED_PROJECT.name,
      GETTING_STARTED_PROJECT.files,
    );

    const setProjectsCall = dispatch.mock.calls.find(
      (c) => (c[0] as { type: string }).type === "SET_PROJECTS",
    );
    expect(setProjectsCall).toBeDefined();
    const projects = (setProjectsCall![0] as { projects: Project[] }).projects;
    expect(projects).toHaveLength(expectedCalls);
    expect(projects[0].name).toBe(GETTING_STARTED_PROJECT.name);

    expect(dispatch).toHaveBeenCalledWith({ type: "SET_LOADING", loading: false });
  });

  it("seeds the English Getting Started when locale is 'en'", async () => {
    localStorage.setItem("karasu-locale", "en");
    const pm = makePm([]);
    const dispatch = vi.fn<(action: unknown) => void>();
    const selectFile = vi.fn<(path: string) => Promise<void>>(async () => {});

    renderHook(() =>
      useProjectInitialization({
        pm,
        fs: new InMemoryFileSystemProvider(),
        dispatch,
        currentProject: null,
        selectFile,
      }),
    );

    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "SET_PROJECTS" })),
    );

    expect(pm.createProject).toHaveBeenNthCalledWith(
      1,
      GETTING_STARTED_PROJECT_EN.name,
      GETTING_STARTED_PROJECT_EN.files,
    );
  });

  it("uses the existing project list without seeding when it is non-empty", async () => {
    const existing = [makeProject("abc"), makeProject("xyz")];
    const pm = makePm(existing);
    const dispatch = vi.fn<(action: unknown) => void>();
    const selectFile = vi.fn<(path: string) => Promise<void>>(async () => {});

    renderHook(() =>
      useProjectInitialization({
        pm,
        fs: new InMemoryFileSystemProvider(),
        dispatch,
        currentProject: null,
        selectFile,
      }),
    );

    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith({ type: "SET_PROJECTS", projects: existing }),
    );
    expect(pm.createProject).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith({ type: "SET_LOADING", loading: false });
  });

  it("sweeps stale .karasu-paste-compare.krs files from every project on startup (Issue #739)", async () => {
    const existing = [makeProject("abc"), makeProject("xyz")];
    const fs = new InMemoryFileSystemProvider();
    await fs.mkdir("/projects");
    await fs.mkdir("/projects/abc");
    await fs.mkdir("/projects/xyz");
    await fs.writeFile("/projects/abc/index.krs", "system A {}");
    await fs.writeFile("/projects/abc/.karasu-paste-compare.krs", "stale");
    await fs.writeFile("/projects/xyz/.karasu-paste-compare.krs", "stale");
    const pm = makePm(existing);
    const dispatch = vi.fn<(action: unknown) => void>();
    const selectFile = vi.fn<(path: string) => Promise<void>>(async () => {});

    renderHook(() =>
      useProjectInitialization({ pm, fs, dispatch, currentProject: null, selectFile }),
    );

    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith({ type: "SET_LOADING", loading: false }),
    );
    expect(await fs.exists("/projects/abc/.karasu-paste-compare.krs")).toBe(false);
    expect(await fs.exists("/projects/xyz/.karasu-paste-compare.krs")).toBe(false);
    // Untouched: non-paste files in the project remain.
    expect(await fs.exists("/projects/abc/index.krs")).toBe(true);
  });
});

describe("useProjectInitialization — project switch", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("persists the current project id to localStorage and auto-selects index.krs", async () => {
    const pm = makePm([]);
    const dispatch = vi.fn<(action: unknown) => void>();
    const selectFile = vi.fn<(path: string) => Promise<void>>(async () => {});
    const project = makeProject("abc");

    renderHook(() =>
      useProjectInitialization({
        pm,
        fs: new InMemoryFileSystemProvider(),
        dispatch,
        currentProject: project,
        selectFile,
      }),
    );

    await waitFor(() => expect(selectFile).toHaveBeenCalled());
    expect(localStorage.getItem(LAST_PROJECT_KEY)).toBe("abc");
    expect(selectFile).toHaveBeenCalledWith("/projects/abc/index.krs");
  });

  it("is a no-op when currentProject is null", async () => {
    const pm = makePm([makeProject("a")]);
    const dispatch = vi.fn<(action: unknown) => void>();
    const selectFile = vi.fn<(path: string) => Promise<void>>(async () => {});

    renderHook(() =>
      useProjectInitialization({
        pm,
        fs: new InMemoryFileSystemProvider(),
        dispatch,
        currentProject: null,
        selectFile,
      }),
    );

    // Wait for bootstrap to settle so we can assert the switch-effect did not fire.
    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith({ type: "SET_LOADING", loading: false }),
    );
    expect(selectFile).not.toHaveBeenCalled();
    expect(localStorage.getItem(LAST_PROJECT_KEY)).toBeNull();
  });
});
