/* eslint-disable no-console -- CLI entry point; stdout/stderr reporting is the whole job */
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";

// Fails when a tracked text file contains a raw NUL byte (Issue #2804).
//
// A NUL makes a file binary to `grep` and `rg`, and both skip it without a
// word: no match, no warning, no sign the file was considered. #2216 escaped
// three such files and added nothing to stop a fourth; #2793 added one six
// weeks later, and it was found by accident, the way the first ones were.
//
// WHAT COUNTS AS TEXT is decided by exclusion, not enumeration. Every tracked
// file is read, and a NUL is expected only in a file whose extension is on
// BINARY_EXTENSIONS. An allow-list of text extensions would fail the same
// silent way the bug does: add a new text extension and it is never scanned
// (TPL-1720). The deny-list fails loudly instead, and it is held to its claim:
// an entry that no NUL-carrying file backs is itself a finding, so it cannot
// fill up with extensions that are denied "just in case".
//
// THE ESCAPED SPELLING STAYS LEGAL because the check reads bytes. A `\0`
// escape in a source is a backslash and a zero on disk; #2216's fix was exactly
// that substitution, and it has to keep passing.
//
// SYMLINKS ARE NOT READ, at either layer. `readFileSync` follows a link, so a
// link would report a NUL from outside the working tree against its own path,
// or hang on a FIFO. The index mode drops tracked links (git stores a link as
// its target path string, which cannot hold a NUL anyway), and `lstatSync`
// drops anything that is not a plain file on disk now, which catches a tracked
// regular file replaced by a link before it was staged.
//
// WHERE IT RUNS: lefthook pre-push, and both jobs that report the Required
// `Check`: `ci.yml` (code changes) and `ci-skip.yml` (docs-only). The stub has
// no `pnpm install`, so it runs this file with plain `node`, which is why it is
// written in erasable TypeScript only. Running it from `ci.yml` alone would
// leave docs-only PRs to a stub that reports success without scanning
// (TPL-2446). The design is recorded in Issue #2804.

/** Extensions whose files legitimately carry NUL bytes. Each must be backed by one. */
export const BINARY_EXTENSIONS = [".otf", ".png", ".ttf"];

/** Git's mode for a tracked symbolic link. */
const SYMLINK_MODE = "120000";

export interface TrackedEntry {
  mode: string;
  /** The path for display and reporting; see {@link displayPath}. */
  path: string;
  /** The path exactly as git stores it, used for every filesystem call. */
  pathBytes: Uint8Array;
}

const TAB = 0x09;

/**
 * The path as a readable string. Git stores a path as bytes, not text, so a
 * name need not be valid UTF-8. Decoding such a name lossily would print a
 * replacement character that names no file, so an invalid name is spelled
 * with each non-ASCII byte as `\xNN` instead. This string is for messages
 * only; the bytes are what reach the filesystem.
 */
export function displayPath(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    let out = "";
    for (const byte of bytes) {
      out +=
        byte >= 0x20 && byte < 0x7f && byte !== 0x5c
          ? String.fromCharCode(byte)
          : `\\x${byte.toString(16).padStart(2, "0")}`;
    }
    return out;
  }
}

/**
 * Parses `git ls-files -s -z`. Each record is `<mode> <sha> <stage>\t<path>`
 * followed by a NUL. `-z` turns quoting off, so a tab inside a path arrives as
 * a literal byte: only the first tab separates the header from the path.
 *
 * The output is read as bytes rather than a UTF-8 string. Decoding it first
 * would rewrite a path that is not valid UTF-8, the rewritten name would match
 * no file, and the file would be skipped without a finding.
 */
export function parseLsFiles(stdout: Uint8Array): TrackedEntry[] {
  const entries: TrackedEntry[] = [];
  let start = 0;
  while (start < stdout.length) {
    let end = stdout.indexOf(0, start);
    if (end === -1) end = stdout.length;
    const record = stdout.subarray(start, end);
    start = end + 1;
    const tab = record.indexOf(TAB);
    if (tab === -1) continue;
    const [mode] = new TextDecoder("latin1").decode(record.subarray(0, tab)).split(" ");
    const pathBytes = record.slice(tab + 1);
    entries.push({ mode, path: displayPath(pathBytes), pathBytes });
  }
  return entries;
}

/**
 * Tracked entries whose content is worth reading: everything except symlinks,
 * one entry per path. An unmerged path is listed once per conflict stage, and
 * the working tree holds only one file for all of them.
 */
