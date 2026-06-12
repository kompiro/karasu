import { unzipSync, strFromU8, type UnzipFileInfo } from "fflate";

const ALLOWED_EXTENSIONS = [".krs", ".krs.style"];

/**
 * Caps that guard a malicious ZIP from exhausting the tab's memory
 * (decompression bomb) or its entry count (#1527). The per-file / total caps
 * use the uncompressed size declared in the ZIP header, which fflate's `filter`
 * exposes *before* decompressing each entry — so a bomb is rejected without
 * being inflated into memory first.
 *
 * Note: an archive that lies about its header size is not fully covered here;
 * a hard cap during inflation would need fflate's streaming API. The header
 * check stops the common case (bombs declare their true, huge size).
 */
interface ImportLimits {
  /** Max number of entries the archive may declare. */
  maxEntries: number;
  /** Max uncompressed size of any single entry, in bytes. */
  maxFileSize: number;
  /** Max total uncompressed size across kept entries, in bytes. */
  maxTotalSize: number;
}

const DEFAULT_LIMITS: ImportLimits = {
  maxEntries: 10_000,
  maxFileSize: 50 * 1024 * 1024,
  maxTotalSize: 200 * 1024 * 1024,
};

function isAllowed(path: string): boolean {
  return ALLOWED_EXTENSIONS.some((ext) => path.endsWith(ext));
}

/**
 * Reject ZIP entry paths that would escape the project root once written under
 * `/projects/<id>/<path>` (zip-slip, #1526). In the in-memory storage provider
 * `normalizePath` collapses `..` segments, so an unguarded `../../x.krs` would
 * write outside the project. We drop any path that is absolute, contains a
 * backslash, or has a `..` segment.
 */
function isSafeRelativePath(path: string): boolean {
  if (path === "" || path.startsWith("/") || path.includes("\\")) return false;
  return !path.split("/").includes("..");
}

/**
 * Detect a single common top-level directory shared by all file entries.
 * Returns the directory name, or null if files span multiple top-level dirs
 * or there are no files.
 */
function detectTopLevelDir(unzipped: Record<string, Uint8Array>): string | null {
  const filePaths = Object.keys(unzipped).filter((p) => !p.endsWith("/"));
  if (filePaths.length === 0) return null;

  // All files must be nested (contain at least one "/") to have a common top-level dir.
  if (!filePaths.every((p) => p.includes("/"))) return null;

  const topDirs = filePaths.map((p) => p.split("/")[0]);
  const first = topDirs[0];
  return topDirs.every((d) => d === first) ? first : null;
}

interface ParsedZip {
  /** Extracted .krs / .krs.style files relative to the project root. */
  files: { path: string; content: string }[];
  /**
   * Project name detected from the single top-level directory inside the ZIP,
   * or undefined when the ZIP has a flat structure.
   */
  detectedName: string | undefined;
}

/**
 * Parse a ZIP Uint8Array and return .krs / .krs.style files with an optional
 * detected project name.
 *
 * Hardening: entries are filtered *before* decompression — directories,
 * non-.krs files, and zip-slip paths are skipped without being inflated, and
 * entry-count / per-file / total-size caps throw to reject decompression bombs
 * (#1526, #1527). Surfacing these errors to the user is tracked separately
 * (#1532); here we fail closed.
 */
export function parseZipForImport(
  zipData: Uint8Array,
  limits: ImportLimits = DEFAULT_LIMITS,
): ParsedZip {
  let entryCount = 0;
  let totalSize = 0;

  const unzipped = unzipSync(zipData, {
    filter: (file: UnzipFileInfo): boolean => {
      if (++entryCount > limits.maxEntries) {
        throw new Error(`ZIP has too many entries (limit ${limits.maxEntries})`);
      }
      const name = file.name;
      // Skip directories and anything we wouldn't write anyway, without paying
      // to decompress it.
      if (name.endsWith("/") || !isAllowed(name) || !isSafeRelativePath(name)) {
        return false;
      }
      if (file.originalSize > limits.maxFileSize) {
        throw new Error(`ZIP entry "${name}" exceeds the per-file size limit`);
      }
      totalSize += file.originalSize;
      if (totalSize > limits.maxTotalSize) {
        throw new Error("ZIP exceeds the maximum total uncompressed size");
      }
      return true;
    },
  });

  const topDir = detectTopLevelDir(unzipped);

  const files: { path: string; content: string }[] = [];
  for (const [rawPath, data] of Object.entries(unzipped)) {
    const relativePath = topDir ? rawPath.slice(topDir.length + 1) : rawPath;
    // The filter already vetted rawPath; re-check the post-strip path since
    // that is what actually gets written (defense in depth).
    if (!relativePath || !isAllowed(relativePath) || !isSafeRelativePath(relativePath)) {
      continue;
    }
    files.push({ path: relativePath, content: strFromU8(data) });
  }

  return { files, detectedName: topDir ?? undefined };
}

/**
 * If `name` already exists in `existingNames`, append " (2)", " (3)", etc.
 * until a unique name is found.
 */
export function disambiguateName(name: string, existingNames: string[]): string {
  if (!existingNames.includes(name)) return name;
  let counter = 2;
  while (existingNames.includes(`${name} (${counter})`)) {
    counter++;
  }
  return `${name} (${counter})`;
}
