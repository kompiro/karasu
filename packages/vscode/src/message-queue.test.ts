import { describe, expect, it } from "vitest";
import type { HostMessage } from "@karasu-tools/app/vscode-webview-protocol";
import { coalesce } from "./message-queue.js";

const queueOf = (...messages: HostMessage[]) => messages.reduce(coalesce, [] as HostMessage[]);

describe("coalesce — the messages waiting for the webview's ready (#3312)", () => {
  it("keeps one filesChanged, with every path that changed", () => {
    expect(
      queueOf(
        { type: "filesChanged", paths: ["/p/a.krs"] },
        { type: "filesChanged", paths: ["/p/b.krs", "/p/a.krs"] },
      ),
    ).toEqual([{ type: "filesChanged", paths: ["/p/a.krs", "/p/b.krs"] }]);
  });

  it("keeps only the latest entry, theme and highlight", () => {
    expect(
      queueOf(
        { type: "highlight", nodeId: "A" },
        { type: "setTheme", theme: "dark" },
        { type: "highlight", nodeId: "B" },
        { type: "setTheme", theme: "light" },
      ),
    ).toEqual([
      { type: "highlight", nodeId: "B" },
      { type: "setTheme", theme: "light" },
    ]);
  });

  it("drops a pending refresh once a new entry is queued", () => {
    expect(queueOf({ type: "refresh" }, { type: "setEntry", path: "/p/b.krs" })).toEqual([
      { type: "setEntry", path: "/p/b.krs" },
    ]);
  });

  it("stays bounded however many keystrokes arrive before the page loads", () => {
    const keystrokes = Array.from(
      { length: 500 },
      (_, i): HostMessage =>
        ({
          type: i % 2 ? "filesChanged" : "highlight",
          ...(i % 2 ? { paths: ["/p/index.krs"] } : { nodeId: `N${i}` }),
        }) as HostMessage,
    );
    expect(queueOf(...keystrokes)).toHaveLength(2);
  });
});
