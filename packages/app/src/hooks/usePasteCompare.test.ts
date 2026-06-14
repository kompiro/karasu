// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act, cleanup, waitFor } from "@testing-library/react";
import type { FileSystemProvider } from "@karasu-tools/core";
import type { CompareSource } from "../fs/compare-source.js";
import { usePasteCompare } from "./usePasteCompare.js";

afterEach(cleanup);

function makeFs(overrides: Partial<FileSystemProvider> = {}): FileSystemProvider {
  return {
    exists: vi.fn<(p: string) => Promise<boolean>>(() => Promise.resolve(false)),
    delete: vi.fn<(p: string) => Promise<void>>(() => Promise.resolve()),
    writeFile: vi.fn<(p: string, c: string) => Promise<void>>(() => Promise.resolve()),
    readFile: vi.fn<(p: string) => Promise<string>>(() => Promise.resolve("pasted body")),
    ...overrides,
  } as unknown as FileSystemProvider;
}

const PASTED = "/p1/.karasu-paste-compare.krs";

describe("usePasteCompare", () => {
  it("confirmPaste writes the temp file and sets a pasted compare source", async () => {
    const fs = makeFs();
    const dispatch = vi.fn<(a: unknown) => void>();
    const { result } = renderHook(() =>
      usePasteCompare({ fs, projectRoot: "/p1", compareSource: null, dispatch }),
    );

    act(() => result.current.openPasteDialog());
    expect(result.current.pasteDialog).toEqual({ mode: "edit", initial: "" });

    await act(async () => await result.current.confirmPaste("diagram body"));
    expect(fs.writeFile).toHaveBeenCalledWith(PASTED, "diagram body");
    expect(dispatch).toHaveBeenCalledWith({
      type: "SET_COMPARE_SOURCE",
      source: { kind: "pasted", path: PASTED },
    });
    expect(result.current.pasteDialog).toBeNull();
  });

  it("deletes the temp file when the compare source is not the pasted one", async () => {
    const fs = makeFs({
      exists: vi.fn<(p: string) => Promise<boolean>>(() => Promise.resolve(true)),
    });
    const dispatch = vi.fn<(a: unknown) => void>();
    // compareSource is a plain file diff, not the pasted blob → cleanup runs.
    const compareSource: CompareSource = { kind: "file", path: "/p1/other.krs" };
    renderHook(() => usePasteCompare({ fs, projectRoot: "/p1", compareSource, dispatch }));
    await waitFor(() => expect(fs.delete).toHaveBeenCalledWith(PASTED));
  });

  it("does NOT delete the temp file while the pasted source is active", async () => {
    const fs = makeFs({
      exists: vi.fn<(p: string) => Promise<boolean>>(() => Promise.resolve(true)),
    });
    const dispatch = vi.fn<(a: unknown) => void>();
    const compareSource: CompareSource = { kind: "pasted", path: PASTED };
    renderHook(() => usePasteCompare({ fs, projectRoot: "/p1", compareSource, dispatch }));
    // Give the effect a chance to run; it must early-return without deleting.
    await new Promise((r) => setTimeout(r, 0));
    expect(fs.delete).not.toHaveBeenCalled();
  });
});
