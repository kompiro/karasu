import { describe, expect, it } from "vitest";
import { InMemoryFileSystemProvider, type ExampleProject } from "@karasu-tools/core";
import { isNamedAfterExample, projectMatchesExample } from "./project-matches-example.js";

const example: ExampleProject = {
  name: "getting-started",
  files: [
    { path: "index.krs", content: "system A {}\n" },
    { path: "default.krs.style", content: "system { }\n" },
  ],
};
const project = { rootPath: "/p" };

async function withFiles(files: Record<string, string>) {
  const fs = new InMemoryFileSystemProvider();
  await fs.mkdir("/p");
  for (const [path, content] of Object.entries(files)) await fs.writeFile(`/p/${path}`, content);
  return fs;
}

describe("isNamedAfterExample (#3600)", () => {
  it.each([
    ["getting-started", true],
    ["getting-started (2)", true],
    ["getting-started (12)", true],
    ["getting-started (work)", false],
    ["getting-started-2", false],
    ["service-split", false],
  ])("%s: %s", (name, expected) => {
    expect(isNamedAfterExample({ name }, example)).toBe(expected);
  });
});

describe("projectMatchesExample (#3600)", () => {
  it("matches when every file of the sample is there unchanged", async () => {
    const fs = await withFiles({
      "index.krs": "system A {}\n",
      "default.krs.style": "system { }\n",
    });
    expect(await projectMatchesExample(fs, project, example)).toBe(true);
  });

  it("ignores a file the visitor added: the sample's text still holds", async () => {
    const fs = await withFiles({
      "index.krs": "system A {}\n",
      "default.krs.style": "system { }\n",
      "notes.krs": "system B {}\n",
    });
    expect(await projectMatchesExample(fs, project, example)).toBe(true);
  });

  it("does not match when a file was edited", async () => {
    const fs = await withFiles({
      "index.krs": "system B {}\n",
      "default.krs.style": "system { }\n",
    });
    expect(await projectMatchesExample(fs, project, example)).toBe(false);
  });

  it("does not match when a file is missing or cannot be read", async () => {
    const fs = await withFiles({ "index.krs": "system A {}\n" });
    expect(await projectMatchesExample(fs, project, example)).toBe(false);
    const broken = {
      readFile: () => Promise.reject(new Error("blocked")),
    };
    expect(await projectMatchesExample(broken, project, example)).toBe(false);
  });
});
