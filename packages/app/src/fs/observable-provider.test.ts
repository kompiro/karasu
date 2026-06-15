import { describe, expect, it, vi } from "vitest";
import { InMemoryFileSystemProvider, type FsEvent } from "@karasu-tools/core";
import { ObservableFileSystemProvider } from "./observable-provider.js";

function setup() {
  const delegate = new InMemoryFileSystemProvider();
  const fs = new ObservableFileSystemProvider(delegate);
  const events: FsEvent[] = [];
  const dispose = fs.watch("/", (e) => events.push(e));
  return { delegate, fs, events, dispose };
}

describe("ObservableFileSystemProvider", () => {
  describe("writeFile", () => {
    it("emits `create` when the file does not exist yet", async () => {
      const { fs, events } = setup();
      await fs.writeFile("/a.krs", "hello");
      expect(events).toEqual([{ type: "create", path: "/a.krs" }]);
    });

    it("emits `change` when the file already exists", async () => {
      const { fs, events } = setup();
      await fs.writeFile("/a.krs", "first");
      events.length = 0;
      await fs.writeFile("/a.krs", "second");
      expect(events).toEqual([{ type: "change", path: "/a.krs" }]);
    });

    it("normalizes the emitted path", async () => {
      const { fs, events } = setup();
      await fs.writeFile("/dir/./nested/../a.krs", "x");
      expect(events[0].path).toBe("/dir/a.krs");
    });
  });

  describe("delete and mkdir", () => {
    it("emits `delete` after a successful delete", async () => {
      const { fs, events } = setup();
      await fs.writeFile("/a.krs", "x");
      events.length = 0;
      await fs.delete("/a.krs");
      expect(events).toEqual([{ type: "delete", path: "/a.krs" }]);
    });

    it("emits `create` for mkdir", async () => {
      const { fs, events } = setup();
      await fs.mkdir("/sub");
      expect(events).toEqual([{ type: "create", path: "/sub" }]);
    });
  });

  describe("update (serialized read-modify-write)", () => {
    it("reads current content, applies transform, and writes it back", async () => {
      const { fs } = setup();
      await fs.writeFile("/a.krs.style", "edge { color: red; }\n");
      await fs.update("/a.krs.style", (current) => current + "service { shape: box; }\n");
      expect(await fs.readFile("/a.krs.style")).toBe(
        "edge { color: red; }\nservice { shape: box; }\n",
      );
    });

    it("treats a missing file as empty and emits `create`", async () => {
      const { fs, events } = setup();
      await fs.update("/new.krs.style", (current) => current + "edge { color: red; }\n");
      expect(await fs.readFile("/new.krs.style")).toBe("edge { color: red; }\n");
      expect(events).toEqual([{ type: "create", path: "/new.krs.style" }]);
    });

    // #1563 (TPL-20260613-02): a read-modify-write must be atomic per path so a
    // concurrent writer can't clobber it. Two appends fired together must BOTH
    // land — without serialization they'd both read the same base and the later
    // write would drop the earlier append (a lost update).
    it("serializes concurrent updates to the same path (no lost update)", async () => {
      const { fs } = setup();
      await fs.writeFile("/a.krs.style", "");
      await Promise.all([
        fs.update("/a.krs.style", (c) => c + "X\n"),
        fs.update("/a.krs.style", (c) => c + "Y\n"),
      ]);
      const result = await fs.readFile("/a.krs.style");
      expect(result).toContain("X\n");
      expect(result).toContain("Y\n");
      expect(result.length).toBe(4); // both 2-char lines present; neither clobbered
    });

    // A plain writeFile fired alongside an update must not interleave between
    // the update's read and write: the editor's auto-save (writeFile) and the
    // GUI append (update) on the same open .krs.style file (#1563).
    it("serializes a writeFile against an update on the same path", async () => {
      const { fs } = setup();
      await fs.writeFile("/a.krs.style", "base\n");
      await Promise.all([
        fs.writeFile("/a.krs.style", "editor-save\n"),
        fs.update("/a.krs.style", (c) => c + "appended\n"),
      ]);
      const result = await fs.readFile("/a.krs.style");
      // Either order is a valid serial outcome; the buggy lost-update result
      // ("appended\n" built on the pre-save base, dropping the editor save) must
      // NOT occur.
      expect(["editor-save\nappended\n", "editor-save\n"]).toContain(result);
    });

    it("does not serialize updates to different paths", async () => {
      const { fs } = setup();
      await Promise.all([
        fs.update("/a.krs.style", () => "a\n"),
        fs.update("/b.krs.style", () => "b\n"),
      ]);
      expect(await fs.readFile("/a.krs.style")).toBe("a\n");
      expect(await fs.readFile("/b.krs.style")).toBe("b\n");
    });
  });

  describe("read ops pass through without emitting", () => {
    it("readFile / readDir / exists are silent", async () => {
      const { fs, events } = setup();
      await fs.writeFile("/a.krs", "x");
      events.length = 0;
      await fs.readFile("/a.krs");
      await fs.readDir("/");
      await fs.exists("/a.krs");
      expect(events).toEqual([]);
    });
  });

  describe("watch", () => {
    it("filters events by rootPath prefix", async () => {
      const delegate = new InMemoryFileSystemProvider();
      const fs = new ObservableFileSystemProvider(delegate);
      const projectEvents: FsEvent[] = [];
      const otherEvents: FsEvent[] = [];
      fs.watch("/project", (e) => projectEvents.push(e));
      fs.watch("/other", (e) => otherEvents.push(e));
      await fs.writeFile("/project/a.krs", "x");
      await fs.writeFile("/other/b.krs", "y");
      expect(projectEvents).toHaveLength(1);
      expect(projectEvents[0].path).toBe("/project/a.krs");
      expect(otherEvents).toHaveLength(1);
      expect(otherEvents[0].path).toBe("/other/b.krs");
    });

    it("treats `/` as ancestor of every path", async () => {
      const delegate = new InMemoryFileSystemProvider();
      const fs = new ObservableFileSystemProvider(delegate);
      const events: FsEvent[] = [];
      fs.watch("/", (e) => events.push(e));
      await fs.writeFile("/deeply/nested/a.krs", "x");
      expect(events).toHaveLength(1);
    });

    it("does not fire a sibling subscription for a non-prefix path", async () => {
      const delegate = new InMemoryFileSystemProvider();
      const fs = new ObservableFileSystemProvider(delegate);
      const events: FsEvent[] = [];
      fs.watch("/foo", (e) => events.push(e));
      // /foobar is not a descendant of /foo even though the string prefix matches
      await fs.writeFile("/foobar/a.krs", "x");
      expect(events).toEqual([]);
    });

    it("dispose removes the subscription", async () => {
      const { fs, events, dispose } = setup();
      dispose.dispose();
      await fs.writeFile("/a.krs", "x");
      expect(events).toEqual([]);
    });

    it("supports multiple concurrent subscribers on the same root", async () => {
      const delegate = new InMemoryFileSystemProvider();
      const fs = new ObservableFileSystemProvider(delegate);
      const a = vi.fn<(event: FsEvent) => void>();
      const b = vi.fn<(event: FsEvent) => void>();
      fs.watch("/", a);
      fs.watch("/", b);
      await fs.writeFile("/a.krs", "x");
      expect(a).toHaveBeenCalledTimes(1);
      expect(b).toHaveBeenCalledTimes(1);
    });
  });

  describe("error handling", () => {
    it("does not emit when the delegate write throws", async () => {
      const { events } = setup();
      const failing: typeof InMemoryFileSystemProvider.prototype = Object.assign(
        new InMemoryFileSystemProvider(),
        {
          writeFile: () => Promise.reject(new Error("boom")),
        },
      );
      const fs = new ObservableFileSystemProvider(failing);
      fs.watch("/", (e) => events.push(e));
      await expect(fs.writeFile("/a.krs", "x")).rejects.toThrow("boom");
      expect(events).toEqual([]);
    });

    it("treats an `exists` failure as `create` (does not block the write)", async () => {
      const delegate = new InMemoryFileSystemProvider();
      // Replace exists with a thrower; writeFile must still succeed and emit `create`.
      delegate.exists = () => Promise.reject(new Error("exists failed"));
      const fs = new ObservableFileSystemProvider(delegate);
      const events: FsEvent[] = [];
      fs.watch("/", (e) => events.push(e));
      await fs.writeFile("/a.krs", "x");
      expect(events).toEqual([{ type: "create", path: "/a.krs" }]);
    });
  });
});
