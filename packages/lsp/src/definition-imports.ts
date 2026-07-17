import * as fs from "fs";
import * as path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { Location } from "vscode-languageserver/node";
import { Parser, type ImportDeclaration } from "@karasu-tools/core";
import { findRangeOfNode } from "./position-resolver.js";

/**
 * Read, parse, and search a single `.krs` file for `word`'s definition,
 * recursing into its own imports (transitively) on a miss. Shared by both
 * the directory-import expansion and the single-file-import branch below.
 */
function searchKrsFile(filePath: string, word: string, visited: Set<string>): Location | null {
  // Skip this file on any read or parse failure, matching the per-branch
  // skip semantics the two original import branches had. `Parser.parse`
  // reports errors as diagnostics rather than throwing today, so the parse
  // guard is a deliberate resilience net, not a load-bearing branch.
  let parsed: ReturnType<typeof Parser.parse>;
  try {
    const text = fs.readFileSync(filePath, "utf-8");
    parsed = Parser.parse(text);
  } catch {
    return null;
  }

  const fileUri = pathToFileURL(filePath).toString();
  const range = findRangeOfNode(parsed.value, word);
  if (range) return Location.create(fileUri, range);

  return findDefinitionInImports(parsed.value.nodeImports, word, fileUri, visited);
}

/**
 * Recursively search imported files for a node definition.
 * Handles named imports, wildcard imports (file and directory), and transitive imports.
 */
export function findDefinitionInImports(
  nodeImports: ImportDeclaration[],
  word: string,
  baseUri: string,
  visited: Set<string>,
): Location | null {
  for (const imp of nodeImports) {
    if (imp.path === "") continue;

    // Directory import: expand to individual .krs files and search each
    if (imp.path.endsWith("/")) {
      const dirUri = resolveImportUri(baseUri, imp.path);
      const dirPath = fileURLToPath(dirUri);
      let entries: string[];
      try {
        entries = fs
          .readdirSync(dirPath)
          .filter((name) => name.endsWith(".krs"))
          .sort()
          .map((name) => path.join(dirPath, name));
      } catch {
        continue;
      }
      for (const filePath of entries) {
        if (visited.has(filePath)) continue;
        visited.add(filePath);
        const result = searchKrsFile(filePath, word, visited);
        if (result) return result;
      }
      continue;
    }

    const isNamed = imp.ids.length > 0;
    // For named imports, only search files that declare the target id.
    // After path-import support (#927) `imp.ids` is `string[][]`; check both
    // bare entries (`["Foo"]`) and the leaf segment of multi-segment paths
    // (`["A", "B", "Foo"]`) — the user can only place a cursor on a single
    // identifier token, so we match against the final segment.
    if (isNamed && !imp.ids.some((segments) => segments[segments.length - 1] === word)) continue;

    const importedUri = resolveImportUri(baseUri, imp.path);
    const importedFilePath = fileURLToPath(importedUri);
    if (visited.has(importedFilePath)) continue;
    visited.add(importedFilePath);

    const result = searchKrsFile(importedFilePath, word, visited);
    if (result) return result;
  }
  return null;
}

/** Resolve a relative import path to a file:// URI. */
function resolveImportUri(documentUri: string, importPath: string): string {
  const documentFilePath = fileURLToPath(documentUri);
  const dir = path.dirname(documentFilePath);
  const resolved = path.resolve(dir, importPath);
  return pathToFileURL(resolved).toString();
}
