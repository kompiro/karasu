import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryFileSystemProvider } from "@karasu-tools/core";
import { SnapshotManager } from "./snapshot-manager";
import { resolveCompareSource, compareSourceKey } from "./compare-source";

describe("compareSourceKey", () => {
  it("returns distinct keys for file vs snapshot sources", () => {
    expect(compareSourceKey(null)).toBe("");
    expect(compareSourceKey({ kind: "file", path: "/a.krs" })).toBe("file:/a.krs");
    expect(compareSourceKey({ kind: "snapshot", filePath: "index.krs", snapshotId: "abc" })).toBe(
      "snap:index.krs:abc",
    );
  });
});

describe("resolveCompareSource", () => {
  const projectRoot = "/projects/p1";
  let fs: InMemoryFileSystemProvider;
  let sm: SnapshotManager;

  beforeEach(async () => {
    fs = new InMemoryFileSystemProvider();
    sm = new SnapshotManager(fs, projectRoot);
    await fs.mkdir(projectRoot);
  });

  it("passes through file sources", async () => {
    const { entryPath, fs: outFs } = await resolveCompareSource(
      { kind: "file", path: `${projectRoot}/other.krs` },
      fs,
      sm,
      projectRoot,
    );
    expect(entryPath).toBe(`${projectRoot}/other.krs`);
    expect(outFs).toBe(fs);
  });

  it("returns snapshot content when reading the entry path on the overlay", async () => {
    const rec = await sm.capture("index.krs", "system Before {}", { trigger: "manual" });

    const { entryPath, fs: overlay } = await resolveCompareSource(
      { kind: "snapshot", filePath: "index.krs", snapshotId: rec!.id },
      fs,
      sm,
      projectRoot,
    );

    expect(entryPath).toBe(`/.snapshot-view/${rec!.id}/index.krs`);
    expect(await overlay.readFile(entryPath)).toBe("system Before {}");
  });

  it("falls back to live workspace for imports under the virtual root", async () => {
    await fs.writeFile(`${projectRoot}/lib.krs`, "service Live {}");
    const rec = await sm.capture("index.krs", "system Before {}", { trigger: "manual" });

    const { fs: overlay } = await resolveCompareSource(
      { kind: "snapshot", filePath: "index.krs", snapshotId: rec!.id },
      fs,
      sm,
      projectRoot,
    );

    // Relative import like "lib.krs" becomes /.snapshot-view/<id>/lib.krs; overlay should
    // rewrite to the live workspace path.
    const importPath = `/.snapshot-view/${rec!.id}/lib.krs`;
    expect(await overlay.readFile(importPath)).toBe("service Live {}");
    expect(await overlay.exists(importPath)).toBe(true);
  });

  it("passes through reads outside the virtual root to the base fs", async () => {
    await fs.writeFile(`${projectRoot}/index.krs`, "system Live {}");
    const rec = await sm.capture("index.krs", "system Before {}", { trigger: "manual" });

    const { fs: overlay } = await resolveCompareSource(
      { kind: "snapshot", filePath: "index.krs", snapshotId: rec!.id },
      fs,
      sm,
      projectRoot,
    );

    expect(await overlay.readFile(`${projectRoot}/index.krs`)).toBe("system Live {}");
  });
});
