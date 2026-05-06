import type { EdgeDirection, FileSystemProvider } from "@karasu-tools/core";
import { Parser, resolvePath } from "@karasu-tools/core";

/**
 * Resolve the path of the `.krs.style` file the GUI append writer should
 * land its rules in. Two cases:
 *
 *  1. The user is editing a `.krs.style` file directly — the open file
 *     *is* the target. Append straight there.
 *  2. The user is editing a `.krs` source — look at the file's
 *     `@import` declarations and pick the *last* one so appended rules
 *     sit at the bottom of the cascade and win against earlier imports.
 *
 * Returns `undefined` when neither case applies (no `.krs.style` open
 * and the active `.krs` has no `@import`). Callers should surface the
 * GUI write path as disabled in that situation rather than guess a
 * path.
 */
export function resolveStyleAppendTarget(
  fileContent: string | undefined,
  filePath: string | undefined,
): string | undefined {
  if (!filePath) return undefined;
  // Case 1: editing a .krs.style directly. Skip the @import lookup and
  // use the open file itself — that's the file the user is looking at.
  if (filePath.endsWith(".krs.style")) return filePath;
  // Case 2: editing a .krs source. Need the parsed @import list.
  if (!fileContent) return undefined;
  const parsed = Parser.parse(fileContent);
  const imports = parsed.value.styleImports;
  if (imports.length === 0) return undefined;
  return resolvePath(filePath, imports[imports.length - 1]);
}

/**
 * Append `selector { property: value; }` to the given `.krs.style` file. The
 * file's existing content is preserved verbatim; the new rule lands on its
 * own line at the bottom so the cascade resolves it last among rules of the
 * same specificity. Creates the file with the new rule when it doesn't
 * exist yet (the resolver tolerates a missing file but we prefer to make
 * the user's intent visible).
 */
export async function appendEdgeDirectionRule(
  fs: FileSystemProvider,
  styleFilePath: string,
  canonicalId: string,
  direction: EdgeDirection,
): Promise<void> {
  let existing = "";
  try {
    existing = await fs.readFile(styleFilePath);
  } catch {
    existing = "";
  }
  const block = `edge#${canonicalId} { direction: ${direction}; }\n`;
  const separator = existing.length === 0 || existing.endsWith("\n") ? "" : "\n";
  await fs.writeFile(styleFilePath, existing + separator + block);
}
