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
const GREP_RE = /^grep:\s*(.+?)\s*::\s*(.+)$/;

/**
 * Evaluate a single assumption string against the working tree.
 *
 * Supported structured forms:
 *   - `file: <path>`            — asserts the path exists (file or directory).
 *   - `grep: <path> :: <regex>` — asserts the regex matches somewhere in the file.
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

  const grepMatch = assumption.match(GREP_RE);
  if (grepMatch) {
    const relativePath = grepMatch[1].trim();
    const pattern = grepMatch[2].trim();
    const fullPath = join(repoRoot, relativePath);
    if (!existsSync(fullPath)) {
      return { ...base, status: "fail", message: `missing file: ${relativePath}` };
    }
    let content: string;
    try {
      content = readFileSync(fullPath, "utf8");
    } catch (e) {
      return { ...base, status: "fail", message: `read error: ${(e as Error).message}` };
    }
    let re: RegExp;
    try {
      re = new RegExp(pattern);
    } catch (e) {
      return { ...base, status: "fail", message: `bad regex: ${(e as Error).message}` };
    }
    if (re.test(content)) return { ...base, status: "ok" };
    return { ...base, status: "fail", message: `pattern not found in ${relativePath}` };
  }

  return { ...base, status: "manual" };
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
