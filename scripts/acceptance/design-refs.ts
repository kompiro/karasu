import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Guard: an AT record must not point at `docs/design/`.
 *
 * A Design Doc is deleted when it is promoted to an ADR (`docs/process.md`
 * 「設計判断を ADR に残すタイミング」), so an AT record that cites one is
 * pointing at an address the process guarantees will die. That is TPL-2254 —
 * a record must point at something that outlives it.
 *
 * This was not a hypothetical. When the guard was written, 27 of the 34
 * references from `docs/acceptance/` to `docs/design/` already resolved to
 * nothing, and one of them (`1821-layer-toggle-external-infra.md`) was a
 * broken markdown link sitting in main. Nothing caught it: the repo's only
 * link check covers `packages/docs-site`, the published subset, and 26 of the
 * dead references were backtick prose rather than links, which no link checker
 * would flag anyway.
 *
 * Point at the Issue instead — it is never deleted, and it reaches both the
 * design PR and the ADR. Once the ADR exists, cite that too.
 */

export interface DesignRefFinding {
  file: string;
  /** 1-based line of the reference. */
  line: number;
  /** The referenced design doc path as written. */
  ref: string;
  /** True when the target no longer exists (already broken). */
  dangling: boolean;
}

/** `docs/design/<name>.md` or a relative `../design/<name>.md`. */
const DESIGN_REF = /(?:\.\.\/design\/|docs\/design\/)([A-Za-z0-9._-]+\.md)/g;

export function analyzeDesignRefs(repoRoot: string): DesignRefFinding[] {
  const atDir = join(repoRoot, "docs/acceptance");
  if (!existsSync(atDir)) return [];

  const findings: DesignRefFinding[] = [];
  for (const entry of readdirSync(atDir).sort()) {
    if (!entry.endsWith(".md") || entry === "TEMPLATE.md") continue;
    const lines = readFileSync(join(atDir, entry), "utf8").split("\n");
    lines.forEach((text, i) => {
      // A markdown link spells the same target twice (`[docs/design/x.md](../design/x.md)`),
      // so collapse per line+target — one reference, one finding.
      const seen = new Set<string>();
      for (const m of text.matchAll(DESIGN_REF)) {
        if (seen.has(m[1])) continue;
        seen.add(m[1]);
        findings.push({
          file: `docs/acceptance/${entry}`,
          line: i + 1,
          ref: m[0],
          dangling: !existsSync(join(repoRoot, "docs/design", m[1])),
        });
      }
    });
  }
  return findings;
}

export function describeDesignRefFinding(f: DesignRefFinding): string {
  const state = f.dangling ? "already gone" : "will be deleted at ADR promotion";
  return `${f.file}:${f.line} → ${f.ref} (${state}); cite the Issue instead`;
}
