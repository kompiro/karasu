// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { Project } from "@karasu-tools/core";
import type { AppAction } from "../../state/app-reducer.js";
import { useGuidedScene, type PendingScene } from "./use-guided-scene.js";

afterEach(cleanup);

const stamp = { createdAt: "2026-11-03T00:00:00Z", updatedAt: "2026-11-03T00:00:00Z" };
const tourProject: Project = {
  id: "tour",
  name: "service-split",
  rootPath: "/projects/tour",
  ...stamp,
};
const otherProject: Project = {
  id: "gs",
  name: "getting-started",
  rootPath: "/projects/gs",
  ...stamp,
};

const diffScene: PendingScene = {
  root: "/projects/tour",
  scene: { file: "planned.krs", view: "system", compareWith: "index.krs" },
  key: "tour:1:2",
};

type Props = { project: Project | null; file: string | null; pending: PendingScene | null };

function setup(initial: Props, read: (path: string) => Promise<void> = async () => {}) {
  const calls: string[] = [];
  const selectFile = vi.fn<(path: string) => Promise<void>>(async (path) => {
    calls.push(`select ${path}`);
    await read(path);
  });
  const dispatch = vi.fn<(action: AppAction) => void>((action) => {
    calls.push(action.type);
  });
  const view = renderHook(
    ({ project, file, pending }: Props) =>
      useGuidedScene({
        pending,
        currentProject: project,
        currentFilePath: file,
        selectFile,
        dispatch,
      }),
    { initialProps: initial },
  );
  return { ...view, calls, selectFile, dispatch };
}

describe("useGuidedScene", () => {
  it("waits for the project switch and its own index.krs selection before applying", async () => {
    // The guide starts while the previous project is still open.
    const { rerender, calls } = setup({
      project: otherProject,
      file: "/projects/gs/index.krs",
      pending: diffScene,
    });
    expect(calls).toEqual([]);

    // Switched, but the auto-select has not landed yet: applying now would be
    // overwritten by that slower selection.
    rerender({ project: tourProject, file: null, pending: diffScene });
    expect(calls).toEqual([]);

    await act(async () => {
      rerender({ project: tourProject, file: "/projects/tour/index.krs", pending: diffScene });
    });
    expect(calls).toEqual([
      "select /projects/tour/planned.krs",
      "SET_COMPARE_SOURCE",
      "SET_ACTIVE_VIEW",
    ]);
  });

  it("sets the diff source and then the view, after the file (selecting a file resets the view)", async () => {
    const { dispatch } = setup({
      project: tourProject,
      file: "/projects/tour/planned.krs",
      pending: diffScene,
    });
    await act(async () => {});
    expect(dispatch.mock.calls.map(([a]) => a)).toEqual([
      {
        type: "SET_COMPARE_SOURCE",
        source: { kind: "file", path: "/projects/tour/index.krs" },
      },
      { type: "SET_ACTIVE_VIEW", activeView: "system" },
    ]);
  });

  it("clears the diff for a scene without one, and selects its file even when already open", async () => {
    const orgScene: PendingScene = {
      root: "/projects/tour",
      scene: { file: "index.krs", view: "org" },
      key: "tour:1:1",
    };
    const { selectFile, dispatch } = setup({
      project: tourProject,
      file: "/projects/tour/index.krs",
      pending: orgScene,
    });
    await act(async () => {});
    // Selecting it again supersedes a slower selection still in flight.
    expect(selectFile).toHaveBeenCalledWith("/projects/tour/index.krs");
    expect(dispatch.mock.calls.map(([a]) => a)).toEqual([
      { type: "SET_COMPARE_SOURCE", source: null },
      { type: "SET_ACTIVE_VIEW", activeView: "org" },
    ]);
  });

  it("drops the diff and view of a scene left before its file loaded (TPL-1534)", async () => {
    // Step 3's planned.krs loads slowly; the visitor presses Back to step 2
    // before it lands. Step 3 must not switch the diff on afterwards.
    let releaseSlow: () => void = () => {};
    const slow = new Promise<void>((resolve) => {
      releaseSlow = resolve;
    });
    const orgScene: PendingScene = {
      root: "/projects/tour",
      scene: { file: "index.krs", view: "org" },
      key: "tour:1:1",
    };
    const { rerender, dispatch } = setup(
      { project: tourProject, file: "/projects/tour/index.krs", pending: diffScene },
      (path) => (path.endsWith("planned.krs") ? slow : Promise.resolve()),
    );
    await act(async () => {
      rerender({ project: tourProject, file: "/projects/tour/index.krs", pending: orgScene });
    });
    await act(async () => {
      releaseSlow();
    });
    expect(dispatch.mock.calls.map(([a]) => a)).toEqual([
      { type: "SET_COMPARE_SOURCE", source: null },
      { type: "SET_ACTIVE_VIEW", activeView: "org" },
    ]);
  });

  it("drops a scene's late diff once the guide has ended", async () => {
    let release: () => void = () => {};
    const slow = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { rerender, dispatch } = setup(
      { project: tourProject, file: "/projects/tour/index.krs", pending: diffScene },
      () => slow,
    );
    await act(async () => {
      rerender({ project: tourProject, file: "/projects/tour/index.krs", pending: null });
    });
    await act(async () => {
      release();
    });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("shows the scene again after the visitor leaves its project and comes back", async () => {
    const { rerender, dispatch } = setup({
      project: tourProject,
      file: "/projects/tour/planned.krs",
      pending: diffScene,
    });
    await act(async () => {});
    expect(dispatch).toHaveBeenCalledTimes(2);

    await act(async () => {
      rerender({ project: otherProject, file: "/projects/gs/index.krs", pending: diffScene });
    });
    // Coming back resets the file to index.krs and clears the diff.
    await act(async () => {
      rerender({ project: tourProject, file: "/projects/tour/index.krs", pending: diffScene });
    });
    expect(dispatch).toHaveBeenCalledTimes(4);
  });

  it("applies a scene once per key, and again for a new key", async () => {
    const { rerender, dispatch } = setup({
      project: tourProject,
      file: "/projects/tour/planned.krs",
      pending: diffScene,
    });
    await act(async () => {});
    // The user moves around inside the scene: nothing is re-applied.
    await act(async () => {
      rerender({ project: tourProject, file: "/projects/tour/index.krs", pending: diffScene });
    });
    expect(dispatch).toHaveBeenCalledTimes(2);

    await act(async () => {
      rerender({
        project: tourProject,
        file: "/projects/tour/index.krs",
        pending: { ...diffScene, key: "tour:1:3" },
      });
    });
    expect(dispatch).toHaveBeenCalledTimes(4);
  });
});