export function readableEntries(entries: readonly TrackedEntry[]): TrackedEntry[] {
  // Keyed on the bytes, not the display string, which is not injective.
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = Buffer.from(entry.pathBytes).toString("hex");
    if (entry.mode === SYMLINK_MODE || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export interface ScannedFile {
  path: string;
  bytes: Uint8Array;
}

export type FindingKind =
  /** A text file carries a raw NUL, so the file has gone silent to code search. */
  | "nul-byte-in-text-file"
  /** A denied extension that no NUL-carrying file backs any more. */
  | "stale-binary-extension";

export interface Finding {
  kind: FindingKind;
  /** The file for `nul-byte-in-text-file`, the extension for `stale-binary-extension`. */
  subject: string;
  /** 1-based line of the first NUL; 0 for `stale-binary-extension`. */
  line: number;
  /** Byte offset of the first NUL; -1 for `stale-binary-extension`. */
  offset: number;
  /** How many NUL bytes the file carries; 0 for `stale-binary-extension`. */
  count: number;
}

/** The lower-cased extension including its dot, or "" for a file without one. */
export function extensionOf(path: string): string {
  const base = path.slice(path.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot <= 0 ? "" : base.slice(dot).toLowerCase();
}

function countNul(bytes: Uint8Array, from: number): number {
  let count = 0;
  for (let i = from; i < bytes.length; i++) if (bytes[i] === 0) count++;
  return count;
}

function lineAt(bytes: Uint8Array, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset; i++) if (bytes[i] === 0x0a) line++;
  return line;
}

/** Findings for a set of files, ordered by subject. */
export function check(
  files: readonly ScannedFile[],
  binaryExtensions: readonly string[] = BINARY_EXTENSIONS,
): Finding[] {
  const denied = new Set(binaryExtensions);
  const backed = new Set<string>();
  const findings: Finding[] = [];

  for (const { path, bytes } of files) {
    const offset = bytes.indexOf(0);
    if (offset === -1) continue;
    const ext = extensionOf(path);
    if (denied.has(ext)) {
      backed.add(ext);
      continue;
    }
    findings.push({
      kind: "nul-byte-in-text-file",
      subject: path,
      line: lineAt(bytes, offset),
      offset,
      count: countNul(bytes, offset),
    });
  }

  for (const ext of denied) {
    if (!backed.has(ext)) {
      findings.push({
        kind: "stale-binary-extension",
        subject: ext,
        line: 0,
        offset: -1,
        count: 0,
      });
    }
  }

  return findings.sort((a, b) => a.subject.localeCompare(b.subject));
}

export function describeFinding(f: Finding): string {
  switch (f.kind) {
    case "nul-byte-in-text-file":
      return `${f.subject}:${f.line}: raw NUL byte at offset ${f.offset} (${f.count} in the file)`;
    case "stale-binary-extension":
      return `BINARY_EXTENSIONS lists \`${f.subject}\`, but no tracked file with it carries a NUL`;
  }
}

/** Everything an author needs to act on a finding, printed with every failure. */
export const HOW_TO_FIX = [
  "",
  "A file with a raw NUL byte is binary to grep and rg, so both skip it silently.",
  "",
  "In a source file, the byte almost always sits inside a string literal. Write it",
  "as an escape sequence instead: `\\0` or `\\u0000` is plain ASCII on disk and",
  "evaluates to the same string.",
  "",
  "If the file is a binary asset, add its extension to BINARY_EXTENSIONS in",
  "scripts/lint/no-nul-bytes.ts. An extension there must be backed by at least one",
  "tracked file that carries a NUL, so remove an entry once nothing needs it.",
].join("\n");

/** Tracked entries of the repository at `repoRoot`, from git's index. */
function trackedEntries(repoRoot: string): TrackedEntry[] {
  // No `encoding`: the output stays a Buffer so path bytes survive (see parseLsFiles).
  const stdout = execFileSync("git", ["ls-files", "-s", "-z"], {
    cwd: repoRoot,
    maxBuffer: 64 * 1024 * 1024,
  });
  return parseLsFiles(stdout);
}

/**
 * Reads the given entries from the working tree under `repoRoot`, keeping only
 * what is a regular file on disk right now.
 *
 * The index mode alone is not enough: the working tree can disagree with it.
 * A tracked regular file replaced by a symlink before staging is still `100644`
 * in the index, and `readFileSync` would follow the link, reading a file outside
 * the tree, blocking forever on a FIFO, or never finishing on `/dev/zero`.
 * `lstatSync` does not follow links, so anything that is not a plain file here
 * (a link, a directory, a device) is skipped. A path deleted from the working
 * tree but still in the index is skipped too: there is no content to scan.
 */
export function readRegularFiles(
  repoRoot: string,
  entries: readonly TrackedEntry[],
): ScannedFile[] {
  const files: ScannedFile[] = [];
  const root = Buffer.from(repoRoot.endsWith("/") ? repoRoot : `${repoRoot}/`);
  for (const { path, pathBytes } of entries) {
    // A Buffer path reaches the filesystem byte for byte; a string would be
    // re-encoded as UTF-8 and miss a name that is not valid UTF-8.
    const abs = Buffer.concat([root, pathBytes]);
    try {
      if (!lstatSync(abs).isFile()) continue;
      files.push({ path, bytes: readFileSync(abs) });
    } catch {
      continue;
    }
  }
  return files;
}

/** Scans every readable tracked file under `repoRoot`. */
export function scanRepository(repoRoot: string): { findings: Finding[]; scanned: number } {
  const files = readRegularFiles(repoRoot, readableEntries(trackedEntries(repoRoot)));
  return { findings: check(files), scanned: files.length };
}

function main(): void {
  const { findings, scanned } = scanRepository(process.cwd());
  if (findings.length > 0) {
    console.error(`no-nul-bytes: ${findings.length} finding(s):`);
    for (const f of findings) console.error(`✗ ${describeFinding(f)}`);
    console.error(HOW_TO_FIX);
    process.exit(1);
  }
  console.log(
    `no-nul-bytes: ok (${scanned} tracked file(s); NUL only in ${BINARY_EXTENSIONS.join(", ")})`,
  );
}

const invokedDirectly =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  /no-nul-bytes\.ts$/.test(process.argv[1]);

if (invokedDirectly) {
  main();
}
