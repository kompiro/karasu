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
});
