/* eslint-disable no-console -- CLI entry point; stdout/stderr reporting is the whole job */
import { existsSync, readFileSync } from "node:fs";
import { dirname, posix, resolve } from "node:path";
import { extractLinkTargets } from "../../packages/docs-site/scripts/lib/rewrite.ts";
import { PUBLISHED_EN_FILES } from "../../packages/docs-site/scripts/lib/site-map.ts";

// Guards the section structure of each en/ja spec document pair (Issue #1501).
// Heading *text* is language-specific, so the comparison is structural: the
// sequence of heading levels (`#`..`######`, fenced code blocks excluded) must
// be identical between the two files of a pair. The comparison is grouped per
// top-level section (level 1-2 heading + its descendants) rather than over one
// flat sequence, so equal-and-opposite edits in different sections cannot
// cancel each other out. A drifted pair reports the first point of divergence
// with the surrounding heading text on both sides.
//
// The pairs are derived rather than listed: every page the docs site publishes
// (`PUBLISHED_EN_FILES`, whose `.ja.md` twin `site-map.test.ts` requires) plus
// the twinned docs the site does not publish. A page added to the site is
// checked from the PR that adds it, so a section added to one locale of
// `docs/tools/*` or the glossary fails here (TPL-1716, TPL-2005). Free prose
// inside a section is not compared.
//
// `docs/spec/i18n.md` intentionally has no Japanese twin: it is a
// contributor-facing policy document, not part of the user-facing spec, so it
// is neither published nor listed here.

/** Twinned docs (docs-relative) the site does not publish. */
const UNPUBLISHED_TWINNED = ["spec/permalink.md"] as const;

export const SPEC_PAIRS: readonly { en: string; ja: string }[] = [
  ...PUBLISHED_EN_FILES,
  ...UNPUBLISHED_TWINNED,
].map((rel) => ({ en: `docs/${rel}`, ja: `docs/${rel.replace(/\.md$/, ".ja.md")}` }));

/**
 * Glossaries whose terms are bullets (`- **term** — …`), not headings, so the
 * heading comparison alone cannot see a term added to one locale. Their
 * sections must also hold the same number of term bullets.
 */
export const TERM_BULLET_PAIRS = ["docs/glossary.md", "docs/spec/glossary.md"] as const;

/**
 * The keystone glossary and the modeling-language glossary point at each
 * other, in both locales (TPL-2005). Source file -> repo path it must link to.
 */
export const GLOSSARY_CROSS_LINKS = [
  { from: "docs/glossary.md", to: "docs/spec/glossary.md" },
  { from: "docs/glossary.ja.md", to: "docs/spec/glossary.ja.md" },
  { from: "docs/spec/glossary.md", to: "docs/glossary.md" },
  { from: "docs/spec/glossary.ja.md", to: "docs/glossary.ja.md" },
] as const;

export interface Heading {
  level: number;
  text: string;
  line: number;
}

// CommonMark: a fence is 3+ backticks or tildes, indented at most 3 spaces;
// the closing fence must use the same character, be at least as long, and
// carry no info string.
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})(.*)$/;

export function extractHeadings(content: string): Heading[] {
  const headings: Heading[] = [];
  let fence: { char: string; length: number } | null = null;
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fenceMatch = FENCE_RE.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      const info = fenceMatch[2].trim();
      if (fence === null) {
        // Backtick fences cannot open when the info string contains a
        // backtick (CommonMark), but spec docs never do that — treat any
        // fence-looking line as an opener for simplicity.
        fence = { char: marker[0], length: marker.length };
        continue;
      }
      if (marker[0] === fence.char && marker.length >= fence.length && info === "") {
        fence = null;
      }
      continue;
    }
    if (fence) continue;
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
  if (!heading) return `${file}: (no heading)`;
  return `${file}:${heading.line} ${"#".repeat(heading.level)} ${heading.text}`;
}

// A "section" is a level 1-2 heading plus all deeper headings under it.
// Headings before the first level 1-2 heading (unusual) form a leading section.
function splitSections(headings: Heading[]): Heading[][] {
  const sections: Heading[][] = [];
  let current: Heading[] = [];
  for (const heading of headings) {
    if (heading.level <= 2 && current.length > 0) {
      sections.push(current);
      current = [];
    }
    current.push(heading);
  }
  if (current.length > 0) sections.push(current);
  return sections;
}

