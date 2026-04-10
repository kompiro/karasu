import * as fs from "fs";
import * as path from "path";
import { format, FormatError } from "@karasu-tools/core";

export interface FmtOptions {
  check?: boolean;
  stdin?: boolean;
}

export async function fmt(files: string[], options: FmtOptions): Promise<void> {
  if (options.stdin) {
    await fmtStdin();
    return;
  }

  const targets = await resolveTargets(files);

  if (targets.length === 0) {
    process.stderr.write("No .krs files found.\n");
    process.exit(0);
  }

  let anyChanged = false;
  let anyError = false;

  for (const file of targets) {
    const src = fs.readFileSync(file, "utf8");
    let formatted: string;
    try {
      formatted = format(src);
    } catch (e) {
      if (e instanceof FormatError) {
        process.stderr.write(`${file}: ${e.message}\n`);
        anyError = true;
        continue;
      }
      throw e;
    }

    if (src === formatted) continue;

    anyChanged = true;
    if (options.check) {
      process.stderr.write(`${file}: would be reformatted\n`);
    } else {
      fs.writeFileSync(file, formatted, "utf8");
      process.stdout.write(`${file}: formatted\n`);
    }
  }

  if (anyError) process.exit(2);
  if (options.check && anyChanged) process.exit(1);
}

async function fmtStdin(): Promise<void> {
  const src = await readStdin();
  try {
    process.stdout.write(format(src));
  } catch (e) {
    if (e instanceof FormatError) {
      process.stderr.write(`stdin: ${e.message}\n`);
      process.exit(2);
    }
    throw e;
  }
}

async function resolveTargets(files: string[]): Promise<string[]> {
  if (files.length > 0) {
    return files.map((f) => path.resolve(f));
  }
  // Default: all .krs files under the current directory (recursive)
  return findKrsFiles(process.cwd()).sort();
}

function findKrsFiles(dir: string): string[] {
  const SKIP = new Set(["node_modules", ".worktrees", ".git", "dist"]);
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findKrsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".krs")) {
      results.push(full);
    }
  }
  return results;
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}
