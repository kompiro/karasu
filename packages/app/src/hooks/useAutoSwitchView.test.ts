// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";
import {
  useAutoSwitchView,
  shouldAutoSwitchToDeploy,
  shouldAutoSwitchToOrg,
} from "./useAutoSwitchView.js";
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

// The hook only sees a caller-computed boolean, so its mechanics are
// target-agnostic — exercise them once per target used in production
// (useAppViews wires "deploy" per #766 and "org" per #817). The predicate
// combinations that feed `shouldSwitch` are covered separately below,
// against the real exported expressions.
describe.each<{ target: ActiveView }>([{ target: "deploy" }, { target: "org" }])(
  "useAutoSwitchView (target: $target)",
  ({ target }) => {
    const base: Args = { entryPath: "a.krs", activeView: "system", target, shouldSwitch: true };

    it(`dispatches SET_ACTIVE_VIEW ${target} when shouldSwitch holds on the system tab`, () => {
      const { dispatch } = render(base);
      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(dispatch).toHaveBeenCalledWith({ type: "SET_ACTIVE_VIEW", activeView: target });
    });

    it("does not switch when shouldSwitch is false", () => {
      const { dispatch } = render({ ...base, shouldSwitch: false });
      expect(dispatch).not.toHaveBeenCalled();
    });

    it("does not switch when activeView is not system", () => {
      const otherView: ActiveView = target === "deploy" ? "org" : "deploy";
      const { dispatch } = render({ ...base, activeView: otherView });
      expect(dispatch).not.toHaveBeenCalled();
    });

    it("does nothing when entryPath is null", () => {
      const { dispatch } = render({ ...base, entryPath: null });
      expect(dispatch).not.toHaveBeenCalled();
    });

    it("does not re-switch after the user moves back to system on the same file", () => {
      const { dispatch, rerender } = render(base);
      expect(dispatch).toHaveBeenCalledTimes(1);

      // Simulate: auto-switch took effect (activeView becomes the target),
      // then the user manually goes back to "system".
      rerender({ ...base, activeView: target });
      rerender({ ...base, activeView: "system" });
      expect(dispatch).toHaveBeenCalledTimes(1);
    });

    it("switches again when entryPath changes to a new file", () => {
      const { dispatch, rerender } = render(base);
      expect(dispatch).toHaveBeenCalledTimes(1);

      rerender({ ...base, entryPath: "b.krs" });
      expect(dispatch).toHaveBeenCalledTimes(2);
    });
  },
);

// Fence the REAL predicate expressions that useAppViews passes as
// `shouldSwitch` — the `system > deploy > org` priority (ADR-766)
// lives in these, not in hook call order. E.g. dropping `!hasDeployDiagram`
// from the org predicate would reintroduce the #923 stale-org tab flip.
describe("shouldAutoSwitchToDeploy (Issue #766)", () => {
  it("holds for a deploy-only file", () => {
    expect(shouldAutoSwitchToDeploy({ hasDeployDiagram: true, hasSystem: false })).toBe(true);
  });

  it("does not hold when the file has a system block", () => {
    expect(shouldAutoSwitchToDeploy({ hasDeployDiagram: true, hasSystem: true })).toBe(false);
  });

  it("does not hold when the file has no deploy block", () => {
    expect(shouldAutoSwitchToDeploy({ hasDeployDiagram: false, hasSystem: false })).toBe(false);
  });
});

describe("shouldAutoSwitchToOrg (Issue #817)", () => {
  const orgOnly = { hasOrg: true, hasSystem: false, hasDeployDiagram: false };

  it("holds for an organization-only file", () => {
    expect(shouldAutoSwitchToOrg(orgOnly)).toBe(true);
  });

  it("does not hold when the file has a system block", () => {
    expect(shouldAutoSwitchToOrg({ ...orgOnly, hasSystem: true })).toBe(false);
  });

  it("does not hold when the file has a deploy block (deploy switch takes priority)", () => {
    expect(shouldAutoSwitchToOrg({ ...orgOnly, hasDeployDiagram: true })).toBe(false);
  });

  it("does not hold when the file has no organization block", () => {
    expect(shouldAutoSwitchToOrg({ ...orgOnly, hasOrg: false })).toBe(false);
  });
});
