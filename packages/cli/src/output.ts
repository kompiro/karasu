import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

/**
 * Shared output sink for commands with an optional `--output` flag:
 * write `content` to `outputPath` when given, otherwise to stdout.
 */
export async function writeOutput(content: string, outputPath?: string): Promise<void> {
  if (outputPath) {
    await writeFile(resolve(outputPath), content, "utf-8");
  } else {
    process.stdout.write(content);
  }
}
