/* eslint-disable no-console -- CLI entry point; stdout/stderr reporting is the whole job */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Guards the section structure of each en/ja spec document pair (Issue #1501).
// Heading *text* is language-specific, so the comparison is structural: the
// sequence of heading levels (`#`..`######`, fenced code blocks excluded) must
// be identical between the two files of a pair. A drifted pair reports the
// first point of divergence with the surrounding heading text on both sides.
//
// `docs/spec/i18n.md` intentionally has no Japanese twin: it is a
// contributor-facing policy document, not part of the user-facing spec, so it
// is not listed here.

export const SPEC_PAIRS = [
  { en: "docs/spec/syntax.md", ja: "docs/spec/syntax.ja.md" },
  { en: "docs/spec/style.md", ja: "docs/spec/style.ja.md" },
  { en: "docs/spec/tags-annotations.md", ja: "docs/spec/tags-annotations.ja.md" },
  { en: "docs/concepts.md", ja: "docs/concepts.ja.md" },
] as const;

export interface Heading {
  level: number;
  text: string;
  line: number;
}

export function extractHeadings(content: string): Heading[] {
  const headings: Heading[] = [];
  let inFence = false;
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = /^(#{1,6})\s+(.*)$/.exec(line);
    if (match) {
      headings.push({ level: match[1].length, text: match[2].trim(), line: i + 1 });
    }
  }
  return headings;
}

export interface PairProblem {
  en: string;
  ja: string;
  message: string;
}

function describe(file: string, heading: Heading | undefined): string {
  if (!heading) return `${file}: (no heading — end of file)`;
  return `${file}:${heading.line} ${"#".repeat(heading.level)} ${heading.text}`;
}

export function comparePair(
  pair: { en: string; ja: string },
  enContent: string,
  jaContent: string,
): PairProblem | null {
  const enHeadings = extractHeadings(enContent);
  const jaHeadings = extractHeadings(jaContent);
  const max = Math.max(enHeadings.length, jaHeadings.length);
  for (let i = 0; i < max; i++) {
    const en = enHeadings[i];
    const ja = jaHeadings[i];
    if (en && ja && en.level === ja.level) continue;
    const lines = [
      `heading structure diverges at heading #${i + 1} (en has ${enHeadings.length}, ja has ${jaHeadings.length}):`,
      `  en: ${describe(pair.en, en)}`,
      `  ja: ${describe(pair.ja, ja)}`,
    ];
    const prevEn = enHeadings[i - 1];
    if (prevEn) {
      lines.push(`  last matching heading: ${"#".repeat(prevEn.level)} ${prevEn.text}`);
    }
    return { en: pair.en, ja: pair.ja, message: lines.join("\n") };
  }
  return null;
}

export function check(repoRoot: string): PairProblem[] {
  const problems: PairProblem[] = [];
  for (const pair of SPEC_PAIRS) {
    const enContent = readFileSync(resolve(repoRoot, pair.en), "utf8");
    const jaContent = readFileSync(resolve(repoRoot, pair.ja), "utf8");
    const problem = comparePair(pair, enContent, jaContent);
    if (problem) problems.push(problem);
  }
  return problems;
}

function main(): void {
  const problems = check(process.cwd());
  if (problems.length > 0) {
    console.error(`spec-structure-sync: ${problems.length} drifted pair(s):`);
    for (const p of problems) {
      console.error(`✗ ${p.en} <-> ${p.ja}`);
      console.error(p.message.replace(/^/gm, "  "));
    }
    process.exit(1);
  }
  console.log(`spec-structure-sync: ok (${SPEC_PAIRS.length} pairs)`);
}

const invokedDirectly =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  /spec-structure-sync\.ts$/.test(process.argv[1]);

if (invokedDirectly) {
  main();
}
