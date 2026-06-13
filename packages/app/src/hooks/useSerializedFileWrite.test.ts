// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import type { FileSystemProvider } from "@karasu-tools/core";
import { useSerializedFileWrite } from "./useSerializedFileWrite.js";

afterEach(cleanup);

function makeFs(writeFile: FileSystemProvider["writeFile"]): FileSystemProvider {
  return {
    readFile: vi.fn<(path: string) => Promise<string>>(async () => ""),
    writeFile,
    readDir: vi.fn<(path: string) => Promise<never[]>>(async () => []),
    exists: vi.fn<(path: string) => Promise<boolean>>(async () => true),
    delete: vi.fn<(path: string) => Promise<void>>(async () => {}),
    mkdir: vi.fn<(path: string) => Promise<void>>(async () => {}),
  } as unknown as FileSystemProvider;
}

describe("useSerializedFileWrite", () => {
  it("commits writes in submission order, one at a time", async () => {
    const order: string[] = [];
    let active = 0;
    let maxActive = 0;
    const writeFile = vi.fn<(path: string, content: string) => Promise<void>>(
      async (_path: string, content: string) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await Promise.resolve();
        await Promise.resolve();
        order.push(content);
        active -= 1;
      },
    );
    const fs = makeFs(writeFile);
    const { result } = renderHook(() => useSerializedFileWrite(fs));

    await act(async () => {
      await Promise.all([
        result.current.write("/a.krs", "v1"),
        result.current.write("/a.krs", "v2"),
        result.current.write("/a.krs", "v3"),
      ]);
    });

    expect(maxActive).toBe(1); // never two writes overlapping
    expect(order).toEqual(["v1", "v2", "v3"]); // last submitted commits last
  });

  it("recognizes recently written values as own writes", async () => {
    const fs = makeFs(vi.fn<(path: string, content: string) => Promise<void>>(async () => {}));
    const { result } = renderHook(() => useSerializedFileWrite(fs));

    await act(async () => {
      await result.current.write("/a.krs", "hello");
    });

    expect(result.current.isOwnWrite("hello")).toBe(true);
    expect(result.current.isOwnWrite("not written by us")).toBe(false);
  });

  it("recognizes intermediate self-writes, not just the latest", async () => {
    const fs = makeFs(vi.fn<(path: string, content: string) => Promise<void>>(async () => {}));
    const { result } = renderHook(() => useSerializedFileWrite(fs));

    await act(async () => {
      await result.current.write("/a.krs", "step1");
      await result.current.write("/a.krs", "step2");
    });

    // Both must be recognized so the watcher never reverts to an older keystroke.
    expect(result.current.isOwnWrite("step1")).toBe(true);
    expect(result.current.isOwnWrite("step2")).toBe(true);
  });

  it("bounds the remembered set so it does not grow without limit", async () => {
    const fs = makeFs(vi.fn<(path: string, content: string) => Promise<void>>(async () => {}));
    const { result } = renderHook(() => useSerializedFileWrite(fs));

    await act(async () => {
      for (let i = 0; i < 60; i++) {
        await result.current.write("/a.krs", `v${i}`);
      }
    });

    // The cap is 50, so the very first writes are evicted while recent ones stay.
    expect(result.current.isOwnWrite("v0")).toBe(false);
    expect(result.current.isOwnWrite("v59")).toBe(true);
  });
});
