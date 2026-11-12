import { describe, expect, it } from "vitest";
import { gzipSync } from "node:zlib";
import {
  compareTarballs,
  isSame,
  packagePath,
  platformPackages,
  readTarball,
  readTarballStrict,
  readTarballWithNodeTar,
  manifestDifferences,
  sameNoticesAcrossPlatforms,
} from "./tarball.mts";

// Fences the tarball check of #3240: a staged or published tarball is compared
// file by file with a pack of the release commit, read in memory only.

type Entry = {
  path: string;
  content?: string;
  type?: string;
  badChecksum?: boolean;
  /** Bytes written to the uname field. */
  uname?: Buffer;
  prefix?: string;
  /** Store the signed checksum, which node-tar refuses. */
  signed?: boolean;
};

function header(
  name: string,
  size: number,
  type: string,
  badChecksum = false,
  extra: Pick<Entry, "uname" | "prefix" | "signed"> = {},
): Buffer {
  const block = Buffer.alloc(512);
  block.write(name, 0, 100, "latin1");
  extra.uname?.copy(block, 265);
  if (extra.prefix) block.write(extra.prefix, 345);
  block.write("0000644\0", 100);
  block.write(`${size.toString(8).padStart(11, "0")}\0`, 124);
  block.write(type, 156);
  block.write("ustar\0", 257);
  block.write("00", 263);
  block.fill(0x20, 148, 156);
  const sum =
    block.reduce((total, byte) => total + (extra.signed && byte > 127 ? byte - 256 : byte), 0) +
    (badChecksum ? 1 : 0);
  block.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148);
  return block;
}

function pad(data: Buffer): Buffer {
  const rest = data.length % 512;
  return rest === 0 ? data : Buffer.concat([data, Buffer.alloc(512 - rest)]);
}

/** One pax record, `<length> <key>=<value>\n`. */
function paxRecord(key: string, value: string): string {
  const rest = ` ${key}=${value}\n`;
  let length = rest.length;
  while (`${length}${rest}`.length !== length) length = `${length}${rest}`.length;
  return `${length}${rest}`;
}

/** A pax extended header holding `records`, as node-tar writes one. */
function paxBlocks(records: Record<string, string>): Buffer[] {
  const body = Object.entries(records)
    .map(([key, value]) => paxRecord(key, value))
    .join("");
  const data = Buffer.from(body);
  return [header("PaxHeader", data.length, "x"), pad(data)];
}

function tar(entries: (Entry | Buffer[])[]): Buffer {
  const blocks: Buffer[] = [];
  for (const entry of entries) {
    if (Array.isArray(entry)) {
      blocks.push(...entry);
      continue;
    }
    const data = Buffer.from(entry.content ?? "");
    blocks.push(
      header(entry.path, data.length, entry.type ?? "0", entry.badChecksum, entry),
      pad(data),
    );
  }
  return Buffer.concat(blocks);
}

const END = Buffer.alloc(1024);

