import { describe, expect, it } from "vitest";
import { gzipSync } from "node:zlib";
import {
  compareTarballs,
  isSame,
  packagePath,
  platformPackages,
  readTarball,
  withoutPlatformSections,
} from "./tarball.mts";

// Fences the tarball check of #3240: a staged or published tarball is compared
// file by file with a pack of the release commit, read in memory only.

type Entry = { path: string; content?: string; type?: string };

function header(name: string, size: number, type: string): Buffer {
  const block = Buffer.alloc(512);
  block.write(name, 0, 100, "utf8");
  block.write("0000644\0", 100);
  block.write(`${size.toString(8).padStart(11, "0")}\0`, 124);
  block.write(type, 156);
  block.write("ustar\0", 257);
  block.write("00", 263);
  return block;
}

function pad(data: Buffer): Buffer {
  const rest = data.length % 512;
  return rest === 0 ? data : Buffer.concat([data, Buffer.alloc(512 - rest)]);
}

function tgz(entries: Entry[], opts: { pax?: Record<string, string> } = {}): Buffer {
  const blocks: Buffer[] = [];
  for (const entry of entries) {
    const data = Buffer.from(entry.content ?? "");
    if (opts.pax?.[entry.path]) {
      const record = `path=${opts.pax[entry.path]}\n`;
      const length = record.length + 3;
      const pax = Buffer.from(`${length + String(length).length - 2} ${record}`);
      blocks.push(header("PaxHeader", pax.length, "x"), pad(pax));
    }
    blocks.push(header(entry.path, data.length, entry.type ?? "0"), pad(data));
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks));
}

describe("readTarball", () => {
  it("reads the files under package/ by their path inside the package", () => {
    const files = readTarball(
      tgz([
        { path: "package/", type: "5" },
        { path: "package/package.json", content: '{"name":"karasu"}' },
        { path: "package/dist/index.js", content: "x" },
      ]),
    );
    expect([...files.keys()]).toEqual(["package.json", "dist/index.js"]);
    expect(files.get("package.json")?.toString()).toBe('{"name":"karasu"}');
  });

  it("takes the path from a pax header", () => {
    const long = `package/${"a".repeat(120)}.md`;
    const files = readTarball(
      tgz([{ path: "package/short", content: "y" }], { pax: { "package/short": long } }),
    );
    expect([...files.keys()]).toEqual([`${"a".repeat(120)}.md`]);
  });

  it("refuses an entry that would leave the package", () => {
    expect(() => readTarball(tgz([{ path: "package/../etc/passwd", content: "z" }]))).toThrow(
      /outside the package/,
    );
    expect(() => readTarball(tgz([{ path: "package/link", type: "2" }]))).toThrow(
      /unexpected tar entry type/,
    );
  });

  it("refuses the same path twice", () => {
    expect(() =>
      readTarball(
        tgz([
          { path: "package/a", content: "1" },
          { path: "package/./a", content: "2" },
        ]),
      ),
    ).toThrow(/duplicate/);
  });
});

describe("packagePath", () => {
  it("drops the first segment and refuses escapes", () => {
    expect(packagePath("package/skills/SKILL.md")).toBe("skills/SKILL.md");
    expect(packagePath("package/a/../../b")).toBeNull();
    expect(packagePath("/abs/file")).toBeNull();
    expect(packagePath("package/")).toBeNull();
  });
});

describe("platform notices", () => {
  const lockfile = [
    "lockfileVersion: '9.0'",
    "",
    "packages:",
    "",
    "  '@esbuild/linux-x64@0.28.2':",
    "    resolution: {integrity: sha512-x}",
    "    cpu: [x64]",
    "    os: [linux]",
    "",
    "  fsevents@2.3.3:",
    "    os: [darwin]",
    "",
    "  yaml@2.9.1:",
    "    resolution: {integrity: sha512-y}",
    "",
    "snapshots:",
    "",
    "  plain@1.0.0:",
    "    os: [linux]",
  ].join("\n");

  it("lists the packages the lockfile records with os or cpu", () => {
    expect([...platformPackages(lockfile)].sort()).toEqual(["@esbuild/linux-x64", "fsevents"]);
  });

  it("drops their sections, reading headings outside code fences only", () => {
    const notices = [
      "# Third-Party Notices",
      "",
      "## @esbuild/linux-x64@0.28.2",
      "",
      "```",
      "MIT",
      "```",
      "",
      "## yaml@2.9.1",
      "",
      "```",
      "## @esbuild/linux-x64@0.28.2 inside a licence",
      "```",
    ].join("\n");
    const kept = withoutPlatformSections(notices, new Set(["@esbuild/linux-x64"]));
    expect(kept).not.toContain("MIT");
    expect(kept).toContain("## yaml@2.9.1");
    expect(kept).toContain("inside a licence");
  });
});

describe("compareTarballs", () => {
  const files = (entries: Record<string, string>) =>
    new Map(Object.entries(entries).map(([path, content]) => [path, Buffer.from(content)]));

  it("matches the same files", () => {
    expect(isSame(compareTarballs(files({ a: "1", b: "2" }), files({ b: "2", a: "1" })))).toBe(
      true,
    );
  });

  it("reports missing, extra and changed files", () => {
    const diff = compareTarballs(files({ a: "1", b: "2" }), files({ b: "3", c: "4" }));
    expect(diff).toEqual({ missing: ["a"], extra: ["c"], changed: ["b"] });
  });

  it("ignores only the platform sections of a notices file", () => {
    const notices = (platformPkg: string, body = "MIT") =>
      `# N\n\n## ${platformPkg}@1.0.0\n\nx\n\n## yaml@2.9.1\n\n${body}\n`;
    const platform = new Set(["@esbuild/linux-x64", "@esbuild/linux-arm64"]);
    const expected = files({ "dist/app/THIRD_PARTY_NOTICES.md": notices("@esbuild/linux-arm64") });
    expect(
      isSame(
        compareTarballs(
          expected,
          files({ "dist/app/THIRD_PARTY_NOTICES.md": notices("@esbuild/linux-x64") }),
          platform,
        ),
      ),
    ).toBe(true);
    expect(
      compareTarballs(
        expected,
        files({ "dist/app/THIRD_PARTY_NOTICES.md": notices("@esbuild/linux-x64", "Apache") }),
        platform,
      ).changed,
    ).toEqual(["dist/app/THIRD_PARTY_NOTICES.md"]);
  });
});
