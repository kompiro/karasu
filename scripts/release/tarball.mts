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

function readString(block: Buffer, offset: number, length: number): string {
  const raw = block.subarray(offset, offset + length);
  const end = raw.indexOf(0);
  return (end === -1 ? raw : raw.subarray(0, end)).toString("utf8");
}

function readOctal(block: Buffer, offset: number, length: number): number {
  const text = readString(block, offset, length).trim();
  if (text === "") return 0;
  if (!/^[0-7]+$/.test(text))
    throw new Error(`malformed tar header number: ${JSON.stringify(text)}`);
  return Number.parseInt(text, 8);
}

/** `path=...` records of a pax extended header. */
function parsePax(data: Buffer): Record<string, string> {
  const records: Record<string, string> = {};
  let offset = 0;
  while (offset < data.length) {
    const space = data.indexOf(0x20, offset);
    if (space === -1) break;
    const length = Number.parseInt(data.subarray(offset, space).toString("utf8"), 10);
    if (!Number.isInteger(length) || length <= 0) throw new Error("malformed pax header");
    const record = data.subarray(space + 1, offset + length - 1).toString("utf8");
    const eq = record.indexOf("=");
    if (eq !== -1) records[record.slice(0, eq)] = record.slice(eq + 1);
    offset += length;
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

/** Every regular file of a `.tgz`. Fails on an entry it cannot place safely. */
export function readTarball(gzipped: Buffer): TarballFiles {
  const tar = gunzipSync(gzipped);
  const files: TarballFiles = new Map();
  let offset = 0;
  let longName: string | null = null;
  let pax: Record<string, string> = {};
  while (offset + BLOCK <= tar.length) {
    const header = tar.subarray(offset, offset + BLOCK);
    if (header.every((byte) => byte === 0)) break;
    const size = readOctal(header, 124, 12);
    const type = String.fromCharCode(header[156] || 0x30);
    const dataStart = offset + BLOCK;
    const data = tar.subarray(dataStart, dataStart + size);
    if (data.length !== size) throw new Error("truncated tar entry");
    offset = dataStart + Math.ceil(size / BLOCK) * BLOCK;

    if (type === "x") {
      pax = parsePax(data);
      continue;
    }
    if (type === "g") continue;
    if (type === "L") {
      longName = readString(data, 0, data.length);
      continue;
    }

    const prefix = readString(header, 345, 155);
    const name = readString(header, 0, 100);
    const entryPath = pax.path ?? longName ?? (prefix ? `${prefix}/${name}` : name);
    longName = null;
    pax = {};

    if (type === "5") continue;
    if (type !== "0")
      throw new Error(`unexpected tar entry type ${JSON.stringify(type)} at ${entryPath}`);
    const path = packagePath(entryPath);
    if (path === null)
      throw new Error(`tar entry outside the package: ${JSON.stringify(entryPath)}`);
    if (files.has(path)) throw new Error(`duplicate tar entry: ${path}`);
    files.set(path, Buffer.from(data));
  }
  return files;
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
  for (const path of diff.missing) lines.push(`  missing: ${path}`);
  for (const path of diff.extra) lines.push(`  extra:   ${path}`);
  for (const path of diff.changed) lines.push(`  changed: ${path}`);
  return lines.join("\n");
}
