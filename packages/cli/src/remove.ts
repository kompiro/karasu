import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { applyKrsPatch } from "@karasu-tools/core";

/**
 * Remove a node with the given ID from a .krs file in-place.
 *
 * Exits with a non-zero code if:
 *   - the file does not exist
 *   - the node ID is not found in the file
 */
export function remove(nodeId: string, targetFile: string): void {
  const targetPath = resolve(targetFile);

  if (!existsSync(targetPath)) {
    process.stderr.write(`Error: file not found: ${targetFile}\n`);
    process.exit(1);
    return; // unreachable in production; allows process.exit to be mocked in tests
  }

  const source = readFileSync(targetPath, "utf-8");
  const result = applyKrsPatch(source, "remove", nodeId);

  if (!result.ok) {
    process.stderr.write(`Error: ${result.error}\n`);
    process.exit(1);
    return;
  }

  writeFileSync(targetPath, result.source, "utf-8");
}