const tgz = (entries: (Entry | Buffer[])[]): Buffer => gzipSync(Buffer.concat([tar(entries), END]));

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
      tgz([paxBlocks({ path: long }), { path: "package/short", content: "y" }]),
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

  it("refuses the same path twice, also as a case-insensitive file system sees it", () => {
    const twice = (second: string) =>
      readTarball(
        tgz([
          { path: "package/a.js", content: "1" },
          { path: second, content: "2" },
        ]),
      );
    expect(() => twice("package/a.js")).toThrow(/duplicate/);
    expect(() => twice("package/A.js")).toThrow(/duplicate/);
  });

  // The shapes below are ones node-tar reads differently from a lenient reader:
  // each could hide a file that `npm i` extracts but the check never sees.
  it("refuses an entry hidden behind a single zero block", () => {
    const hidden = Buffer.concat([
      tar([{ path: "package/index.js", content: "benign" }]),
      Buffer.alloc(512),
      tar([{ path: "package/index.js", content: "EVIL" }]),
      END,
    ]);
    expect(() => readTarball(gzipSync(hidden))).toThrow(/after the end-of-archive/);
  });

  it("refuses a header with a wrong checksum", () => {
    expect(() =>
      readTarball(tgz([{ path: "package/index.js", content: "x", badChecksum: true }])),
    ).toThrow(/checksum/);
  });

  it("refuses pax records that change more than metadata, and global pax headers", () => {
    expect(() =>
      readTarball(tgz([paxBlocks({ size: "4" }), { path: "package/index.js", content: "x" }])),
    ).toThrow(/unsupported pax record/);
    expect(() =>
      readTarball(
        tgz([paxBlocks({ linkpath: "/etc/passwd" }), { path: "package/a", content: "" }]),
      ),
    ).toThrow(/unsupported pax record/);
    expect(() => readTarball(tgz([{ path: "pax_global_header", type: "g" }]))).toThrow(
      /unexpected tar entry type/,
    );
  });

  it("refuses a header that is not POSIX ustar", () => {
    const gnu = header("package/index.js", 1, "0");
    gnu.write("ustar  \0", 257);
    gnu.fill(0x20, 148, 156);
    const sum = gnu.reduce((total, byte) => total + byte, 0);
    gnu.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148);
    expect(() => readTarball(gzipSync(Buffer.concat([gnu, pad(Buffer.from("x")), END])))).toThrow(
      /ustar/,
    );
  });

  it("refuses a checksum node-tar refuses, which would make it read data as headers", () => {
    // node-tar skips a header whose checksum is only right as a signed sum and
    // reads its data block as the next header: here a pax header hides evil.js.
    const data = Buffer.alloc(1024);
    header("1024 mtime=x/evil.js", 5, "0").copy(data, 0);
    Buffer.from("EVIL\n").copy(data, 512);
    data[1023] = 0x0a;
    const archive = tgz([
      { path: "package/package.json", content: "{}" },
      [
        header("PaxHeader", data.length, "x", false, { uname: Buffer.from([0xff]), signed: true }),
        data,
      ],
    ]);
    expect(() => readTarball(archive)).toThrow(/checksum/);
    expect(() => readTarballWithNodeTar(archive)).toThrow(/node-tar refused/);
  });

  it("refuses a newline inside a pax value, which node-tar splits into another record", () => {
    const inner = paxRecord("path", "package/dist/index.js").replace(/\n$/, "");
    const data = Buffer.from(paxRecord("mtime", `1\n${inner}`));
    expect(() =>
      readTarball(
        tgz([
          [header("PaxHeader", data.length, "x"), pad(data)],
          { path: "package/README.md", content: "readme" },
        ]),
      ),
    ).toThrow(/malformed pax mtime/);
  });

  it("refuses data after the NUL of a name, and a pax path next to a ustar prefix", () => {
    expect(() =>
      readTarball(tgz([{ path: "package/README.md\0\n/x".padEnd(100, "y"), content: "r" }])),
    ).toThrow(/after its terminating NUL/);
    expect(() =>
      readTarball(
        tgz([
          paxBlocks({ path: "package/README.md" }),
          { path: "README.md", prefix: "package/dist", content: "r" },
        ]),
      ),
    ).toThrow(/pax path together with a ustar prefix/);
  });

  it("reads a plain archive the same way as npm's node-tar", () => {
    const archive = tgz([
      { path: "package/package.json", content: "{}" },
      paxBlocks({ path: `package/${"b".repeat(120)}.md` }),
      { path: "package/short", content: "long" },
    ]);
    expect([...readTarballWithNodeTar(archive)]).toEqual([...readTarball(archive)]);
  });

  it("refuses an archive without its end blocks", () => {
    expect(() => readTarball(gzipSync(tar([{ path: "package/a", content: "x" }])))).toThrow(
      /end-of-archive/,
    );
  });
});

describe("readTarballStrict", () => {
  it("refuses an archive that unpacks past the bound", () => {
    const archive = tgz([{ path: "package/big.txt", content: "x".repeat(4096) }]);
    expect(readTarballStrict(archive, { maxBytes: 64 * 1024 }).size).toBe(1);
    expect(() => readTarballStrict(archive, { maxBytes: 2048 })).toThrow(
      /unpacks to more than 2048 bytes/,
    );
  });
});

