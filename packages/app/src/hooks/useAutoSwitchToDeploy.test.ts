// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";
import { useAutoSwitchToDeploy } from "./useAutoSwitchToDeploy.js";
import type { AppAction, ActiveView } from "../state/app-reducer.js";

afterEach(cleanup);

interface Args {
  entryPath: string | null;
  activeView: ActiveView;
  hasDeployDiagram: boolean;
  hasSystem: boolean;
}

function render(initial: Args) {
  const dispatch = vi.fn<(a: AppAction) => void>();
  const { rerender } = renderHook(
    (args: Args) =>
      useAutoSwitchToDeploy({
        entryPath: args.entryPath,
        activeView: args.activeView,
        hasDeployDiagram: args.hasDeployDiagram,
        hasSystem: args.hasSystem,
        dispatch,
      }),
    { initialProps: initial },
  );
  return { dispatch, rerender };
}

describe("useAutoSwitchToDeploy", () => {
  it("switches to deploy for a deploy-only file", () => {
    const { dispatch } = render({
      entryPath: "a.krs",
      activeView: "system",
      hasDeployDiagram: true,
      hasSystem: false,
    });
    expect(dispatch).toHaveBeenCalledWith({ type: "SET_ACTIVE_VIEW", activeView: "deploy" });
  });

  it("does not switch when the file has a system block", () => {
    const { dispatch } = render({
      entryPath: "a.krs",
      activeView: "system",
      hasDeployDiagram: true,
      hasSystem: true,
    });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("does not switch when the file has no deploy block", () => {
    const { dispatch } = render({
      entryPath: "a.krs",
      activeView: "system",
      hasDeployDiagram: false,
      hasSystem: false,
    });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("does not switch when activeView is not system", () => {
    const { dispatch } = render({
      entryPath: "a.krs",
      activeView: "org",
      hasDeployDiagram: true,
      hasSystem: false,
    });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("does nothing when entryPath is null", () => {
    const { dispatch } = render({
      entryPath: null,
      activeView: "system",
      hasDeployDiagram: true,
      hasSystem: false,
    });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("does not re-switch after the user moves back to system on the same file", () => {
    const { dispatch, rerender } = render({
      entryPath: "a.krs",
      activeView: "system",
      hasDeployDiagram: true,
      hasSystem: false,
    });
    expect(dispatch).toHaveBeenCalledTimes(1);

    // Simulate: auto-switch took effect (activeView becomes "deploy"),
    // then the user manually goes back to "system".
    rerender({
      entryPath: "a.krs",
      activeView: "deploy",
      hasDeployDiagram: true,
      hasSystem: false,
    });
    rerender({
      entryPath: "a.krs",
      activeView: "system",
      hasDeployDiagram: true,
      hasSystem: false,
    });
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("switches again when entryPath changes to a new deploy-only file", () => {
    const { dispatch, rerender } = render({
      entryPath: "a.krs",
      activeView: "system",
      hasDeployDiagram: true,
      hasSystem: false,
    });
    expect(dispatch).toHaveBeenCalledTimes(1);

    rerender({
      entryPath: "b.krs",
      activeView: "system",
      hasDeployDiagram: true,
      hasSystem: false,
    });
    expect(dispatch).toHaveBeenCalledTimes(2);
  });
});
