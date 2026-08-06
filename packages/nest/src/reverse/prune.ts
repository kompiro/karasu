/**
 * Repair by deleting, before repair by asking.
 *
 * The reverse skill this pipeline descends from splits the work: judgement is
 * the model's, **validation is deterministic and belongs to the tool**
 * (`.claude/skills/reverse-architecture/SKILL.md`, ADR-1895). This pipeline
 * had validation on the deterministic side and *repair* on the model's, which
 * is the wrong cut. Asking a model to fix syntax is another sample from the
 * same distribution that produced the mistake: real runs went 824 → 31 → 47 →
 * 22 → 40 errors, wandering rather than converging.
 *
 * Most of what fails here is not a subtle syntax error. It is a construct the
 * notation has no home for -- attributes inside an `entity`, the single most
 * natural thing to write when reading a DDD repository and the one thing
 * `entity` forbids. SKILL.md lists that family under "notation gaps": value
 * objects, state machines, policies, "no structural home, so they survive
 * only as prose".
 *
 * A line the parser rejects for that reason carries nothing the model could
 * have expressed. Deleting it loses no representable information, and unlike
 * a re-prompt it is free, instant and the same every time.
 *
 * The guards matter more than the algorithm. Deleting a line with a brace
 * would turn a local mistake into a structural one, and a prune that removes
 * half the document is not repairing it.
 */
import { compile } from "@karasu-tools/core";

export interface PruneResult {
  krs: string;
  /** How many lines were dropped. Zero when nothing could be improved. */
  removed: number;
  /** Error count after pruning. Zero means the document now parses. */
  remainingErrors: number;
}

/** How many delete-and-recheck rounds to run. */
const MAX_ROUNDS = 4;

/**
 * The largest share of a document this will delete.
 *
 * Past this the problem is not a few unrepresentable lines, and quietly
 * shipping the remainder would be a confident model of a fraction of the
 * repository.
 */
const MAX_REMOVED_SHARE = 0.25;

function errorCount(krs: string): number {
  return compile(krs, { diagramType: "system" }).diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error",
  ).length;
}

/** Lines the parser put an error on, 1-based. */
function offendingLines(krs: string): Set<number> {
  const lines = new Set<number>();
  for (const diagnostic of compile(krs, { diagramType: "system" }).diagnostics) {
    if (diagnostic.severity !== "error") continue;
    if (diagnostic.loc === undefined) continue;
    lines.add(diagnostic.loc.start.line);
  }
  return lines;
}

/**
 * Whether a line may be deleted without changing the document's structure.
 *
 * A line carrying a brace holds nesting, and removing it turns "one bad
 * property" into "every block after this is misparsed" -- a far worse
 * document that still, sometimes, parses.
 */
function safeToRemove(line: string): boolean {
  return !line.includes("{") && !line.includes("}") && line.trim().length > 0;
}

/**
 * Delete the lines the parser rejects, while that makes the document better.
 *
 * Each round is checked rather than trusted: a round that does not reduce the
 * error count is discarded and the loop stops. That is what keeps this from
 * being a slower way to destroy a document.
 */
export function pruneUnparseableLines(krs: string): PruneResult {
  let current = krs;
  let removed = 0;
  let errors = errorCount(current);
  const originalLines = krs.split("\n").length;

  for (let round = 0; round < MAX_ROUNDS && errors > 0; round += 1) {
    const targets = offendingLines(current);
    if (targets.size === 0) break;

    const lines = current.split("\n");
    const kept: string[] = [];
    let removedThisRound = 0;
    for (const [index, line] of lines.entries()) {
      if (targets.has(index + 1) && safeToRemove(line)) {
        removedThisRound += 1;
        continue;
      }
      kept.push(line);
    }
    if (removedThisRound === 0) break;
    if (removed + removedThisRound > originalLines * MAX_REMOVED_SHARE) break;

    const candidate = kept.join("\n");
    const candidateErrors = errorCount(candidate);
    // Strictly better, or not at all. Deleting lines can uncover errors that
    // were previously masked, and a round that trades one problem for another
    // is not progress.
    if (candidateErrors >= errors) break;

    current = candidate;
    errors = candidateErrors;
    removed += removedThisRound;
  }

  return { krs: current, removed, remainingErrors: errors };
}
