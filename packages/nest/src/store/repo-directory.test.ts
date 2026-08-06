import { describe, expect, it } from "vitest";
import { MemoryKV } from "../testing/memory-kv.js";
import { RepoDirectory } from "./repo-directory.js";

const pointer = { installationId: "42", sha: "a".repeat(40), generatedAt: "2026-08-02T00:00:00Z" };

describe("RepoDirectory", () => {
  it("round-trips a pointer", async () => {
    const directory = new RepoDirectory(new MemoryKV());
    await directory.publish("kompiro", "karasu", pointer, 3600);
    expect(await directory.get("kompiro", "karasu")).toEqual(pointer);
  });

  it("keys case-insensitively, like GitHub", async () => {
    const directory = new RepoDirectory(new MemoryKV());
    await directory.publish("Kompiro", "Karasu", pointer, 3600);
    expect(await directory.get("kompiro", "karasu")).toEqual(pointer);
  });

  it("keeps repos with a shared name prefix apart", async () => {
    const kv = new MemoryKV();
    const directory = new RepoDirectory(kv);
    await directory.publish("kompiro", "kara", pointer, 3600);
    await directory.publish("kompiro", "karasu", { ...pointer, installationId: "43" }, 3600);
    expect((await directory.get("kompiro", "kara"))?.installationId).toBe("42");
  });

  it("reads an unroutable name as absent rather than throwing", async () => {
    // The route decides 400 vs 404; the directory should not force that
    // decision by throwing from a lookup.
    const directory = new RepoDirectory(new MemoryKV());
    expect(await directory.get("a/b", "c")).toBeUndefined();
    expect(await directory.get("", "c")).toBeUndefined();
  });

  it("expires with the document it points at", async () => {
    const kv = new MemoryKV();
    const directory = new RepoDirectory(kv);
    await directory.publish("kompiro", "karasu", pointer, 60);
    kv.advance(61);
    expect(await directory.get("kompiro", "karasu")).toBeUndefined();
  });

  it("reads a corrupt or incomplete value as absent", async () => {
    const kv = new MemoryKV();
    const directory = new RepoDirectory(kv);
    await kv.put("idx/v1/kompiro/karasu", "not json");
    expect(await directory.get("kompiro", "karasu")).toBeUndefined();
    await kv.put("idx/v1/kompiro/karasu", JSON.stringify({ installationId: 42 }));
    expect(await directory.get("kompiro", "karasu")).toBeUndefined();
  });

  describe("unpublishOwnedBy", () => {
    it("removes the entry when the installation matches", async () => {
      const directory = new RepoDirectory(new MemoryKV());
      await directory.publish("kompiro", "karasu", pointer, 3600);
      expect(await directory.unpublishOwnedBy("kompiro", "karasu", "42")).toBe(true);
      expect(await directory.get("kompiro", "karasu")).toBeUndefined();
    });

    it("leaves an entry a different installation now owns", async () => {
      const directory = new RepoDirectory(new MemoryKV());
      await directory.publish("kompiro", "karasu", { ...pointer, installationId: "43" }, 3600);
      expect(await directory.unpublishOwnedBy("kompiro", "karasu", "42")).toBe(false);
      expect(await directory.get("kompiro", "karasu")).toBeDefined();
    });

    it("reports false for an entry that is not there", async () => {
      const directory = new RepoDirectory(new MemoryKV());
      expect(await directory.unpublishOwnedBy("kompiro", "karasu", "42")).toBe(false);
    });
  });
});
