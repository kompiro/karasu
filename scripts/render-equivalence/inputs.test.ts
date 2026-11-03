import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildManifest, mergeInputs } from "./inputs.ts";

let work: string;

function write(root: string, rel: string, text: string): void {
  const path = join(root, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), "render-equivalence-inputs-"));
});
afterEach(() => {
  rmSync(work, { recursive: true, force: true });
});

describe("mergeInputs", () => {
  it("takes HEAD's copy of a file both sides have, and the merge base's of one HEAD deleted", () => {
    const base = join(work, "base");
    const head = join(work, "head");
    write(base, "examples/a/index.krs", "system Old {}");
    write(head, "examples/a/index.krs", "system New {}");
    write(base, "examples/gone/index.krs", "system Gone {}");
    write(head, "examples/added/index.krs", "system Added {}");
    write(base, "docs/acceptance/0001-x.md", "base record");

    const into = join(work, "inputs");
    expect(mergeInputs(base, head, into)).toEqual([
      "docs/acceptance/0001-x.md",
      "examples/a/index.krs",
      "examples/added/index.krs",
      "examples/gone/index.krs",
    ]);
    expect(readFileSync(join(into, "examples/a/index.krs"), "utf8")).toBe("system New {}");
    expect(readFileSync(join(into, "examples/gone/index.krs"), "utf8")).toBe("system Gone {}");
  });

  it("reads only the acceptance records, not other files under docs/acceptance", () => {
    const root = join(work, "root");
    write(root, "docs/acceptance/0001-x.md", "");
    write(root, "docs/acceptance/README.txt", "");
    write(root, "docs/acceptance/fixtures/0002-y.md", "");
    expect(mergeInputs(root, root, join(work, "inputs"))).toEqual(["docs/acceptance/0001-x.md"]);
  });
});

describe("buildManifest", () => {
  it("renders entries and fences, formats every .krs and tidies every sheet", () => {
    const root = join(work, "inputs");
    write(root, "examples/a/index.krs", 'import "./part.krs"\nsystem A {}');
    write(root, "examples/a/part.krs", "system Part {}");
    write(root, "examples/a/theme.krs.style", "service { color: red }");
    write(
      root,
      "docs/acceptance/0001-x.md",
      [
        "```krs",
        "system F {}",
        "```",
        "```krs fragment",
        "service S",
        "```",
        "```krs.style",
        "system { color: blue }",
        "```",
      ].join("\n"),
    );
    const files = mergeInputs(root, root, join(work, "copy"));
    const manifest = buildManifest(join(work, "copy"), files);

    // The imported part is drawn with its entry, not on its own.
    expect(manifest.entries.map((e) => e.name)).toEqual([
      "examples/a/index.krs",
      "docs/acceptance/0001-x.md#L1",
    ]);
    expect(manifest.krs.map((s) => s.name)).toEqual([
      "docs/acceptance/0001-x.md#L1",
      "examples/a/index.krs",
      "examples/a/part.krs",
    ]);
    expect(manifest.styles).toEqual([
      { name: "docs/acceptance/0001-x.md#L7", source: "system { color: blue }" },
      { name: "examples/a/theme.krs.style", source: "service { color: red }" },
    ]);
  });
});
