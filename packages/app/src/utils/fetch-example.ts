// Fetch a gallery example's files from the FIXED karasu raw origin and return
// them as a project (#1646). The caller passes only a slug + lang; we never take
// a user-supplied URL. The entry is fetched, then its imports are followed
// recursively from the same origin — `resolvePath` keeps every target under the
// example root (it can't climb above "/"), so a crafted import can't escape.

import { findOpenableExample, Parser, resolvePath } from "@karasu-tools/core";

const RAW_BASE = "https://raw.githubusercontent.com/kompiro/karasu/main/examples";

// Caps mirror the spirit of the ZIP-import guards (import-project-zip.ts).
const MAX_FILES = 50;
const MAX_FILE_BYTES = 1_000_000;
const MAX_TOTAL_BYTES = 5_000_000;

interface FetchedExample {
  name: string;
  files: { path: string; content: string }[];
}

function isImportable(path: string): boolean {
  return path.endsWith(".krs") || path.endsWith(".krs.style");
}

function hasScheme(spec: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(spec) || spec.startsWith("//");
}

/**
 * Fetch `examples/<lang>/<slug>/` (entry + transitively imported files) from the
 * fixed origin. Throws on an unknown/unavailable slug, a fetch failure, a
 * redirect, or the size/count caps — callers surface these gracefully.
 */
export async function fetchExampleProject(slug: string, lang: string): Promise<FetchedExample> {
  const example = findOpenableExample(slug, lang);
  if (!example) {
    throw new Error(`Unknown or unavailable example: ${slug} (${lang})`);
  }

  const root = `${RAW_BASE}/${lang}/${slug}`;
  const seen = new Set<string>();
  const files: { path: string; content: string }[] = [];
  let total = 0;
  // Virtual-absolute paths rooted at "/"; resolvePath normalizes and cannot
  // climb above "/", so all targets stay inside the example dir.
  const queue: string[] = [`/${example.entry}`];

  while (queue.length > 0) {
    const abs = queue.shift() as string;
    if (seen.has(abs)) continue;
    seen.add(abs);
    if (files.length >= MAX_FILES) throw new Error("Example has too many files");

    const rel = abs.replace(/^\//, "");
    const res = await fetch(`${root}/${rel}`, { redirect: "error" });
    if (!res.ok) throw new Error(`Failed to fetch ${rel} (HTTP ${res.status})`);
    const content = await res.text();
    total += content.length;
    if (content.length > MAX_FILE_BYTES || total > MAX_TOTAL_BYTES) {
      throw new Error("Example is too large");
    }
    files.push({ path: rel, content });

    if (rel.endsWith(".krs")) {
      const parsed = Parser.parse(content).value;
      const deps = [...parsed.nodeImports.map((i) => i.path), ...parsed.styleImports];
      for (const dep of deps) {
        if (hasScheme(dep)) continue;
        const target = resolvePath(abs, dep);
        if (isImportable(target) && !seen.has(target)) queue.push(target);
      }
    }
  }

  return { name: slug, files };
}
