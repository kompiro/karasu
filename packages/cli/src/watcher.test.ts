import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import type { ServerResponse } from "node:http";

let mockFsWatcher: EventEmitter;

vi.mock("chokidar", () => ({
  watch: vi.fn<() => EventEmitter>(() => mockFsWatcher),
}));

import { FileWatcher } from "./watcher.js";

function makeMockClient(): { on: ReturnType<typeof vi.fn>; write: ReturnType<typeof vi.fn> } {
  return { on: vi.fn<() => void>(), write: vi.fn<() => void>() };
}

describe("FileWatcher", () => {
  let watcher: FileWatcher;

  beforeEach(() => {
    mockFsWatcher = new EventEmitter();
    watcher = new FileWatcher("/test/dir");
    watcher.start();
  });

  describe("addClient / close", () => {
    it("broadcasts to added client", () => {
      const client = makeMockClient();
      watcher.addClient(client as unknown as ServerResponse);

      mockFsWatcher.emit("change", "/test/dir/index.krs");

      expect(client.write).toHaveBeenCalledOnce();
    });

    it("removes client when close event fires", () => {
      const client = makeMockClient();
      watcher.addClient(client as unknown as ServerResponse);

      // Simulate the response socket closing
      const closeCall = client.on.mock.calls.find((args) => args[0] === "close");
      const closeHandler = closeCall?.[1] as (() => void) | undefined;
      closeHandler?.();

      mockFsWatcher.emit("change", "/test/dir/index.krs");

      expect(client.write).not.toHaveBeenCalled();
    });

    it("registers close listener on the client", () => {
      const client = makeMockClient();
      watcher.addClient(client as unknown as ServerResponse);

      expect(client.on).toHaveBeenCalledWith("close", expect.any(Function));
    });
  });

  describe("change events", () => {
    it("broadcasts SSE payload for changed .krs files", () => {
      const client = makeMockClient();
      watcher.addClient(client as unknown as ServerResponse);

      mockFsWatcher.emit("change", "/test/dir/system.krs");

      const payload = client.write.mock.calls[0][0] as string;
      expect(payload).toContain("event: change");
      expect(payload).toContain('"file":"system"');
    });

    it("ignores non-.krs files on change", () => {
      const client = makeMockClient();
      watcher.addClient(client as unknown as ServerResponse);

      mockFsWatcher.emit("change", "/test/dir/readme.md");

      expect(client.write).not.toHaveBeenCalled();
    });

    it("broadcasts to multiple clients", () => {
      const clientA = makeMockClient();
      const clientB = makeMockClient();
      watcher.addClient(clientA as unknown as ServerResponse);
      watcher.addClient(clientB as unknown as ServerResponse);

      mockFsWatcher.emit("change", "/test/dir/index.krs");

      expect(clientA.write).toHaveBeenCalledOnce();
      expect(clientB.write).toHaveBeenCalledOnce();
    });
  });

  describe("add events", () => {
    it("broadcasts add event for new .krs files", () => {
      const client = makeMockClient();
      watcher.addClient(client as unknown as ServerResponse);

      mockFsWatcher.emit("add", "/test/dir/new.krs");

      const payload = client.write.mock.calls[0][0] as string;
      expect(payload).toContain("event: add");
      expect(payload).toContain('"event":"add"');
      expect(payload).toContain('"file":"new"');
    });

    it("ignores non-.krs files on add", () => {
      const client = makeMockClient();
      watcher.addClient(client as unknown as ServerResponse);

      mockFsWatcher.emit("add", "/test/dir/notes.txt");

      expect(client.write).not.toHaveBeenCalled();
    });
  });

  describe("unlink events", () => {
    it("broadcasts unlink event for deleted .krs files", () => {
      const client = makeMockClient();
      watcher.addClient(client as unknown as ServerResponse);

      mockFsWatcher.emit("unlink", "/test/dir/old.krs");

      const payload = client.write.mock.calls[0][0] as string;
      expect(payload).toContain("event: unlink");
      expect(payload).toContain('"event":"unlink"');
      expect(payload).toContain('"file":"old"');
    });

    it("ignores non-.krs files on unlink", () => {
      const client = makeMockClient();
      watcher.addClient(client as unknown as ServerResponse);

      mockFsWatcher.emit("unlink", "/test/dir/notes.txt");

      expect(client.write).not.toHaveBeenCalled();
    });
  });

  describe("pathToName", () => {
    it("strips dir prefix and .krs extension", () => {
      const client = makeMockClient();
      watcher.addClient(client as unknown as ServerResponse);

      mockFsWatcher.emit("change", "/test/dir/services/api.krs");

      const payload = client.write.mock.calls[0][0] as string;
      expect(payload).toContain('"file":"services/api"');
    });

    it("handles file path without dir prefix", () => {
      const client = makeMockClient();
      watcher.addClient(client as unknown as ServerResponse);

      mockFsWatcher.emit("change", "standalone.krs");

      const payload = client.write.mock.calls[0][0] as string;
      expect(payload).toContain('"file":"standalone"');
    });
  });
});
