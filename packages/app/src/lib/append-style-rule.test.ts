import { describe, expect, it } from "vitest";
import { InMemoryFileSystemProvider } from "@karasu-tools/core";
import { appendEdgeDirectionRule, resolveStyleAppendTarget } from "./append-style-rule.js";

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
