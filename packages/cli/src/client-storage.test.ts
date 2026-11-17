// `karasu coverage` / `karasu matrix` on client storages (#3794): a usecase's
// `resource <ClientId>.<Id>` reaches the storage a client declares with that
// id, top-level clients included.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { coverage } from "./coverage.js";
import { matrix } from "./matrix.js";

let tmpDir: string;
let krsPath: string;
let stdoutSpy: ReturnType<typeof vi.spyOn>;
let exitSpy: ReturnType<typeof vi.spyOn>;

// The client is top-level, outside every system: it reaches the commands only
// through the compile result's model-wide target index.
const KRS = `
client WebApp [web] {
  resource sessionStorage ApiKey "karasu.ai.anthropic.apiKey"
  resource localStorage Theme "karasu-theme"
  resource opfs "/meta/projects.json"
}
system S {
  service App {
    domain Chat {
      usecase SaveApiKey { resource WebApp.ApiKey { operations create, update } }
    }
  }
}
`;

const out = () => stdoutSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("");

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "karasu-client-storage-test-"));
  krsPath = join(tmpDir, "index.krs");
  await writeFile(krsPath, KRS, "utf-8");
  stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("client storages in the CLI (#3794)", () => {
  it("coverage prints a client storage table, though the model declares no infra", async () => {
    await coverage(krsPath, {});
    expect(out()).toContain("| client | storages | referenced | unreferenced | unidentified |");
    expect(out()).toContain("| WebApp | 2 | 1 | Theme | /meta/projects.json (opfs) |");
    expect(out()).not.toContain("| infra | kind |");
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("coverage --format json carries clientStores", async () => {
    await coverage(krsPath, { format: "json" });
    const report = JSON.parse(out());
    expect(report.clientStores).toEqual([
      {
        clientId: "WebApp",
        identified: ["ApiKey", "Theme"],
        referenced: ["ApiKey"],
        unreferenced: ["Theme"],
        unidentified: ["/meta/projects.json (opfs)"],
      },
    ]);
  });

  it("matrix labels the client storage columns and fills the cell", async () => {
    await matrix(krsPath, {});
    const header = out().split("\n")[0];
    expect(header).toContain("karasu.ai.anthropic.apiKey (sessionStorage)");
    expect(header).toContain("karasu-theme (localStorage)");
    const row = out()
      .split("\n")
      .find((l: string) => l.startsWith("| SaveApiKey"));
    expect(row).toContain("CU");
    expect(exitSpy).not.toHaveBeenCalled();
  });
});
