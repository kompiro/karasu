/**
 * The `examples/` corpus as layout inputs, for the placement invariants that
 * have to hold on every canvas a user can open rather than on hand-built
 * fixtures (the #1954 lesson). Excluded from the build with the rest of
 * `fixtures/`, which is what lets it read the files from disk.
 *
 * A view is every canvas `extractView` can produce from one file without
 * resolving imports: the root (one system's own canvas, or the multi-system
 * root when the file declares several), each system on its own when there are
 * several, and the drill-down of every child that has children of its own.
 * Enumerated from the parsed model, so a new example is covered the day it
 * lands.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { layout } from "../layout.js";
import { extractView } from "../../view/view-extract.js";
import { Parser } from "../../parser/parser.js";
import type { KrsNode } from "../../types/ast.js";
import type { LayoutOptions, LayoutResult } from "../layout-types.js";

export const EXAMPLES_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../examples",
);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (name.endsWith(".krs")) out.push(path);
  }
  return out;
}

/** Every `.krs` under `examples/`, both languages. */
export function exampleFiles(): string[] {
  return walk(EXAMPLES_DIR);
}

export interface CorpusView {
  /** `<file relative to examples/>[<path>]`, for failure messages. */
  name: string;
  src: string;
  path: string[];
}

export function viewPathsOf(systems: readonly KrsNode[]): string[][] {
  const paths: string[][] = [[]];
  for (const sys of systems) {
    if (systems.length > 1) paths.push([sys.id]);
    for (const child of sys.children) {
      if (child.children.length > 0) paths.push([sys.id, child.id]);
    }
  }
  return paths;
}

export function corpusViews(): CorpusView[] {
  return exampleFiles().flatMap((file) => {
    const src = readFileSync(file, "utf8");
    const rel = file.slice(EXAMPLES_DIR.length + 1);
    return viewPathsOf(Parser.parse(src).value.systems).map((path) => ({
      name: `${rel}[${path.join(".")}]`,
      src,
      path,
    }));
  });
}

/** Parse, extract and lay out one view the way the preview does, minus styles. */
export function layoutView(
  src: string,
  path: string[] = [],
  options: LayoutOptions = {},
): LayoutResult {
  const parsed = Parser.parse(src).value;
  return layout(extractView(parsed.systems, path), {
    ownerIndex: parsed.ownerIndex,
    boundaryMembership: parsed.boundaryMembership,
    ...options,
  });
}
