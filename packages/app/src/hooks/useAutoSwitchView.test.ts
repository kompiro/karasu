// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";
import { useAutoSwitchView } from "./useAutoSwitchView.js";
import type { AppAction, ActiveView } from "../state/app-reducer.js";

afterEach(cleanup);

interface Args {
  entryPath: string | null;
  activeView: ActiveView;
  target: ActiveView;
  shouldSwitch: boolean;
}

function render(initial: Args) {
  const dispatch = vi.fn<(a: AppAction) => void>();
  const { rerender } = renderHook(
    (args: Args) =>
      useAutoSwitchView({
        entryPath: args.entryPath,
        activeView: args.activeView,
        target: args.target,
        shouldSwitch: args.shouldSwitch,
        dispatch,
      }),
    { initialProps: initial },
  );
  return { dispatch, rerender };
}

// The caller (useAppViews) computes `shouldSwitch` from the compile result:
//   deploy: hasDeployDiagram && !hasSystem            (Issue #766)
//   org:    hasOrg && !hasSystem && !hasDeployDiagram (Issue #817)
// These scenario helpers mirror those predicates so the original per-hook
// test cases (useAutoSwitchToDeploy / useAutoSwitchToOrg) are preserved.
const deployOnly = (over: { hasDeployDiagram?: boolean; hasSystem?: boolean } = {}): Args => {
  const { hasDeployDiagram = true, hasSystem = false } = over;
  return {
    entryPath: "a.krs",
    activeView: "system",
    target: "deploy",
    shouldSwitch: hasDeployDiagram && !hasSystem,
  };
};

const orgOnly = (
  over: { hasOrg?: boolean; hasSystem?: boolean; hasDeployDiagram?: boolean } = {},
): Args => {
  const { hasOrg = true, hasSystem = false, hasDeployDiagram = false } = over;
  return {
    entryPath: "a.krs",
    activeView: "system",
    target: "org",
    shouldSwitch: hasOrg && !hasSystem && !hasDeployDiagram,
  };
};

describe("useAutoSwitchView (deploy target, ex-useAutoSwitchToDeploy)", () => {
  it("switches to deploy for a deploy-only file", () => {
    const { dispatch } = render(deployOnly());
    expect(dispatch).toHaveBeenCalledWith({ type: "SET_ACTIVE_VIEW", activeView: "deploy" });
  });

  it("does not switch when the file has a system block", () => {
    const { dispatch } = render(deployOnly({ hasSystem: true }));
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("does not switch when the file has no deploy block", () => {
    const { dispatch } = render(deployOnly({ hasDeployDiagram: false }));
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("does not switch when activeView is not system", () => {
    const { dispatch } = render({ ...deployOnly(), activeView: "org" });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("does nothing when entryPath is null", () => {
    const { dispatch } = render({ ...deployOnly(), entryPath: null });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("does not re-switch after the user moves back to system on the same file", () => {
    const { dispatch, rerender } = render(deployOnly());
    expect(dispatch).toHaveBeenCalledTimes(1);

    // Simulate: auto-switch took effect (activeView becomes "deploy"),
    // then the user manually goes back to "system".
    rerender({ ...deployOnly(), activeView: "deploy" });
    rerender({ ...deployOnly(), activeView: "system" });
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("switches again when entryPath changes to a new deploy-only file", () => {
    const { dispatch, rerender } = render(deployOnly());
    expect(dispatch).toHaveBeenCalledTimes(1);

    rerender({ ...deployOnly(), entryPath: "b.krs" });
    expect(dispatch).toHaveBeenCalledTimes(2);
  });
});

describe("useAutoSwitchView (org target, ex-useAutoSwitchToOrg)", () => {
  it("switches to org for an organization-only file", () => {
    const { dispatch } = render(orgOnly());
    expect(dispatch).toHaveBeenCalledWith({ type: "SET_ACTIVE_VIEW", activeView: "org" });
  });

  it("does not switch when the file has a system block", () => {
    const { dispatch } = render(orgOnly({ hasSystem: true }));
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("does not switch when the file has a deploy block (deploy switch takes priority)", () => {
    const { dispatch } = render(orgOnly({ hasDeployDiagram: true }));
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("does not switch when the file has no organization block", () => {
    const { dispatch } = render(orgOnly({ hasOrg: false }));
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("does not switch when activeView is not system", () => {
    const { dispatch } = render({ ...orgOnly(), activeView: "deploy" });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("does nothing when entryPath is null", () => {
    const { dispatch } = render({ ...orgOnly(), entryPath: null });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("does not re-switch after the user moves back to system on the same file", () => {
    const { dispatch, rerender } = render(orgOnly());
    expect(dispatch).toHaveBeenCalledTimes(1);

    // Auto-switch took effect → user manually returns to system.
    rerender({ ...orgOnly(), activeView: "org" });
    rerender({ ...orgOnly(), activeView: "system" });
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("switches again when entryPath changes to a new org-only file", () => {
    const { dispatch, rerender } = render(orgOnly());
    expect(dispatch).toHaveBeenCalledTimes(1);

    rerender({ ...orgOnly(), entryPath: "b.krs" });
    expect(dispatch).toHaveBeenCalledTimes(2);
  });
});
