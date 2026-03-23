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
        `system "Test" {
          service Svc "Service"
        }`,
      );

      const result = await resolver.resolve("/project/index.krs");
      expect(result.krsFile.systems).toHaveLength(1);
      expect(result.krsFile.systems[0].label).toBe("Test");
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
system "Test" {
  service Svc "Service"
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
system "Test" {
  service Svc "Service"
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
system "EC" {
  service ECommerce "EC"
}`,
      );
      await fs.writeFile(
        "/project/services/payment.krs",
        `system "EC" {
  service Payment "Payment" [external]
}`,
      );

      const result = await resolver.resolve("/project/index.krs");
      expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);

      // EC system should have both ECommerce and Payment
      const ecSystem = result.krsFile.systems.find((s) => s.label === "EC");
      expect(ecSystem).toBeDefined();
      const childIds = ecSystem!.children.map((c) => c.id);
      expect(childIds).toContain("ECommerce");
      expect(childIds).toContain("Payment");
    });

    it("reports error for non-existent identifier", async () => {
      await fs.writeFile(
        "/project/index.krs",
        `import { NonExistent } from "other.krs"
system "Test" {
  service Svc "Service"
}`,
      );
      await fs.writeFile(
        "/project/other.krs",
        `system "Test" {
  service Actual "Actual"
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
system "Test" {
  service Svc "Service"
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
system "Chain" {
  service Svc1 "Service1"
}`,
      );
      await fs.writeFile(
        "/project/b.krs",
        `import { Svc3 } from "c.krs"
system "Chain" {
  service Svc2 "Service2"
}`,
      );
      await fs.writeFile(
        "/project/c.krs",
        `system "Chain" {
  service Svc3 "Service3"
}`,
      );

      const result = await resolver.resolve("/project/a.krs");
      expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);

      const chainSystem = result.krsFile.systems.find((s) => s.label === "Chain");
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
system "Circular" {
  service X "X"
}`,
      );
      await fs.writeFile(
        "/project/b.krs",
        `import { X } from "a.krs"
system "Circular" {
  service Y "Y"
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
system "Test" {
  service Svc "Service"
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

  describe("edge merging", () => {
    it("merges edges related to imported nodes", async () => {
      await fs.writeFile(
        "/project/index.krs",
        `import { Payment } from "payment.krs"
system "EC" {
  service ECommerce "EC"
  ECommerce -> Payment "pay"
}`,
      );
      await fs.writeFile(
        "/project/payment.krs",
        `system "EC" {
  service Payment "Payment" [external]
}`,
      );

      const result = await resolver.resolve("/project/index.krs");
      const ecSystem = result.krsFile.systems.find((s) => s.label === "EC");
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
});
