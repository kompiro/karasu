/**
 * Reads npm package tarballs in memory and compares their contents (#3240).
 *
 * Approving a staged version, or recording a published one, checks that its
 * tarball holds the same files as a pack of the release commit made somewhere
 * the CI run cannot reach. A hijacked run could otherwise stage a counterfeit
 * first and have it approved. Tarballs come from the registry, so they are
 * untrusted: entries are only read into memory, never written to a path taken
 * from the archive.
 *
 * Bytes of the archive itself are not compared, since gzip and tar metadata
 * differ between environments. Files are compared by path and content.
 *
 * Runs on Node's type stripping, so it uses erasable TypeScript only and
 * imports nothing but node builtins. Reading a tarball also loads the node-tar
 * that the npm CLI on PATH bundles (see `readTarball`).
 */
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { delimiter, dirname, join } from "node:path";
import { gunzipSync } from "node:zlib";

/** Path inside the package (the leading `package/` removed) → content. */
export type TarballFiles = Map<string, Buffer>;

const BLOCK = 512;

/*
 * A tarball is read twice, by two independent readers, and passes only if both
 * see the same files (`readTarball`):
 *
 * - node-tar, the library npm extracts packages with, loaded from the npm CLI
 *   itself and run in strict mode, so a warning is a failure;
 * - the strict reader below, which rejects anything it might interpret
 *   differently from node-tar instead of guessing.
 *
 * A counterfeit has to hide a file from the check while npm still extracts it.
 * Reviews of a single hand-written reader found such archives (an entry after
 * one zero block, a checksum node-tar refuses and then reads the data as
 * headers, a newline inside a pax value that node-tar splits on). To pass now,
 * an archive has to read the same way in both readers.
 */

/** pax records that only carry metadata; anything else is refused. */
const PAX_METADATA: Record<string, RegExp> = {
  path: /^[^\n\0]+$/,
  mtime: /^[0-9]+(\.[0-9]+)?$/,
  atime: /^[0-9]+(\.[0-9]+)?$/,
  ctime: /^[0-9]+(\.[0-9]+)?$/,
  uid: /^[0-9]+$/,
  gid: /^[0-9]+$/,
  uname: /^[^\n\0]*$/,
  gname: /^[^\n\0]*$/,
};

/** A NUL-terminated header field; fails if anything follows the first NUL. */
function readString(block: Buffer, offset: number, length: number): string {
  const raw = block.subarray(offset, offset + length);
  const end = raw.indexOf(0);
  if (end !== -1 && !raw.subarray(end).every((byte) => byte === 0)) {
    throw new Error("tar header field has data after its terminating NUL");
  }
  const text = (end === -1 ? raw : raw.subarray(0, end)).toString("utf8");
  if (text.includes("\n")) throw new Error("tar header field contains a newline");
  return text;
}

function readOctal(block: Buffer, offset: number, length: number): number {
  if (block[offset] & 0x80) throw new Error("base-256 numbers in tar headers are not supported");
  const raw = block.subarray(offset, offset + length).toString("latin1");
  const text = raw.replace(/[\0 ]+$/, "").replace(/^ +/, "");
  if (text === "") return 0;
  if (!/^[0-7]+$/.test(text))
    throw new Error(`malformed tar header number: ${JSON.stringify(raw)}`);
  return Number.parseInt(text, 8);
}

function checkHeader(header: Buffer): void {
  // node-tar accepts the unsigned sum only, so a signed one must fail here too.
  let sum = 0;
  for (let i = 0; i < BLOCK; i++) sum += i >= 148 && i < 156 ? 0x20 : header[i];
  if (readOctal(header, 148, 8) !== sum) throw new Error("tar header checksum mismatch");
  if (header.toString("latin1", 257, 265) !== "ustar\u000000") {
    throw new Error("only POSIX ustar tar headers are supported");
  }
}

