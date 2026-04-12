import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { applyKrsPatch } from "@karasu-tools/core";

/**
 * Append stdin .krs content as a new top-level block at the end of a .krs file.
 * Creates the file if it does not exist.
 *
 * Exits with a non-zero code if stdin is empty.
 */
export async function append(targetFile: string): Promise<void> {
  const content = await readStdin();

  if (!content.trim()) {
    process.stderr.write("Error: stdin is empty — pipe .krs content to append\n");
    process.exit(1);
    return; // unreachable in production; allows process.exit to be mocked in tests
  }

  const targetPath = resolve(targetFile);
  const existing = existsSync(targetPath) ? readFileSync(targetPath, "utf-8") : "";

  const result = applyKrsPatch(existing, "append", undefined, content.trim());
  if (!result.ok) {
    process.stderr.write(`Error: ${result.error}\n`);
    process.exit(1);
    return;
  }

  writeFileSync(targetPath, result.source, "utf-8");
}

function readStdin(): Promise<string> {
  return new Promise((done) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => {
      done(data);
    });
  });
}
