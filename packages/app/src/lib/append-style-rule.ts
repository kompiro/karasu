import type { EdgeDirection, FileSystemProvider } from "@karasu-tools/core";
import { Parser, basename, resolvePath } from "@karasu-tools/core";

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
 * not exist on disk yet — callers writing through `upsertEdgeDirectionRule`
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
 * Update the value of `property` inside the last block matching `selector`,
 * or append a fresh single-line rule when no eligible block exists. A block
 * is eligible for in-place rewrite when:
 *
 *   - it declares exactly the requested selector (full match, not prefix),
 *   - it contains no block or line comments, and
 *   - it declares the targeted property exactly once.
 *
 * Multi-property blocks, comment-bearing blocks, and any shape this scanner
 * cannot confidently round-trip fall through to append. The cascade puts
 * the new rule last, so behavior is preserved either way — the upgrade is
 * that GUI-emitted single-line rules collapse into one entry instead of
 * stacking on every edit (see ADR-20260508-01, supersedes ADR-20260506-01).
 */
export function upsertStyleProperty(
  content: string,
  selector: string,
  property: string,
  value: string,
): string {
  const updated = updateLastSingleProperty(content, selector, property, value);
  if (updated !== null) return updated;
  return appendSingleLineRule(content, selector, property, value);
}

function updateLastSingleProperty(
  content: string,
  selector: string,
  property: string,
  value: string,
): string | null {
  const blockRe = /([^{}]*)\{([^{}]*)\}/g;
  let lastMatch: { selectorStart: number; bodyStart: number; bodyEnd: number } | null = null;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(content)) !== null) {
    const head = m[1];
    const body = m[2];
    const headStart = m.index;
    const bodyStart = headStart + head.length + 1;
    const bodyEnd = bodyStart + body.length;
    if (!isExactSelector(head, selector)) continue;
    if (!isCommentFree(body)) continue;
    if (countPropertyDeclarations(body) !== 1) continue;
    lastMatch = { selectorStart: headStart, bodyStart, bodyEnd };
  }
  if (!lastMatch) return null;
  const body = content.slice(lastMatch.bodyStart, lastMatch.bodyEnd);
  const propRe = new RegExp(`(${escapeRegex(property)}\\s*:\\s*)([^;]*)(;?)`);
  const propMatch = propRe.exec(body);
  if (!propMatch) return null;
  const newBody =
    body.slice(0, propMatch.index) +
    propMatch[1] +
    value +
    (propMatch[3] || ";") +
    body.slice(propMatch.index + propMatch[0].length);
  return content.slice(0, lastMatch.bodyStart) + newBody + content.slice(lastMatch.bodyEnd);
}

function appendSingleLineRule(
  content: string,
  selector: string,
  property: string,
  value: string,
): string {
  const block = `${selector} { ${property}: ${value}; }\n`;
  const separator = content.length === 0 || content.endsWith("\n") ? "" : "\n";
  return content + separator + block;
}

function isExactSelector(head: string, selector: string): boolean {
  return head.trim() === selector;
}

function isCommentFree(body: string): boolean {
  return !body.includes("/*") && !body.includes("*/") && !body.includes("//");
}

function countPropertyDeclarations(body: string): number {
  return body
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.includes(":")).length;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Upsert `edge#<canonicalId> { direction: <direction>; }` into the given
 * `.krs.style` file. When an eligible single-property `edge#<canonicalId>`
 * block already exists, the existing direction value is rewritten in place
 * (no duplicate rule). Otherwise the rule is appended to the end of the
 * file. See `upsertStyleProperty` for the eligibility rules.
 */
export async function upsertEdgeDirectionRule(
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
  const updated = upsertStyleProperty(existing, `edge#${canonicalId}`, "direction", direction);
  await fs.writeFile(styleFilePath, updated);
}
