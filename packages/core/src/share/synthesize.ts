import type { FileSystemProvider } from "../fs/types.js";
import { ImportResolver } from "../fs/import-resolver.js";
import { serializeKrsFile } from "../formatter/formatter.js";
import { serializeStyleSheet } from "../style/serialize.js";

/**
 * Relative `.krs.style` path embedded as the single `@import` in a synthesized
 * share payload. The decoder writes the bundled style next to the `.krs` under
 * this name, so the import resolves in the ephemeral in-memory project.
 */
export const SHARE_STYLE_IMPORT_PATH = "index.krs.style";

/** A self-contained share payload: a single `.krs` plus its optional merged style. */
export interface SharePayload {
  /** Flattened, self-contained `.krs` (all node imports inlined). */
  krs: string;
  /**
   * Serialized merged `.krs.style`, or `undefined` when the project has no
   * styles. When present, `krs` carries a single `@import "index.krs.style"`.
   */
  style?: string;
}

/**
 * Flatten a (possibly multi-file) project into a single self-contained share
 * payload: imports are resolved and inlined into one `.krs`, and the resolved
 * stylesheets are merged into one `.krs.style`.
 *
 * Used by karasu-nest inline sharing — the result encodes into a URL that opens
 * as a standalone in-memory project (design:
 * docs/design/karasu-nest-hosted-preview.md).
 */
export async function synthesizeSharePayload(
  entryPath: string,
  fs: FileSystemProvider,
): Promise<SharePayload> {
  const resolver = new ImportResolver(fs);
  const { krsFile, styleSheets } = await resolver.resolve(entryPath);

  const style =
    styleSheets.length > 0 ? styleSheets.map(serializeStyleSheet).join("\n") : undefined;

  // Emit a single self-contained `.krs`: drop the original node/style imports
  // (their targets won't exist in the shared project) and, when a style exists,
  // point at the one bundled stylesheet.
  const krs = serializeKrsFile({
    ...krsFile,
    nodeImports: [],
    styleImports: style !== undefined ? [SHARE_STYLE_IMPORT_PATH] : [],
  });

  return style !== undefined ? { krs, style } : { krs };
}
