// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";
import { useAutoSwitchToOrg } from "./useAutoSwitchToOrg.js";
import type { AppAction, ActiveView } from "../state/app-reducer.js";

afterEach(cleanup);

interface Args {
  entryPath: string | null;
  activeView: ActiveView;
  hasOrg: boolean;
  hasSystem: boolean;
  hasDeployDiagram: boolean;
}

function render(initial: Args) {
  const dispatch = vi.fn<(a: AppAction) => void>();
  const { rerender } = renderHook(
    (args: Args) =>
      useAutoSwitchToOrg({
        entryPath: args.entryPath,
        activeView: args.activeView,
        hasOrg: args.hasOrg,
        hasSystem: args.hasSystem,
        hasDeployDiagram: args.hasDeployDiagram,
        dispatch,
      }),
    { initialProps: initial },
  );
  return { dispatch, rerender };
}

const orgOnly: Args = {
  entryPath: "a.krs",
  activeView: "system",
  hasOrg: true,
  hasSystem: false,
  hasDeployDiagram: false,
};

describe("useAutoSwitchToOrg", () => {
  it("switches to org for an organization-only file", () => {
    const { dispatch } = render(orgOnly);
    expect(dispatch).toHaveBeenCalledWith({ type: "SET_ACTIVE_VIEW", activeView: "org" });
  });

  it("does not switch when the file has a system block", () => {
    const { dispatch } = render({ ...orgOnly, hasSystem: true });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("does not switch when the file has a deploy block (deploy hook takes priority)", () => {
    const { dispatch } = render({ ...orgOnly, hasDeployDiagram: true });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("does not switch when the file has no organization block", () => {
    const { dispatch } = render({ ...orgOnly, hasOrg: false });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("does not switch when activeView is not system", () => {
    const { dispatch } = render({ ...orgOnly, activeView: "deploy" });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("does nothing when entryPath is null", () => {
    const { dispatch } = render({ ...orgOnly, entryPath: null });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("does not re-switch after the user moves back to system on the same file", () => {
    const { dispatch, rerender } = render(orgOnly);
    expect(dispatch).toHaveBeenCalledTimes(1);

    // Auto-switch took effect → user manually returns to system.
    rerender({ ...orgOnly, activeView: "org" });
    rerender({ ...orgOnly, activeView: "system" });
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("switches again when entryPath changes to a new org-only file", () => {
    const { dispatch, rerender } = render(orgOnly);
    expect(dispatch).toHaveBeenCalledTimes(1);

    rerender({ ...orgOnly, entryPath: "b.krs" });
    expect(dispatch).toHaveBeenCalledTimes(2);
  });
});
