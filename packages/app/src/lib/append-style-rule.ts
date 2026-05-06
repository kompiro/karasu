import type { EdgeDirection, FileSystemProvider } from "@karasu-tools/core";
import { Parser, basename, resolvePath } from "@karasu-tools/core";

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
 * Derive the `.krs.style` filename a GUI-driven edit should bootstrap when
 * the active `.krs` source has no `@import` yet. Strips a trailing `.krs`
 * from the source's basename so `flow.krs` → `flow.krs.style` and
 * `index.krs` → `index.krs.style`. Returns the absolute path resolved
 * relative to the source file's directory.
 */
export function deriveStyleFilePath(krsPath: string): string {
  const name = basename(krsPath);
  const stem = name.endsWith(".krs") ? name.slice(0, -".krs".length) : name;
  const styleFileName = `${stem}.krs.style`;
  return resolvePath(krsPath, styleFileName);
}

/**
 * Resolve the existing append target if the source has an `@import`,
 * otherwise fall back to the basename-derived path. The returned path may
 * not exist on disk yet — callers writing through `appendEdgeDirectionRule`
 * tolerate that. Returns `undefined` only when there is no source file at
 * all (`krsPath` missing).
 */
export function resolveOrDeriveStyleAppendTarget(
  krsContent: string | undefined,
  krsPath: string | undefined,
): string | undefined {
  if (!krsPath) return undefined;
  const existing = resolveStyleAppendTarget(krsContent, krsPath);
  if (existing) return existing;
  return deriveStyleFilePath(krsPath);
}

/**
 * Inject `@import "<styleFileName>"` at the very top of a `.krs` source so a
 * brand-new diagram becomes self-bootstrapping for GUI style edits. Skips
 * when the same import is already present (idempotent — second click should
 * not stack duplicate directives). Existing content is preserved verbatim
 * after the new line.
 */
export function injectStyleImport(krsContent: string, styleFileName: string): string {
  const directive = `@import "${styleFileName}"`;
  const escaped = styleFileName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const alreadyImported = new RegExp(`^\\s*@import\\s+"${escaped}"`, "m");
  if (alreadyImported.test(krsContent)) return krsContent;
  return krsContent.length === 0 ? `${directive}\n` : `${directive}\n${krsContent}`;
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
