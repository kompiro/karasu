import * as fs from "fs";
import * as path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { Location } from "vscode-languageserver/node";
import { Parser, type ImportDeclaration, type KrsFile } from "@karasu-tools/core";
import { findRangeOfNode } from "./position-resolver.js";

/**
 * Read, parse, and search a single `.krs` file for `word`'s definition,
 * recursing into its own imports (transitively) on a miss. Shared by both
 * the directory-import expansion and the single-file-import branch below.
 */
function searchKrsFile(
  filePath: string,
  word: string,
  visited: Set<string>,
  options: LookupOptions,
): Location | null {
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
  const range = findRangeOfNode(parsed.value, word, options);
  if (range) return Location.create(fileUri, range);

  return findDefinitionInImports(parsed.value.nodeImports, word, fileUri, visited, options);
}

/**
 * Where `word` is defined, as Go to Definition answers it: a node in this
 * file, then a node in an imported file, and only then a client storage id
 * in this file (#3794). A storage id is listed so its declaration is
 * findable, but it never hides a node of the same id, here or imported.
 */
export function resolveDefinition(file: KrsFile, word: string, uri: string): Location | null {
  const nodesOnly = { nodesOnly: true };
  const node = findRangeOfNode(file, word, nodesOnly);
  if (node) return Location.create(uri, node);
  const self = () => new Set<string>([fileURLToPath(uri)]);
  const imported = findDefinitionInImports(file.nodeImports, word, uri, self(), nodesOnly);
  if (imported) return imported;
  // No node anywhere: a storage id, in this file first.
  const storage = findRangeOfNode(file, word);
  if (storage) return Location.create(uri, storage);
  return findDefinitionInImports(file.nodeImports, word, uri, self());
}

/** `nodesOnly` skips client storage ids (see {@link resolveDefinition}). */
type LookupOptions = { nodesOnly?: boolean };

/**
 * Recursively search imported files for a node definition.
 * Handles named imports, wildcard imports (file and directory), and transitive imports.
 */
export function findDefinitionInImports(
  nodeImports: ImportDeclaration[],
  word: string,
  baseUri: string,
  visited: Set<string>,
  options: LookupOptions = {},
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
        const result = searchKrsFile(filePath, word, visited, options);
        if (result) return result;
      }
      continue;
    }

    const isNamed = imp.ids.length > 0;
    // For named imports, only search files that declare the target id.
    // Each entry carries a path (#927) plus its own range (#2582); check both
    // bare entries (`["Foo"]`) and the leaf segment of multi-segment paths
    // (`["A", "B", "Foo"]`) — the user can only place a cursor on a single
    // identifier token, so we match against the final segment.
    if (isNamed && !imp.ids.some((entry) => entry.path[entry.path.length - 1] === word)) continue;

    const importedUri = resolveImportUri(baseUri, imp.path);
    const importedFilePath = fileURLToPath(importedUri);
    if (visited.has(importedFilePath)) continue;
    visited.add(importedFilePath);

    const result = searchKrsFile(importedFilePath, word, visited, options);
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
