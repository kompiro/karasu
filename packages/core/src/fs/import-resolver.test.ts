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
        expect.objectContaining({ severity: "error", code: "file-not-found" }),
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
        expect.objectContaining({ severity: "warning", code: "style-file-not-found" }),
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

    it("fills stub in system.children when importing a top-level service by name", async () => {
      await fs.writeFile(
        "/project/system.krs",
        `import { ECommerce } from "./ecommerce.krs"
system ECPlatform {
  service ECommerce
}`,
      );
      await fs.writeFile(
        "/project/ecommerce.krs",
        `service ECommerce {
  label "ECサイト"
  domain Order {
    label "受注"
    usecase PlaceOrder { label "注文を受け付ける" }
  }
}`,
      );

      const result = await resolver.resolve("/project/system.krs");
      expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);

      // ECommerce should be a child of ECPlatform with its domains
      const system = result.krsFile.systems.find((s) => s.id === "ECPlatform");
      expect(system).toBeDefined();
      const ecommerce = system!.children.find((c) => c.id === "ECommerce");
      expect(ecommerce).toBeDefined();
      expect(ecommerce!.children.map((c) => c.id)).toContain("Order");

      // Top-level services should not include ECommerce (it was merged into the system)
      expect(result.krsFile.services.map((s) => s.id)).not.toContain("ECommerce");
    });

    it("preserves stub tags when importing a top-level service by name", async () => {
      await fs.writeFile(
        "/project/system.krs",
        `import { ECommerce } from "./ecommerce.krs"
system ECPlatform {
  service ECommerce [external]
}`,
      );
      await fs.writeFile(
        "/project/ecommerce.krs",
        `service ECommerce {
  label "ECサイト"
  domain Order { label "受注" }
}`,
      );

      const result = await resolver.resolve("/project/system.krs");
      expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);

      const system = result.krsFile.systems.find((s) => s.id === "ECPlatform");
      const ecommerce = system!.children.find((c) => c.id === "ECommerce");
      expect(ecommerce).toBeDefined();
      // Stub tag [external] must be preserved
      expect(ecommerce!.tags).toContain("external");
      // Definition content must be present
      expect(ecommerce!.children.map((c) => c.id)).toContain("Order");
    });

    it("fills stubs in all systems when multiple systems reference the same top-level service", async () => {
      await fs.writeFile(
        "/project/system.krs",
        `import { ECommerce } from "./ecommerce.krs"
system ECPlatform {
  service ECommerce
}
system Legacy {
  service ECommerce
}`,
      );
      await fs.writeFile(
        "/project/ecommerce.krs",
        `service ECommerce {
  domain Order { label "受注" }
}`,
      );

      const result = await resolver.resolve("/project/system.krs");
      expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);

      for (const sysId of ["ECPlatform", "Legacy"]) {
        const system = result.krsFile.systems.find((s) => s.id === sysId);
        const ecommerce = system!.children.find((c) => c.id === "ECommerce");
        expect(ecommerce).toBeDefined();
        expect(ecommerce!.children.map((c) => c.id)).toContain("Order");
      }
    });

    it("adds top-level service as system child when referenced only in edges (no stub)", async () => {
      await fs.writeFile(
        "/project/system.krs",
        `import { ECommerce } from "./ecommerce.krs"
import { Payment } from "./payment.krs"
system ECPlatform {
  service Inventory { domain Stock { usecase CheckStock {} } }
  ECommerce -> Payment "決済を処理する"
  ECommerce -> Inventory "在庫を確認する"
}`,
      );
      await fs.writeFile(
        "/project/ecommerce.krs",
        `service ECommerce {
  label "ECサイト"
  domain Order { usecase PlaceOrder {} }
}`,
      );
      await fs.writeFile(
        "/project/payment.krs",
        `service Payment {
  label "決済サービス"
  domain Billing { usecase Charge {} }
}`,
      );

      const result = await resolver.resolve("/project/system.krs");
      expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);

      const system = result.krsFile.systems.find((s) => s.id === "ECPlatform");
      expect(system).toBeDefined();
      const childIds = system!.children.map((c) => c.id);

      // ECommerce and Payment are referenced in edges → added as children with full definitions
      expect(childIds).toContain("ECommerce");
      expect(childIds).toContain("Payment");

      const ecommerce = system!.children.find((c) => c.id === "ECommerce");
      expect(ecommerce!.children.map((c) => c.id)).toContain("Order");

      const payment = system!.children.find((c) => c.id === "Payment");
      expect(payment!.children.map((c) => c.id)).toContain("Billing");

      // Should not appear at top level
      expect(result.krsFile.services.map((s) => s.id)).not.toContain("ECommerce");
      expect(result.krsFile.services.map((s) => s.id)).not.toContain("Payment");
    });

    it("keeps top-level service in services when not referenced in any system edges", async () => {
      await fs.writeFile(
        "/project/system.krs",
        `import { SharedLib } from "./shared.krs"
system ECPlatform {
  service Inventory {}
}`,
      );
      await fs.writeFile(
        "/project/shared.krs",
        `service SharedLib {
  domain Core { usecase DoSomething {} }
}`,
      );

      const result = await resolver.resolve("/project/system.krs");
      expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);

      // SharedLib has no edges in ECPlatform → stays at top level
      const system = result.krsFile.systems.find((s) => s.id === "ECPlatform");
      expect(system!.children.map((c) => c.id)).not.toContain("SharedLib");
      expect(result.krsFile.services.map((s) => s.id)).toContain("SharedLib");
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
          code: "import-id-not-found",
          params: expect.objectContaining({ id: "NonExistent" }),
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
        expect.objectContaining({ severity: "error", code: "file-not-found" }),
      );
    });

    it("merges deploy nodes into existing deploy block matched by id", async () => {
      await fs.writeFile(
        "/project/index.krs",
        `import { PaymentService } from "payment.krs"
deploy Production {
  label "prod-env"
  oci OrderService {
    image "order:latest"
  }
}`,
      );
      await fs.writeFile(
        "/project/payment.krs",
        `deploy Production {
  label "payment-infra"
  oci PaymentService {
    image "payment:latest"
  }
}`,
      );

      const result = await resolver.resolve("/project/index.krs");
      expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);

      // Deploy blocks should be merged by id ("Production"), not by label
      // (labels differ: "prod-env" vs "payment-infra")
      expect(result.krsFile.deploys).toHaveLength(1);
      const nodeIds = result.krsFile.deploys[0].nodes.map((n) => n.id);
      expect(nodeIds).toContain("OrderService");
      expect(nodeIds).toContain("PaymentService");
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
          code: "circular-import",
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
          code: "circular-style-import",
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
      await fs.writeFile("/project/index.krs", `import "services.krs"`);
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
          code: "duplicate-node-in-system",
          params: expect.objectContaining({ nodeId: "Duplicate" }),
        }),
      );
    });

    it("warns for top-level service declared outside any system block (Case B)", async () => {
      await fs.writeFile("/project/index.krs", `import "services.krs"`);
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
          code: "service-outside-system",
          params: expect.objectContaining({ serviceId: "StandaloneService" }),
        }),
      );
      // OtherService should be merged without warning
      const sys = result.krsFile.systems.find((s) => s.id === "MySystem");
      expect(sys).toBeDefined();
      expect(sys!.children.map((c) => c.id)).toContain("OtherService");
    });

    it("merges deploy blocks from wildcard import", async () => {
      await fs.writeFile("/project/index.krs", `import "infra.krs"`);
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

  describe("directory import", () => {
    it("merges all .krs files in the directory", async () => {
      await fs.writeFile("/project/index.krs", `import "teams/"`);
      await fs.writeFile(
        "/project/teams/ec.krs",
        `system ECPlatform {
          service ECommerce
        }`,
      );
      await fs.writeFile(
        "/project/teams/payment.krs",
        `system ECPlatform {
          service Payment
        }`,
      );

      const result = await resolver.resolve("/project/index.krs");
      expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
      const ec = result.krsFile.systems.find((s) => s.id === "ECPlatform");
      expect(ec).toBeDefined();
      expect(ec!.children.map((c) => c.id)).toContain("ECommerce");
      expect(ec!.children.map((c) => c.id)).toContain("Payment");
    });

    it("loads files in alphabetical order", async () => {
      await fs.writeFile("/project/index.krs", `import "teams/"`);
      // b.krs declares duplicate ID that would error only if processed after a.krs
      await fs.writeFile(
        "/project/teams/a.krs",
        `system S {
          service Alpha
        }`,
      );
      await fs.writeFile(
        "/project/teams/b.krs",
        `system S {
          service Beta
        }`,
      );

      const result = await resolver.resolve("/project/index.krs");
      // Alpha and Beta merged into same system S — no duplicate error
      expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
      const s = result.krsFile.systems.find((sys) => sys.id === "S");
      expect(s!.children.map((c) => c.id)).toEqual(["Alpha", "Beta"]);
    });

    it("excludes non-.krs files", async () => {
      await fs.writeFile("/project/index.krs", `import "assets/"`);
      await fs.writeFile("/project/assets/styles.krs.style", `user { background-color: #fff; }`);
      await fs.writeFile("/project/assets/system.krs", `system S { service Svc }`);

      const result = await resolver.resolve("/project/index.krs");
      expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
      expect(result.krsFile.systems).toHaveLength(1);
    });

    it("returns error diagnostic for missing directory", async () => {
      await fs.writeFile("/project/index.krs", `import "missing/"`);

      const result = await resolver.resolve("/project/index.krs");
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({
          severity: "error",
          code: "directory-not-found",
        }),
      );
    });

    it("does not double-merge a file imported both directly and via directory", async () => {
      await fs.writeFile(
        "/project/index.krs",
        `import "teams/ec.krs"
import "teams/"`,
      );
      await fs.writeFile(
        "/project/teams/ec.krs",
        `system ECPlatform {
          service ECommerce
        }`,
      );

      const result = await resolver.resolve("/project/index.krs");
      expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
      const ec = result.krsFile.systems.find((s) => s.id === "ECPlatform");
      // ECommerce should appear exactly once
      expect(ec!.children.filter((c) => c.id === "ECommerce")).toHaveLength(1);
    });

    it("does not warn about circular import when entry file is in the imported directory", async () => {
      // system.krs lives in the same directory it imports — self-reference must be silently skipped
      await fs.writeFile(
        "/project/teams/system.krs",
        `import "./"

system ECPlatform {
  user Customer [human]
  Customer -> ECommerce "商品を購入する"
}`,
      );
      await fs.writeFile(
        "/project/teams/ec.krs",
        `system ECPlatform {
          service ECommerce
        }`,
      );

      const result = await resolver.resolve("/project/teams/system.krs");
      expect(result.diagnostics.filter((d) => d.severity === "warning")).toHaveLength(0);
      expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
      const sys = result.krsFile.systems.find((s) => s.id === "ECPlatform");
      expect(sys!.children.map((c) => c.id)).toContain("ECommerce");
    });
  });
});
