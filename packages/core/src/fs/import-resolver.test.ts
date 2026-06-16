import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { InMemoryFileSystemProvider } from "./in-memory-provider";
import { ImportResolver } from "./import-resolver";

const __dirname = dirname(fileURLToPath(import.meta.url));

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

    // Regression coverage for #412 — `examples/ja/ec-platform/05-multifile/` was
    // the originating reproduction (top-level `service` in one file, named-
    // imported and stub-referenced from a `system` in another). TPL-20260510-01
    // checklist item 5 ("top-level 宣言を named import で `system` 内に取り込む
    // `.krs`") is locked in by this test plus the two that follow (tag
    // preservation and multi-system fan-out). The end-to-end variant that runs
    // the same scenario against the actual example files lives at the bottom
    // of this file under the ec-platform/05-multifile suite.
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

  describe("path syntax (Issue #927)", () => {
    it("resolves a 3-segment path Sys.Svc.Dom", async () => {
      await fs.writeFile(
        "/project/main.krs",
        `import { ECPlatform.ECommerce.Order } from "./services.krs"
deploy Production {
  oci app {
    runtime "k"
    realizes Order
  }
}`,
      );
      await fs.writeFile(
        "/project/services.krs",
        `system ECPlatform {
  service ECommerce {
    domain Order {}
    domain Catalog {}
  }
}`,
      );

      const result = await resolver.resolve("/project/main.krs");
      expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);

      // ECPlatform should exist with ECommerce as ancestor stub of Order
      const sys = result.krsFile.systems.find((s) => s.id === "ECPlatform");
      expect(sys).toBeDefined();
      const svc = sys!.children.find((c) => c.id === "ECommerce");
      expect(svc).toBeDefined();
      const dom = svc!.children.find((c) => c.id === "Order");
      expect(dom).toBeDefined();
      expect(dom!.kind).toBe("domain");

      // Catalog (sibling not requested) should NOT have been imported.
      const catalog = svc!.children.find((c) => c.id === "Catalog");
      expect(catalog).toBeUndefined();
    });

    it("resolves a 2-segment path Sys.Svc (equivalent to bare-id Svc)", async () => {
      await fs.writeFile(
        "/project/main.krs",
        `import { ECPlatform.ECommerce } from "./services.krs"`,
      );
      await fs.writeFile(
        "/project/services.krs",
        `system ECPlatform {
  service ECommerce { domain Order {} }
}`,
      );

      const result = await resolver.resolve("/project/main.krs");
      expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);

      const sys = result.krsFile.systems.find((s) => s.id === "ECPlatform");
      const svc = sys!.children.find((c) => c.id === "ECommerce");
      expect(svc).toBeDefined();
      // The leaf is copied with its full subtree, so Order comes along.
      expect(svc!.children.some((c) => c.id === "Order")).toBe(true);
    });

    it("disambiguates same-id services across different systems via path", async () => {
      await fs.writeFile(
        "/project/main.krs",
        `import { OrderSystemV2.OrderService } from "./services.krs"`,
      );
      await fs.writeFile(
        "/project/services.krs",
        `system OrderSystemV1 {
  service OrderService { domain Legacy {} }
}
system OrderSystemV2 {
  service OrderService { domain Modern {} }
}`,
      );

      const result = await resolver.resolve("/project/main.krs");
      expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);

      // Only V2 should be present.
      const v1 = result.krsFile.systems.find((s) => s.id === "OrderSystemV1");
      expect(v1).toBeUndefined();
      const v2 = result.krsFile.systems.find((s) => s.id === "OrderSystemV2");
      expect(v2).toBeDefined();
      const svc = v2!.children.find((c) => c.id === "OrderService");
      expect(svc!.children.some((c) => c.id === "Modern")).toBe(true);
      expect(svc!.children.some((c) => c.id === "Legacy")).toBe(false);
    });

    it("emits import-path-not-found when the root system id is missing", async () => {
      await fs.writeFile("/project/main.krs", `import { Missing.Foo } from "./services.krs"`);
      await fs.writeFile("/project/services.krs", `system ECPlatform { service ECommerce {} }`);

      const result = await resolver.resolve("/project/main.krs");
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({
          severity: "error",
          code: "import-path-not-found",
          params: expect.objectContaining({ failedAt: 0 }),
        }),
      );
    });

    it("emits import-path-not-found when an intermediate segment is missing", async () => {
      await fs.writeFile(
        "/project/main.krs",
        `import { ECPlatform.NotThere.Order } from "./services.krs"`,
      );
      await fs.writeFile(
        "/project/services.krs",
        `system ECPlatform {
  service ECommerce { domain Order {} }
}`,
      );

      const result = await resolver.resolve("/project/main.krs");
      const diag = result.diagnostics.find((d) => d.code === "import-path-not-found");
      expect(diag).toBeDefined();
      if (diag?.code !== "import-path-not-found") throw new Error("kind mismatch");
      expect(diag.params.failedAt).toBe(1);
      expect(diag.params.lastResolvedId).toBe("ECPlatform");
    });

    it("does not affect wildcard imports — they continue to take the whole file", async () => {
      await fs.writeFile(
        "/project/main.krs",
        `import "./services.krs"
deploy Production { oci app { runtime "k" realizes Order } }`,
      );
      await fs.writeFile(
        "/project/services.krs",
        `system ECPlatform { service ECommerce { domain Order {} } }`,
      );

      const result = await resolver.resolve("/project/main.krs");
      expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
      // Whole system imported.
      const sys = result.krsFile.systems.find((s) => s.id === "ECPlatform");
      expect(sys!.children.some((c) => c.id === "ECommerce")).toBe(true);
    });

    it("merges multiple leaves under one shared ancestor stub when listed in the same import block", async () => {
      // Two paths in the same import statement share the ancestor walk, so
      // ECommerce ends up as a single stub holding both Order and Catalog.
      await fs.writeFile(
        "/project/main.krs",
        `import { ECPlatform.ECommerce.Order, ECPlatform.ECommerce.Catalog } from "./services.krs"`,
      );
      await fs.writeFile(
        "/project/services.krs",
        `system ECPlatform {
  service ECommerce {
    domain Order {}
    domain Catalog {}
    domain Member {}
  }
}`,
      );

      const result = await resolver.resolve("/project/main.krs");
      expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);

      const sys = result.krsFile.systems.find((s) => s.id === "ECPlatform");
      const svcs = sys!.children.filter((c) => c.id === "ECommerce");
      expect(svcs).toHaveLength(1); // single shared stub
      const childIds = svcs[0].children.map((c) => c.id);
      expect(childIds).toContain("Order");
      expect(childIds).toContain("Catalog");
      expect(childIds).not.toContain("Member"); // not requested
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

  // End-to-end regression test for #412 (named import + top-level service +
  // stub reference inside a `system` block). Runs the actual example files
  // through ImportResolver — complementary to the synthetic-fixture unit
  // tests in `describe("node imports")` above. Closes TPL-20260510-01
  // checklist item 5's coverage at the integration level so a refactor of
  // `mergeNamedImport` / `resolveBareIdImport` that breaks the user-visible
  // example fails CI before #412 reappears.
  describe("ec-platform/05-multifile end-to-end (#412 / TPL-20260510-01)", () => {
    it("merges both ECommerce and Payment into ECPlatform with full content preserved", async () => {
      const exampleDir = resolve(__dirname, "../../../../examples/ja/ec-platform/05-multifile");
      const provider = new InMemoryFileSystemProvider();
      await provider.writeFile(
        "/project/system.krs",
        readFileSync(resolve(exampleDir, "system.krs"), "utf8"),
      );
      await provider.writeFile(
        "/project/ecommerce.krs",
        readFileSync(resolve(exampleDir, "ecommerce.krs"), "utf8"),
      );
      await provider.writeFile(
        "/project/payment.krs",
        readFileSync(resolve(exampleDir, "payment.krs"), "utf8"),
      );

      const localResolver = new ImportResolver(provider);
      const result = await localResolver.resolve("/project/system.krs");

      expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);

      const platform = result.krsFile.systems.find((s) => s.id === "ECPlatform");
      expect(platform).toBeDefined();

      // Both imported top-level services must end up as children of the system
      // (the #412 failure mode left them as orphan top-level services and the
      // ECPlatform diagram rendered without them).
      const childIds = platform!.children.map((c) => c.id);
      expect(childIds).toContain("ECommerce");
      expect(childIds).toContain("Payment");
      expect(childIds).toContain("Inventory"); // declared inline — sanity check

      // Full content from the imported files must be preserved through the
      // merge — not just the id. ECommerce.Order and Payment have their
      // domains intact.
      const ecommerce = platform!.children.find((c) => c.id === "ECommerce");
      expect(ecommerce!.children.map((c) => c.id)).toContain("Order");
      const payment = platform!.children.find((c) => c.id === "Payment");
      expect(payment!.children.length).toBeGreaterThan(0);

      // Imported services must NOT leak into the top-level services array
      // (the #412 symptom included orphan top-level services rendered next to
      // the system instead of inside it).
      expect(result.krsFile.services.map((s) => s.id)).not.toContain("ECommerce");
      expect(result.krsFile.services.map((s) => s.id)).not.toContain("Payment");
    });
  });

  // ─── Spec §"Multi-file import semantics" (S1–S7) — Issue #1381 ─────────────
  // Locked in by TPL-20260514-01 through TPL-20260514-05.
  describe("multi-file import semantics (#1381)", () => {
    it("S5: DAG re-arrival of the same file is not a cycle — no circular-import warning", async () => {
      // index.krs → admin.krs → auth.krs   (named import)
      // index.krs → auth.krs               (wildcard import, second arrival)
      await fs.writeFile(
        "/project/index.krs",
        `import "admin.krs"
         import "auth.krs"
         system Blog { label "Top" }`,
      );
      await fs.writeFile(
        "/project/admin.krs",
        `import { Inner } from "auth.krs"
         system Blog { client AdminApp { } AdminApp -> Inner }`,
      );
      await fs.writeFile("/project/auth.krs", "system Blog { service Inner { } }");

      const result = await resolver.resolve("/project/index.krs");
      const cycleWarnings = result.diagnostics.filter((d) => d.code === "circular-import");
      expect(cycleWarnings).toEqual([]);
    });

    it("S5: a true cycle still produces a circular-import warning", async () => {
      await fs.writeFile("/project/a.krs", `import "b.krs"\nsystem X { }`);
      await fs.writeFile("/project/b.krs", `import "a.krs"\nsystem X { }`);

      const result = await resolver.resolve("/project/a.krs");
      const cycleWarnings = result.diagnostics.filter((d) => d.code === "circular-import");
      expect(cycleWarnings.length).toBeGreaterThan(0);
    });

    it("S2: whole-file import preserves all top-level + nested nodes after a named import preceded it", async () => {
      // The #1381 failure mode: admin.krs named-imports {Inner} from auth.krs;
      // then index.krs's `import "auth.krs"` previously returned an empty
      // KrsFile and silently dropped Outer / Db / SupportUser.
      await fs.writeFile(
        "/project/index.krs",
        `import "admin.krs"
         import "auth.krs"
         system Blog { label "Top" }`,
      );
      await fs.writeFile(
        "/project/admin.krs",
        `import { Inner } from "auth.krs"
         system Blog { client AdminApp { } AdminApp -> Inner }`,
      );
      await fs.writeFile(
        "/project/auth.krs",
        `system Blog {
           user SupportUser [human] { }
           service Inner { }
           service Outer { }
           database Db { table t }
         }`,
      );

      const result = await resolver.resolve("/project/index.krs");
      const blog = result.krsFile.systems.find((s) => s.id === "Blog");
      expect(blog).toBeDefined();
      const childIds = blog!.children.map((c) => c.id);
      // Every child declared in auth.krs's `system Blog` must end up in the
      // merged system, regardless of which import path brought it in.
      expect(childIds).toEqual(expect.arrayContaining(["SupportUser", "Inner", "Outer", "Db"]));
    });

    it("S3: reopened `system` merges children and root entry wins for `label`", async () => {
      await fs.writeFile(
        "/project/index.krs",
        `import "reader.krs"
         system Blog { label "Root choice" }`,
      );
      await fs.writeFile(
        "/project/reader.krs",
        `system Blog {
           label "Reader slice"
           user Reader [human] { }
           service Delivery { }
         }`,
      );

      const result = await resolver.resolve("/project/index.krs");
      const blog = result.krsFile.systems.find((s) => s.id === "Blog");
      expect(blog).toBeDefined();
      expect(blog!.label).toBe("Root choice");
      // Children from the imported file are still merged in.
      expect(blog!.children.map((c) => c.id)).toEqual(
        expect.arrayContaining(["Reader", "Delivery"]),
      );
      // The non-empty conflict surfaces as a warning.
      const conflicts = result.diagnostics.filter((d) => d.code === "system-property-conflict");
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].params).toMatchObject({
        blockId: "Blog",
        blockKind: "system",
        property: "label",
        chosen: "Root choice",
        ignored: "Reader slice",
      });
    });

    it("S3: importer with no `label` adopts the imported file's value silently", async () => {
      await fs.writeFile(
        "/project/index.krs",
        `import "reader.krs"
         system Blog { }`,
      );
      await fs.writeFile(
        "/project/reader.krs",
        `system Blog {
           label "Reader slice"
           user Reader [human] { }
         }`,
      );

      const result = await resolver.resolve("/project/index.krs");
      const blog = result.krsFile.systems.find((s) => s.id === "Blog");
      expect(blog!.label).toBe("Reader slice");
      expect(result.diagnostics.filter((d) => d.code === "system-property-conflict")).toEqual([]);
    });

    it("S4: same-id `deploy` and `organization` blocks merge across files", async () => {
      await fs.writeFile(
        "/project/index.krs",
        `import "reader.krs"
         import "editor.krs"
         system Blog { service Delivery { } service Drafting { } }`,
      );
      await fs.writeFile(
        "/project/reader.krs",
        `deploy Prod {
           oci readerContainer { runtime "Docker" realizes Delivery }
         }
         organization Co {
           team platform { owns Delivery }
         }`,
      );
      await fs.writeFile(
        "/project/editor.krs",
        `deploy Prod {
           oci editorContainer { runtime "Docker" realizes Drafting }
         }
         organization Co {
           team editorial { owns Drafting }
         }`,
      );

      const result = await resolver.resolve("/project/index.krs");
      const prod = result.krsFile.deploys.find((d) => d.id === "Prod");
      expect(prod).toBeDefined();
      expect(prod!.nodes.map((n) => n.id)).toEqual(
        expect.arrayContaining(["readerContainer", "editorContainer"]),
      );
      const org = result.krsFile.organizations.find((o) => o.id === "Co");
      expect(org).toBeDefined();
      expect(org!.teams.map((t) => t.id)).toEqual(
        expect.arrayContaining(["platform", "editorial"]),
      );
    });

    it("S4.5: same-id `database` declared in multiple files merges with an info diagnostic", async () => {
      await fs.writeFile(
        "/project/index.krs",
        `import "a.krs"
         import "b.krs"
         system X { }`,
      );
      await fs.writeFile(
        "/project/a.krs",
        `system X {
           database UserDB { table users }
         }`,
      );
      await fs.writeFile(
        "/project/b.krs",
        `system X {
           database UserDB { table sessions }
         }`,
      );

      const result = await resolver.resolve("/project/index.krs");
      const errors = result.diagnostics.filter((d) => d.severity === "error");
      expect(errors).toEqual([]);

      const infos = result.diagnostics.filter((d) => d.code === "infra-redeclared-across-files");
      expect(infos).toHaveLength(1);
      expect(infos[0].severity).toBe("info");
      expect(infos[0].params).toMatchObject({ blockId: "UserDB", blockKind: "database" });

      const sys = result.krsFile.systems.find((s) => s.id === "X")!;
      const userDb = sys.children.find((c) => c.id === "UserDB")!;
      const tableIds = userDb.children.map((c) => c.id).sort();
      expect(tableIds).toEqual(["sessions", "users"]);
    });

    it("S4.5: same `database` declaration reached via DAG re-arrival does not emit an info", async () => {
      await fs.writeFile(
        "/project/index.krs",
        `import "infra.krs"
         import "a.krs"
         system X { }`,
      );
      // Both a.krs and index.krs reach infra.krs — same instance via cache, must dedup silently.
      await fs.writeFile("/project/infra.krs", `system X { database UserDB { table users } }`);
      await fs.writeFile(
        "/project/a.krs",
        `import "infra.krs"
         system X {
           service Svc {
             domain D { usecase U { resource UserDB.users } }
           }
         }`,
      );

      const result = await resolver.resolve("/project/index.krs");
      const errors = result.diagnostics.filter((d) => d.severity === "error");
      expect(errors).toEqual([]);
      const infos = result.diagnostics.filter((d) => d.code === "infra-redeclared-across-files");
      expect(infos).toEqual([]);

      const sys = result.krsFile.systems.find((s) => s.id === "X")!;
      const userDb = sys.children.find((c) => c.id === "UserDB");
      expect(userDb).toBeDefined();
    });

    it("S4.5: same-id at file-root (top-level `database`) also merges + info", async () => {
      await fs.writeFile(
        "/project/index.krs",
        `import "a.krs"
         import "b.krs"
         system X { }`,
      );
      await fs.writeFile("/project/a.krs", `database UserDB { table users }`);
      await fs.writeFile("/project/b.krs", `database UserDB { table accounts }`);

      const result = await resolver.resolve("/project/index.krs");
      const infos = result.diagnostics.filter((d) => d.code === "infra-redeclared-across-files");
      expect(infos).toHaveLength(1);
      expect(infos[0].severity).toBe("info");

      expect(result.krsFile.databases).toHaveLength(1);
      const merged = result.krsFile.databases[0];
      expect(merged.id).toBe("UserDB");
      expect(merged.children.map((c) => c.id).sort()).toEqual(["accounts", "users"]);
    });

    it("S4.5: same-id leaf inside an infra body keeps the first and emits infra-leaf-redeclared-silently info", async () => {
      // Both files declare `database UserDB { table users }` with different bodies.
      // Per S4.5: the database itself merges (1 info), and the duplicated `table users`
      // is dropped silently with a leaf-level info pointing at the loss.
      await fs.writeFile(
        "/project/index.krs",
        `import "a.krs"
         import "b.krs"
         system X { }`,
      );
      await fs.writeFile(
        "/project/a.krs",
        `system X { database UserDB { table users { label "from a" } } }`,
      );
      await fs.writeFile(
        "/project/b.krs",
        `system X { database UserDB { table users { label "from b" } } }`,
      );

      const result = await resolver.resolve("/project/index.krs");
      const errors = result.diagnostics.filter((d) => d.severity === "error");
      expect(errors).toEqual([]);

      const leafInfos = result.diagnostics.filter(
        (d) => d.code === "infra-leaf-redeclared-silently",
      );
      expect(leafInfos).toHaveLength(1);
      expect(leafInfos[0].severity).toBe("info");
      expect(leafInfos[0].params).toMatchObject({
        leafId: "users",
        leafKind: "table",
        infraId: "UserDB",
        infraKind: "database",
      });

      // The leaf is deduped — first declaration wins.
      const sys = result.krsFile.systems.find((s) => s.id === "X")!;
      const userDb = sys.children.find((c) => c.id === "UserDB")!;
      const usersLeaves = userDb.children.filter((c) => c.id === "users");
      expect(usersLeaves).toHaveLength(1);
      expect(usersLeaves[0].label).toBe("from a");
    });

    it("S2 + S4: end-to-end on the examples/ja/multi-file-system fixture", async () => {
      // Drives the actual on-disk example so the spec & the impl are
      // exercised against the same fixture users will read.
      const exampleDir = resolve(__dirname, "../../../../examples/ja/multi-file-system");
      for (const name of ["index.krs", "reader.krs", "editor.krs", "moderation.krs", "infra.krs"]) {
        await fs.writeFile(`/proj/${name}`, readFileSync(resolve(exampleDir, name), "utf-8"));
      }
      const result = await resolver.resolve("/proj/index.krs");
      const errors = result.diagnostics.filter((d) => d.severity === "error");
      expect(errors).toEqual([]);

      const blog = result.krsFile.systems.find((s) => s.id === "Blog");
      expect(blog).toBeDefined();
      const childIds = blog!.children.map((c) => c.id);
      expect(childIds).toEqual(
        expect.arrayContaining([
          // reader.krs
          "Reader",
          "ReaderApp",
          "ArticleDelivery",
          // editor.krs
          "Editor",
          "EditorApp",
          "Authoring",
          // moderation.krs (the previously-dropped slice)
          "Moderator",
          "AdminApp",
          "Moderation",
          // infra.krs (external service)
          "Search",
        ]),
      );
      // Databases from infra.krs propagate as children of system Blog via
      // S3 system reopen — the canonical pattern declares them once inside
      // a reopened `system Blog { ... }` so the system-membership inference
      // attaches them cleanly. DAG re-arrival (S5) memoizes infra.krs so
      // reaching it through reader / editor / cms doesn't duplicate work.
      expect(childIds).toEqual(
        expect.arrayContaining(["ArticleDB", "DraftStore", "SearchIndex", "ModerationLog"]),
      );
      // deploy / organization (S4)
      const prod = result.krsFile.deploys.find((d) => d.id === "Production");
      expect(prod!.nodes.map((n) => n.id)).toEqual(
        expect.arrayContaining(["readerContainer", "authoringContainer", "moderationContainer"]),
      );
      const editorial = result.krsFile.organizations.find((o) => o.id === "Editorial");
      expect(editorial!.teams.map((t) => t.id)).toEqual(
        expect.arrayContaining(["platform", "editorial", "trustSafety"]),
      );
    });
  });
});
