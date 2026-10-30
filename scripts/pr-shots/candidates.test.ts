import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { collectCandidates, exampleEntries, fenceCandidates } from "./candidates.ts";

const root = mkdtempSync(join(tmpdir(), "pr-shots-candidates-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function write(path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

const MODEL = "system S {\n  service A\n}";

write(
  "docs/acceptance/sample.md",
  [
    "# AT",
    "",
    "```krs",
    MODEL,
    "```",
    "",
    "```krs fragment",
    "service A",
    "```",
    "",
    "```krs invalid",
    "system {",
    "```",
    "",
    "```bash",
    "pnpm test",
    "```",
  ].join("\n"),
);
write("docs/acceptance/untouched.md", ["```krs", MODEL, "```"].join("\n"));
write("examples/en/single/system.krs", MODEL);
write("examples/en/multi/index.krs", 'import "reader.krs"\n@import "default.krs.style"\n');
write("examples/en/multi/reader.krs", MODEL);
write("examples/en/named/system.krs", 'import { Pay } from "./payment.krs"\n');
write("examples/en/named/payment.krs", MODEL);
write("examples/en/at-import/main.krs", '@import "part.krs"\n');
write("examples/en/at-import/part.krs", MODEL);
write("models/extra.krs", MODEL);

describe("fenceCandidates", () => {
  it("takes only the plain krs fences of the acceptance records in the diff", () => {
    const fences = fenceCandidates(root, ["docs/acceptance/sample.md", "packages/core/src/x.ts"]);
    expect(fences).toEqual([
      { kind: "fence", name: "docs/acceptance/sample.md#L3", source: MODEL },
    ]);
  });

  it("skips a record the branch deleted", () => {
    expect(fenceCandidates(root, ["docs/acceptance/deleted.md"])).toEqual([]);
  });
});

describe("exampleEntries", () => {
  it("keeps the files no sibling imports, whatever the import form", () => {
    expect(exampleEntries(root)).toEqual([
      "examples/en/at-import/main.krs",
      "examples/en/multi/index.krs",
      "examples/en/named/system.krs",
      "examples/en/single/system.krs",
    ]);
  });
});

describe("collectCandidates", () => {
  it("orders --file, then the diff's fences, then the examples", () => {
    const candidates = collectCandidates({
      headRoot: root,
      files: ["models/extra.krs"],
      changedFiles: ["docs/acceptance/sample.md"],
    });
    expect(candidates.map((c) => `${c.kind}:${c.name}`)).toEqual([
      "file:models/extra.krs",
      "fence:docs/acceptance/sample.md#L3",
      "example:examples/en/at-import/main.krs",
      "example:examples/en/multi/index.krs",
      "example:examples/en/named/system.krs",
      "example:examples/en/single/system.krs",
    ]);
  });

  it("does not shoot a --file model a second time as an example", () => {
    const candidates = collectCandidates({
      headRoot: root,
      files: ["examples/en/single/system.krs"],
      changedFiles: [],
    });
    expect(candidates.filter((c) => c.name === "examples/en/single/system.krs")).toHaveLength(1);
    expect(candidates[0].kind).toBe("file");
  });

  it("refuses a --file that does not exist", () => {
    expect(() =>
      collectCandidates({ headRoot: root, files: ["nope.krs"], changedFiles: [] }),
    ).toThrow(/--file nope\.krs does not exist/);
  });
});
