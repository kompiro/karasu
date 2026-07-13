/* eslint-disable no-console -- CLI entry point; stdout/stderr reporting is the whole job */
import { readFile, readdir, stat } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  buildAllViewsSvgProject,
  type FileSystemProvider,
  type DirEntry,
} from "../../packages/core/src/index.ts";

// Validates the `permalink:` frontmatter block that ADRs use to link to a
// karasu structure (convention: ADR-20260702-01, `.claude/rules/adr.md`).
//
// For each `permalink:` entry it checks:
//   - `source` is present (required — the in-repo .krs is the record of
//     record; a `short` link alone is not restorable — TPL-20260630-03).
//   - the `source` .krs file exists (relative to repo root).
//   - a deep anchor (`…krs#krs-<view>-<id>`) resolves to an element the
//     renderer actually emits — detecting a rename/removal that dangled the
//     link (docs/spec/permalink.md § Stability caveat).
//   - `view` (optional) is a known view token.
//   - `short` (optional) is a well-formed http(s) URL and not a `#s=`
//     fragment share (a fragment never reaches the server, so its OGP unfurl
//     dies — ADR-20260626-04). Offline shape check only; the link is not
//     resolved over the network (avoids CI flakiness / leaking structure).
//
// The karasu-specific anchor resolution lives here (not in the generic
// `@kompiro/adr-tools`) because it needs @karasu-tools/core to parse the .krs.
// See docs/adr/<#1830 ADR> (design: docs/design/adr-permalink-validation.md).
//
// It is a consistency check between two artifacts (the ADR and the .krs), so
// it must fire on changes to *either* side — CI runs it in the unfiltered
// `Check` job and lefthook runs it glob-less on every push (TPL-20260520-02).

// Known `<view>` tokens for an anchor / the `view` field. Mirrors the set in
// docs/spec/permalink.md § Anchor grammar (ShareTargetView + `entity`).
const KNOWN_VIEWS = new Set(["system", "deploy", "org", "matrix", "entity"]);

// Whole-view fragments that carry no `<id>` segment and are intentionally
// outside the `anchorId` element-grammar (docs/spec/permalink.md): the
// single-level deploy/matrix tabs and the org Tree View mode. They resolve to
// the view itself, so they are accepted without an element-membership check.
const WHOLE_VIEW_ANCHORS = new Set(["krs-deploy", "krs-matrix", "krs-org-tree"]);

export interface Problem {
  file: string;
  message: string;
}

export interface PermalinkEntry {
  short?: unknown;
  source?: unknown;
  view?: unknown;
}

/** Extract the YAML frontmatter block (between the first pair of `---`). */
export function extractFrontmatter(markdown: string): string | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(markdown);
  return match ? match[1] : null;
}

/**
 * Parse the `permalink:` field out of an ADR's frontmatter. Returns `null`
 * when the ADR has no `permalink:` (the common case). Throws on malformed YAML
 * or a non-array `permalink:` so the caller can report it as a Problem.
 */
export function parsePermalinkField(frontmatter: string): PermalinkEntry[] | null {
  const data = parseYaml(frontmatter) as Record<string, unknown> | null;
  if (data == null || typeof data !== "object") return null;
  if (!("permalink" in data) || data.permalink == null) return null;
  const raw = data.permalink;
  if (!Array.isArray(raw)) {
    throw new Error("`permalink:` must be a list of entries");
  }
  return raw as PermalinkEntry[];
}

/** Split a `source` value into its .krs path and optional deep anchor. */
export function splitSourceAnchor(source: string): { path: string; anchor: string | null } {
  const hashIdx = source.indexOf("#");
  if (hashIdx === -1) return { path: source, anchor: null };
  return { path: source.slice(0, hashIdx), anchor: source.slice(hashIdx + 1) };
}

/**
 * Normalize a deep anchor to the element-anchor id the renderer emits.
 * Drops a leading `#` and the SPA-only `:<highlight>` focus suffix, which the
 * static SVG (our source of truth for the valid set) does not carry.
 */
export function normalizeAnchor(anchor: string): string {
  let a = anchor.startsWith("#") ? anchor.slice(1) : anchor;
  const colon = a.indexOf(":");
  if (colon !== -1) a = a.slice(0, colon);
  return a;
}

/** Minimal read-only FileSystemProvider backed by node:fs (for import resolution). */
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
    throw new Error("writeFile not supported");
  }
  async delete(): Promise<void> {
    throw new Error("delete not supported");
  }
  async mkdir(): Promise<void> {
    throw new Error("mkdir not supported");
  }
}

/**
 * Build every view of a .krs (resolving @import) and collect the set of deep
 * anchor ids the renderer emits (`krs-<view>-<sanitizeId(id)>`). Using the
 * rendered output as the source of truth keeps the accepted set in lockstep
 * with what a reader can actually land on (TPL-20260630-01 parity).
 */
export async function collectValidAnchors(
  krsAbsPath: string,
  fs: FileSystemProvider,
): Promise<Set<string>> {
  const { svg } = await buildAllViewsSvgProject(krsAbsPath, fs);
  const anchors = new Set<string>();
  for (const m of svg.matchAll(/id="(krs-[^"]+)"/g)) {
    anchors.add(m[1]);
  }
  return anchors;
}

