import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { teamDependencies } from "./team-dependencies.js";

let tmpDir: string;
let krsPath: string;
let stdoutSpy: ReturnType<typeof vi.spyOn>;
let stderrSpy: ReturnType<typeof vi.spyOn>;
let exitSpy: ReturnType<typeof vi.spyOn>;

const KRS = `
system Shop {
  service Checkout {
    domain Cart {
      Cart -> Authorization "Authorize card"
      Cart --> Picking "Reserve stock"
    }
  }
  service Payments { domain Authorization {} }
  service Fulfillment { domain Picking {} }
  service Platform {}
  user Shopper
  client Storefront [web]

  Shopper -> Storefront "Browse"
  Checkout -> Platform "Read config"
}

organization Shop {
  team checkout { label "Checkout Team" owns Checkout }
  team payments { label "Payments Team" owns Payments }
  team fulfillment { label "Fulfillment Team" owns Fulfillment }
}
`;

function stdout(): string {
  return stdoutSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("");
}

function stderr(): string {
  return stderrSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("");
}

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "karasu-team-deps-test-"));
  krsPath = join(tmpDir, "index.krs");
  await writeFile(krsPath, KRS, "utf-8");
  stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("team-dependencies CLI", () => {
  it("writes the markdown matrix and provenance to stdout by default", async () => {
    await teamDependencies(krsPath, {});
    const out = stdout();
    expect(out).toContain("| from \\ to | Checkout Team | Payments Team | Fulfillment Team |");
    expect(out).toContain("| Checkout Team | — | -> | --> |");
    expect(out).toContain("## Dependencies");
    expect(out).toContain('Shop.Checkout.Cart~ -> Shop.Payments.Authorization~ "Authorize card"');
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("reports the unowned remainder and leaves `user` endpoints out of it", async () => {
    await teamDependencies(krsPath, {});
    const out = stdout();
    expect(out).toContain("## Unowned endpoints");
    expect(out).toContain("| Shop.Platform | service |");
    expect(out).not.toContain("Shop.Shopper");
  });

  it("writes csv to file when --format csv -o is given", async () => {
    const outPath = join(tmpDir, "team-deps.csv");
    await teamDependencies(krsPath, { format: "csv", output: outPath });
    const content = await readFile(outPath, "utf-8");
    expect(content).toContain("relation,from_team,to_team,edge_kind,node,node_kind,edges,via");
    expect(content).toContain("cross-team,checkout,fulfillment,async,");
    expect(content).toContain("unowned,,,,Shop.Platform,service,");
  });

  it("derives across a multi-file project whose organization is split over files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "karasu-team-deps-multi-"));
    try {
      await writeFile(
        join(dir, "index.krs"),
        `import "./system.krs"\nimport "./org-a.krs"\nimport "./org-b.krs"\n`,
        "utf-8",
      );
      await writeFile(
        join(dir, "system.krs"),
        `system S {\n  service A { domain Da { Da -> Db "call" } }\n  service B { domain Db {} }\n}\n`,
        "utf-8",
      );
      await writeFile(join(dir, "org-a.krs"), `organization O { team ta { owns A } }\n`, "utf-8");
      await writeFile(join(dir, "org-b.krs"), `organization O { team tb { owns B } }\n`, "utf-8");

      await teamDependencies(join(dir, "index.krs"), { format: "csv" });
      expect(stdout()).toContain("cross-team,ta,tb,sync,");
      expect(exitSpy).not.toHaveBeenCalled();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("exits 1 on an unknown --format", async () => {
    await teamDependencies(krsPath, { format: "svg" as "md" });
    expect(stderr()).toContain('unknown --format "svg"');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("exits 1 when the file does not exist", async () => {
    await teamDependencies(join(tmpDir, "missing.krs"), {});
    expect(stderr()).toContain("File not found");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
