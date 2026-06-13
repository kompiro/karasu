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
    const { result } = renderHook(() => useSerializedFileWrite(fs, "/a.krs"));

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
    const { result } = renderHook(() => useSerializedFileWrite(fs, "/a.krs"));

    await act(async () => {
      await result.current.write("/a.krs", "hello");
    });

    expect(result.current.isOwnWrite("hello")).toBe(true);
    expect(result.current.isOwnWrite("not written by us")).toBe(false);
  });

  it("recognizes intermediate self-writes, not just the latest", async () => {
    const fs = makeFs(vi.fn<(path: string, content: string) => Promise<void>>(async () => {}));
    const { result } = renderHook(() => useSerializedFileWrite(fs, "/a.krs"));

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
    const { result } = renderHook(() => useSerializedFileWrite(fs, "/a.krs"));

    await act(async () => {
      for (let i = 0; i < 60; i++) {
        await result.current.write("/a.krs", `v${i}`);
      }
    });

    // The cap is 50, so the very first writes are evicted while recent ones stay.
    expect(result.current.isOwnWrite("v0")).toBe(false);
    expect(result.current.isOwnWrite("v59")).toBe(true);
  });

  // #1535 review: the echo set is scoped to the open file. A value typed in
  // file A must not be reported as a self-write after switching to file B,
  // or it would suppress a genuine external refresh on B.
  it("clears the self-write set when the open file changes", async () => {
    const fs = makeFs(vi.fn<(path: string, content: string) => Promise<void>>(async () => {}));
    const { result, rerender } = renderHook(
      ({ path }: { path: string }) => useSerializedFileWrite(fs, path),
      { initialProps: { path: "/a.krs" } },
    );

    await act(async () => {
      await result.current.write("/a.krs", "typed-in-A");
    });
    expect(result.current.isOwnWrite("typed-in-A")).toBe(true);

    // Switch to file B — A's recorded values must no longer count as own writes.
    rerender({ path: "/b.krs" });
    expect(result.current.isOwnWrite("typed-in-A")).toBe(false);
  });
});
