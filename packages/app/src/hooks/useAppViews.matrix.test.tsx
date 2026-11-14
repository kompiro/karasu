// @vitest-environment jsdom
//
// Matrix tests over every diagram view and every compare-source kind.
//
// Both tables below are typed as an exhaustive `Record` over a union
// (`ActiveView`, `CompareSource["kind"]`), so adding a view or a compare-source
// kind is a type error (`pnpm typecheck` covers test files) until it has a row.
// That is what makes these tests guards for a new view or source and not only
// for the ones that exist today:
//
// - TPL-1032 item 3: a view's recompile result is published unconditionally,
//   including the error -> recovery step back to byte-identical content (the
//   fingerprint dedup must not swallow it; #1540).
// - TPL-1402 item 2: swapping the diff direction swaps only the input paths,
//   never the FS that resolves both of them (#1402).
import { describe, it, expect, afterEach } from "vitest";
import { renderHook, cleanup, waitFor, act } from "@testing-library/react";
import { InMemoryFileSystemProvider, type Diagnostic } from "@karasu-tools/core";
import { useAppViews } from "./useAppViews.js";
import { SnapshotManager } from "../fs/snapshot-manager.js";
import type { CompareSource } from "../fs/compare-source.js";
import { ACTIVE_VIEWS, type ActiveView } from "../state/app-reducer.js";

afterEach(cleanup);

type AppViews = ReturnType<typeof useAppViews>;

interface ViewProjection {
  /** What the view shows: its SVG, or for the matrix the systems it is built from. */
  output: (views: AppViews) => string;
  /** The diagnostics published alongside that output. */
  diagnostics: (views: AppViews) => readonly Diagnostic[];
}

/**
 * How each view reads its published state out of `useAppViews`. The matrix tab
 * has no SVG of its own: `PreviewColumn` feeds it `system.resolvedSystems`, and
 * `selectActiveViewData` gives it the system projection.
 */
const VIEWS: Record<ActiveView, ViewProjection> = {
  system: { output: (v) => v.system.svg, diagnostics: (v) => v.system.diagnostics },
  deploy: { output: (v) => v.deploy.svg, diagnostics: (v) => v.deploy.diagnostics },
  org: { output: (v) => v.org.svg, diagnostics: (v) => v.org.diagnostics },
  matrix: {
    output: (v) => v.system.resolvedSystems.map((s) => s.id).join(","),
    diagnostics: (v) => v.system.diagnostics,
  },
};

const hasError = (ds: readonly Diagnostic[]) => ds.some((d) => d.severity === "error");

const PROJECT_ROOT = "/projects/p1";
const ENTRY = `${PROJECT_ROOT}/index.krs`;
const COMPARE_FILE = `${PROJECT_ROOT}/compare.krs`;

// One source every view can draw: a system, a deploy block realizing it, and
// an organization owning it.
const sourceWith = (extraService: string) => `system Shop {
  service Billing { label "Billing" }
  ${extraService}
}

deploy Prod {
  oci billing {
    label "BillingContainer"
    runtime "Docker"
    realizes Billing
  }
}

organization Org {
  team "payments" { label "Payments" owns Billing }
}`;

const AFTER_SOURCE = sourceWith("");
const BEFORE_SOURCE = sourceWith('service Search { label "Search" }');
const INVALID_SOURCE = "!!! invalid krs !!!";

function baseArgs(fs: InMemoryFileSystemProvider) {
  return {
    entryPath: ENTRY,
    fs,
    viewPath: [] as string[],
    selectedDeployBlockId: null,
    highlightedNodeId: null,
    displayMode: "shape" as const,
    theme: "dark" as const,
    currentFilePath: ENTRY,
    dispatch: () => {},
    isOrgTreeViewOpen: false,
    isTeamDependenciesOpen: false,
    setIsOrgTreeViewOpen: () => {},
    isEntityViewOpen: false,
    setIsEntityViewOpen: () => {},
  };
}

