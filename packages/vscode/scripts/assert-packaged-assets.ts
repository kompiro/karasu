/**
 * Fail the vscode build when an asset the extension loads is not where the
 * `.vsix` will carry it (TPL-1024).
 *
 *   tsx scripts/assert-packaged-assets.ts   (run by `postbuild`)
 *
 * Walks `PACKAGED_ASSETS`, the list every runtime lookup resolves from, so a
 * new asset is checked as soon as the extension can load it. The extension
 * falls back to the dev tree for some assets, so a build that forgot to copy
 * one still works under F5 and only breaks once installed.
 */
import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { PACKAGED_ASSET_NAMES, PACKAGED_ASSETS } from "../src/packaged-assets.ts";

/** One line per asset missing or empty under `extensionRoot`. */
export function missingPackagedAssets(extensionRoot: string): string[] {
  const problems: string[] = [];
  for (const asset of PACKAGED_ASSET_NAMES) {
    const spec = PACKAGED_ASSETS[asset];
    const where = join(extensionRoot, ...spec.path);
    let empty: boolean;
    try {
      empty = spec.kind === "dir" ? readdirSync(where).length === 0 : statSync(where).size === 0;
    } catch {
      problems.push(`${asset}: ${where} is missing. It is put there by ${spec.builtBy}.`);
      continue;
    }
    if (empty) problems.push(`${asset}: ${where} is empty. It is put there by ${spec.builtBy}.`);
  }
  return problems;
}

// Only run when invoked directly (not when imported by tests).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const problems = missingPackagedAssets(resolve(import.meta.dirname, ".."));
  if (problems.length > 0) {
    process.stderr.write(
      `[vscode build] The installed .vsix would miss files the extension loads:\n${problems.join("\n")}\n`,
    );
    process.exit(1);
  }
}
