import { describe, it, expect } from "vitest";
import { compileProject } from "@karasu-tools/core";
import { SingleFileFileSystemProvider } from "./single-file-fs.js";

describe("SingleFileFileSystemProvider (#2997)", () => {
  it("answers a missing .krs.style as an empty sheet", async () => {
    const fs = new SingleFileFileSystemProvider();
    expect(await fs.readFile("/gallery/default.krs.style")).toBe("");
  });

  it("returns a .krs.style that exists and still fails on other missing files", async () => {
    const fs = new SingleFileFileSystemProvider();
    await fs.writeFile("/gallery/a.krs.style", "service { fill: red; }");
    expect(await fs.readFile("/gallery/a.krs.style")).toBe("service { fill: red; }");
    await expect(fs.readFile("/gallery/other.krs")).rejects.toThrow("ENOENT");
  });

  it("compiles a submission that imports a style it does not carry without a warning", async () => {
    const fs = new SingleFileFileSystemProvider();
    await fs.writeFile(
      "/gallery/index.krs",
      '@import "default.krs.style"\nsystem Shop {\n  service Api { label "API" }\n}\n',
    );
    const result = await compileProject("/gallery/index.krs", fs);
    expect(result.diagnostics.map((d) => d.code)).not.toContain("style-file-not-found");
  });
});
