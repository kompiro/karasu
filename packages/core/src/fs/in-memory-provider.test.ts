import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryFileSystemProvider } from "./in-memory-provider";

describe("InMemoryFileSystemProvider", () => {
  let fs: InMemoryFileSystemProvider;

  beforeEach(() => {
    fs = new InMemoryFileSystemProvider();
  });

  describe("readFile / writeFile", () => {
    it("writes and reads a file", async () => {
      await fs.writeFile("/hello.txt", "world");
      expect(await fs.readFile("/hello.txt")).toBe("world");
    });

    it("overwrites existing file", async () => {
      await fs.writeFile("/a.txt", "first");
      await fs.writeFile("/a.txt", "second");
      expect(await fs.readFile("/a.txt")).toBe("second");
    });

    it("throws on reading non-existent file", async () => {
      await expect(fs.readFile("/missing.txt")).rejects.toThrow("ENOENT");
    });

    it("auto-creates parent directories on write", async () => {
      await fs.writeFile("/a/b/c.txt", "content");
      expect(await fs.exists("/a")).toBe(true);
      expect(await fs.exists("/a/b")).toBe(true);
    });
  });

  describe("readDir", () => {
    it("lists files in directory", async () => {
      await fs.writeFile("/dir/a.krs", "a");
      await fs.writeFile("/dir/b.krs", "b");
      const entries = await fs.readDir("/dir");
      expect(entries).toEqual([
        { name: "a.krs", kind: "file" },
        { name: "b.krs", kind: "file" },
      ]);
    });

    it("distinguishes files and directories", async () => {
      await fs.writeFile("/root/file.txt", "content");
      await fs.writeFile("/root/sub/nested.txt", "nested");
      const entries = await fs.readDir("/root");
      expect(entries).toEqual([
        { name: "file.txt", kind: "file" },
        { name: "sub", kind: "directory" },
      ]);
    });

    it("lists root directory", async () => {
      await fs.writeFile("/a.txt", "a");
      await fs.mkdir("/emptydir");
      const entries = await fs.readDir("/");
      expect(entries).toEqual([
        { name: "a.txt", kind: "file" },
        { name: "emptydir", kind: "directory" },
      ]);
    });

    it("includes empty directories", async () => {
      await fs.mkdir("/parent/empty");
      const entries = await fs.readDir("/parent");
      expect(entries).toEqual([{ name: "empty", kind: "directory" }]);
    });

    it("throws on non-existent directory", async () => {
      await expect(fs.readDir("/nonexistent")).rejects.toThrow("ENOENT");
    });
  });

  describe("exists", () => {
    it("returns true for existing file", async () => {
      await fs.writeFile("/file.txt", "content");
      expect(await fs.exists("/file.txt")).toBe(true);
    });

    it("returns true for existing directory", async () => {
      await fs.mkdir("/dir");
      expect(await fs.exists("/dir")).toBe(true);
    });

    it("returns false for non-existent path", async () => {
      expect(await fs.exists("/nothing")).toBe(false);
    });

    it("returns true for root", async () => {
      expect(await fs.exists("/")).toBe(true);
    });
  });

  describe("delete", () => {
    it("deletes a file", async () => {
      await fs.writeFile("/file.txt", "content");
      await fs.delete("/file.txt");
      expect(await fs.exists("/file.txt")).toBe(false);
    });

    it("deletes a directory and its contents", async () => {
      await fs.writeFile("/dir/a.txt", "a");
      await fs.writeFile("/dir/sub/b.txt", "b");
      await fs.delete("/dir");
      expect(await fs.exists("/dir")).toBe(false);
      expect(await fs.exists("/dir/a.txt")).toBe(false);
      expect(await fs.exists("/dir/sub/b.txt")).toBe(false);
    });

    it("throws on non-existent path", async () => {
      await expect(fs.delete("/missing")).rejects.toThrow("ENOENT");
    });
  });

  describe("mkdir", () => {
    it("creates a directory", async () => {
      await fs.mkdir("/newdir");
      expect(await fs.exists("/newdir")).toBe(true);
    });

    it("creates nested directories", async () => {
      await fs.mkdir("/a/b/c");
      expect(await fs.exists("/a")).toBe(true);
      expect(await fs.exists("/a/b")).toBe(true);
      expect(await fs.exists("/a/b/c")).toBe(true);
    });

    it("is idempotent", async () => {
      await fs.mkdir("/dir");
      await fs.mkdir("/dir");
      expect(await fs.exists("/dir")).toBe(true);
    });
  });
});
