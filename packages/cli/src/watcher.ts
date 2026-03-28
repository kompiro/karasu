import { watch } from "chokidar";
import type { ServerResponse } from "node:http";

export type SseClient = ServerResponse;

export class FileWatcher {
  private clients: Set<SseClient> = new Set();

  constructor(private dir: string) {}

  start(): void {
    const watcher = watch(`${this.dir}/**/*.krs`, {
      ignoreInitial: true,
      persistent: true,
    });

    watcher.on("change", (filePath: string) => {
      const name = this.pathToName(filePath);
      this.broadcast({ file: name });
    });

    watcher.on("add", (filePath: string) => {
      const name = this.pathToName(filePath);
      this.broadcast({ file: name, event: "add" });
    });

    watcher.on("unlink", (filePath: string) => {
      const name = this.pathToName(filePath);
      this.broadcast({ file: name, event: "unlink" });
    });
  }

  addClient(client: SseClient): void {
    this.clients.add(client);
    client.on("close", () => {
      this.clients.delete(client);
    });
  }

  private broadcast(data: { file: string; event?: string }): void {
    const payload = `event: change\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.clients) {
      client.write(payload);
    }
  }

  private pathToName(filePath: string): string {
    const rel = filePath.startsWith(this.dir)
      ? filePath.slice(this.dir.length).replace(/^\//, "")
      : filePath;
    return rel.replace(/\.krs$/, "");
  }
}
