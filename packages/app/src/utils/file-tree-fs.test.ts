import { describe, it, expect } from "vitest";
import { InMemoryFileSystemProvider } from "@karasu-tools/core";
import { loadDir, copyDirRecursive } from "./file-tree-fs.js";

async function setupFs() {
  const fs = new InMemoryFileSystemProvider();
  await fs.mkdir("/project");
  await fs.writeFile("/project/index.krs", "system A {}");
  await fs.mkdir("/project/sub");
  await fs.writeFile("/project/sub/b.krs", "system B {}");
  return fs;
}

describe("loadDir", () => {
  it("returns one collapsed node per entry", async () => {
    const fs = await setupFs();
    const nodes = await loadDir("/project", fs);
    const sorted = [...nodes].sort((a, b) => a.name.localeCompare(b.name));
    expect(sorted).toEqual([
      { name: "index.krs", path: "/project/index.krs", kind: "file", expanded: false },
      { name: "sub", path: "/project/sub", kind: "directory", expanded: false },
    ]);
  });

  it("returns [] on read error (e.g. missing path)", async () => {
    const fs = new InMemoryFileSystemProvider();
    const nodes = await loadDir("/nope", fs);
    expect(nodes).toEqual([]);
  });
});

describe("copyDirRecursive", () => {
  it("copies files and nested directories to the destination", async () => {
    const fs = await setupFs();
    await copyDirRecursive(fs, "/project", "/copy");

    expect(await fs.readFile("/copy/index.krs")).toBe("system A {}");
    expect(await fs.readFile("/copy/sub/b.krs")).toBe("system B {}");
  });

  it("preserves the source tree", async () => {
    const fs = await setupFs();
    await copyDirRecursive(fs, "/project", "/copy");

    expect(await fs.readFile("/project/index.krs")).toBe("system A {}");
    expect(await fs.readFile("/project/sub/b.krs")).toBe("system B {}");
  });
});