/** The records of a pax extended header; fails on one it does not understand. */
function parsePax(data: Buffer): Record<string, string> {
  const records: Record<string, string> = {};
  let offset = 0;
  while (offset < data.length) {
    const space = data.indexOf(0x20, offset);
    const lengthText = space === -1 ? "" : data.toString("utf8", offset, space);
    if (!/^[1-9][0-9]*$/.test(lengthText)) throw new Error("malformed pax header");
    const end = offset + Number(lengthText);
    if (end > data.length || data[end - 1] !== 0x0a) throw new Error("malformed pax header");
    const record = data.toString("utf8", space + 1, end - 1);
    const eq = record.indexOf("=");
    if (eq <= 0) throw new Error("malformed pax header");
    const key = record.slice(0, eq);
    const value = record.slice(eq + 1);
    const allowed = Object.hasOwn(PAX_METADATA, key) ? PAX_METADATA[key] : null;
    if (allowed === null) throw new Error(`unsupported pax record: ${JSON.stringify(key)}`);
    // node-tar splits pax data on newlines, so one inside a value could carry
    // a record only node-tar sees.
    if (!allowed.test(value)) throw new Error(`malformed pax ${key} record`);
    if (Object.hasOwn(records, key)) throw new Error(`repeated pax record: ${key}`);
    records[key] = value;
    offset = end;
  }
  return records;
}

/**
 * A package path, or null for any path that npm's extraction could place
 * somewhere else. The first segment must be `package/`, as npm and pnpm write
 * it; every other segment must be a plain name. node-tar's Unpack keeps a `\\`
 * as a literal character, strips Windows drive and UNC roots after the first
 * segment, and drops empty segments, so a path with any of those could be
 * compared as one file and installed as another (even over a genuine file).
 */
export function packagePath(entryPath: string): string | null {
  const [first, ...rest] = entryPath.split("/");
  if (first !== "package" || rest.length === 0) return null;
  const plain = (segment: string) =>
    segment !== "" &&
    segment !== "." &&
    segment !== ".." &&
    !segment.includes("\\") &&
    !segment.includes(":");
  return rest.every(plain) ? rest.join("/") : null;
}

/** Adds a file, failing on one a case-insensitive file system would merge. */
function addFile(files: TarballFiles, folded: Set<string>, entryPath: string, data: Buffer): void {
  const path = packagePath(entryPath);
  if (path === null) throw new Error(`tar entry outside the package: ${JSON.stringify(entryPath)}`);
  const key = path.normalize("NFC").toLowerCase();
  if (folded.has(key)) throw new Error(`duplicate tar entry: ${path}`);
  folded.add(key);
  files.set(path, data);
}

/** The strict reader: every regular file, or a failure on anything unusual. */
export function readTarballStrict(gzipped: Buffer): TarballFiles {
  const tar = gunzipSync(gzipped);
  const files: TarballFiles = new Map();
  const folded = new Set<string>();
  let offset = 0;
  let pax: Record<string, string> | null = null;
  for (;;) {
    if (offset + BLOCK > tar.length)
      throw new Error("tar archive ends without its end-of-archive blocks");
    const header = tar.subarray(offset, offset + BLOCK);
    if (header.every((byte) => byte === 0)) {
      // The end of the archive: everything after it must be zero, so no entry
      // can hide behind a single zero block.
      if (!tar.subarray(offset).every((byte) => byte === 0)) {
        throw new Error("tar data after the end-of-archive block");
      }
      if (pax !== null) throw new Error("pax header without an entry");
      return files;
    }
    checkHeader(header);
    const size = readOctal(header, 124, 12);
    const type = String.fromCharCode(header[156] || 0x30);
    const dataStart = offset + BLOCK;
    const data = tar.subarray(dataStart, dataStart + size);
    if (data.length !== size) throw new Error("truncated tar entry");
    offset = dataStart + Math.ceil(size / BLOCK) * BLOCK;

    if (type === "x") {
      if (pax !== null) throw new Error("two pax headers in a row");
      pax = parsePax(data);
      continue;
    }

    const prefix = readString(header, 345, 155);
    const name = readString(header, 0, 100);
    if (pax?.path !== undefined && prefix !== "") {
      throw new Error("a pax path together with a ustar prefix is not supported");
    }
    const entryPath = pax?.path ?? (prefix ? `${prefix}/${name}` : name);
    pax = null;

    if (type === "5") {
      if (size !== 0) throw new Error(`directory entry with data: ${JSON.stringify(entryPath)}`);
      continue;
    }
    if (type !== "0")
      throw new Error(`unexpected tar entry type ${JSON.stringify(type)} at ${entryPath}`);
    addFile(files, folded, entryPath, Buffer.from(data));
  }
}

// ------------------------------------------------------------------ node-tar