describe("useAppViews: every view republishes after an error (TPL-1032 item 3)", () => {
  it("walks every ActiveView", () => {
    // The Record above is exhaustive by type; this pins it to the runtime list.
    expect(Object.keys(VIEWS).sort()).toEqual([...ACTIVE_VIEWS].sort());
  });

  it.each(ACTIVE_VIEWS)(
    "%s: valid -> error -> the same valid source publishes again",
    async (view) => {
      const { output, diagnostics } = VIEWS[view];
      const fs = new InMemoryFileSystemProvider();
      await fs.writeFile(ENTRY, AFTER_SOURCE);

      const { result } = renderHook(() => useAppViews({ ...baseArgs(fs), activeView: view }));

      await waitFor(() => expect(output(result.current)).toBeTruthy(), { timeout: 3000 });
      expect(hasError(diagnostics(result.current))).toBe(false);
      const validOutput = output(result.current);

      await act(async () => {
        await fs.writeFile(ENTRY, INVALID_SOURCE);
        result.current.recompile();
      });
      await waitFor(() => expect(hasError(diagnostics(result.current))).toBe(true), {
        timeout: 3000,
      });

      // Back to byte-identical content: the result fingerprint equals the one
      // published before the error, and the view must publish it anyway.
      await act(async () => {
        await fs.writeFile(ENTRY, AFTER_SOURCE);
        result.current.recompile();
      });
      await waitFor(() => expect(hasError(diagnostics(result.current))).toBe(false), {
        timeout: 3000,
      });
      expect(output(result.current)).toBe(validOutput);
    },
  );
});

interface CompareFixture {
  /** Write the compare-side content and return the source plus what resolves it. */
  setup: (fs: InMemoryFileSystemProvider) => Promise<{
    compareSource: CompareSource;
    snapshotManager: SnapshotManager;
  }>;
}

const COMPARE_KINDS: Record<CompareSource["kind"], CompareFixture> = {
  file: {
    setup: async (fs) => {
      await fs.writeFile(COMPARE_FILE, BEFORE_SOURCE);
      return {
        compareSource: { kind: "file", path: COMPARE_FILE },
        snapshotManager: new SnapshotManager(fs, PROJECT_ROOT),
      };
    },
  },
  pasted: {
    setup: async (fs) => {
      const path = `${PROJECT_ROOT}/.pasted/compare.krs`;
      await fs.writeFile(path, BEFORE_SOURCE);
      return {
        compareSource: { kind: "pasted", path },
        snapshotManager: new SnapshotManager(fs, PROJECT_ROOT),
      };
    },
  },
  snapshot: {
    setup: async (fs) => {
      const snapshotManager = new SnapshotManager(fs, PROJECT_ROOT);
      const record = await snapshotManager.capture("index.krs", BEFORE_SOURCE, {
        trigger: "manual",
      });
      if (!record) throw new Error("snapshot capture returned null");
      return {
        compareSource: { kind: "snapshot", filePath: "index.krs", snapshotId: record.id },
        snapshotManager,
      };
    },
  },
};

const COMPARE_KIND_NAMES = Object.keys(COMPARE_KINDS) as CompareSource["kind"][];

describe("useAppViews: both swap states render for every compare source (TPL-1402 item 2)", () => {
  const cases = COMPARE_KIND_NAMES.flatMap((kind) =>
    [false, true].map((swapped) => ({ kind, swapped })),
  );

  it.each(cases)(
    "$kind, swapped=$swapped: every view draws without errors",
    async ({ kind, swapped }) => {
      const fs = new InMemoryFileSystemProvider();
      await fs.writeFile(ENTRY, AFTER_SOURCE);
      const { compareSource, snapshotManager } = await COMPARE_KINDS[kind].setup(fs);

      // Start un-swapped so the compare source has resolved before the swap
      // applies (`canSwap` falls back to the plain pair while it resolves).
      const { result, rerender } = renderHook(
        ({ swap }: { swap: boolean }) =>
          useAppViews({
            ...baseArgs(fs),
            activeView: "system",
            compareSource,
            snapshotManager,
            projectRoot: PROJECT_ROOT,
            swapped: swap,
          }),
        { initialProps: { swap: false } },
      );
      await waitFor(() => expect(result.current.system.nodeDiff?.size ?? 0).toBeGreaterThan(0), {
        timeout: 3000,
      });
      const unswapped = result.current.system.svg;

      // Swapped: wait for the inverted diff. Un-swapped: the same props again.
      rerender({ swap: swapped });
      await waitFor(() => expect(result.current.system.svg !== unswapped).toBe(swapped), {
        timeout: 3000,
      });

      for (const view of ACTIVE_VIEWS) {
        const { output, diagnostics } = VIEWS[view];
        await waitFor(() => expect(output(result.current)).toBeTruthy(), { timeout: 3000 });
        expect(hasError(diagnostics(result.current)), `${view} has an error diagnostic`).toBe(
          false,
        );
      }
    },
  );
});
