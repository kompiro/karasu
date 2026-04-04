import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryFileSystemProvider } from "./in-memory-provider";
import { ImportResolver } from "./import-resolver";

describe("ImportResolver", () => {
  let fs: InMemoryFileSystemProvider;
  let resolver: ImportResolver;

  beforeEach(() => {
    fs = new InMemoryFileSystemProvider();
    resolver = new ImportResolver(fs);
  });

  describe("single file (no imports)", () => {
    it("resolves a single krs file", async () => {
      await fs.writeFile(
        "/project/index.krs",
        `system Test {
          service Svc
        }`,
      );

      const result = await resolver.resolve("/project/index.krs");
      expect(result.krsFile.systems).toHaveLength(1);
      expect(result.krsFile.systems[0].id).toBe("Test");
      expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
    });

    it("returns error diagnostic for missing file", async () => {
      const result = await resolver.resolve("/missing.krs");
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({
          severity: "error",
          message: expect.stringContaining("File not found"),
        }),
      );
    });
  });

  describe("style imports", () => {
    it("resolves @import for style files", async () => {
      await fs.writeFile(
        "/project/index.krs",
        `@import "default.krs.style"
system Test {
  service Svc
}`,
      );
      await fs.writeFile(
        "/project/default.krs.style",
        `user {
  background-color: #1D4ED8;
  shape: user;
}`,
      );

      const result = await resolver.resolve("/project/index.krs");
      expect(result.styleSheets).toHaveLength(1);
      expect(result.styleSheets[0].rules).toHaveLength(1);
      expect(result.styleSheets[0].rules[0].properties["background-color"]).toBe("#1D4ED8");
    });

    it("returns warning diagnostic for missing style file", async () => {
      await fs.writeFile(
        "/project/index.krs",
        `@import "missing.krs.style"
system Test {
  service Svc
}`,
      );

      const result = await resolver.resolve("/project/index.krs");
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({
          severity: "warning",
          message: expect.stringContaining("Style file not found"),
        }),
      );
    });
  });

  describe("node imports", () => {
    it("resolves import { X } from another file", async () => {
      await fs.writeFile(
        "/project/index.krs",
        `import { Payment } from "services/payment.krs"
system EC {
  service ECommerce
}`,
      );
      await fs.writeFile(
        "/project/services/payment.krs",
        `system EC {
  service Payment [external]
}`,
      );

      const result = await resolver.resolve("/project/index.krs");
      expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);

      // EC system should have both ECommerce and Payment
      const ecSystem = result.krsFile.systems.find((s) => s.id === "EC");
      expect(ecSystem).toBeDefined();
      const childIds = ecSystem!.children.map((c) => c.id);
      expect(childIds).toContain("ECommerce");
      expect(childIds).toContain("Payment");
    });

    it("reports error for non-existent identifier", async () => {
      await fs.writeFile(
        "/project/index.krs",
        `import { NonExistent } from "other.krs"
system Test {
  service Svc
}`,
      );
      await fs.writeFile(
        "/project/other.krs",
        `system Test {
  service Actual
}`,
      );

      const result = await resolver.resolve("/project/index.krs");
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({
          severity: "error",
          message: expect.stringContaining('"NonExistent" not found'),
        }),
      );
    });

    it("reports error for missing import file", async () => {
      await fs.writeFile(
        "/project/index.krs",
        `import { X } from "missing.krs"
system Test {
  service Svc
}`,
      );

      const result = await resolver.resolve("/project/index.krs");
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({
          severity: "error",
          message: expect.stringContaining("File not found"),
        }),
      );
    });
  });

  describe("chained imports", () => {
    it("resolves A -> B -> C chain", async () => {
      await fs.writeFile(
        "/project/a.krs",
        `import { Svc2, Svc3 } from "b.krs"
system Chain {
  service Svc1
}`,
      );
      await fs.writeFile(
        "/project/b.krs",
        `import { Svc3 } from "c.krs"
system Chain {
  service Svc2
}`,
      );
      await fs.writeFile(
        "/project/c.krs",
        `system Chain {
  service Svc3
}`,
      );

      const result = await resolver.resolve("/project/a.krs");
      expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);

      const chainSystem = result.krsFile.systems.find((s) => s.id === "Chain");
      expect(chainSystem).toBeDefined();
      const childIds = chainSystem!.children.map((c) => c.id);
      expect(childIds).toContain("Svc1");
      expect(childIds).toContain("Svc2");
      expect(childIds).toContain("Svc3");
    });
  });

  describe("circular import detection", () => {
    it("detects circular krs imports", async () => {
      await fs.writeFile(
        "/project/a.krs",
        `import { Y } from "b.krs"
system Circular {
  service X
}`,
      );
      await fs.writeFile(
        "/project/b.krs",
        `import { X } from "a.krs"
system Circular {
  service Y
}`,
      );

      const result = await resolver.resolve("/project/a.krs");
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({
          severity: "warning",
          message: expect.stringContaining("Circular import"),
        }),
      );
    });

    it("detects circular style imports", async () => {
      // Style files referencing each other isn't directly supported
      // by the current style parser, but we test the visited check
      await fs.writeFile(
        "/project/index.krs",
        `@import "a.krs.style"
@import "a.krs.style"
system Test {
  service Svc
}`,
      );
      await fs.writeFile("/project/a.krs.style", `user { background-color: #000; }`);

      const result = await resolver.resolve("/project/index.krs");
      // Second import of same file should be detected as circular
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({
          severity: "warning",
          message: expect.stringContaining("Circular style import"),
        }),
      );
    });
  });

  describe("organization and ownerIndex merging", () => {
    it("merges organizations and ownerIndex from the parsed file", async () => {
      await fs.writeFile(
        "/project/index.krs",
        `system MySystem {
  service ECommerce {}
  service Payment {}
}
organization Corp {
  team ecTeam {
    label "EC開発チーム"
    owns ECommerce
    owns Payment
  }
}`,
      );

      const result = await resolver.resolve("/project/index.krs");
      expect(result.krsFile.organizations).toHaveLength(1);
      expect(result.krsFile.ownerIndex.get("ECommerce")).toBe("ecTeam");
      expect(result.krsFile.ownerIndex.get("Payment")).toBe("ecTeam");
    });
  });

  describe("edge merging", () => {
    it("merges edges related to imported nodes", async () => {
      await fs.writeFile(
        "/project/index.krs",
        `import { Payment } from "payment.krs"
system EC {
  service ECommerce
  ECommerce -> Payment "pay"
}`,
      );
      await fs.writeFile(
        "/project/payment.krs",
        `system EC {
  service Payment [external]
}`,
      );

      const result = await resolver.resolve("/project/index.krs");
      const ecSystem = result.krsFile.systems.find((s) => s.id === "EC");
      expect(ecSystem).toBeDefined();

      // Payment should be merged into the system
      const childIds = ecSystem!.children.map((c) => c.id);
      expect(childIds).toContain("Payment");

      // The edge ECommerce -> Payment should exist in the original system
      expect(ecSystem!.edges).toContainEqual(
        expect.objectContaining({ from: "ECommerce", to: "Payment" }),
      );
    });
  });

  describe("wildcard import", () => {
    it("merges all system blocks from the imported file", async () => {
      await fs.writeFile(
        "/project/platform.krs",
        `import "team-ec.krs"
import "team-payment.krs"`,
      );
      await fs.writeFile(
        "/project/team-ec.krs",
        `system ECPlatform {
  service OrderService
}`,
      );
      await fs.writeFile(
        "/project/team-payment.krs",
        `system ECPlatform {
  service PaymentService
}`,
      );

      const result = await resolver.resolve("/project/platform.krs");
      expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);

      const ecSystem = result.krsFile.systems.find((s) => s.id === "ECPlatform");
      expect(ecSystem).toBeDefined();
      const childIds = ecSystem!.children.map((c) => c.id);
      expect(childIds).toContain("OrderService");
      expect(childIds).toContain("PaymentService");
    });

    it("merges edges from same-named system across files", async () => {
      await fs.writeFile(
        "/project/platform.krs",
        `import "team-ec.krs"
import "team-payment.krs"`,
      );
      await fs.writeFile(
        "/project/team-ec.krs",
        `system ECPlatform {
  service OrderService
  OrderService -> PaymentService
}`,
      );
      await fs.writeFile(
        "/project/team-payment.krs",
        `system ECPlatform {
  service PaymentService
}`,
      );

      const result = await resolver.resolve("/project/platform.krs");
      expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);

      const ecSystem = result.krsFile.systems.find((s) => s.id === "ECPlatform");
      expect(ecSystem).toBeDefined();
      expect(ecSystem!.edges).toContainEqual(
        expect.objectContaining({ from: "OrderService", to: "PaymentService" }),
      );
    });

    it("merges different systems from the imported file", async () => {
      await fs.writeFile(
        "/project/index.krs",
        `import "services.krs"`,
      );
      await fs.writeFile(
        "/project/services.krs",
        `system SystemA {
  service SvcA
}
system SystemB {
  service SvcB
}`,
      );

      const result = await resolver.resolve("/project/index.krs");
      expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
      expect(result.krsFile.systems).toHaveLength(2);
      const ids = result.krsFile.systems.map((s) => s.id);
      expect(ids).toContain("SystemA");
      expect(ids).toContain("SystemB");
    });

    it("reports error for duplicate node ID in same-named system", async () => {
      await fs.writeFile(
        "/project/index.krs",
        `import "a.krs"
import "b.krs"`,
      );
      await fs.writeFile(
        "/project/a.krs",
        `system MySystem {
  service Duplicate
}`,
      );
      await fs.writeFile(
        "/project/b.krs",
        `system MySystem {
  service Duplicate
}`,
      );

      const result = await resolver.resolve("/project/index.krs");
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({
          severity: "error",
          message: expect.stringContaining('Duplicate node ID "Duplicate"'),
        }),
      );
    });

    it("warns for top-level service declared outside any system block (Case B)", async () => {
      await fs.writeFile(
        "/project/index.krs",
        `import "services.krs"`,
      );
      await fs.writeFile(
        "/project/services.krs",
        `service StandaloneService

system MySystem {
  service OtherService
}`,
      );

      const result = await resolver.resolve("/project/index.krs");
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({
          severity: "warning",
          message: expect.stringContaining(
            '"StandaloneService" is declared outside any system block',
          ),
        }),
      );
      // OtherService should be merged without warning
      const sys = result.krsFile.systems.find((s) => s.id === "MySystem");
      expect(sys).toBeDefined();
      expect(sys!.children.map((c) => c.id)).toContain("OtherService");
    });

    it("merges deploy blocks from wildcard import", async () => {
      await fs.writeFile(
        "/project/index.krs",
        `import "infra.krs"`,
      );
      await fs.writeFile(
        "/project/infra.krs",
        `deploy Production {
  oci OrderService {
    image "order:latest"
  }
}`,
      );

      const result = await resolver.resolve("/project/index.krs");
      expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
      expect(result.krsFile.deploys).toHaveLength(1);
      expect(result.krsFile.deploys[0].id).toBe("Production");
    });

    it("merges same-named deploy blocks from wildcard import", async () => {
      await fs.writeFile(
        "/project/index.krs",
        `import "ec.krs"
import "payment.krs"`,
      );
      await fs.writeFile(
        "/project/ec.krs",
        `deploy Production {
  oci OrderService {
    image "order:latest"
  }
}`,
      );
      await fs.writeFile(
        "/project/payment.krs",
        `deploy Production {
  oci PaymentService {
    image "payment:latest"
  }
}`,
      );

      const result = await resolver.resolve("/project/index.krs");
      expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
      expect(result.krsFile.deploys).toHaveLength(1);
      expect(result.krsFile.deploys[0].nodes).toHaveLength(2);
      const nodeIds = result.krsFile.deploys[0].nodes.map((n) => n.id);
      expect(nodeIds).toContain("OrderService");
      expect(nodeIds).toContain("PaymentService");
    });

    it("resolves two-pass edge: edge references service defined in later-loaded file", async () => {
      await fs.writeFile(
        "/project/platform.krs",
        `import "team-ec.krs"
import "team-payment.krs"`,
      );
      // OrderService references PaymentService which is in the second imported file
      await fs.writeFile(
        "/project/team-ec.krs",
        `system ECPlatform {
  service OrderService
  OrderService -> PaymentService
}`,
      );
      await fs.writeFile(
        "/project/team-payment.krs",
        `system ECPlatform {
  service PaymentService
}`,
      );

      const result = await resolver.resolve("/project/platform.krs");
      // No "not found" error for PaymentService — two-pass ensures all files are loaded first
      expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
      const ecSystem = result.krsFile.systems.find((s) => s.id === "ECPlatform");
      expect(ecSystem!.children.map((c) => c.id)).toContain("PaymentService");
    });
  });
});
