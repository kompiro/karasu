/* eslint-disable no-console -- CLI entry point; stdout/stderr reporting is the whole job */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, posix, resolve } from "node:path";

// Keeps the reference docs bundled inside each published skill identical to
// their sources in `docs/`, links aside (Issue #2574; generalized to every
// skill that bundles them in #2912; links rewritten in #3103).
//
// The skill runs against an ARBITRARY repository. `docs/spec/syntax.md` is not
// there, so every reference the skill made to a `docs/…` path resolved only by
// luck — when the agent happened to be running inside a karasu checkout. The
// bundle makes the skill self-contained; this guard is the price of the copy.
//
// The precedent was the byte-equality guard in `examples.test.ts` (examples/ ↔
// examples.ts, since replaced by codegen in #3345): a copy that nothing
// verifies is a copy that silently goes stale, and a stale grammar is worse
// than an absent one — the agent writes confidently against a syntax that
// no longer parses. Same reasoning as `skill-cli-refs`, one register down: that
// guard checks the skill's claims ABOUT the CLI, this one checks the skill's
// copy OF the spec.
//
// Identical to the source after one transform, `bundledContent`: a relative
// link resolves against `docs/`, which the installed skill does not have, so
// the copy points it at the bundled sibling when there is one and at the file
// on GitHub otherwise (#3103). The guard compares the copy to the transformed
// source, so it stays a plain string comparison. Nothing else is changed:
// annotating the copies (a "generated, do not edit" header) would make them
// self-explaining but make the comparison less obvious; the notice lives in
// the bundle's README instead, which this guard also requires.

/**
 * The skills that bundle the reference, by directory under
 * `packages/skills/skills/`. Each carries its own copy: `karasu skill install`
 * and the plugin install place one skill directory, so a skill cannot reach
 * another skill's `reference/`.
 */
export const BUNDLED_SKILLS = ["reverse-architecture", "karasu-author"] as const;

export const bundleDir = (skill: string): string => `packages/skills/skills/${skill}/reference`;

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
const REFERENCE_DOCS: ReadonlyArray<{ source: string; name: string }> = [
  { source: "docs/spec/syntax.md", name: "syntax.md" },
  { source: "docs/spec/tags-annotations.md", name: "tags-annotations.md" },
  { source: "docs/spec/diagnostics.md", name: "diagnostics.md" },
  { source: "docs/guide/notation-cookbook.md", name: "notation-cookbook.md" },
];

export const BUNDLED_DOCS: ReadonlyArray<{ source: string; bundled: string }> =
  BUNDLED_SKILLS.flatMap((skill) =>
    REFERENCE_DOCS.map(({ source, name }) => ({ source, bundled: `${bundleDir(skill)}/${name}` })),
  );

/** Where a link to a file that is not bundled points instead. */
export const REPOSITORY_BLOB_URL = "https://github.com/kompiro/karasu/blob/main/";

/** A markdown link or image target: `](target)` or `](target "title")`. */
const LINK_TARGET = /(\]\()([^)\s]+)((?:\s+"[^"]*")?\))/g;

/**
 * A line-by-line scanner for fenced code blocks: returns whether each line it
 * is given opens, sits inside, or closes one. A fence closes only on a line of
 * the opener's character, at least as long, with nothing but whitespace after
 * it (CommonMark), so a `~~~` block may hold a line starting with three
 * backticks and a four-backtick block may hold a three-backtick one.
 */
export function fenceScanner(): (line: string) => boolean {
  let open: { char: string; length: number } | null = null;
  return (line) => {
    if (open === null) {
      const opener = /^ {0,3}(`{3,}|~{3,})/.exec(line);
      // A backtick fence's info string may not contain a backtick.
      if (opener && !(opener[1][0] === "`" && line.slice(opener[0].length).includes("`"))) {
        open = { char: opener[1][0], length: opener[1].length };
        return true;
      }
      return false;
    }
    const closer = /^ {0,3}(`+|~+)\s*$/.exec(line);
    if (closer && closer[1][0] === open.char && closer[1].length >= open.length) open = null;
    return true;
  };
}

/**
 * `source`'s contents as the bundled copy carries them (#3103).
 *
 * A relative link target (no scheme, not `#…`, not `/…`) is resolved against
 * the source's directory. When it names a bundled source, it points at that
 * sibling copy (unchanged when it already reads that way, as `./syntax.md`
 * does from `docs/spec/`); otherwise it points at the file on GitHub. Fenced
 * code blocks are left alone: a `](…)` there is example text, not a link.
 */
export function bundledContent(source: string, content: string): string {
  const sourceDir = posix.dirname(source);
  const bundledNames = new Map(REFERENCE_DOCS.map((d) => [d.source, d.name]));
  const inFence = fenceScanner();
  return content
    .split("\n")
    .map((line) => {
      if (inFence(line)) return line;
      return line.replace(LINK_TARGET, (whole, open: string, target: string, close: string) => {
        if (
          /^[a-z][a-z0-9+.-]*:/i.test(target) ||
          target.startsWith("#") ||
          target.startsWith("/")
        ) {
          return whole;
        }
        const hash = target.indexOf("#");
        const path = hash === -1 ? target : target.slice(0, hash);
        const anchor = hash === -1 ? "" : target.slice(hash);
        const repoPath = posix.normalize(posix.join(sourceDir, path));
        // Outside the repository: there is nothing to point at.
        if (repoPath.startsWith("..")) return whole;
        const sibling = bundledNames.get(repoPath);
        if (sibling !== undefined) {
          if (posix.normalize(path) === sibling) return whole;
          return `${open}${sibling}${anchor}${close}`;
        }
        return `${open}${REPOSITORY_BLOB_URL}${repoPath}${anchor}${close}`;
      });
    })
    .join("\n");
}

/** Each bundle's own notice; a copy with no "do not edit here" invites the wrong edit. */
export const BUNDLE_READMES: readonly string[] = BUNDLED_SKILLS.map(
  (skill) => `${bundleDir(skill)}/README.md`,
);

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
      // Every bundle copies the same sources; name a missing one once.
      if (!problems.some((p) => p.kind === "missing-source" && p.file === source)) {
        problems.push({ kind: "missing-source", file: source });
      }
      continue;
    }
    if (!existsSync(bundledAbs)) {
      problems.push({ kind: "missing-copy", file: bundled, source });
      continue;
    }
    const expected = bundledContent(source, readFileSync(sourceAbs, "utf8"));
    if (readFileSync(bundledAbs, "utf8") !== expected) {
      problems.push({ kind: "stale-copy", file: bundled, source });
    }
  }

  for (const readme of BUNDLE_READMES) {
    if (!existsSync(resolve(repoRoot, readme))) {
      problems.push({ kind: "missing-readme", file: readme });
    }
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
    const content = bundledContent(source, readFileSync(sourceAbs, "utf8"));
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
    "\nEach published skill ships its own copy of these docs so it works " +
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
