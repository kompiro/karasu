import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Parser } from "@karasu-tools/core";
import { findDefinitionInImports } from "./definition-imports.js";

// Unit fence for the cross-file Go to Definition walk (AT-0037-4 beyond the
// named-import happy path covered by the VS Code E2E suite). Fixtures are
// real files on disk because the walk reads imports through `fs` — exactly
// what the `onDefinition` handler does at runtime (#2001).

describe("findDefinitionInImports — cross-file definition walk (AT-0037-4)", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "karasu-lsp-defs-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  /** Write a fixture file under the temp dir, creating parent directories. */
  function write(rel: string, content: string): string {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
    return abs;
  }

  /**
   * Run the walk exactly the way `onDefinition` does: parse the entry file
   * for its `nodeImports`, seed `visited` with the entry file's own path,
   * and pass the entry file's URI as the resolution base.
   */
  function walkFrom(entryPath: string, word: string) {
    const parsed = Parser.parse(readFileSync(entryPath, "utf-8"));
    const visited = new Set<string>([entryPath]);
    return findDefinitionInImports(
      parsed.value.nodeImports,
      word,
      pathToFileURL(entryPath).toString(),
      visited,
    );
  }

  it("resolves a named import", () => {
    const base = write("base.krs", `service SharedAuth {\n  label "Shared Auth"\n}\n`);
    const main = write("main.krs", `import { SharedAuth } from "./base.krs"\nsystem Platform {}\n`);

    const location = walkFrom(main, "SharedAuth");
    expect(location).not.toBeNull();
    expect(location!.uri).toBe(pathToFileURL(base).toString());
    // Anchored on the `service SharedAuth` declaration (first line, 0-based).
    expect(location!.range.start.line).toBe(0);
  });

  it("skips a file that does not declare the id", () => {
    // `base.krs` DOES declare `Hidden`, but the named import clause only
    // names `Alpha` — the walk must not look past the import clause.
    write("base.krs", `service Alpha {}\nservice Hidden {}\n`);
    const main = write("main.krs", `import { Alpha } from "./base.krs"\nsystem Platform {}\n`);

    expect(walkFrom(main, "Hidden")).toBeNull();
  });

  it("resolves a whole-file (wildcard) import", () => {
    const base = write("base.krs", `service Wildcarded {}\n`);
    const main = write("main.krs", `import "./base.krs"\nsystem Platform {}\n`);

    const location = walkFrom(main, "Wildcarded");
    expect(location).not.toBeNull();
    expect(location!.uri).toBe(pathToFileURL(base).toString());
  });

  it("resolves a directory import in sorted order", () => {
    // Both files declare `Dup`; the walk visits `.krs` files in sorted
    // filename order, so `a.krs` must win. The non-.krs file is ignored.
    const first = write("shared/a.krs", `service Dup {}\n`);
    write("shared/b.krs", `service Dup {}\n`);
    write("shared/notes.txt", `service Dup {}\n`);
    const main = write("main.krs", `import "./shared/"\nsystem Platform {}\n`);

    const location = walkFrom(main, "Dup");
    expect(location).not.toBeNull();
    expect(location!.uri).toBe(pathToFileURL(first).toString());
  });

  it("resolves a transitive import (main→mid→base)", () => {
    const base = write("base.krs", `service DeepTarget {}\n`);
    write("mid.krs", `import "./base.krs"\nservice Mid {}\n`);
    const main = write("main.krs", `import "./mid.krs"\nsystem Platform {}\n`);

    const location = walkFrom(main, "DeepTarget");
    expect(location).not.toBeNull();
    expect(location!.uri).toBe(pathToFileURL(base).toString());
  });

  it("terminates on an import cycle and returns null", () => {
    write("b.krs", `import "./a.krs"\nservice B {}\n`);
    const main = write("a.krs", `import "./b.krs"\nservice A {}\n`);

    // `a.krs` is seeded into `visited`, so when `b.krs` imports it back the
    // walk must skip it instead of recursing forever.
    expect(walkFrom(main, "NoSuchNode")).toBeNull();
  });

  it("returns null for an unknown identifier", () => {
    write("base.krs", `service Known {}\n`);
    const main = write("main.krs", `import "./base.krs"\nsystem Platform {}\n`);

    expect(walkFrom(main, "Unknown")).toBeNull();
  });

  it("ignores a missing import path", () => {
    // The wildcard import of `missing.krs` must be skipped without throwing,
    // and the walk must still reach the later import.
    const real = write("real.krs", `service RealThing {}\n`);
    const main = write(
      "main.krs",
      `import "./missing.krs"\nimport "./real.krs"\nsystem Platform {}\n`,
    );

    const location = walkFrom(main, "RealThing");
    expect(location).not.toBeNull();
    expect(location!.uri).toBe(pathToFileURL(real).toString());
  });
});
