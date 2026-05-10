import * as fs from "fs";
import * as path from "path";
import { tidyStyleSheet } from "@karasu-tools/core";
import { readStdin } from "./stdin.js";

interface TidyStyleOptions {
  check?: boolean;
  stdin?: boolean;
  noMerge?: boolean;
}

/**
 * `karasu tidy-style` — normalize one or more `.krs.style` files in
 * place. Defaults to rewriting; `--check` reports drift only and exits
 * non-zero when any file would change.
 */
export async function tidyStyle(files: string[], options: TidyStyleOptions): Promise<void> {
  if (options.stdin) {
    await tidyStyleStdin(options);
    return;
  }

  const targets = await resolveTargets(files);

  if (targets.length === 0) {
    process.stderr.write("No .krs.style files found.\n");
    process.exit(0);
  }

  let anyChanged = false;

  for (const file of targets) {
    const src = fs.readFileSync(file, "utf8");
    const result = tidyStyleSheet(src, { merge: !options.noMerge });

    if (!result.changed) continue;

    anyChanged = true;
    if (options.check) {
      process.stderr.write(`${file}: would be tidied\n`);
    } else {
      fs.writeFileSync(file, result.output, "utf8");
      process.stdout.write(`${file}: tidied\n`);
    }
  }

  if (options.check && anyChanged) process.exit(1);
}

async function tidyStyleStdin(options: TidyStyleOptions): Promise<void> {
  const src = await readStdin();
  const result = tidyStyleSheet(src, { merge: !options.noMerge });
  process.stdout.write(result.output);
}

async function resolveTargets(files: string[]): Promise<string[]> {
  if (files.length > 0) {
    return files.map((f) => path.resolve(f));
  }
  return findStyleFiles(process.cwd()).sort();
}

function findStyleFiles(dir: string): string[] {
  const SKIP = new Set(["node_modules", ".worktrees", ".git", "dist", ".claude"]);
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findStyleFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".krs.style")) {
      results.push(full);
    }
  }
  return results;
}
