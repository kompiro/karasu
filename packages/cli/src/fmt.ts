import * as fs from "node:fs";
import { format, FormatError } from "@karasu-tools/core";
import { DEFAULT_SKIP_DIRS, findFilesBySuffix, resolveTargets } from "./find-files.js";
import { readStdin } from "./stdin.js";

interface FmtOptions {
  check?: boolean;
  stdin?: boolean;
}

export async function fmt(files: string[], options: FmtOptions): Promise<void> {
  if (options.stdin) {
    await fmtStdin();
    return;
  }

  // Default: all .krs files under the current directory (recursive)
  const targets = resolveTargets(files, () =>
    findFilesBySuffix(process.cwd(), ".krs", DEFAULT_SKIP_DIRS),
  );

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
