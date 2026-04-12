import { unzipSync, strFromU8 } from "fflate";

const ALLOWED_EXTENSIONS = [".krs", ".krs.style"];

function isAllowed(path: string): boolean {
  return ALLOWED_EXTENSIONS.some((ext) => path.endsWith(ext));
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

export interface ParsedZip {
  /** Extracted .krs / .krs.style files relative to the project root. */
  files: { path: string; content: string }[];
  /**
   * Project name detected from the single top-level directory inside the ZIP,
   * or undefined when the ZIP has a flat structure.
   */
  detectedName: string | undefined;
}

/** Parse a ZIP Uint8Array and return .krs / .krs.style files with an optional detected project name. */
export function parseZipForImport(zipData: Uint8Array): ParsedZip {
  const unzipped = unzipSync(zipData);
  const topDir = detectTopLevelDir(unzipped);

  const files: { path: string; content: string }[] = [];
  for (const [rawPath, data] of Object.entries(unzipped)) {
    if (rawPath.endsWith("/")) continue;

    const relativePath = topDir ? rawPath.slice(topDir.length + 1) : rawPath;
    if (!relativePath) continue;
    if (!isAllowed(relativePath)) continue;

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