export function comparePair(
  pair: { en: string; ja: string },
  enContent: string,
  jaContent: string,
): PairProblem | null {
  const enSections = splitSections(extractHeadings(enContent));
  const jaSections = splitSections(extractHeadings(jaContent));
  const maxSections = Math.max(enSections.length, jaSections.length);
  for (let s = 0; s < maxSections; s++) {
    const enSection = enSections[s] ?? [];
    const jaSection = jaSections[s] ?? [];
    const max = Math.max(enSection.length, jaSection.length);
    for (let i = 0; i < max; i++) {
      const en = enSection[i];
      const ja = jaSection[i];
      if (en && ja && en.level === ja.level) continue;
      const lines = [
        `heading structure diverges in section #${s + 1} at heading #${i + 1} ` +
          `(section has ${enSection.length} en / ${jaSection.length} ja headings):`,
        `  en: ${describe(pair.en, en ?? enSection[0])}`,
        `  ja: ${describe(pair.ja, ja ?? jaSection[0])}`,
      ];
      const sectionTitle = (enSection[0] ?? jaSection[0])?.text;
      if (sectionTitle !== undefined) {
        lines.push(`  section: ${sectionTitle}`);
      }
      return { en: pair.en, ja: pair.ja, message: lines.join("\n") };
    }
  }
  return null;
}

/** Top-level term bullets (`- **…`) per level 1-2 section, fenced code excluded. */
export function termBulletsPerSection(content: string): { title: string; count: number }[] {
  const sections: { title: string; count: number }[] = [{ title: "(preamble)", count: 0 }];
  let fence: string | null = null;
  for (const line of content.split("\n")) {
    const fenceMatch = FENCE_RE.exec(line);
    if (fenceMatch) {
      if (fence === null) fence = fenceMatch[1][0];
      else if (fenceMatch[1][0] === fence && fenceMatch[2].trim() === "") fence = null;
      continue;
    }
    if (fence) continue;
    const heading = /^#{1,2}\s+(.*)$/.exec(line);
    if (heading) sections.push({ title: heading[1].trim(), count: 0 });
    else if (/^[-*] \*\*/.test(line)) sections[sections.length - 1].count++;
  }
  return sections;
}

export function compareTermBullets(
  pair: { en: string; ja: string },
  enContent: string,
  jaContent: string,
): PairProblem | null {
  const en = termBulletsPerSection(enContent);
  const ja = termBulletsPerSection(jaContent);
  for (let i = 0; i < Math.max(en.length, ja.length); i++) {
    if (en[i]?.count === ja[i]?.count) continue;
    return {
      ...pair,
      message:
        `term bullets differ in section #${i} ` +
        `(en "${en[i]?.title}" has ${en[i]?.count ?? 0}, ja "${ja[i]?.title}" has ${ja[i]?.count ?? 0})`,
    };
  }
  return null;
}

/** Repo paths (no fragment) of every link in `content`, resolved from `file`. */
function linkedPaths(file: string, content: string): Set<string> {
  const out = new Set<string>();
  for (const target of extractLinkTargets(content)) {
    const path = target.split(/[#?]/)[0];
    if (path === "" || /^[a-z][a-z0-9+.-]*:/i.test(path)) continue;
    out.add(posix.normalize(posix.join(dirname(file), path)));
  }
  return out;
}

export function check(repoRoot: string): PairProblem[] {
  const problems: PairProblem[] = [];
  for (const pair of SPEC_PAIRS) {
    const missing = [pair.en, pair.ja].filter((rel) => !existsSync(resolve(repoRoot, rel)));
    if (missing.length > 0) {
      problems.push({
        en: pair.en,
        ja: pair.ja,
        message: `pair file missing: ${missing.join(", ")}`,
      });
      continue;
    }
    const enContent = readFileSync(resolve(repoRoot, pair.en), "utf8");
    const jaContent = readFileSync(resolve(repoRoot, pair.ja), "utf8");
    const problem = comparePair(pair, enContent, jaContent);
    if (problem) problems.push(problem);
    if ((TERM_BULLET_PAIRS as readonly string[]).includes(pair.en)) {
      const terms = compareTermBullets(pair, enContent, jaContent);
      if (terms) problems.push(terms);
    }
  }
  for (const { from, to } of GLOSSARY_CROSS_LINKS) {
    const abs = resolve(repoRoot, from);
    if (!existsSync(abs)) continue; // reported above as a missing pair file
    if (!linkedPaths(from, readFileSync(abs, "utf8")).has(to)) {
      problems.push({ en: from, ja: to, message: `${from} no longer links to ${to}` });
    }
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