/** Offline shape check of a `short` value. */
export function validateShort(short: string, file: string): Problem[] {
  const problems: Problem[] = [];
  let url: URL;
  try {
    url = new URL(short);
  } catch {
    return [{ file, message: `permalink \`short\` is not a valid URL: ${short}` }];
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    problems.push({ file, message: `permalink \`short\` must be http(s): ${short}` });
  }
  // A `#s=` fragment share never reaches the server, so its OGP unfurl dies —
  // the shortened destination must be the query form `/s?s=` (ADR-20260626-04).
  if (url.hash.includes("s=")) {
    problems.push({
      file,
      message: `permalink \`short\` points at a \`#s=\` fragment share; use the \`/s?s=\` query form so the link unfurls: ${short}`,
    });
  }
  return problems;
}

/** Validate one ADR file's `permalink:` block. */
export async function checkAdrFile(
  relPath: string,
  content: string,
  repoRoot: string,
  fs: FileSystemProvider,
): Promise<Problem[]> {
  const frontmatter = extractFrontmatter(content);
  if (frontmatter === null) return [];

  let entries: PermalinkEntry[] | null;
  try {
    entries = parsePermalinkField(frontmatter);
  } catch (e) {
    return [{ file: relPath, message: (e as Error).message }];
  }
  if (entries === null) return [];

  const problems: Problem[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const at = `permalink[${i}]`;

    if (entry == null || typeof entry !== "object") {
      problems.push({ file: relPath, message: `${at} must be a mapping` });
      continue;
    }

    // source is required.
    if (typeof entry.source !== "string" || entry.source.trim() === "") {
      problems.push({
        file: relPath,
        message: `${at} is missing required \`source\` (the in-repo .krs is the record; a short link alone is not restorable)`,
      });
      continue;
    }

    const { path: srcPath, anchor } = splitSourceAnchor(entry.source);
    const krsAbs = resolve(repoRoot, srcPath);

    if (!(await fs.exists(krsAbs))) {
      problems.push({
        file: relPath,
        message: `${at} \`source\` does not exist: ${srcPath}`,
      });
      // Can't resolve an anchor against a missing file; move on.
      continue;
    }

    if (anchor !== null) {
      const wanted = normalizeAnchor(anchor);
      const viewToken = wanted.split("-")[1];
      if (!viewToken || !KNOWN_VIEWS.has(viewToken)) {
        // Unknown view — can't resolve, and membership would just fail again.
        problems.push({
          file: relPath,
          message: `${at} anchor \`#${anchor}\` uses unknown view \`${viewToken ?? ""}\` (known: ${[...KNOWN_VIEWS].join(", ")})`,
        });
      } else if (wanted === `krs-${viewToken}` || WHOLE_VIEW_ANCHORS.has(wanted)) {
        // A bare `krs-<view>` or a known whole-view fragment addresses the view
        // itself, not an element — outside the anchorId grammar, so accept it
        // without an element-membership check (docs/spec/permalink.md).
      } else {
        let valid: Set<string>;
        try {
          valid = await collectValidAnchors(krsAbs, fs);
        } catch (e) {
          problems.push({
            file: relPath,
            message: `${at} could not render \`source\` ${srcPath} to resolve anchor: ${(e as Error).message}`,
          });
          continue;
        }
        if (!valid.has(wanted)) {
          problems.push({
            file: relPath,
            message: `${at} anchor \`#${anchor}\` does not resolve to any element in ${srcPath} (renamed or removed?)`,
          });
        }
      }
    }

    if (entry.view !== undefined) {
      if (typeof entry.view !== "string" || !KNOWN_VIEWS.has(entry.view)) {
        problems.push({
          file: relPath,
          message: `${at} \`view\` is not a known view: ${String(entry.view)} (known: ${[...KNOWN_VIEWS].join(", ")})`,
        });
      }
    }

    if (entry.short !== undefined) {
      if (typeof entry.short !== "string") {
        problems.push({ file: relPath, message: `${at} \`short\` must be a string` });
      } else {
        problems.push(...validateShort(entry.short, relPath));
      }
    }
  }
  return problems;
}

/** List `docs/adr/*.md` files (non-recursive), excluding generated bundles. */
export function listAdrFiles(adrDir: string): string[] {
  const GENERATED = new Set(["effective.md", "graph.md", "README.md", "TEMPLATE.md"]);
  return readdirSync(adrDir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".md") && !GENERATED.has(e.name))
    .map((e) => e.name)
    .sort();
}

export interface CheckOptions {
  repoRoot?: string;
  adrDir?: string;
  fs?: FileSystemProvider;
}

/** Validate every ADR's `permalink:` block under `adrDir`. */
export async function checkAllPermalinks(options: CheckOptions = {}): Promise<Problem[]> {
  const repoRoot = options.repoRoot ?? process.cwd();
  const adrDir = options.adrDir ?? join(repoRoot, "docs/adr");
  const fs = options.fs ?? new ReadOnlyNodeFs();
  const problems: Problem[] = [];
  for (const name of listAdrFiles(adrDir)) {
    const abs = join(adrDir, name);
    const content = await readFile(abs, "utf-8");
    const rel = `docs/adr/${name}`;
    problems.push(...(await checkAdrFile(rel, content, repoRoot, fs)));
  }
  return problems;
}

async function main(): Promise<void> {
  const quiet = process.argv.includes("--quiet");
  const problems = await checkAllPermalinks();
  if (problems.length > 0) {
    for (const p of problems) {
      console.error(`FAIL ${p.file}: ${p.message}`);
    }
    console.error(`\n${problems.length} ADR permalink problem(s) found.`);
    process.exit(1);
  }
  if (!quiet) {
    console.log("OK — all ADR permalinks resolve.");
  }
}

// Run only as a CLI entry, not when imported by tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
