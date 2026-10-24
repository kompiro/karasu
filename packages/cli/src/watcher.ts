import { watch } from "chokidar";
import type { ServerResponse } from "node:http";
import { relative, sep } from "node:path";

type SseClient = ServerResponse;

type WatchEvent = "change" | "add" | "unlink";

/**
 * What a watch event says. `path` is the changed file relative to the served
 * directory, extension included, so a `.krs.style` change has a name too
 * (#3258). `file` is the same path without `.krs`, the form `/api/file/:name`
 * takes; it is only there for `.krs` files, as it always was.
 */
interface WatchPayload {
  path: string;
  file?: string;
  event?: WatchEvent;
}

/** The files a preview reads: models, and the style sheets they `@import`. */
function isWatched(filePath: string): boolean {
  return filePath.endsWith(".krs") || filePath.endsWith(".krs.style");
}

export class FileWatcher {
  private clients: Set<SseClient> = new Set();

  constructor(private dir: string) {}

  start(): void {
    const watcher = watch(this.dir, {
      ignoreInitial: true,
      persistent: true,
    });

    for (const event of ["change", "add", "unlink"] as const) {
      watcher.on(event, (filePath: string) => {
        if (!isWatched(filePath)) return;
        this.broadcast(event, this.payload(filePath, event));
      });
    }
  }

  addClient(client: SseClient): void {
    this.clients.add(client);
    client.on("close", () => {
      this.clients.delete(client);
    });
  }

  private broadcast(eventName: WatchEvent, data: WatchPayload): void {
    const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.clients) {
      client.write(payload);
    }
  }

  private payload(filePath: string, event: WatchEvent): WatchPayload {
    const path = this.relativePath(filePath);
    const data: WatchPayload = { path };
    if (path.endsWith(".krs")) data.file = path.replace(/\.krs$/, "");
    // `change` has always gone out without an `event` field.
    if (event !== "change") data.event = event;
    return data;
  }

  private relativePath(filePath: string): string {
    const rel = filePath.startsWith(this.dir) ? relative(this.dir, filePath) : filePath;
    return rel.split(sep).join("/");
  }
}
