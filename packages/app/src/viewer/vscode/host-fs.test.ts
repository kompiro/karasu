import { describe, expect, it } from "vitest";
import { HostFileSystem, HostFsError } from "./host-fs.js";
import type { WebviewMessage } from "./protocol.js";

type FsRequest = Extract<WebviewMessage, { type: "fs" }>;

/** A host FS whose requests are kept so a test can answer them in any order. */
function setup() {
  const requests: FsRequest[] = [];
  const fs = new HostFileSystem((message) => {
    if (message.type === "fs") requests.push(message);
  });
  const answer = (request: FsRequest, value: string | boolean) =>
    fs.handleResult({ type: "fsResult", id: request.id, ok: true, value });
  return { fs, requests, answer };
}

describe("HostFileSystem (#3312)", () => {
  it("asks the host once per path and answers later reads from the cache", async () => {
    const { fs, requests, answer } = setup();
    const first = fs.readFile("/p/index.krs");
    expect(requests).toEqual([
      { type: "fs", id: requests[0].id, op: "readFile", path: "/p/index.krs" },
    ]);
    answer(requests[0], "system A {}");
    expect(await first).toBe("system A {}");
    expect(await fs.readFile("/p/index.krs")).toBe("system A {}");
    expect(requests).toHaveLength(1);
  });

  // The stale-response contract of decision 4 (#2996): a reply to a request
  // made before a change is handed back, but never stored.
  it("does not cache a reply that arrives after filesChanged, and reads the new text next", async () => {
    const { fs, requests, answer } = setup();
    const before = fs.readFile("/p/index.krs");
    fs.invalidate(["/p/index.krs"]);
    answer(requests[0], "old text");
    expect(await before).toBe("old text");

    const after = fs.readFile("/p/index.krs");
    expect(requests).toHaveLength(2);
    answer(requests[1], "new text");
    expect(await after).toBe("new text");
  });

  it("does not cache a reply that arrives after setEntry (reset)", async () => {
    const { fs, requests, answer } = setup();
    const before = fs.exists("/p/a.krs.style");
    fs.reset();
    answer(requests[0], true);
    expect(await before).toBe(true);
    void fs.exists("/p/a.krs.style");
    expect(requests).toHaveLength(2);
  });

  it("forgets only the changed files' text, but every listing and existence answer", async () => {
    const { fs, requests, answer } = setup();
    const reads = [fs.readFile("/p/a.krs"), fs.readFile("/p/b.krs"), fs.exists("/p/c.krs")];
    requests.forEach((r, i) => answer(r, i === 2 ? false : `text ${i}`));
    await Promise.all(reads);

    fs.invalidate(["/p/a.krs"]);
    void fs.readFile("/p/a.krs");
    void fs.readFile("/p/b.krs");
    void fs.exists("/p/c.krs");
    expect(requests.slice(3).map((r) => r.path)).toEqual(["/p/a.krs", "/p/c.krs"]);
  });

  it("rejects with notFound when the host has no such file", async () => {
    const { fs, requests } = setup();
    const read = fs.readFile("/p/missing.krs");
    fs.handleResult({
      type: "fsResult",
      id: requests[0].id,
      ok: false,
      notFound: true,
      error: "no such file",
    });
    await expect(read).rejects.toMatchObject({ name: "HostFsError", notFound: true });
  });

  it("fails what is waiting on dispose, ignores later replies, and asks nothing more", async () => {
    const { fs, requests, answer } = setup();
    const waiting = fs.readFile("/p/index.krs");
    fs.dispose();
    await expect(waiting).rejects.toBeInstanceOf(HostFsError);
    expect(() => answer(requests[0], "late")).not.toThrow();
    await expect(fs.readFile("/p/other.krs")).rejects.toBeInstanceOf(HostFsError);
    expect(requests).toHaveLength(1);
  });

  // A reload of the page must not take the replies the host still owes the
  // previous load as its own (both would otherwise number from 1).
  it("numbers its requests from a random start", () => {
    const starts = Array.from({ length: 4 }, () => {
      const { fs, requests } = setup();
      void fs.readFile("/p/a.krs");
      return requests[0].id;
    });
    expect(new Set(starts).size).toBeGreaterThan(1);
    for (const id of starts) expect(Number.isSafeInteger(id) && id > 0).toBe(true);
  });

  // #3313: a write carries the text the viewer last read, so the host can
  // refuse it when the user has edited the file since.
  it("writes with the last-read text as base, then serves the written text", async () => {
    const { fs, requests, answer } = setup();
    const read = fs.readFile("/p/app.krs.style");
    answer(requests[0], "service {}");
    await read;

    const write = fs.writeFile("/p/app.krs.style", "service {}\nedge#a { direction: down; }");
    expect(requests[1]).toMatchObject({
      type: "fs",
      op: "writeFile",
      path: "/p/app.krs.style",
      content: "service {}\nedge#a { direction: down; }",
      base: "service {}",
    });
    answer(requests[1], true);
    await write;
    expect(await fs.readFile("/p/app.krs.style")).toBe("service {}\nedge#a { direction: down; }");
    expect(requests).toHaveLength(2);
  });

  it("sends no base for a file it never read (a new style sheet)", async () => {
    const { fs, requests, answer } = setup();
    const write = fs.writeFile("/p/new.krs.style", "edge#a { direction: down; }");
    expect(requests[0]).toMatchObject({ op: "writeFile", base: undefined });
    answer(requests[0], true);
    await write;
  });

  it("keeps the cache as it was when the host refuses the write", async () => {
    const { fs, requests, answer } = setup();
    const read = fs.readFile("/p/a.krs");
    answer(requests[0], "before");
    await read;
    const write = fs.writeFile("/p/a.krs", "after");
    fs.handleResult({
      type: "fsResult",
      id: requests[1].id,
      ok: false,
      notFound: false,
      error: "The file changed since it was read.",
    });
    await expect(write).rejects.toBeInstanceOf(HostFsError);
    expect(await fs.readFile("/p/a.krs")).toBe("before");
  });

  it("refuses to delete files or create directories", async () => {
    const { fs, requests } = setup();
    await expect(fs.delete()).rejects.toBeInstanceOf(HostFsError);
    await expect(fs.mkdir()).rejects.toBeInstanceOf(HostFsError);
    expect(requests).toHaveLength(0);
  });
});
