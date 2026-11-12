// Every shipped example as a render input, for corpus guards: a check that
// walks this list covers an example the day it is added, which a hand-kept
// list of models does not (ADR-3038 D4). Each `.krs` file is its own entry and
// is resolved through the real `ImportResolver`, so a multi-file example
// renders with what it imports and with its `@import`ed style sheets, as
// `karasu render` draws it.

import { readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { InMemoryFileSystemProvider } from "../../fs/in-memory-provider.js";
import { ImportResolver } from "../../fs/import-resolver.js";
import type { KrsFile } from "../../types/ast.js";
import type { StyleSheet } from "../../types/style.js";
import type { LayoutOptions } from "../layout-types.js";
import { buildAllViewsSvg } from "../drill-down-svg.js";

const EXAMPLES = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../examples");

export interface ExampleEntry {
  /** Path under `examples/`, e.g. `en/hato/index.krs`. */
  name: string;
  krsFile: KrsFile;
  styleSheets: StyleSheet[];
}

export type GroupByMode = NonNullable<LayoutOptions["groupBy"]> | "none";

/**
 * Every "Group by" mode a viewer can pick. A `Record` over the option's type,
 * so a new axis does not typecheck until it is listed here, and every corpus
 * guard that walks the modes picks it up.
 */
const MODES: Record<GroupByMode, true> = { none: true, team: true, boundary: true };
export const GROUP_BY_MODES = Object.keys(MODES) as GroupByMode[];

function walk(dir: string, out: string[]): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

/** Resolve every `.krs` file under `examples/` as an entry point, in path order. */
export async function loadExampleCorpus(): Promise<ExampleEntry[]> {
  const files = walk(EXAMPLES, []).sort();
  const fs = new InMemoryFileSystemProvider();
  for (const file of files)
    await fs.writeFile(`/${relative(EXAMPLES, file)}`, readFileSync(file, "utf8"));
  const entries: ExampleEntry[] = [];
  for (const file of files.filter((f) => f.endsWith(".krs"))) {
    const name = relative(EXAMPLES, file);
    const { krsFile, styleSheets, diagnostics } = await new ImportResolver(fs).resolve(`/${name}`);
    // A file that does not parse or resolve would join as a partial model and
    // quietly shrink what every corpus guard measures.
    const errors = diagnostics.filter((d) => d.severity === "error");
    if (errors.length > 0) {
      throw new Error(`${name} does not resolve cleanly: ${errors.map((d) => d.code).join(", ")}`);
    }
    entries.push({ name, krsFile, styleSheets });
  }
  return entries;
}

/**
 * Render every view of an entry the way the all-views bundle does: the system
 * view and each drill-down level under `mode`, plus the deploy and org views.
 * Returns the bundle's SVG. A test that wraps `layout` sees every logical
 * canvas laid out on the way, and one that wraps `layoutDeploy` every deploy
 * canvas; the org view has its own tree renderer and goes through neither.
 */
export function renderEveryView(entry: ExampleEntry, mode: GroupByMode): string {
  return buildAllViewsSvg(
    entry.krsFile,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    mode === "none" ? undefined : mode,
    undefined,
    entry.styleSheets,
  ).svg;
}
