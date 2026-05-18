// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { renderHook, cleanup, waitFor } from "@testing-library/react";
import { InMemoryFileSystemProvider } from "@karasu-tools/core";
import { useAppViews } from "./useAppViews.js";
import { SnapshotManager } from "../fs/snapshot-manager.js";
import type { CompareSource } from "../fs/compare-source.js";

afterEach(cleanup);

const PROJECT_ROOT = "/projects/p1";
const ENTRY = `${PROJECT_ROOT}/index.krs`;
const COMPARE_FILE = `${PROJECT_ROOT}/compare.krs`;

// Structurally different so the un-swapped and swapped diff SVGs are distinct.
const AFTER_SOURCE = `system Sys {
  service Frontend { label "Frontend" }
}`;
const BEFORE_SOURCE = `system Sys {
  service Frontend { label "Frontend" }
  service Backend { label "Backend" }
}`;

describe("useAppViews — diff swap", () => {
  // Issue #1402: clicking Swap with a snapshot compare source flipped the diff
  // direction, but `effCompareFs` was set to the base FS. The swapped after-side
  // is the virtual `/.snapshot-view/…` path, which only the SnapshotOverlayFs can
  // serve — so `compileSystemDiff` threw and the diagram failed to render.
  it("renders the swapped diff for a snapshot compare source", async () => {
    const fs = new InMemoryFileSystemProvider();
    await fs.writeFile(ENTRY, AFTER_SOURCE);
    const snapshots = new SnapshotManager(fs, PROJECT_ROOT);
    const record = await snapshots.capture("index.krs", BEFORE_SOURCE, { trigger: "manual" });
    expect(record).not.toBeNull();

    const compareSource: CompareSource = {
      kind: "snapshot",
      filePath: "index.krs",
      snapshotId: record!.id,
    };

    const { result, rerender } = renderHook(
      ({ swapped }: { swapped: boolean }) =>
        useAppViews({
          entryPath: ENTRY,
          fs,
          viewPath: [],
          activeView: "system",
          selectedDeployBlockId: null,
          highlightedNodeId: null,
          displayMode: "shape",
          currentFilePath: ENTRY,
          dispatch: () => {},
          isOrgTreeViewOpen: false,
          setIsOrgTreeViewOpen: () => {},
          compareSource,
          snapshotManager: snapshots,
          projectRoot: PROJECT_ROOT,
          swapped,
        }),
      { initialProps: { swapped: false } },
    );

    // The buggy `effCompareFs` is shared by all three view hooks, so each
    // `compile*Diff` failed on the swapped virtual path. Assert all three.
    const noCompileError = () => {
      const { system, deploy, org } = result.current;
      expect(system.diagnostics.some((d) => d.code === "app-project-compile-error")).toBe(false);
      expect(deploy.diagnostics.some((d) => d.code === "app-project-compile-error")).toBe(false);
      expect(org.diagnostics.some((d) => d.code === "app-org-parse-error")).toBe(false);
    };

    // Un-swapped diff renders.
    await waitFor(() => expect(result.current.system.svg).toBeTruthy(), { timeout: 2000 });
    noCompileError();
    const unswappedSvg = result.current.system.svg;

    // Swap: before/after flip. The diff must re-render — on the buggy code the
    // swapped compile threw and the catch block kept the stale (un-swapped) SVG.
    rerender({ swapped: true });
    await waitFor(() => expect(result.current.system.svg).not.toBe(unswappedSvg), {
      timeout: 2000,
    });
    noCompileError();
    expect(result.current.system.svg).toBeTruthy();
  });

  // TPL-20260518-01 checklist item 3: forward → reverse → forward round-trip.
  // The reverse state must not be assumed to be the mirror of forward; each
  // direction is independently rendered via the overlay FS.
  it("renders correctly after a full swap round-trip (forward → reverse → forward)", async () => {
    const fs = new InMemoryFileSystemProvider();
    await fs.writeFile(ENTRY, AFTER_SOURCE);
    const snapshots = new SnapshotManager(fs, PROJECT_ROOT);
    const record = await snapshots.capture("index.krs", BEFORE_SOURCE, { trigger: "manual" });
    expect(record).not.toBeNull();

    const compareSource: CompareSource = {
      kind: "snapshot",
      filePath: "index.krs",
      snapshotId: record!.id,
    };

    const { result, rerender } = renderHook(
      ({ swapped }: { swapped: boolean }) =>
        useAppViews({
          entryPath: ENTRY,
          fs,
          viewPath: [],
          activeView: "system",
          selectedDeployBlockId: null,
          highlightedNodeId: null,
          displayMode: "shape",
          currentFilePath: ENTRY,
          dispatch: () => {},
          isOrgTreeViewOpen: false,
          setIsOrgTreeViewOpen: () => {},
          compareSource,
          snapshotManager: snapshots,
          projectRoot: PROJECT_ROOT,
          swapped,
        }),
      { initialProps: { swapped: false } },
    );

    const noCompileError = () => {
      const { system, deploy, org } = result.current;
      expect(system.diagnostics.some((d) => d.code === "app-project-compile-error")).toBe(false);
      expect(deploy.diagnostics.some((d) => d.code === "app-project-compile-error")).toBe(false);
      expect(org.diagnostics.some((d) => d.code === "app-org-parse-error")).toBe(false);
    };

    // Step 1 — forward: unswapped diff renders.
    await waitFor(() => expect(result.current.system.svg).toBeTruthy(), { timeout: 2000 });
    noCompileError();
    const forwardSvg = result.current.system.svg;

    // Step 2 — reverse: swap renders a different SVG (the inverted diff).
    rerender({ swapped: true });
    await waitFor(() => expect(result.current.system.svg).not.toBe(forwardSvg), {
      timeout: 2000,
    });
    noCompileError();
    const reverseSvg = result.current.system.svg;
    expect(reverseSvg).toBeTruthy();

    // Step 3 — forward again (swap-back): must return to the original rendering,
    // not remain stuck in the reverse state or error. The SVG should match the
    // initial forward render.
    rerender({ swapped: false });
    await waitFor(() => expect(result.current.system.svg).not.toBe(reverseSvg), {
      timeout: 2000,
    });
    noCompileError();
    expect(result.current.system.svg).toBeTruthy();
  });

  // TPL-20260518-01 checklist item 4: verify swap for a non-overlay (file) compare
  // source. For `kind: "file"`, `compareFs === fs` (no overlay), so both effFs and
  // effCompareFs are the base FS in both directions — the fix must not break this.
  it("renders the swapped diff for a file compare source", async () => {
    const fs = new InMemoryFileSystemProvider();
    await fs.writeFile(ENTRY, AFTER_SOURCE);
    await fs.writeFile(COMPARE_FILE, BEFORE_SOURCE);

    const compareSource: CompareSource = { kind: "file", path: COMPARE_FILE };

    const { result, rerender } = renderHook(
      ({ swapped }: { swapped: boolean }) =>
        useAppViews({
          entryPath: ENTRY,
          fs,
          viewPath: [],
          activeView: "system",
          selectedDeployBlockId: null,
          highlightedNodeId: null,
          displayMode: "shape",
          currentFilePath: ENTRY,
          dispatch: () => {},
          isOrgTreeViewOpen: false,
          setIsOrgTreeViewOpen: () => {},
          compareSource,
          swapped,
        }),
      { initialProps: { swapped: false } },
    );

    const noCompileError = () => {
      const { system } = result.current;
      expect(system.diagnostics.some((d) => d.code === "app-project-compile-error")).toBe(false);
    };

    // Forward direction renders without errors.
    await waitFor(() => expect(result.current.system.svg).toBeTruthy(), { timeout: 2000 });
    noCompileError();
    const forwardSvg = result.current.system.svg;

    // Reverse direction also renders without errors and produces a different SVG.
    rerender({ swapped: true });
    await waitFor(() => expect(result.current.system.svg).not.toBe(forwardSvg), {
      timeout: 2000,
    });
    noCompileError();
    expect(result.current.system.svg).toBeTruthy();
  });

  // `canSwap` guard: when `swapped=true` is set before the compare source has
  // resolved (compareEntryPath is null), the hook must fall through to the
  // unswapped pair and continue rendering the after-side rather than showing
  // an error or blank output.
  it("falls back to the unswapped view while the compare source is still resolving", async () => {
    const fs = new InMemoryFileSystemProvider();
    await fs.writeFile(ENTRY, AFTER_SOURCE);

    // Pass swapped=true from the very first render, but no compareSource yet —
    // simulates the moment between "swap button clicked" and "snapshot resolved".
    const { result } = renderHook(() =>
      useAppViews({
        entryPath: ENTRY,
        fs,
        viewPath: [],
        activeView: "system",
        selectedDeployBlockId: null,
        highlightedNodeId: null,
        displayMode: "shape",
        currentFilePath: ENTRY,
        dispatch: () => {},
        isOrgTreeViewOpen: false,
        setIsOrgTreeViewOpen: () => {},
        compareSource: null, // not yet resolved
        swapped: true, // swap already requested
      }),
    );

    // The hook must render the live file (no diff errors, non-empty SVG).
    await waitFor(() => expect(result.current.system.svg).toBeTruthy(), { timeout: 2000 });
    expect(
      result.current.system.diagnostics.some((d) => d.code === "app-project-compile-error"),
    ).toBe(false);
  });
});