/** The directory of the npm CLI found on PATH. */
function npmCliDir(): string {
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    const bin = join(dir, "npm");
    if (dir === "" || !existsSync(bin)) continue;
    let at = dirname(realpathSync(bin));
    for (let up = 0; up < 4; up++) {
      const manifest = join(at, "package.json");
      if (
        existsSync(manifest) &&
        (JSON.parse(readFileSync(manifest, "utf8")) as { name?: string }).name === "npm"
      ) {
        return at;
      }
      at = dirname(at);
    }
  }
  throw new Error("cannot find the npm CLI on PATH, whose node-tar reads the tarballs");
}

type TarEntry = {
  type: string;
  path: string;
  on(event: "data", listener: (chunk: Buffer) => void): void;
  resume(): void;
};
type NodeTar = {
  t(options: {
    strict: boolean;
    onwarn: (code: string, message: string) => void;
    onentry: (entry: TarEntry) => void;
  }): { on(event: "error", listener: (error: Error) => void): void; end(data: Buffer): void };
};

let nodeTar: NodeTar | null = null;

/** Every regular file as npm's own node-tar lists it, in strict mode. */
export function readTarballWithNodeTar(gzipped: Buffer): TarballFiles {
  nodeTar ??= createRequire(join(npmCliDir(), "package.json"))("tar") as NodeTar;
  const files: TarballFiles = new Map();
  const folded = new Set<string>();
  const problems: string[] = [];
  const entries: { entry: TarEntry; chunks: Buffer[] }[] = [];
  const stream = nodeTar.t({
    strict: true,
    onwarn: (code, message) => problems.push(`${code}: ${message}`),
    onentry: (entry) => {
      if (entry.type === "File" || entry.type === "OldFile") {
        const chunks: Buffer[] = [];
        entry.on("data", (chunk) => chunks.push(chunk));
        entries.push({ entry, chunks });
      } else {
        if (entry.type !== "Directory")
          problems.push(`unexpected ${entry.type} entry at ${entry.path}`);
        entry.resume();
      }
    },
  });
  stream.on("error", (error) => problems.push(error.message));
  // node-tar processes a buffer synchronously on end(), as npm itself relies on.
  stream.end(gzipped);
  if (problems.length > 0) throw new Error(`node-tar refused the tarball: ${problems.join("; ")}`);
  for (const { entry, chunks } of entries) {
    addFile(files, folded, entry.path, Buffer.concat(chunks));
  }
  return files;
}

// ------------------------------------------------------------------ both

function sameFiles(a: TarballFiles, b: TarballFiles): boolean {
  if (a.size !== b.size) return false;
  for (const [path, content] of a) {
    const other = b.get(path);
    if (other === undefined || !other.equals(content)) return false;
  }
  return true;
}

/**
 * Every regular file of a `.tgz`, read by node-tar and by the strict reader.
 * Fails unless both read it and see the same files (see above).
 */
export function readTarball(gzipped: Buffer): TarballFiles {
  const strict = readTarballStrict(gzipped);
  const npm = readTarballWithNodeTar(gzipped);
  if (!sameFiles(strict, npm))
    throw new Error("node-tar and the strict reader see different files");
  return strict;
}

// ------------------------------------------------------------------ platform notices

/**
 * Names of the packages that `pnpm-lock.yaml` records with `os` or `cpu`
 * (`@esbuild/linux-x64` and the like). pnpm installs only the ones for the
 * machine, so their sections in a notices file depend on where it was built.
 */
export function platformPackages(lockfile: string): Set<string> {
  const names = new Set<string>();
  const lines = lockfile.split("\n");
  let inPackages = false;
  let current: string | null = null;
  for (const line of lines) {
    if (/^\S/.test(line)) {
      inPackages = line === "packages:";
      current = null;
      continue;
    }
    if (!inPackages) continue;
    const key = /^ {2}'?((?:@[^@/\s']+\/)?[^@\s']+)@[^\s']+'?:$/.exec(line);
    if (key) {
      current = key[1];
      continue;
    }
    if (current && /^ {4}(os|cpu): /.test(line)) names.add(current);
  }
  return names;
}

/** The name of a `## <name>@<version>` notices heading, or null. */
function noticeHeadingName(line: string): string | null {
  const m = /^## (.+)@[^@]+$/.exec(line);
  return m ? m[1] : null;
}

type NoticeSection = { heading: string | null; body: string };

/**
 * A notices file cut at its `## ` headings. Headings are read outside code
 * fences only, because licence texts can contain `## `.
 */
