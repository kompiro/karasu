import { describe, it, expect } from "vitest";
import { normalizePath, resolvePath, dirname, basename, extname } from "./path-utils";

describe("normalizePath", () => {
  it("removes . segments", () => {
    expect(normalizePath("/a/./b/./c")).toBe("/a/b/c");
  });

  it("resolves .. segments", () => {
    expect(normalizePath("/a/b/../c")).toBe("/a/c");
  });

  it("resolves multiple .. segments", () => {
    expect(normalizePath("/a/b/c/../../d")).toBe("/a/d");
  });

  it("does not go above root for absolute paths", () => {
    expect(normalizePath("/a/../..")).toBe("/");
  });

  it("keeps .. for relative paths when needed", () => {
    expect(normalizePath("a/../../b")).toBe("../b");
  });

  it("collapses double slashes", () => {
    expect(normalizePath("/a//b///c")).toBe("/a/b/c");
  });

  it("returns / for root", () => {
    expect(normalizePath("/")).toBe("/");
  });

  it("returns . for empty relative path", () => {
    expect(normalizePath("")).toBe(".");
    expect(normalizePath(".")).toBe(".");
  });

  it("handles relative paths", () => {
    expect(normalizePath("a/b/c")).toBe("a/b/c");
  });
});

describe("resolvePath", () => {
  it("resolves relative path from base file", () => {
    expect(resolvePath("/a/b/c.krs", "../d.krs")).toBe("/a/d.krs");
  });

  it("resolves same-directory path", () => {
    expect(resolvePath("/a/b/c.krs", "./d.krs")).toBe("/a/b/d.krs");
  });

  it("resolves simple filename", () => {
    expect(resolvePath("/a/b/c.krs", "d.krs")).toBe("/a/b/d.krs");
  });

  it("returns absolute path as-is when relative is absolute", () => {
    expect(resolvePath("/a/b/c.krs", "/x/y.krs")).toBe("/x/y.krs");
  });

  it("resolves nested relative path", () => {
    expect(resolvePath("/project/index.krs", "services/ec.krs")).toBe("/project/services/ec.krs");
  });
});

describe("dirname", () => {
  it("returns directory of absolute path", () => {
    expect(dirname("/a/b/c.krs")).toBe("/a/b");
  });

  it("returns / for root-level file", () => {
    expect(dirname("/file.krs")).toBe("/");
  });

  it("returns . for bare filename", () => {
    expect(dirname("file.krs")).toBe(".");
  });
});

describe("basename", () => {
  it("returns filename from path", () => {
    expect(basename("/a/b/c.krs")).toBe("c.krs");
  });

  it("returns bare filename as-is", () => {
    expect(basename("file.krs")).toBe("file.krs");
  });
});

describe("extname", () => {
  it("returns extension with dot", () => {
    expect(extname("/a/b/c.krs")).toBe(".krs");
  });

  it("returns last extension for double extensions", () => {
    expect(extname("style.krs.style")).toBe(".style");
  });

  it("returns empty for no extension", () => {
    expect(extname("Makefile")).toBe("");
  });

  it("returns empty for dotfile", () => {
    expect(extname(".gitignore")).toBe("");
  });
});
