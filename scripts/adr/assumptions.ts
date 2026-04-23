import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ParsedAdr } from "./validator.ts";

type AssumptionStatus = "ok" | "fail" | "manual";

interface AssumptionResult {
  adrId: string;
  file: string;
  assumption: string;
  status: AssumptionStatus;
  message?: string;
}

const FILE_RE = /^file:\s*(.+)$/;
const SYMBOL_RE = /^symbol:\s*(.+?)\s*::\s*(.+)$/;
const GREP_RE = /^grep:\s*(.+?)\s*::\s*(.+)$/;
const IDENT_RE = /^[A-Za-z_$][\w$]*$/;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Evaluate a single assumption string against the working tree.
 *
 * Supported structured forms:
 *   - `file: <path>`              — asserts the path exists (file or directory).
 *   - `symbol: <path> :: <name>`  — asserts `<name>` appears as a whole
 *                                    identifier. Use for function / class /
 *                                    const / type names where
 *                                    `withUnassignedSystem` must NOT match
 *                                    `withUnassignedSystem2`.
 *   - `grep: <path> :: <regex>`   — raw regex match. Use for non-identifier
 *                                    content (e.g. `case TokenType.Database`).
 *
 * Anything else is treated as free-text and returned as `manual` so a human
 * reviews it. Free-text never fails the checker — structured checks do.
 */
export function evaluateAssumption(
  adr: ParsedAdr,
  assumption: string,
  repoRoot: string,
): AssumptionResult {
  const base = { adrId: adr.id, file: adr.file, assumption };

  const fileMatch = assumption.match(FILE_RE);
  if (fileMatch) {
    const relativePath = fileMatch[1].trim();
    const fullPath = join(repoRoot, relativePath);
    if (existsSync(fullPath)) return { ...base, status: "ok" };
    return { ...base, status: "fail", message: `missing: ${relativePath}` };
  }

  const symbolMatch = assumption.match(SYMBOL_RE);
  if (symbolMatch) {
    const relativePath = symbolMatch[1].trim();
    const name = symbolMatch[2].trim();
    if (!IDENT_RE.test(name)) {
      return {
        ...base,
        status: "fail",
        message: `"${name}" is not a valid identifier; use \`grep:\` for free-form patterns`,
      };
    }
    const fileResult = readFileForCheck(base, repoRoot, relativePath);
    if ("error" in fileResult) return fileResult.error;
    // Identifier boundary. `\b` uses `[A-Za-z0-9_]` so it treats `$` as a
    // boundary, which makes `\b$foo\b` fail to match `$foo`. Use explicit
    // lookarounds that include `$` in the identifier character set so that
    // `withUnassignedSystem` still does not match `withUnassignedSystem2`.
    const ident = "[A-Za-z0-9_$]";
    const re = new RegExp(`(?<!${ident})${escapeRegExp(name)}(?!${ident})`);
    if (re.test(fileResult.content)) return { ...base, status: "ok" };
    return {
      ...base,
      status: "fail",
      message: `identifier "${name}" not found in ${relativePath}`,
    };
  }

  const grepMatch = assumption.match(GREP_RE);
  if (grepMatch) {
    const relativePath = grepMatch[1].trim();
    const pattern = grepMatch[2].trim();
    const fileResult = readFileForCheck(base, repoRoot, relativePath);
    if ("error" in fileResult) return fileResult.error;
    let re: RegExp;
    try {
      re = new RegExp(pattern);
    } catch (e) {
      return { ...base, status: "fail", message: `bad regex: ${(e as Error).message}` };
    }
    if (re.test(fileResult.content)) return { ...base, status: "ok" };
    return { ...base, status: "fail", message: `pattern not found in ${relativePath}` };
  }

  return { ...base, status: "manual" };
}

type FileCheckResult = { content: string } | { error: AssumptionResult };

function readFileForCheck(
  base: { adrId: string; file: string; assumption: string },
  repoRoot: string,
  relativePath: string,
): FileCheckResult {
  const fullPath = join(repoRoot, relativePath);
  if (!existsSync(fullPath)) {
    return {
      error: { ...base, status: "fail", message: `missing file: ${relativePath}` },
    };
  }
  try {
    return { content: readFileSync(fullPath, "utf8") };
  } catch (e) {
    return {
      error: { ...base, status: "fail", message: `read error: ${(e as Error).message}` },
    };
  }
}

export function evaluateAll(adrs: ParsedAdr[], repoRoot: string): AssumptionResult[] {
  const results: AssumptionResult[] = [];
  for (const adr of adrs) {
    for (const a of adr.fm.assumptions ?? []) {
      results.push(evaluateAssumption(adr, a, repoRoot));
    }
  }
  return results;
}
