import { describe, it, expect } from "vitest";
import { readFile, readdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import {
  extractFrontmatter,
  parsePermalinkField,
  splitSourceAnchor,
  normalizeAnchor,
  validateShort,
  checkAdrFile,
  type Problem,
} from "./check-permalinks.ts";
import { type FileSystemProvider, type DirEntry } from "../../packages/core/src/index.ts";

const FIXTURE_ROOT = dirname(fileURLToPath(import.meta.url));

class ReadOnlyNodeFs implements FileSystemProvider {
  async readFile(path: string): Promise<string> {
    return readFile(path, "utf-8");
  }
  async readDir(path: string): Promise<DirEntry[]> {
    const entries = await readdir(path, { withFileTypes: true });
    return entries.map((e) => ({
      name: e.name,
      kind: e.isDirectory() ? ("directory" as const) : ("file" as const),
    }));
  }
  async exists(path: string): Promise<boolean> {
    try {
      await stat(path);
      return true;
    } catch {
      return false;
    }
  }
  async writeFile(): Promise<void> {
    throw new Error("no");
  }
  async delete(): Promise<void> {
    throw new Error("no");
  }
  async mkdir(): Promise<void> {
    throw new Error("no");
  }
}

const fs = new ReadOnlyNodeFs();

/** Build an ADR markdown doc with the given `permalink:` YAML lines. */
function adr(permalinkYaml: string): string {
  return `---\nid: ADR-20260713-01\ntitle: t\nstatus: accepted\ndate: 2026-07-13\ntopic: adr-tooling\n${permalinkYaml}\n---\n\n# body\n`;
}

async function check(md: string): Promise<Problem[]> {
  // Fixture .krs paths in the docs are written relative to FIXTURE_ROOT.
  return checkAdrFile("docs/adr/x.md", md, FIXTURE_ROOT, fs);
}

const SRC = "__fixtures__/sample.krs";

describe("extractFrontmatter", () => {
  it("returns the block between the first --- pair", () => {
    expect(extractFrontmatter("---\na: 1\n---\nbody")).toBe("a: 1");
  });
  it("returns null when there is no frontmatter", () => {
    expect(extractFrontmatter("# just body")).toBeNull();
  });
});

describe("parsePermalinkField", () => {
  it("returns null when there is no permalink field", () => {
    expect(parsePermalinkField("id: x")).toBeNull();
  });
  it("throws when permalink is not a list", () => {
    expect(() => parsePermalinkField("permalink:\n  source: a.krs")).toThrow(/must be a list/);
  });
  it("parses a list of entries", () => {
    const e = parsePermalinkField("permalink:\n  - source: a.krs\n    view: system");
    expect(e).toEqual([{ source: "a.krs", view: "system" }]);
  });
});

describe("splitSourceAnchor", () => {
  it("splits path and anchor", () => {
    expect(splitSourceAnchor("a/b.krs#krs-system-X")).toEqual({
      path: "a/b.krs",
      anchor: "krs-system-X",
    });
  });
  it("returns null anchor when absent", () => {
    expect(splitSourceAnchor("a/b.krs")).toEqual({ path: "a/b.krs", anchor: null });
  });
});

describe("normalizeAnchor", () => {
  it("drops a leading # and the :highlight suffix", () => {
    expect(normalizeAnchor("#krs-system-X:focusY")).toBe("krs-system-X");
    expect(normalizeAnchor("krs-org-Team")).toBe("krs-org-Team");
  });
});

describe("validateShort", () => {
  it("accepts an https query-form short link", () => {
    expect(validateShort("https://taka.kompiro.dev/AbCdEf", "f")).toEqual([]);
  });
  it("rejects a non-URL", () => {
    expect(validateShort("not a url", "f").length).toBe(1);
  });
  it("rejects a #s= fragment share (unfurl dies)", () => {
    const p = validateShort("https://karasu.example/s#s=eyJ...", "f");
    expect(p.length).toBe(1);
    expect(p[0].message).toMatch(/fragment/);
  });
});

describe("checkAdrFile", () => {
  it("passes an ADR with no permalink block", async () => {
    expect(await check(adr("scope:\n  packages: [core]"))).toEqual([]);
  });

  it("passes a valid source + deep anchor (case a)", async () => {
    const p = await check(
      adr(`permalink:\n  - source: ${SRC}#krs-system-Payments\n    view: system`),
    );
    expect(p).toEqual([]);
  });

  it("passes a source with no anchor (case f)", async () => {
    expect(await check(adr(`permalink:\n  - source: ${SRC}`))).toEqual([]);
  });

  it("fails a missing source (case b)", async () => {
    const p = await check(adr(`permalink:\n  - short: https://taka.kompiro.dev/x`));
    expect(p.length).toBe(1);
    expect(p[0].message).toMatch(/required `source`/);
  });

  it("fails a non-existent source file (case c)", async () => {
    const p = await check(adr(`permalink:\n  - source: nope.krs`));
    expect(p.length).toBe(1);
    expect(p[0].message).toMatch(/does not exist/);
  });

  it("fails a dangling anchor — renamed/removed element (case d)", async () => {
    const p = await check(adr(`permalink:\n  - source: ${SRC}#krs-system-Gone`));
    expect(p.length).toBe(1);
    expect(p[0].message).toMatch(/does not resolve/);
  });

  it("accepts a bare whole-view anchor (deploy tab, no element id)", async () => {
    expect(await check(adr(`permalink:\n  - source: ${SRC}#krs-deploy`))).toEqual([]);
  });

  it("accepts the org Tree View mode anchor", async () => {
    expect(await check(adr(`permalink:\n  - source: ${SRC}#krs-org-tree`))).toEqual([]);
  });

  it("fails an unknown view token in the anchor (case e)", async () => {
    const p = await check(adr(`permalink:\n  - source: ${SRC}#krs-bogus-Payments`));
    expect(p.some((x) => /unknown view/.test(x.message))).toBe(true);
  });

  it("fails an unknown `view` field", async () => {
    const p = await check(adr(`permalink:\n  - source: ${SRC}\n    view: bogus`));
    expect(p.length).toBe(1);
    expect(p[0].message).toMatch(/not a known view/);
  });

  it("surfaces a bad `short` alongside a valid source", async () => {
    const p = await check(adr(`permalink:\n  - source: ${SRC}\n    short: nope`));
    expect(p.length).toBe(1);
    expect(p[0].message).toMatch(/not a valid URL/);
  });

  it("reports each entry independently", async () => {
    const p = await check(
      adr(`permalink:\n  - source: ${SRC}#krs-system-Payments\n  - source: nope.krs`),
    );
    expect(p.length).toBe(1);
    expect(p[0].message).toMatch(/permalink\[1\]/);
  });
});
