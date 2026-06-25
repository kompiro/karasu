// @vitest-environment jsdom
import { StrictMode, createElement } from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { renderHook, cleanup, waitFor } from "@testing-library/react";
import {
  CLIENT_MCP_PROJECT,
  EC_PLATFORM_PROJECTS,
  EC_PLATFORM_PROJECTS_EN,
  FEATURE_SAMPLES_PROJECT,
  GETTING_STARTED_PROJECT,
  GETTING_STARTED_PROJECT_EN,
  InMemoryFileSystemProvider,
  MULTI_FILE_SYSTEM_PROJECT,
  MULTI_FILE_SYSTEM_PROJECT_EN,
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

    // Getting Started first, then one createProject per ec-platform example,
    // then the client-mcp sample, the multi-file-system sample, and finally
    // the feature-samples catalog.
    const expectedCalls = 1 + EC_PLATFORM_PROJECTS.length + 3;
    expect(pm.createProject).toHaveBeenCalledTimes(expectedCalls);
    expect(pm.createProject).toHaveBeenNthCalledWith(
      1,
      GETTING_STARTED_PROJECT.name,
      GETTING_STARTED_PROJECT.files,
    );
    // The ec-platform drill-down is seeded as the Japanese variant.
    expect(pm.createProject).toHaveBeenNthCalledWith(
      2,
      EC_PLATFORM_PROJECTS[0].name,
      EC_PLATFORM_PROJECTS[0].files,
    );
    expect(pm.createProject).toHaveBeenNthCalledWith(
      1 + EC_PLATFORM_PROJECTS.length + 1,
      CLIENT_MCP_PROJECT.name,
      CLIENT_MCP_PROJECT.files,
    );
    expect(pm.createProject).toHaveBeenNthCalledWith(
      1 + EC_PLATFORM_PROJECTS.length + 2,
      MULTI_FILE_SYSTEM_PROJECT.name,
      MULTI_FILE_SYSTEM_PROJECT.files,
    );
    expect(pm.createProject).toHaveBeenLastCalledWith(
      FEATURE_SAMPLES_PROJECT.name,
      FEATURE_SAMPLES_PROJECT.files,
    );

    const setProjectsCall = dispatch.mock.calls.find(
      (c) => (c[0] as { type: string }).type === "SET_PROJECTS",
    );
    expect(setProjectsCall).toBeDefined();
    const projects = (setProjectsCall![0] as { projects: Project[] }).projects;
    expect(projects).toHaveLength(expectedCalls);
    expect(projects[0].name).toBe(GETTING_STARTED_PROJECT.name);
    expect(projects[projects.length - 1].name).toBe(FEATURE_SAMPLES_PROJECT.name);

    expect(dispatch).toHaveBeenCalledWith({ type: "SET_LOADING", loading: false });
  });

  it("seeds the English Getting Started + ec-platform + multi-file-system when locale is 'en'", async () => {
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
    // #1777: the ec-platform drill-down is locale-matched too — en gets the
    // English variant (same stage names, English-labeled content).
    expect(pm.createProject).toHaveBeenNthCalledWith(
      2,
      EC_PLATFORM_PROJECTS_EN[0].name,
      EC_PLATFORM_PROJECTS_EN[0].files,
    );
    // #1642: the multi-file-system seed is locale-matched like Getting Started.
    expect(pm.createProject).toHaveBeenNthCalledWith(
      1 + EC_PLATFORM_PROJECTS.length + 2,
      MULTI_FILE_SYSTEM_PROJECT_EN.name,
      MULTI_FILE_SYSTEM_PROJECT_EN.files,
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

  // #1530: a throw during bootstrap (OPFS unavailable, quota, corrupt metadata)
  // must surface an error and still clear loading — never hang on "Loading…".
  it("dispatches SET_INIT_ERROR and clears loading when listProjects throws", async () => {
    const pm = makePm([]);
    (pm.listProjects as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("OPFS unavailable"));
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
      expect(dispatch).toHaveBeenCalledWith({
        type: "SET_INIT_ERROR",
        error: "OPFS unavailable",
      }),
    );
    // Loading is always cleared (finally), so the app cannot hang.
    expect(dispatch).toHaveBeenCalledWith({ type: "SET_LOADING", loading: false });
    expect(pm.createProject).not.toHaveBeenCalled();
  });

  // #1530: React StrictMode double-invokes effects in dev; the guard must keep
  // the defaults from being seeded twice.
  it("seeds only once under StrictMode's double effect invocation", async () => {
    const pm = makePm([]);
    const dispatch = vi.fn<(action: unknown) => void>();
    const selectFile = vi.fn<(path: string) => Promise<void>>(async () => {});
    const fs = new InMemoryFileSystemProvider();

    renderHook(
      () => useProjectInitialization({ pm, fs, dispatch, currentProject: null, selectFile }),
      { wrapper: ({ children }) => createElement(StrictMode, null, children) },
    );

    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith({ type: "SET_LOADING", loading: false }),
    );
    const expectedSeedCalls = 1 + EC_PLATFORM_PROJECTS.length + 3;
    expect(pm.createProject).toHaveBeenCalledTimes(expectedSeedCalls);
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
