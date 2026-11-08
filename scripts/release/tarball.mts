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
 * imports nothing but node builtins.
 */
import { gunzipSync } from "node:zlib";

/** Path inside the package (the leading `package/` removed) → content. */
export type TarballFiles = Map<string, Buffer>;

const BLOCK = 512;

/*
 * The reader is strict on purpose. npm extracts tarballs with node-tar, and a
 * counterfeit could hide a file from a lenient reader that node-tar still
 * extracts (an entry after a single zero block, a header with a bad checksum
 * that node-tar skips and then reads its data as headers). Anything this reader
 * might interpret differently from node-tar is rejected instead of guessed at,
 * so the check fails rather than passing a tarball it did not fully read.
 */

/** pax records that only carry metadata; anything else is refused. */
const PAX_METADATA = new Set(["path", "mtime", "atime", "ctime", "uid", "gid", "uname", "gname"]);

function readString(block: Buffer, offset: number, length: number): string {
  const raw = block.subarray(offset, offset + length);
  const end = raw.indexOf(0);
  return (end === -1 ? raw : raw.subarray(0, end)).toString("utf8");
}

function readOctal(block: Buffer, offset: number, length: number): number {
  if (block[offset] & 0x80) throw new Error("base-256 numbers in tar headers are not supported");
  const text = readString(block, offset, length).trim();
  if (text === "") return 0;
  if (!/^[0-7]+$/.test(text))
    throw new Error(`malformed tar header number: ${JSON.stringify(text)}`);
  return Number.parseInt(text, 8);
}

function checkHeader(header: Buffer): void {
  let unsigned = 0;
  let signed = 0;
  for (let i = 0; i < BLOCK; i++) {
    const byte = i >= 148 && i < 156 ? 0x20 : header[i];
    unsigned += byte;
    signed += byte > 127 ? byte - 256 : byte;
  }
  const stored = readOctal(header, 148, 8);
  if (stored !== unsigned && stored !== signed) throw new Error("tar header checksum mismatch");
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
    if (!PAX_METADATA.has(key)) throw new Error(`unsupported pax record: ${JSON.stringify(key)}`);
    records[key] = record.slice(eq + 1);
    offset = end;
  }
  return records;
}

/**
 * A package path, or null for one that could escape the package directory.
 * npm puts every file under `package/`; the first segment is dropped whatever
 * it is called, as npm itself does.
 */
export function packagePath(entryPath: string): string | null {
  const segments = entryPath.replaceAll("\\", "/").split("/");
  const rest = segments.slice(1).filter((segment) => segment !== "" && segment !== ".");
  if (rest.length === 0 || rest.includes("..") || entryPath.startsWith("/")) return null;
  return rest.join("/");
}

/**
 * Every regular file of a `.tgz`. Fails on an entry it cannot place safely and
 * on any archive it cannot read the way node-tar would (see above).
 */
export function readTarball(gzipped: Buffer): TarballFiles {
  const tar = gunzipSync(gzipped);
  const files: TarballFiles = new Map();
  /** Paths as a case-insensitive file system would see them. */
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
    const entryPath = pax?.path ?? (prefix ? `${prefix}/${name}` : name);
    pax = null;

    if (type === "5") {
      if (size !== 0) throw new Error(`directory entry with data: ${JSON.stringify(entryPath)}`);
      continue;
    }
    if (type !== "0")
      throw new Error(`unexpected tar entry type ${JSON.stringify(type)} at ${entryPath}`);
    const path = packagePath(entryPath);
    if (path === null)
      throw new Error(`tar entry outside the package: ${JSON.stringify(entryPath)}`);
    const key = path.normalize("NFC").toLowerCase();
    if (folded.has(key)) throw new Error(`duplicate tar entry: ${path}`);
    folded.add(key);
    files.set(path, Buffer.from(data));
  }
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

/**
 * A notices file without the sections of `platform` packages. Headings are
 * read outside code fences only, because licence texts can contain `## `.
 */
export function withoutPlatformSections(notices: string, platform: Set<string>): string {
  const kept: string[] = [];
  let inFence = false;
  let skipping = false;
  for (const line of notices.split("\n")) {
    if (!inFence) {
      const name = noticeHeadingName(line);
      if (name !== null) skipping = platform.has(name);
    }
    if (line.startsWith("```")) inFence = !inFence;
    if (!skipping) kept.push(line);
  }
  return kept.join("\n");
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
 * from the release commit). Notices files are compared without the sections of
 * platform-specific packages, the one difference known to come from the machine
 * that built the pack.
 */
export function compareTarballs(
  expected: TarballFiles,
  actual: TarballFiles,
  platform: Set<string> = new Set(),
): TarballDifference {
  const normalise = (path: string, content: Buffer): Buffer =>
    NOTICE_FILE.test(path)
      ? Buffer.from(withoutPlatformSections(content.toString("utf8"), platform))
      : content;
  const missing = [...expected.keys()].filter((path) => !actual.has(path)).sort();
  const extra = [...actual.keys()].filter((path) => !expected.has(path)).sort();
  const changed = [...expected.keys()]
    .filter((path) => actual.has(path))
    .filter(
      (path) => !normalise(path, expected.get(path)!).equals(normalise(path, actual.get(path)!)),
    )
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
