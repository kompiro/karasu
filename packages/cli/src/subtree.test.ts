import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { compileProject, type FileSystemProvider, type DirEntry } from "@karasu-tools/core";
import { readFile, readdir, stat } from "node:fs/promises";
import { subtree } from "./subtree.js";

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
      entity OrderEntity
    }
    domain Catalog {
      usecase Browse
    }
  }
}
`;

// A minimal fs provider so tests can re-compile subtree output for round-trip checks.
class TestFs implements FileSystemProvider {
  async readFile(p: string) {
    return readFile(p, "utf-8");
  }
  async writeFile(p: string, c: string) {
    await writeFile(p, c, "utf-8");
  }
  async readDir(p: string): Promise<DirEntry[]> {
    const entries = await readdir(p, { withFileTypes: true });
    return entries.map((e) => ({
      name: e.name,
      kind: e.isDirectory() ? ("directory" as const) : ("file" as const),
    }));
  }
  async exists(p: string) {
    try {
      await stat(p);
      return true;
    } catch {
      return false;
    }
  }
  async delete() {}
  async mkdir() {}
}

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "karasu-subtree-test-"));
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

function stdout(): string {
  return stdoutSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("");
}

describe("subtree CLI", () => {
  it("emits a domain's interior as a standalone top-level block", async () => {
    await subtree("Order", krsPath, {});
    const out = stdout();
    expect(out).toContain("domain Order");
    expect(out).toContain("usecase PlaceOrder");
    expect(out).not.toContain("domain Catalog"); // sibling pruned
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("round-trips: subtree output re-compiles without errors", async () => {
    const outPath = join(tmpDir, "slice.krs");
    await subtree("Order", krsPath, { output: outPath });
    const result = await compileProject(outPath, new TestFs(), { diagramType: "system" });
    const errors = result.diagnostics.filter((d) => d.severity === "error");
    expect(errors).toEqual([]);
  });

  it("wraps a usecase in its enclosing domain (minimal)", async () => {
    await subtree("PlaceOrder", krsPath, {});
    const out = stdout();
    expect(out).toContain("domain Order");
    expect(out).toContain("usecase PlaceOrder");
    // minimal wrap stops at the domain — no enclosing system/service
    expect(out).not.toContain("system EC");
  });

  it("keeps the system → node chain with --with-ancestors", async () => {
    await subtree("Order", krsPath, { withAncestors: true });
    const out = stdout();
    expect(out).toContain("system EC");
    expect(out).toContain("service Svc");
    expect(out).toContain("domain Order");
  });

  it("exits 1 with a not-found message for an unknown id", async () => {
    await subtree("Nope", krsPath, {});
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("exits 1 when the id is ambiguous across systems", async () => {
    const dup = join(tmpDir, "dup.krs");
    await writeFile(
      dup,
      `
system A { service S { domain Dup { usecase U1 } } }
system B { service T { domain Dup { usecase U2 } } }
`,
      "utf-8",
    );
    await subtree("Dup", dup, {});
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("exits 1 when the source has compile errors", async () => {
    const bad = join(tmpDir, "bad.krs");
    await writeFile(
      bad,
      `system EC { service S { domain D { usecase U { unknownprop } } } }`,
      "utf-8",
    );
    await subtree("D", bad, {});
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("exits 1 for a missing file", async () => {
    await subtree("Order", join(tmpDir, "nope.krs"), {});
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
