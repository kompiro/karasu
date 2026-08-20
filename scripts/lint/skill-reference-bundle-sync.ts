/* eslint-disable no-console -- CLI entry point; stdout/stderr reporting is the whole job */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

// Keeps the reference docs bundled inside the reverse-architecture skill
// byte-identical to their sources in `docs/` (Issue #2574).
//
// The skill runs against an ARBITRARY repository. `docs/spec/syntax.md` is not
// there, so every reference the skill made to a `docs/…` path resolved only by
// luck — when the agent happened to be running inside a karasu checkout. The
// bundle makes the skill self-contained; this guard is the price of the copy.
//
// The precedent is `examples.test.ts` (examples/ ↔ examples.ts): a copy that
// nothing verifies is a copy that silently goes stale, and a stale grammar is
// worse than an absent one — the agent writes confidently against a syntax that
// no longer parses. Same reasoning as `skill-cli-refs`, one register down: that
// guard checks the skill's claims ABOUT the CLI, this one checks the skill's
// copy OF the spec.
//
// Byte-identical on purpose. Annotating the copies (a "generated, do not edit"
// header) would make them self-explaining but would cost the trivial
// comparison that makes this guard strong; the notice lives in the bundle's
// README instead, which this guard also requires.

export const BUNDLE_DIR = ".claude/skills/reverse-architecture/reference";

/**
 * source (repo-relative) → bundled copy (repo-relative).
 *
 * The set is what a reverse run READS, not everything a human might want:
 *
 *   - `syntax.md` — the grammar. `docs/guide/reverse-engineering-with-ai.md`
 *     step 1 names it as the one thing an LLM must be given.
 *   - `notation-cookbook.md` — named by that same step, "so the model picks
 *     karasu-idiomatic shapes instead of inventing them".
 *   - `tags-annotations.md` — the four-way register split (boundary /
 *     annotation / tag / facet) and `@draft`, both of which SKILL.md now
 *     instructs against by name.
 *   - `diagnostics.md` — SKILL.md's Phase 4 table names diagnostic codes; this
 *     is what they mean.
 *
 * Deliberately excluded: `style.md` (the skill produces no `.krs.style` and
 * says so), the `.ja.md` variants (the skill is English), and the ADRs (cited
 * for provenance, never read to produce a model).
 */
export const BUNDLED_DOCS: ReadonlyArray<{ source: string; bundled: string }> = [
  { source: "docs/spec/syntax.md", bundled: `${BUNDLE_DIR}/syntax.md` },
  { source: "docs/spec/tags-annotations.md", bundled: `${BUNDLE_DIR}/tags-annotations.md` },
  { source: "docs/spec/diagnostics.md", bundled: `${BUNDLE_DIR}/diagnostics.md` },
  { source: "docs/guide/notation-cookbook.md", bundled: `${BUNDLE_DIR}/notation-cookbook.md` },
];

/** The bundle's own notice; a copy with no "do not edit here" invites the wrong edit. */
export const BUNDLE_README = `${BUNDLE_DIR}/README.md`;

export type ProblemKind = "missing-source" | "missing-copy" | "stale-copy" | "missing-readme";

export interface Problem {
  kind: ProblemKind;
  /** The bundled copy at fault, or the README / source path for the other kinds. */
  file: string;
  source?: string;
}

/** Every bundled copy that is absent or differs from its source, plus the README. */
export function check(repoRoot: string): Problem[] {
  const problems: Problem[] = [];

  for (const { source, bundled } of BUNDLED_DOCS) {
    const sourceAbs = resolve(repoRoot, source);
    const bundledAbs = resolve(repoRoot, bundled);

    if (!existsSync(sourceAbs)) {
      // The source moved or was renamed: the manifest is what is stale now, not
      // the copy, so say that rather than reporting a phantom drift.
      problems.push({ kind: "missing-source", file: source });
      continue;
    }
    if (!existsSync(bundledAbs)) {
      problems.push({ kind: "missing-copy", file: bundled, source });
      continue;
    }
    if (readFileSync(bundledAbs, "utf8") !== readFileSync(sourceAbs, "utf8")) {
      problems.push({ kind: "stale-copy", file: bundled, source });
    }
  }

  if (!existsSync(resolve(repoRoot, BUNDLE_README))) {
    problems.push({ kind: "missing-readme", file: BUNDLE_README });
  }

  return problems;
}

/** Copy every source over its bundled counterpart. Returns the paths written. */
export function write(repoRoot: string): string[] {
  const written: string[] = [];
  for (const { source, bundled } of BUNDLED_DOCS) {
    const sourceAbs = resolve(repoRoot, source);
    if (!existsSync(sourceAbs)) continue;
    const bundledAbs = resolve(repoRoot, bundled);
    const content = readFileSync(sourceAbs, "utf8");
    if (existsSync(bundledAbs) && readFileSync(bundledAbs, "utf8") === content) continue;
    mkdirSync(dirname(bundledAbs), { recursive: true });
    writeFileSync(bundledAbs, content);
    written.push(bundled);
  }
  return written;
}

function main(): void {
  const repoRoot = process.cwd();

  if (process.argv.includes("--write")) {
    const written = write(repoRoot);
    if (written.length === 0) {
      console.log("skill-reference-bundle-sync: already in sync (nothing written)");
      return;
    }
    for (const file of written) console.log(`updated ${file}`);
    return;
  }

  const problems = check(repoRoot);
  if (problems.length === 0) {
    console.log(
      `skill-reference-bundle-sync: ok (${BUNDLED_DOCS.length} bundled docs match their sources)`,
    );
    return;
  }

  console.error(`skill-reference-bundle-sync: ${problems.length} problem(s):`);
  for (const p of problems) {
    if (p.kind === "missing-source") {
      console.error(
        `✗ ${p.file}: source is gone — a doc was renamed or moved. Update BUNDLED_DOCS ` +
          `in scripts/lint/skill-reference-bundle-sync.ts to its new path.`,
      );
    } else if (p.kind === "missing-readme") {
      console.error(
        `✗ ${p.file}: the bundle's "generated copy, do not edit here" notice is missing.`,
      );
    } else if (p.kind === "missing-copy") {
      console.error(`✗ ${p.file}: bundled copy is missing (source: ${p.source})`);
    } else {
      console.error(`✗ ${p.file}: differs from ${p.source}`);
    }
  }
  console.error(
    "\nThe reverse-architecture skill ships its own copy of these docs so it works " +
      "in a repository that is not karasu. Edit the source under docs/, never the copy, " +
      "then run:\n\n  pnpm run lint:skill-reference-bundle-sync --write\n\n" +
      "and commit the source and the copy together.",
  );
  process.exit(1);
}

const invokedDirectly =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  /skill-reference-bundle-sync\.ts$/.test(process.argv[1]);

if (invokedDirectly) {
  main();
}
