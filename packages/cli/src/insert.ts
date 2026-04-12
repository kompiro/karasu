import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { applyKrsPatch } from "@karasu-tools/core";

/**
 * Insert stdin .krs content as the last child of the node with `parentId`
 * in a .krs file, automatically indenting relative to the parent's closing `}`.
 *
 * Exits with a non-zero code if:
 *   - the file does not exist
 *   - stdin is empty
 *   - the parent node ID is not found in the file
 */
export async function insert(parentId: string, targetFile: string): Promise<void> {
  const content = await readStdin();

  if (!content.trim()) {
    process.stderr.write("Error: stdin is empty — pipe .krs content to insert\n");
    process.exit(1);
    return; // unreachable in production; allows process.exit to be mocked in tests
  }

  const targetPath = resolve(targetFile);

  if (!existsSync(targetPath)) {
    process.stderr.write(`Error: file not found: ${targetFile}\n`);
    process.exit(1);
    return;
  }

  const source = readFileSync(targetPath, "utf-8");
  const result = applyKrsPatch(source, "insert-child", parentId, content.trim());

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
