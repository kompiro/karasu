// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { cleanup } from "@testing-library/react";
import { InMemoryFileSystemProvider } from "@karasu-tools/core";
import { SnapshotManager } from "../fs/snapshot-manager";
import { useSnapshotAutoCapture } from "./useSnapshotAutoCapture";

describe("useSnapshotAutoCapture", () => {
  let fs: InMemoryFileSystemProvider;
  let sm: SnapshotManager;
  const projectRoot = "/projects/p1";

  beforeEach(() => {
    vi.useFakeTimers();
    fs = new InMemoryFileSystemProvider();
    sm = new SnapshotManager(fs, projectRoot);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("captures an auto snapshot after debounce elapses", async () => {
    const filePath = `${projectRoot}/index.krs`;
    renderHook(() => useSnapshotAutoCapture(sm, projectRoot, filePath, "system A {}", 1000));

    await vi.advanceTimersByTimeAsync(1000);
    const list = await sm.list("index.krs");
    expect(list.length).toBe(1);
    expect(list[0].trigger).toBe("auto");
  });

  it("resets the timer when content changes during the debounce window", async () => {
    const filePath = `${projectRoot}/index.krs`;
    const { rerender } = renderHook(
      ({ content }: { content: string }) =>
        useSnapshotAutoCapture(sm, projectRoot, filePath, content, 1000),
      { initialProps: { content: "v1" } },
    );

    await vi.advanceTimersByTimeAsync(600);
    rerender({ content: "v2" });
    await vi.advanceTimersByTimeAsync(600);
    expect((await sm.list("index.krs")).length).toBe(0);

    await vi.advanceTimersByTimeAsync(500);
    const list = await sm.list("index.krs");
    expect(list.length).toBe(1);
  });

  it("does nothing when snapshots manager is null", async () => {
    const filePath = `${projectRoot}/index.krs`;
    renderHook(() => useSnapshotAutoCapture(null, projectRoot, filePath, "x", 1000));
    await vi.advanceTimersByTimeAsync(5000);
    // No throw, no capture — nothing to assert directly; reaching here is the test.
    expect(true).toBe(true);
  });
});
