import type { EdgeDirection, FileSystemProvider } from "@karasu-tools/core";
import { Parser, resolvePath } from "@karasu-tools/core";

/**
 * Resolve the path of the `.krs.style` file we should append GUI-driven
 * style rules to. Picks the *last* `@import` declaration in the active
 * `.krs` file so the appended rules sit at the bottom of the cascade and
 * win against earlier imports.
 *
 * Returns `undefined` when the file has no `@import` — callers should
 * disable the GUI write path in that case rather than guessing a path.
 */
export function resolveStyleAppendTarget(
  krsContent: string | undefined,
  krsPath: string | undefined,
): string | undefined {
  if (!krsContent || !krsPath) return undefined;
  const parsed = Parser.parse(krsContent);
  const imports = parsed.value.styleImports;
  if (imports.length === 0) return undefined;
  return resolvePath(krsPath, imports[imports.length - 1]);
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
