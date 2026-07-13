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
});
