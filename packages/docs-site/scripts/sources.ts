// Filesystem helpers shared by sync + check-links: locate docs/, resolve the
// published page set (en base files + any existing .ja.md siblings), and read them.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PUBLISHED_EN_FILES } from "./lib/site-map.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
export const PKG_ROOT = path.resolve(here, "..");
export const REPO_ROOT = path.resolve(PKG_ROOT, "../..");
const DOCS_DIR = path.join(REPO_ROOT, "docs");
export const CONTENT_DIR = path.join(PKG_ROOT, "src", "content", "docs");

interface Source {
  /** docs-relative path, e.g. "guide/01-service-team-design.ja.md" */
  docsRel: string;
  absPath: string;
}

/** Published pages in deterministic order: each en base file, then its ja sibling if present. */
export function listSources(): Source[] {
  const sources: Source[] = [];
  for (const enRel of PUBLISHED_EN_FILES) {
    const enAbs = path.join(DOCS_DIR, enRel);
    if (!fs.existsSync(enAbs)) {
      throw new Error(`Published doc is missing: docs/${enRel}`);
    }
    sources.push({ docsRel: enRel, absPath: enAbs });

    const jaRel = enRel.replace(/\.md$/, ".ja.md");
    const jaAbs = path.join(DOCS_DIR, jaRel);
    if (fs.existsSync(jaAbs)) sources.push({ docsRel: jaRel, absPath: jaAbs });
  }
  return sources;
}

/** docs-relative paths of every published page (for link resolution). */
export function publishedSet(sources: Source[]): Set<string> {
  return new Set(sources.map((s) => s.docsRel));
}
