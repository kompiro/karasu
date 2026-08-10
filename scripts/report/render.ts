// `.krs` → SVG for report generators (Issue #2419). A thin wrapper over
// `compile()` whose only real job is to fail loudly: a PoC that silently
// embeds the renderer's error placeholder produces a report that argues from a
// picture of nothing.
//
// Single-file models only. A multi-file PoC should import `compileProject`
// from packages/core directly — the file-resolution options it needs have no
// useful default here.

import { compile, type CompileOptions } from "../../packages/core/src/index.ts";

export interface RenderOptions extends CompileOptions {
  /**
   * `.krs.style` content. When given, `@import "*.krs.style"` lines are
   * stripped from `source` first: the import would resolve against a file that
   * does not exist beside the generator. Mirrors scripts/guide/gen-guide-diagrams.ts.
   */
  styleSource?: string;
}

/** Matches a whole-line `@import "….krs.style"` statement. */
const STYLE_IMPORT_RE = /^\s*@import\s+"[^"]*\.krs\.style"\s*;?\s*$/gm;

/**
 * Compiles `source` and returns the SVG. Throws when the model has error
 * diagnostics, with their codes and params, so a broken snippet stops the
 * generator instead of reaching the report.
 */
export function renderKrs(source: string, options: RenderOptions = {}): string {
  const { styleSource, ...compileOptions } = options;
  const krs = styleSource === undefined ? source : source.replaceAll(STYLE_IMPORT_RE, "");
  const result = compile(krs, { ...compileOptions, styleSource });

  const errors = result.diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) {
    const detail = errors.map((d) => `  - ${d.code}: ${JSON.stringify(d.params)}`).join("\n");
    const view = compileOptions.diagramType ?? "system";
    throw new Error(`renderKrs: source failed to compile (${view} view):\n${detail}`);
  }

  return result.svg;
}