function noticeSections(notices: string): NoticeSection[] {
  const sections: NoticeSection[] = [{ heading: null, body: "" }];
  let inFence = false;
  for (const line of notices.split("\n")) {
    if (!inFence && line.startsWith("## ")) {
      sections.push({ heading: line, body: "" });
    } else {
      sections[sections.length - 1].body += `${line}\n`;
    }
    if (line.startsWith("```")) inFence = !inFence;
  }
  return sections;
}

/**
 * Whether two notices files are the same but for which platform-specific
 * packages they list. Section by section, a heading may differ only when both
 * name a package `pnpm-lock.yaml` records with `os` or `cpu` and the section's
 * text is the same: `@esbuild/linux-arm64` on one machine for `@esbuild/linux-x64`
 * on another. Nothing can be added, dropped or reworded under such a heading.
 */
export function sameNoticesAcrossPlatforms(
  expected: string,
  actual: string,
  platform: Set<string>,
): boolean {
  const a = noticeSections(expected);
  const b = noticeSections(actual);
  if (a.length !== b.length) return false;
  return a.every((section, i) => {
    const other = b[i];
    if (section.body !== other.body) return false;
    if (section.heading === other.heading) return true;
    const names = [
      noticeHeadingName(section.heading ?? ""),
      noticeHeadingName(other.heading ?? ""),
    ];
    return names.every((name) => name !== null && platform.has(name));
  });
}

const NOTICE_FILE = /(^|\/)THIRD_PARTY_NOTICES\.md$/;

// ------------------------------------------------------------------ comparison

export type TarballDifference = {
  /** In the expected pack, missing from the other tarball. */
  missing: string[];
  /** In the other tarball only. */
  extra: string[];
  /** In both, with different content. */
  changed: string[];
};

export const isSame = (diff: TarballDifference): boolean =>
  diff.missing.length === 0 && diff.extra.length === 0 && diff.changed.length === 0;

/**
 * Compares the files of `actual` (staged or published) with `expected` (packed
 * from the release commit). Notices files may differ only in which
 * platform-specific packages they name (`sameNoticesAcrossPlatforms`), the one
 * difference known to come from the machine that built the pack.
 */
export function compareTarballs(
  expected: TarballFiles,
  actual: TarballFiles,
  platform: Set<string> = new Set(),
): TarballDifference {
  const same = (path: string, a: Buffer, b: Buffer): boolean =>
    a.equals(b) ||
    (NOTICE_FILE.test(path) &&
      sameNoticesAcrossPlatforms(a.toString("utf8"), b.toString("utf8"), platform));
  const missing = [...expected.keys()].filter((path) => !actual.has(path)).sort();
  const extra = [...actual.keys()].filter((path) => !expected.has(path)).sort();
  const changed = [...expected.keys()]
    .filter((path) => actual.has(path))
    .filter((path) => !same(path, expected.get(path)!, actual.get(path)!))
    .sort();
  return { missing, extra, changed };
}

export function describeDifference(label: string, diff: TarballDifference): string {
  const lines = [`${label}: the tarball does not match the pack of the release commit.`];
  for (const path of diff.missing) lines.push(`  missing: ${JSON.stringify(path)}`);
  for (const path of diff.extra) lines.push(`  extra:   ${JSON.stringify(path)}`);
  for (const path of diff.changed) lines.push(`  changed: ${JSON.stringify(path)}`);
  return lines.join("\n");
}

// ------------------------------------------------------------------ manifest

/**
 * Fields npm installs from. npm resolves a version from the registry's metadata
 * (the packument), not from the `package.json` inside the tarball, so a
 * counterfeit could add a dependency or an install script there while the
 * tarball still matches ("manifest confusion").
 */
const INSTALL_FIELDS = [
  "dependencies",
  "optionalDependencies",
  "peerDependencies",
  "peerDependenciesMeta",
  "bundleDependencies",
  "bundledDependencies",
  "bin",
  "scripts",
  "os",
  "cpu",
  "engines",
  "main",
  "exports",
  "type",
] as const;

/** Stable JSON: object keys sorted, so key order does not count as a change. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/** The install fields where the registry's metadata differs from the packed manifest. */
export function manifestDifferences(
  packed: Record<string, unknown>,
  registry: Record<string, unknown>,
): string[] {
  return INSTALL_FIELDS.filter((field) => canonical(packed[field]) !== canonical(registry[field]));
}
