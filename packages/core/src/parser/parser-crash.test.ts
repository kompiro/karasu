import { describe, it, expect } from "vitest";
import { Parser } from "./parser.js";
import { compile, compileProject, InMemoryFileSystemProvider } from "../index.js";

describe("Incomplete import - Parser", () => {
  it("should not crash on 'import'", () => {
    expect(() => Parser.parse("import")).not.toThrow();
  });
  it("should not crash on 'import {'", () => {
    expect(() => Parser.parse("import {")).not.toThrow();
  });
  it("should not crash on 'import { Foo'", () => {
    expect(() => Parser.parse("import { Foo")).not.toThrow();
  });
  it("should not crash on 'import { Foo }'", () => {
    expect(() => Parser.parse("import { Foo }")).not.toThrow();
  });
  it("should not crash on 'import { Foo } from'", () => {
    expect(() => Parser.parse("import { Foo } from")).not.toThrow();
  });
});

describe("Incomplete import - compile", () => {
  it("should not crash on 'import'", () => {
    expect(() => compile("import", "")).not.toThrow();
  });
  it("should not crash on 'import {'", () => {
    expect(() => compile("import {", "")).not.toThrow();
  });
  it("should not crash on 'import { Foo } from'", () => {
    expect(() => compile("import { Foo } from", "")).not.toThrow();
  });
});

describe("Incomplete import - compileProject", () => {
  it("should not crash on 'import'", async () => {
    const fs = new InMemoryFileSystemProvider();
    await fs.writeFile("/index.krs", "import");
    await expect(compileProject("/index.krs", fs)).resolves.toBeDefined();
  });
  it("should not crash on 'import {'", async () => {
    const fs = new InMemoryFileSystemProvider();
    await fs.writeFile("/index.krs", "import {");
    await expect(compileProject("/index.krs", fs)).resolves.toBeDefined();
  });
  it("should not crash on 'import { Foo'", async () => {
    const fs = new InMemoryFileSystemProvider();
    await fs.writeFile("/index.krs", "import { Foo");
    await expect(compileProject("/index.krs", fs)).resolves.toBeDefined();
  });
  it("should not crash on 'import { Foo } from'", async () => {
    const fs = new InMemoryFileSystemProvider();
    await fs.writeFile("/index.krs", "import { Foo } from");
    await expect(compileProject("/index.krs", fs)).resolves.toBeDefined();
  });
  it("should not crash on partial import with existing content", async () => {
    const fs = new InMemoryFileSystemProvider();
    await fs.writeFile("/index.krs", '@import "default.krs.style"\nimport');
    await fs.writeFile("/default.krs.style", "");
    await expect(compileProject("/index.krs", fs)).resolves.toBeDefined();
  });
});

describe("Incomplete import followed by other tokens - no infinite loop", () => {
  it("should not hang on 'import\\nsystem ...'", () => {
    const result = Parser.parse('import\nsystem "Test" {\n  person User "User"\n}');
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.value.systems).toHaveLength(1);
  });

  it("should not hang on '@import ...\\nimport\\nsystem ...'", () => {
    const result = Parser.parse(
      '@import "default.krs.style"\nimport\nsystem "Test" {\n  person User "User"\n}',
    );
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.value.styleImports).toEqual(["default.krs.style"]);
    expect(result.value.systems).toHaveLength(1);
  });

  it("should not hang on 'import { system ...'", () => {
    const result = Parser.parse('import {\nsystem "Test" {}');
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it("should handle compileProject with import followed by system", async () => {
    const fs = new InMemoryFileSystemProvider();
    await fs.writeFile(
      "/index.krs",
      '@import "s.krs.style"\nimport\nsystem "Test" {\n  person User "User"\n}',
    );
    await fs.writeFile("/s.krs.style", "");
    const result = await compileProject("/index.krs", fs);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.svg).toBeDefined();
  });
});
