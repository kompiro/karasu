import { describe, expect, it } from "vitest";
import { InMemoryFileSystemProvider } from "@karasu-tools/core";
import {
  appendEdgeDirectionRule,
  deriveStyleFilePath,
  injectStyleImport,
  resolveOrDeriveStyleAppendTarget,
  resolveStyleAppendTarget,
} from "./append-style-rule.js";

describe("resolveStyleAppendTarget", () => {
  it("returns undefined when no krs content is given", () => {
    expect(resolveStyleAppendTarget(undefined, "/a.krs")).toBeUndefined();
  });

  it("returns undefined when no krs path is given", () => {
    expect(resolveStyleAppendTarget('@import "a.krs.style"', undefined)).toBeUndefined();
  });

  it("returns undefined when the krs file has no @import", () => {
    expect(resolveStyleAppendTarget("system S {}", "/a.krs")).toBeUndefined();
  });

  it("returns the resolved path of the only @import", () => {
    const result = resolveStyleAppendTarget(
      `@import "site.krs.style"\nsystem S {}\n`,
      "/project/index.krs",
    );
    expect(result).toBe("/project/site.krs.style");
  });

  it("returns the last @import when multiple are present (cascade-tail wins)", () => {
    const result = resolveStyleAppendTarget(
      `@import "base.krs.style"\n@import "theme.krs.style"\nsystem S {}\n`,
      "/project/index.krs",
    );
    expect(result).toBe("/project/theme.krs.style");
  });
});

describe("appendEdgeDirectionRule", () => {
  it("creates the file with the rule when it does not exist", async () => {
    const fs = new InMemoryFileSystemProvider();
    await appendEdgeDirectionRule(fs, "/site.krs.style", "criticalWrite", "down");
    expect(await fs.readFile("/site.krs.style")).toBe("edge#criticalWrite { direction: down; }\n");
  });

  it("appends to an existing file without disturbing prior content", async () => {
    const fs = new InMemoryFileSystemProvider();
    await fs.writeFile("/site.krs.style", "edge { color: red; }\n");
    await appendEdgeDirectionRule(fs, "/site.krs.style", "criticalWrite", "right");
    expect(await fs.readFile("/site.krs.style")).toBe(
      "edge { color: red; }\nedge#criticalWrite { direction: right; }\n",
    );
  });

  it("inserts a separator newline when the existing file lacks a trailing newline", async () => {
    const fs = new InMemoryFileSystemProvider();
    await fs.writeFile("/site.krs.style", "edge { color: red; }");
    await appendEdgeDirectionRule(fs, "/site.krs.style", "foo", "up");
    expect(await fs.readFile("/site.krs.style")).toBe(
      "edge { color: red; }\nedge#foo { direction: up; }\n",
    );
  });

  it("emits exactly the expected block (no extra spaces, single newline)", async () => {
    const fs = new InMemoryFileSystemProvider();
    await appendEdgeDirectionRule(fs, "/x.krs.style", "id", "auto");
    expect(await fs.readFile("/x.krs.style")).toBe("edge#id { direction: auto; }\n");
  });
});

describe("deriveStyleFilePath", () => {
  it("strips a trailing .krs and appends .krs.style next to the source", () => {
    expect(deriveStyleFilePath("/project/flow.krs")).toBe("/project/flow.krs.style");
  });

  it("works for index.krs (no special-casing)", () => {
    expect(deriveStyleFilePath("/project/index.krs")).toBe("/project/index.krs.style");
  });

  it("resolves to the same directory as the source even when nested", () => {
    expect(deriveStyleFilePath("/a/b/c/diagram.krs")).toBe("/a/b/c/diagram.krs.style");
  });

  it("preserves files without a .krs extension by appending .krs.style", () => {
    // Defensive: callers shouldn't pass non-.krs paths, but don't crash either.
    expect(deriveStyleFilePath("/project/foo")).toBe("/project/foo.krs.style");
  });
});

describe("resolveOrDeriveStyleAppendTarget", () => {
  it("returns undefined when no krs path is given", () => {
    expect(resolveOrDeriveStyleAppendTarget('@import "a.krs.style"', undefined)).toBeUndefined();
  });

  it("prefers an existing @import over the derived path", () => {
    expect(
      resolveOrDeriveStyleAppendTarget(
        '@import "theme.krs.style"\nsystem S {}\n',
        "/project/index.krs",
      ),
    ).toBe("/project/theme.krs.style");
  });

  it("falls back to the derived path when no @import is present", () => {
    expect(resolveOrDeriveStyleAppendTarget("system S {}\n", "/project/flow.krs")).toBe(
      "/project/flow.krs.style",
    );
  });

  it("falls back to the derived path when content is empty", () => {
    expect(resolveOrDeriveStyleAppendTarget("", "/project/flow.krs")).toBe(
      "/project/flow.krs.style",
    );
  });
});

describe("injectStyleImport", () => {
  it("inserts the directive at line 1 of an existing source", () => {
    expect(injectStyleImport("system S {}\n", "flow.krs.style")).toBe(
      '@import "flow.krs.style"\nsystem S {}\n',
    );
  });

  it("creates a single-line file when the source is empty", () => {
    expect(injectStyleImport("", "flow.krs.style")).toBe('@import "flow.krs.style"\n');
  });

  it("is idempotent — does not stack the same import on a second invocation", () => {
    const after = injectStyleImport('@import "flow.krs.style"\nsystem S {}\n', "flow.krs.style");
    expect(after).toBe('@import "flow.krs.style"\nsystem S {}\n');
  });

  it("does not collide with a different existing @import (additive)", () => {
    const after = injectStyleImport('@import "base.krs.style"\nsystem S {}\n', "flow.krs.style");
    expect(after).toBe('@import "flow.krs.style"\n@import "base.krs.style"\nsystem S {}\n');
  });
});
