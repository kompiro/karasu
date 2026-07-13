import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { NodeFileSystemProvider } from "./node-fs.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "karasu-node-fs-test-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("NodeFileSystemProvider", () => {
  it("reads and writes files, and reports existence", async () => {
    const fs = new NodeFileSystemProvider();
    const p = join(tmpDir, "a.txt");
    await fs.writeFile(p, "hello");
    expect(await fs.readFile(p)).toBe("hello");
    expect(await fs.exists(p)).toBe(true);
    expect(await fs.exists(join(tmpDir, "missing.txt"))).toBe(false);
  });

  it("lists directory entries with kind", async () => {
    const fs = new NodeFileSystemProvider();
    await writeFile(join(tmpDir, "file.krs"), "");
    const entries = await fs.readDir(tmpDir);
    const file = entries.find((e) => e.name === "file.krs");
    expect(file?.kind).toBe("file");
  });

  it("throws on unsupported mutations", async () => {
    const fs = new NodeFileSystemProvider();
    await expect(fs.delete()).rejects.toThrow("delete not supported");
    await expect(fs.mkdir()).rejects.toThrow("mkdir not supported");
  });
});
