import { describe, expect, it } from "vitest";
import { InMemoryFileSystemProvider } from "@karasu-tools/core";
import { ObservableFileSystemProvider } from "../fs/observable-provider.js";
import {
  deriveStyleFilePath,
  injectStyleImport,
  resolveOrDeriveStyleAppendTarget,
  resolveStyleAppendTarget,
  upsertEdgeDirectionRule,
  upsertStyleProperty,
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

  it("uses the open file itself when it is a .krs.style", () => {
    // The file content is irrelevant in this case — we don't parse a
    // .krs.style as if it were .krs.
    expect(resolveStyleAppendTarget("edge { color: red; }", "/project/site.krs.style")).toBe(
      "/project/site.krs.style",
    );
  });

  it("uses the open .krs.style even when its content is empty / unloaded", () => {
    expect(resolveStyleAppendTarget(undefined, "/project/site.krs.style")).toBe(
      "/project/site.krs.style",
    );
  });

  it("treats files that merely contain `.krs.style` in the path correctly", () => {
    // The trailing `.krs.style` is what matters — the path can include
    // arbitrary directory segments.
    expect(resolveStyleAppendTarget(undefined, "/deep/nested/path/theme.krs.style")).toBe(
      "/deep/nested/path/theme.krs.style",
    );
  });
});

describe("upsertEdgeDirectionRule", () => {
  it("creates the file with the rule when it does not exist", async () => {
    const fs = new InMemoryFileSystemProvider();
    await upsertEdgeDirectionRule(fs, "/site.krs.style", "criticalWrite", "down");
    expect(await fs.readFile("/site.krs.style")).toBe("edge#criticalWrite { direction: down; }\n");
  });

  it("appends to an existing file when no matching rule is present", async () => {
    const fs = new InMemoryFileSystemProvider();
    await fs.writeFile("/site.krs.style", "edge { color: red; }\n");
    await upsertEdgeDirectionRule(fs, "/site.krs.style", "criticalWrite", "right");
    expect(await fs.readFile("/site.krs.style")).toBe(
      "edge { color: red; }\nedge#criticalWrite { direction: right; }\n",
    );
  });

  it("inserts a separator newline when the existing file lacks a trailing newline", async () => {
    const fs = new InMemoryFileSystemProvider();
    await fs.writeFile("/site.krs.style", "edge { color: red; }");
    await upsertEdgeDirectionRule(fs, "/site.krs.style", "foo", "up");
    expect(await fs.readFile("/site.krs.style")).toBe(
      "edge { color: red; }\nedge#foo { direction: up; }\n",
    );
  });

  it("rewrites the existing single-line rule in place instead of appending", async () => {
    const fs = new InMemoryFileSystemProvider();
    await fs.writeFile("/site.krs.style", "edge#flow { direction: down; }\n");
    await upsertEdgeDirectionRule(fs, "/site.krs.style", "flow", "right");
    expect(await fs.readFile("/site.krs.style")).toBe("edge#flow { direction: right; }\n");
  });

  it("does not collide rules whose ids share a prefix", async () => {
    // edge#flow must not match edge#flow2 (full selector match, not prefix).
    const fs = new InMemoryFileSystemProvider();
    await fs.writeFile("/site.krs.style", "edge#flow2 { direction: down; }\n");
    await upsertEdgeDirectionRule(fs, "/site.krs.style", "flow", "up");
    expect(await fs.readFile("/site.krs.style")).toBe(
      "edge#flow2 { direction: down; }\nedge#flow { direction: up; }\n",
    );
  });

  // #1563 (TPL-20260613-02): the GUI append's read-modify-write must not lose
  // the editor's concurrent auto-save on the same open .krs.style. Through the
  // ObservableFileSystemProvider both go through the per-path queue, so the
  // editor's write is preserved and the rule is appended to it — not to a stale
  // pre-save read.
  it("does not clobber a concurrent editor save when run through the serialized provider", async () => {
    const fs = new ObservableFileSystemProvider(new InMemoryFileSystemProvider());
    await fs.writeFile("/site.krs.style", "edge { color: red; }\n");
    await Promise.all([
      fs.writeFile("/site.krs.style", "edge { color: red; }\nuser { shape: user; }\n"),
      upsertEdgeDirectionRule(fs, "/site.krs.style", "criticalWrite", "down"),
    ]);
    const result = await fs.readFile("/site.krs.style");
    // The editor's save is preserved (not dropped by the append's stale read),
    // and the direction rule is present.
    expect(result).toContain("user { shape: user; }");
    expect(result).toContain("edge#criticalWrite { direction: down; }");
  });
});

describe("upsertStyleProperty", () => {
  it("appends when no block exists", () => {
    expect(upsertStyleProperty("", "edge#a", "direction", "down")).toBe(
      "edge#a { direction: down; }\n",
    );
  });

  it("rewrites a single-line rule in place", () => {
    expect(upsertStyleProperty("edge#a { direction: down; }\n", "edge#a", "direction", "up")).toBe(
      "edge#a { direction: up; }\n",
    );
  });

  it("rewrites a multi-line single-property rule in place (newlines OK when 1 prop, no comments)", () => {
    const before = "edge#a {\n  direction: down;\n}\n";
    const after = upsertStyleProperty(before, "edge#a", "direction", "up");
    expect(after).toBe("edge#a {\n  direction: up;\n}\n");
  });

  it("falls back to append for multi-property rules", () => {
    const before = "edge#a { color: red; direction: down; }\n";
    const after = upsertStyleProperty(before, "edge#a", "direction", "up");
    expect(after).toBe("edge#a { color: red; direction: down; }\nedge#a { direction: up; }\n");
  });

  it("falls back to append when the block contains a /* */ comment", () => {
    const before = "edge#a { /* note */ direction: down; }\n";
    const after = upsertStyleProperty(before, "edge#a", "direction", "up");
    expect(after).toBe("edge#a { /* note */ direction: down; }\nedge#a { direction: up; }\n");
  });

  it("falls back to append when the block contains a // line comment", () => {
    const before = "edge#a {\n  // note\n  direction: down;\n}\n";
    const after = upsertStyleProperty(before, "edge#a", "direction", "up");
    expect(after).toBe("edge#a {\n  // note\n  direction: down;\n}\nedge#a { direction: up; }\n");
  });

  it("updates the LAST matching block when the same selector appears multiple times", () => {
    // Cascade-tail wins; rewriting the last block matches the effective value.
    const before =
      "edge#a { direction: down; }\nedge { color: red; }\nedge#a { direction: left; }\n";
    const after = upsertStyleProperty(before, "edge#a", "direction", "right");
    expect(after).toBe(
      "edge#a { direction: down; }\nedge { color: red; }\nedge#a { direction: right; }\n",
    );
  });

  it("works for node-style id selectors (general for `#<id>`)", () => {
    const before = "#OrderDB { color: red; }\n";
    const after = upsertStyleProperty(before, "#OrderDB", "color", "blue");
    expect(after).toBe("#OrderDB { color: blue; }\n");
  });

  it("preserves the rest of the file verbatim around the rewrite", () => {
    const before =
      "/* heading */\nedge { color: red; }\nedge#a { direction: down; }\n// trailing\n";
    const after = upsertStyleProperty(before, "edge#a", "direction", "up");
    expect(after).toBe(
      "/* heading */\nedge { color: red; }\nedge#a { direction: up; }\n// trailing\n",
    );
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