describe("packagePath", () => {
  it("drops the package/ segment", () => {
    expect(packagePath("package/skills/SKILL.md")).toBe("skills/SKILL.md");
  });

  it("refuses any path npm's extraction could place elsewhere", () => {
    for (const path of [
      "package/a/../../b",
      "/abs/file",
      "package/",
      "other/index.js",
      "package/./a.js",
      "package//a.js",
      "package/\\\\a\\b\\index.js",
      "package/a\\b.js",
      "package/c:/index.js",
    ]) {
      expect({ path, accepted: packagePath(path) }).toEqual({ path, accepted: null });
    }
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

  const notices = (platformPkg: string, licence = "MIT", extra = "") =>
    [
      "# Third-Party Notices",
      "",
      `## ${platformPkg}@0.28.2`,
      "",
      "```",
      licence,
      "```",
      "",
      extra,
      "## yaml@2.9.1",
      "",
      "```",
      "## @esbuild/linux-x64@0.28.2 inside a licence",
      "```",
    ].join("\n");
  const platform = new Set(["@esbuild/linux-x64", "@esbuild/linux-arm64"]);

  it("accepts notices that only name another platform's package", () => {
    expect(
      sameNoticesAcrossPlatforms(
        notices("@esbuild/linux-arm64"),
        notices("@esbuild/linux-x64"),
        platform,
      ),
    ).toBe(true);
  });

  it("refuses a different text under a platform heading, or an added section", () => {
    expect(
      sameNoticesAcrossPlatforms(
        notices("@esbuild/linux-arm64"),
        notices("@esbuild/linux-x64", "Evil"),
        platform,
      ),
    ).toBe(false);
    expect(
      sameNoticesAcrossPlatforms(
        notices("@esbuild/linux-arm64"),
        notices("@esbuild/linux-x64", "MIT", "## @esbuild/linux-x64@0\n\nvisit evil.example\n\n"),
        platform,
      ),
    ).toBe(false);
  });

  it("refuses a heading swap that names a package without os or cpu", () => {
    expect(
      sameNoticesAcrossPlatforms(notices("@esbuild/linux-arm64"), notices("left-pad"), platform),
    ).toBe(false);
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

  it("lets a notices file differ only by its platform packages", () => {
    const notices = (platformPkg: string, body = "MIT") =>
      `# N\n\n## ${platformPkg}@1.0.0\n\nx\n\n## yaml@2.9.1\n\n${body}\n`;
    const platform = new Set(["@esbuild/linux-x64", "@esbuild/linux-arm64"]);
    const path = "dist/app/THIRD_PARTY_NOTICES.md";
    const expected = files({ [path]: notices("@esbuild/linux-arm64") });
    expect(
      isSame(compareTarballs(expected, files({ [path]: notices("@esbuild/linux-x64") }), platform)),
    ).toBe(true);
    expect(
      compareTarballs(
        expected,
        files({ [path]: notices("@esbuild/linux-x64", "Apache") }),
        platform,
      ).changed,
    ).toEqual([path]);
  });
});

describe("manifestDifferences", () => {
  const packed = {
    name: "karasu",
    bin: { karasu: "dist/index.js" },
    dependencies: { "karasu-skills": "0.3.0", yaml: "^2.9.1" },
    scripts: { prepack: "pnpm run build" },
  };

  it("matches registry metadata with the same install fields in another key order", () => {
    const registry = {
      ...packed,
      dependencies: { yaml: "^2.9.1", "karasu-skills": "0.3.0" },
      dist: { tarball: "https://registry.npmjs.org/karasu/-/karasu-0.11.0.tgz" },
      _id: "karasu@0.11.0",
    };
    expect(manifestDifferences(packed, registry)).toEqual([]);
  });

  it("reads bin the way npm installs it", () => {
    const withBin = (bin: unknown) => ({ name: "karasu", bin });
    expect(
      manifestDifferences(
        withBin({ karasu: "./dist/index.js" }),
        withBin({ karasu: "dist/index.js" }),
      ),
    ).toEqual([]);
    expect(
      manifestDifferences(withBin("./dist/index.js"), withBin({ karasu: "dist/index.js" })),
    ).toEqual([]);
    expect(
      manifestDifferences(
        withBin({ karasu: "dist/index.js" }),
        withBin({ karasu: "dist/evil.js" }),
      ),
    ).toEqual(["bin"]);
  });

  it("keeps the scope out of a string bin's command, and flags a renamed command", () => {
    const scoped = (bin: unknown) => ({ name: "@karasu-tools/x", bin });
    expect(manifestDifferences(scoped("./cli.js"), scoped({ x: "cli.js" }))).toEqual([]);
    expect(manifestDifferences(scoped({ x: "cli.js" }), scoped({ y: "cli.js" }))).toEqual(["bin"]);
  });

  it("compares a bin target that is not a string as it is", () => {
    const withBin = (bin: unknown) => ({ name: "karasu", bin });
    expect(manifestDifferences(withBin({ karasu: "1" }), withBin({ karasu: 1 }))).toEqual(["bin"]);
  });

  it("finds a dependency or an install script only the registry metadata has", () => {
    const registry = {
      ...packed,
      dependencies: { ...packed.dependencies, evil: "1.0.0" },
      scripts: { ...packed.scripts, postinstall: "node evil.js" },
    };
    expect(manifestDifferences(packed, registry)).toEqual(["dependencies", "scripts"]);
  });
});
