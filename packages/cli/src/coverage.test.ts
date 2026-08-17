import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { coverage } from "./coverage.js";

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
    domain Order {
      usecase PlaceOrder { resource OrderDB.OrderTable { operations create, read } }
      usecase Cancel { resource OrderDB.OrderTable { operations update, delete } }
      entity OrderEntity
    }
    domain Thin {
      usecase Noop
    }
  }
}
`;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "karasu-coverage-test-"));
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

describe("coverage CLI", () => {
  it("writes a markdown density table by default", async () => {
    await coverage(krsPath, {});
    const out = stdoutSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("");
    expect(out).toContain(
      "| domain | service | usecases | entities | resources | edges | score | thin |",
    );
    expect(out).toContain("| Order | Svc |");
    expect(out).toContain("| Thin | Svc |");
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("flags the thin domain in markdown", async () => {
    await coverage(krsPath, {});
    const out = stdoutSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("");
    const thinRow = out.split("\n").find((l: string) => l.startsWith("| Thin "))!;
    expect(thinRow).toContain("⚠️");
  });

  it("emits machine-readable json with --format json", async () => {
    const outPath = join(tmpDir, "cov.json");
    await coverage(krsPath, { format: "json", output: outPath });
    const parsed = JSON.parse(await readFile(outPath, "utf-8"));
    expect(parsed.domains).toHaveLength(2);
    const order = parsed.domains.find((d: { domainId: string }) => d.domainId === "Order");
    expect(order.usecases).toBe(2);
    expect(order.resourceRefs).toBe(1);
  });

  it("rejects unknown --format", async () => {
    await coverage(krsPath, { format: "xml" as never });
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("rejects a non-numeric --threshold", async () => {
    await coverage(krsPath, { threshold: "abc" });
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("exits 1 for a missing file", async () => {
    await coverage(join(tmpDir, "nope.krs"), {});
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("exits 1 when the source has compile errors", async () => {
    const bad = join(tmpDir, "bad.krs");
    await writeFile(
      bad,
      `system EC { service S { domain D { usecase U { unknownprop } } } }`,
      "utf-8",
    );
    await coverage(bad, {});
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("writes markdown to a file with -o", async () => {
    const outPath = join(tmpDir, "cov.md");
    await coverage(krsPath, { output: outPath });
    const content = await readFile(outPath, "utf-8");
    expect(content).toContain("| domain | service |");
  });

  // Physical-layer recovery (#2078).
  it("adds a physical table naming the unrecovered leaves", async () => {
    await coverage(krsPath, {});
    const out = stdoutSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("");
    expect(out).toContain(
      "| infra | kind | leaves | mapped | referenced | unmapped-but-referenced | unreferenced |",
    );
    const row = out.split("\n").find((l: string) => l.startsWith("| OrderDB "))!;
    // OrderEntity carries no `table` line, so the referenced table is unmapped.
    expect(row).toContain("| database | 1 | 0 | 1 | OrderTable | — |");
    expect(out).toContain("1 entity(ies) with no table mapping: OrderEntity (Order)");
  });

  it("omits the physical section for a model with no infra declarations", async () => {
    // An empty physical table would read as "measured, found nothing" when the
    // truth is that there is no physical layer to measure.
    const logical = join(tmpDir, "logical.krs");
    await writeFile(logical, `system S { service Svc { domain D { usecase U } } }`, "utf-8");
    await coverage(logical, {});
    const out = stdoutSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("");
    expect(out).toContain("| domain | service |");
    expect(out).not.toContain("| infra | kind |");
    expect(out).not.toContain("no table mapping");
  });

  it("carries the physical section through --format json", async () => {
    await coverage(krsPath, { format: "json" });
    const out = stdoutSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("");
    const parsed = JSON.parse(out);
    expect(parsed.physical.infra).toEqual([
      {
        infraId: "OrderDB",
        kind: "database",
        leaves: 1,
        mappedByEntity: 0,
        referencedByResource: 1,
        unmappedButReferenced: ["OrderTable"],
        unreferenced: [],
      },
    ]);
    expect(parsed.physical.tablelessEntities).toEqual([
      { entityId: "OrderEntity", domainId: "Order" },
    ]);
    // The repair loop reads these two lists to decide what to re-dive, so the
    // domain half of the report must keep its existing shape.
    expect(parsed.domains).toHaveLength(2);
    expect(parsed.threshold).toBeGreaterThan(0);
  });
});
