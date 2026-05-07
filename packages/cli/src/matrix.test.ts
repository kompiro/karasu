import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { matrix } from "./matrix.js";

let tmpDir: string;
let krsPath: string;
let stdoutSpy: ReturnType<typeof vi.spyOn>;
let exitSpy: ReturnType<typeof vi.spyOn>;

const KRS = `
system EC {
  database OrderDB {
    table OrderTable { label "Order table" }
  }
  service Svc {
    domain D {
      usecase PlaceOrder { resource OrderDB.OrderTable { operations create, read } }
      usecase Search { resource OrderDB.OrderTable { operations read } }
    }
  }
}
`;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "karasu-matrix-test-"));
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

describe("matrix CLI", () => {
  it("writes markdown to stdout by default", async () => {
    await matrix(krsPath, {});
    const out = stdoutSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("");
    expect(out).toContain("| usecase \\ resource | Order table | ΣC | ΣR | ΣU | ΣD |");
    expect(out).toContain("| PlaceOrder | CR | 1 | 1 | 0 | 0 |");
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("writes csv to file when --format csv -o is given", async () => {
    const outPath = join(tmpDir, "matrix.csv");
    await matrix(krsPath, { format: "csv", output: outPath });
    const content = await readFile(outPath, "utf-8");
    expect(content).toContain("usecase,service,Order table,ΣC,ΣR,ΣU,ΣD");
  });

  it("writes svg to file when --format svg is given", async () => {
    const outPath = join(tmpDir, "matrix.svg");
    await matrix(krsPath, { format: "svg", output: outPath });
    const content = await readFile(outPath, "utf-8");
    expect(content.startsWith("<svg")).toBe(true);
    expect(content).toContain("Order table");
  });

  it("rejects unknown --format", async () => {
    await matrix(krsPath, { format: "xml" as never });
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("filters rows by --service", async () => {
    await matrix(krsPath, { service: ["Other"] });
    const out = stdoutSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("");
    expect(out).not.toContain("PlaceOrder");
  });

  it("--no-totals hides ΣC headers", async () => {
    await matrix(krsPath, { noTotals: true });
    const out = stdoutSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("");
    expect(out).not.toContain("ΣC");
  });

  it("picks up top-level (unassigned) blocks emitted by `karasu translate`", async () => {
    // Mirrors `karasu translate --from db ... --emit-bindings` output: top-level
    // `database` and `service` with no enclosing `system { ... }`. compileProject
    // now wraps these via withUnassignedSystem so matrix is no longer empty.
    const orphanKrs = `
database OrderDB {
  table OrdersTable { label "orders" }
}

service OrderDBService {
  usecase ManageOrders {
    resource OrderDB.OrdersTable {
      operations select:read, insert:create, update, delete
    }
  }
}
`;
    await writeFile(krsPath, orphanKrs, "utf-8");
    await matrix(krsPath, { service: ["OrderDBService"] });
    const out = stdoutSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("");
    expect(out).toContain("ManageOrders");
    // Column header uses the resource label ("orders"), not the id, but the
    // CRUD letters confirm the cell resolved correctly with no `?` suffix.
    expect(out).toContain("orders");
    expect(out).toContain("CRUD");
  });
});
