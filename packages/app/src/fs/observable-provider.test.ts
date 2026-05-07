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
