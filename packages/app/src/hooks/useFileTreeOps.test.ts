// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { InMemoryFileSystemProvider } from "@karasu-tools/core";
import { useFileTreeOps } from "./useFileTreeOps.js";

afterEach(cleanup);

async function setupFs() {
  const fs = new InMemoryFileSystemProvider();
  await fs.mkdir("/project");
  await fs.writeFile("/project/existing.krs", "old");
  return fs;
}

function setup(args: {
  fs: InMemoryFileSystemProvider;
  reload?: () => Promise<void>;
  onFileCreated?: (p: string) => void;
  onFileDeleted?: (p: string) => void;
  onFileRenamed?: (oldP: string, newP: string) => void;
  confirm?: (msg: string) => boolean;
}) {
  const reload = args.reload ?? vi.fn<() => Promise<void>>(async () => {});
  const confirm = args.confirm ?? (() => true);
  const { result } = renderHook(() =>
    useFileTreeOps({
      fs: args.fs,
      reload,
      onFileCreated: args.onFileCreated,
      onFileDeleted: args.onFileDeleted,
      onFileRenamed: args.onFileRenamed,
      confirm,
    }),
  );
  return { result, reload };
}

describe("useFileTreeOps.createFile", () => {
  it("appends .krs when no recognized extension is present", async () => {
    const fs = await setupFs();
    const onFileCreated = vi.fn<(p: string) => void>();
    const { result, reload } = setup({ fs, onFileCreated });

    await act(async () => {
      await result.current.createFile("/project", "foo");
    });

    expect(await fs.readFile("/project/foo.krs")).toBe("");
    expect(reload).toHaveBeenCalled();
    expect(onFileCreated).toHaveBeenCalledWith("/project/foo.krs");
  });

  it("keeps the name as-is when it ends with .krs or .krs.style", async () => {
    const fs = await setupFs();
    const { result } = setup({ fs });

    await act(async () => {
      await result.current.createFile("/project", "theme.krs.style");
    });

    expect(await fs.readFile("/project/theme.krs.style")).toBe("");
  });

  it("does nothing when the name is blank", async () => {
    const fs = await setupFs();
    const onFileCreated = vi.fn<(p: string) => void>();
    const { result, reload } = setup({ fs, onFileCreated });

    await act(async () => {
      await result.current.createFile("/project", "   ");
    });

    expect(reload).not.toHaveBeenCalled();
    expect(onFileCreated).not.toHaveBeenCalled();
  });
});

describe("useFileTreeOps.createDir", () => {
  it("creates the directory and reloads", async () => {
    const fs = await setupFs();
    const { result, reload } = setup({ fs });

    await act(async () => {
      await result.current.createDir("/project", "sub");
    });

    expect(await fs.exists("/project/sub")).toBe(true);
    expect(reload).toHaveBeenCalled();
  });

  it("ignores blank names", async () => {
    const fs = await setupFs();
    const { result, reload } = setup({ fs });

    await act(async () => {
      await result.current.createDir("/project", "");
    });

    expect(reload).not.toHaveBeenCalled();
  });
});

describe("useFileTreeOps.renameItem", () => {
  it("renames a file: writes new path, deletes old, fires onFileRenamed", async () => {
    const fs = await setupFs();
    const onFileRenamed = vi.fn<(o: string, n: string) => void>();
    const { result } = setup({ fs, onFileRenamed });

    await act(async () => {
      await result.current.renameItem("/project/existing.krs", "renamed.krs", "file");
    });

    expect(await fs.exists("/project/existing.krs")).toBe(false);
    expect(await fs.readFile("/project/renamed.krs")).toBe("old");
    expect(onFileRenamed).toHaveBeenCalledWith("/project/existing.krs", "/project/renamed.krs");
  });

  it("renames a directory by copying recursively and deleting the source", async () => {
    const fs = await setupFs();
    await fs.mkdir("/project/src");
    await fs.writeFile("/project/src/a.krs", "hello");
    const { result } = setup({ fs });

    await act(async () => {
      await result.current.renameItem("/project/src", "lib", "directory");
    });

    expect(await fs.exists("/project/src")).toBe(false);
    expect(await fs.readFile("/project/lib/a.krs")).toBe("hello");
  });

  it("is a no-op when the new name equals the current name", async () => {
    const fs = await setupFs();
    const onFileRenamed = vi.fn<(o: string, n: string) => void>();
    const { result, reload } = setup({ fs, onFileRenamed });

    await act(async () => {
      await result.current.renameItem("/project/existing.krs", "existing.krs", "file");
    });

    expect(reload).not.toHaveBeenCalled();
    expect(onFileRenamed).not.toHaveBeenCalled();
  });
});

describe("useFileTreeOps.deleteItem", () => {
  it("deletes and fires onFileDeleted when confirmed", async () => {
    const fs = await setupFs();
    const onFileDeleted = vi.fn<(p: string) => void>();
    const { result } = setup({ fs, onFileDeleted, confirm: () => true });

    await act(async () => {
      await result.current.deleteItem("/project/existing.krs");
    });

    expect(await fs.exists("/project/existing.krs")).toBe(false);
    expect(onFileDeleted).toHaveBeenCalledWith("/project/existing.krs");
  });

  it("skips deletion when the confirm hook returns false", async () => {
    const fs = await setupFs();
    const onFileDeleted = vi.fn<(p: string) => void>();
    const { result, reload } = setup({ fs, onFileDeleted, confirm: () => false });

    await act(async () => {
      await result.current.deleteItem("/project/existing.krs");
    });

    expect(await fs.exists("/project/existing.krs")).toBe(true);
    expect(reload).not.toHaveBeenCalled();
    expect(onFileDeleted).not.toHaveBeenCalled();
  });
});
