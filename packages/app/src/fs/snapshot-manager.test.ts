import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryFileSystemProvider } from "@karasu-tools/core";
import { SnapshotManager, __testing } from "./snapshot-manager";

describe("SnapshotManager", () => {
  let fs: InMemoryFileSystemProvider;
  let sm: SnapshotManager;
  const projectRoot = "/projects/p1";

  beforeEach(() => {
    fs = new InMemoryFileSystemProvider();
    sm = new SnapshotManager(fs, projectRoot);
  });

  describe("capture", () => {
    it("creates a snapshot with content and index entry", async () => {
      const record = await sm.capture("index.krs", "system A {}", {
        trigger: "manual",
        label: "v1",
      });

      expect(record).not.toBeNull();
      expect(record!.trigger).toBe("manual");
      expect(record!.label).toBe("v1");
      expect(record!.filePath).toBe("index.krs");
      expect(record!.sizeBytes).toBe("system A {}".length);

      const stored = await fs.readFile(`${projectRoot}/.snapshots/index.krs/${record!.id}.krs`);
      expect(stored).toBe("system A {}");
    });

    it("lists snapshots newest first", async () => {
      const first = await sm.capture("index.krs", "v1", { trigger: "manual" });
      await new Promise((r) => setTimeout(r, 5));
      const second = await sm.capture("index.krs", "v2", { trigger: "manual" });

      const list = await sm.list("index.krs");
      expect(list.map((r) => r.id)).toEqual([second!.id, first!.id]);
    });

    it("skips auto snapshot when content matches the most recent record", async () => {
      await sm.capture("index.krs", "same", { trigger: "auto" });
      const second = await sm.capture("index.krs", "same", { trigger: "auto" });

      expect(second).toBeNull();
      expect((await sm.list("index.krs")).length).toBe(1);
    });

    it("does not skip manual snapshot even when content is identical", async () => {
      await sm.capture("index.krs", "same", { trigger: "manual" });
      const second = await sm.capture("index.krs", "same", { trigger: "manual" });

      expect(second).not.toBeNull();
      expect((await sm.list("index.krs")).length).toBe(2);
    });

    it("keeps snapshots isolated per file", async () => {
      await sm.capture("index.krs", "a", { trigger: "manual" });
      await sm.capture("other.krs", "b", { trigger: "manual" });

      expect((await sm.list("index.krs")).length).toBe(1);
      expect((await sm.list("other.krs")).length).toBe(1);
    });
  });

  describe("read", () => {
    it("returns stored content for a snapshot", async () => {
      const r = await sm.capture("index.krs", "hello", { trigger: "manual" });
      const content = await sm.read("index.krs", r!.id);
      expect(content).toBe("hello");
    });
  });

  describe("delete", () => {
    it("removes snapshot content and index entry", async () => {
      const r = await sm.capture("index.krs", "x", { trigger: "manual" });
      await sm.delete("index.krs", r!.id);

      expect((await sm.list("index.krs")).length).toBe(0);
      expect(await fs.exists(`${projectRoot}/.snapshots/index.krs/${r!.id}.krs`)).toBe(false);
    });
  });

  describe("gc", () => {
    it("drops the oldest auto snapshots once cap is exceeded", async () => {
      const cap = __testing.AUTO_RETENTION_CAP;
      const ids: string[] = [];
      for (let i = 0; i < cap + 3; i++) {
        const r = await sm.capture("index.krs", `v${i}`, { trigger: "auto" });
        ids.push(r!.id);
        await new Promise((res) => setTimeout(res, 2));
      }

      const list = await sm.list("index.krs");
      expect(list.length).toBe(cap);
      const remaining = new Set(list.map((r) => r.id));
      expect(remaining.has(ids[0])).toBe(false);
      expect(remaining.has(ids[1])).toBe(false);
      expect(remaining.has(ids[2])).toBe(false);
      expect(remaining.has(ids[ids.length - 1])).toBe(true);
    });

    it("never drops manual snapshots even beyond cap", async () => {
      const cap = __testing.AUTO_RETENTION_CAP;
      const manual = await sm.capture("index.krs", "keep-me", {
        trigger: "manual",
        label: "important",
      });
      for (let i = 0; i < cap + 5; i++) {
        await sm.capture("index.krs", `v${i}`, { trigger: "auto" });
        await new Promise((res) => setTimeout(res, 2));
      }

      const list = await sm.list("index.krs");
      const hasManual = list.some((r) => r.id === manual!.id);
      expect(hasManual).toBe(true);
      const autoCount = list.filter((r) => r.trigger === "auto").length;
      expect(autoCount).toBe(cap);
    });
  });

  describe("index resilience", () => {
    it("returns empty list when index is missing", async () => {
      expect(await sm.list("ghost.krs")).toEqual([]);
    });

    it("ignores corrupt index", async () => {
      await fs.mkdir(`${projectRoot}/.snapshots/index.krs`);
      await fs.writeFile(`${projectRoot}/.snapshots/index.krs/index.json`, "not-json");
      expect(await sm.list("index.krs")).toEqual([]);
    });
  });
});
