// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import type { ReactNode } from "react";
import { LocaleProvider } from "../i18n/index.js";
import { useSnapshotCompare } from "./useSnapshotCompare.js";

afterEach(cleanup);
beforeEach(() => {
  vi.spyOn(window, "prompt").mockReturnValue("my label");
});

function wrapper({ children }: { children: ReactNode }) {
  return <LocaleProvider initialLocale="en">{children}</LocaleProvider>;
}

function setup(opts: { capture?: () => Promise<void> } = {}) {
  const capture = vi.fn<() => Promise<void>>(opts.capture ?? (() => Promise.resolve()));
  const snapshotManager = { capture } as never;
  const fs = {
    readFile: vi.fn<(p: string) => Promise<string>>(() => Promise.resolve("file body")),
  } as never;
  const reportError = vi.fn<(m: string) => void>();
  const { result } = renderHook(
    () =>
      useSnapshotCompare({
        snapshotManager,
        projectRoot: "/p1",
        currentFilePath: "/p1/index.krs",
        fileContent: "current body",
        fs,
        reportError,
      }),
    { wrapper },
  );
  return { result, capture, reportError };
}

describe("useSnapshotCompare — snapshotNow", () => {
  it("captures the current file using in-memory content", async () => {
    const { result, capture, reportError } = setup();
    await act(async () => await result.current.snapshotNow("/p1/index.krs"));
    expect(capture).toHaveBeenCalledWith("index.krs", "current body", {
      trigger: "manual",
      label: "my label",
    });
    expect(reportError).not.toHaveBeenCalled();
  });

  it("reads from disk for a file other than the open one", async () => {
    const { result, capture } = setup();
    await act(async () => await result.current.snapshotNow("/p1/other.krs"));
    // Not the open file → content comes from fs.readFile, not the in-memory buffer.
    expect(capture).toHaveBeenCalledWith("other.krs", "file body", {
      trigger: "manual",
      label: "my label",
    });
  });

  it("is a no-op for a path outside the project root", async () => {
    const { result, capture } = setup();
    await act(async () => await result.current.snapshotNow("/other/x.krs"));
    expect(capture).not.toHaveBeenCalled();
  });

  it("reports an error when capture fails (#1532)", async () => {
    const { result, reportError } = setup({
      capture: () => Promise.reject(new Error("snapshot store full")),
    });
    await act(async () => await result.current.snapshotNow("/p1/index.krs"));
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError.mock.calls[0][0]).toContain("snapshot store full");
  });
});

describe("useSnapshotCompare — picker", () => {
  it("opens the picker, derives the relative path, and closes", () => {
    const { result } = setup();
    act(() => result.current.compareWithSnapshot("/p1/sub/a.krs"));
    expect(result.current.pickerFilePath).toBe("/p1/sub/a.krs");
    expect(result.current.pickerRelPath).toBe("sub/a.krs");
    act(() => result.current.closePicker());
    expect(result.current.pickerFilePath).toBeNull();
    expect(result.current.pickerRelPath).toBeNull();
  });
});
