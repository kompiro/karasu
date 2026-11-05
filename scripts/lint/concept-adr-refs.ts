/* eslint-disable no-console -- CLI entry point; stdout/stderr reporting is the whole job */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// Validates the bidirectional reference layer between docs/concepts*.md and
// the ADR topic vocabulary (see Issue #1389):
//   - concepts.md / concepts.ja.md sections carry `<a id>` anchors and a
//     `> Related ADR topics:` annotation.
//   - docs/adr/README.md topic headings carry a `> Derives from (`topic`):`
//     back-ref pointing at a concept anchor (or `N/A`).
// The two directions must agree.
// Each README topic section also links its slice of the generated index
// (`effective.md#<topic>`, `graph/<topic>.md`), and those targets must exist
// (Issue #3595).

export interface Problem {
  kind: "error" | "warning";
  message: string;
}

interface ConceptSection {
  heading: string;
  anchor: string | null;
  /** topics listed in `> Related ADR topics:`; null if the annotation is missing */
  relatedTopics: string[] | null;
}

interface DerivesFrom {
  topic: string;
  anchor: string | null;
  raw: string;
}

const CONCEPT_FILES = ["docs/concepts.md", "docs/concepts.ja.md"] as const;
const README_PATH = "docs/adr/README.md";
const CONFIG_PATH = "adr.config.json";
const EFFECTIVE_PATH = "docs/adr/effective.md";
const GRAPH_DIR = "docs/adr/graph";

function backtickedTokens(text: string): string[] {
  return [...text.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
}

export function parseConceptFile(content: string): ConceptSection[] {
  const lines = content.split("\n");
  const sections: ConceptSection[] = [];
  let current: ConceptSection | null = null;
  for (const line of lines) {
    const headingMatch = /^##\s+(?!#)(.+)$/.exec(line);
    if (headingMatch) {
      current = { heading: headingMatch[1].trim(), anchor: null, relatedTopics: null };
      sections.push(current);
      continue;
    }
    if (!current) continue;
    const anchorMatch = /<a id="([^"]+)"><\/a>/.exec(line);
    if (anchorMatch && current.anchor === null) {
      current.anchor = anchorMatch[1];
      continue;
    }
    const relatedMatch = /^>\s*Related ADR topics:\s*(.*)$/.exec(line);
    if (relatedMatch) {
      current.relatedTopics = backtickedTokens(relatedMatch[1]);
    }
  }
  return sections;
}

export function parseAnchorIds(content: string): Set<string> {
  return new Set([...content.matchAll(/<a id="([^"]+)"><\/a>/g)].map((m) => m[1]));
}

export function parseDerivesFrom(content: string): DerivesFrom[] {
  const out: DerivesFrom[] = [];
  for (const line of content.split("\n")) {
    const match = /^>\s*Derives from\s*\(`([^`]+)`\):\s*(.+)$/.exec(line);
    if (!match) continue;
    const rest = match[2].trim();
    const anchorMatch = /\(\.\.\/concepts\.md#([A-Za-z0-9-]+)\)/.exec(rest);
    out.push({ topic: match[1], anchor: anchorMatch ? anchorMatch[1] : null, raw: rest });
  }
  return out;
}

/** Link targets per topic section, keyed by the section's `> Derives from` topic. */
export function parseTopicLinks(content: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  let current: Set<string> | null = null;
  for (const line of content.split("\n")) {
    if (/^#{1,3}\s/.test(line)) {
      current = null;
      continue;
    }
    const derives = /^>\s*Derives from\s*\(`([^`]+)`\):/.exec(line);
    if (derives) {
      current = out.get(derives[1]) ?? new Set();
      out.set(derives[1], current);
      continue;
    }
    if (!current) continue;
    for (const m of line.matchAll(/\]\(([^)\s]+)\)/g)) current.add(m[1]);
  }
  return out;
}

export function parseEffectiveTopics(content: string): Set<string> {
  return new Set([...content.matchAll(/^##\s+(\S+)\s*$/gm)].map((m) => m[1]));
}

export function check(repoRoot: string): Problem[] {
  const problems: Problem[] = [];

  const config = JSON.parse(readFileSync(resolve(repoRoot, CONFIG_PATH), "utf8")) as {
    topics?: string[];
  };
  const topics = new Set(config.topics ?? []);

  const conceptContents = CONCEPT_FILES.map((rel) => ({
    rel,
    content: readFileSync(resolve(repoRoot, rel), "utf8"),
  }));
  const conceptSections = conceptContents.map((f) => ({
    rel: f.rel,
    sections: parseConceptFile(f.content),
  }));
  const anchorSets = conceptContents.map((f) => ({
    rel: f.rel,
    anchors: parseAnchorIds(f.content),
  }));

  // Concept files must carry the same anchor set.
  const [primary, ...rest] = anchorSets;
  for (const other of rest) {
    for (const anchor of primary.anchors) {
      if (!other.anchors.has(anchor)) {
        problems.push({
          kind: "error",
          message: `Anchor #${anchor} exists in ${primary.rel} but is missing from ${other.rel}.`,
        });
      }
    }
    for (const anchor of other.anchors) {
      if (!primary.anchors.has(anchor)) {
        problems.push({
          kind: "error",
          message: `Anchor #${anchor} exists in ${other.rel} but is missing from ${primary.rel}.`,
        });
      }
    }
  }
  const allAnchors = primary.anchors;

  // Per-file: every section needs an anchor + annotation; topics must be valid.
  for (const { rel, sections } of conceptSections) {
    for (const section of sections) {
      if (section.anchor === null) {
        problems.push({
          kind: "error",
          message: `${rel}: section "${section.heading}" has no <a id> anchor.`,
        });
      }
      if (section.relatedTopics === null) {
        problems.push({
          kind: "warning",
          message: `${rel}: section "${section.heading}" has no "> Related ADR topics:" annotation.`,
        });
        continue;
      }
      for (const topic of section.relatedTopics) {
        if (!topics.has(topic)) {
          problems.push({
            kind: "error",
            message: `${rel}: section "${section.heading}" references unknown ADR topic \`${topic}\`.`,
          });
        }
      }
    }
  }

  // The primary concept file is the source of truth for the topic <-> anchor map.
  const primarySections = conceptSections[0].sections;
  const topicsByAnchor = new Map<string, string[]>();
  for (const section of primarySections) {
    if (section.anchor && section.relatedTopics) {
      topicsByAnchor.set(section.anchor, section.relatedTopics);
    }
  }

  // adr/README.md: parse `> Derives from` back-refs.
  const readme = readFileSync(resolve(repoRoot, README_PATH), "utf8");
  const derivesFrom = parseDerivesFrom(readme);
  const derivesByTopic = new Map<string, DerivesFrom>();
  for (const entry of derivesFrom) {
    if (derivesByTopic.has(entry.topic)) {
      problems.push({
        kind: "error",
        message: `${README_PATH}: duplicate "> Derives from" entry for topic \`${entry.topic}\`.`,
      });
    }
    derivesByTopic.set(entry.topic, entry);
    if (!topics.has(entry.topic)) {
      problems.push({
        kind: "error",
        message: `${README_PATH}: "> Derives from" entry uses unknown topic \`${entry.topic}\`.`,
      });
    }
    if (entry.anchor && !allAnchors.has(entry.anchor)) {
      problems.push({
        kind: "error",
        message: `${README_PATH}: topic \`${entry.topic}\` derives from #${entry.anchor}, which is not an anchor in the concept files.`,
      });
    }
  }

  // Every configured topic must have a back-ref.
  for (const topic of topics) {
    if (!derivesByTopic.has(topic)) {
      problems.push({
        kind: "error",
        message: `${README_PATH}: topic \`${topic}\` has no "> Derives from" back-ref.`,
      });
    }
  }

  // Direction 1: a topic's `Derives from` anchor must list that topic.
  for (const entry of derivesByTopic.values()) {
    if (!entry.anchor) continue;
    const listed = topicsByAnchor.get(entry.anchor) ?? [];
    if (!listed.includes(entry.topic)) {
      problems.push({
        kind: "error",
        message: `Topic \`${entry.topic}\` derives from #${entry.anchor}, but that concept section's "> Related ADR topics:" does not list \`${entry.topic}\`.`,
      });
    }
  }

  // Direction 2: a concept section's listed topic must derive from that section.
  for (const [anchor, listedTopics] of topicsByAnchor) {
    for (const topic of listedTopics) {
      const entry = derivesByTopic.get(topic);
      if (!entry) continue; // already reported as missing back-ref
      if (entry.anchor !== anchor) {
        problems.push({
          kind: "error",
          message: `Concept section #${anchor} lists topic \`${topic}\`, but ${README_PATH} says \`${topic}\` derives from ${
            entry.anchor ? `#${entry.anchor}` : "N/A"
          }.`,
        });
      }
    }
  }

  // Each topic section links its generated index slices, and they exist.
  const linksByTopic = parseTopicLinks(readme);
  const effectivePath = resolve(repoRoot, EFFECTIVE_PATH);
  const effectiveTopics = existsSync(effectivePath)
    ? parseEffectiveTopics(readFileSync(effectivePath, "utf8"))
    : new Set<string>();
  for (const topic of derivesByTopic.keys()) {
    if (!topics.has(topic)) continue; // already reported as unknown
    const links = linksByTopic.get(topic) ?? new Set<string>();
    for (const target of [`effective.md#${topic}`, `graph/${topic}.md`]) {
      if (!links.has(target)) {
        problems.push({
          kind: "error",
          message: `${README_PATH}: topic \`${topic}\` section does not link ${target}.`,
        });
      }
    }
    if (!effectiveTopics.has(topic)) {
      problems.push({
        kind: "error",
        message: `${EFFECTIVE_PATH} has no "## ${topic}" heading; regenerate the ADR index (pnpm adr:regenerate).`,
      });
    }
    if (!existsSync(resolve(repoRoot, GRAPH_DIR, `${topic}.md`))) {
      problems.push({
        kind: "error",
        message: `${GRAPH_DIR}/${topic}.md does not exist; regenerate the ADR index (pnpm adr:regenerate).`,
      });
    }
  }

  return problems;
}

export function formatProblems(problems: Problem[]): string {
  const errors = problems.filter((p) => p.kind === "error");
  const warnings = problems.filter((p) => p.kind === "warning");
  const lines: string[] = [];
  if (errors.length > 0) {
    lines.push(`concept-adr-refs: ${errors.length} error(s):`);
    for (const e of errors) lines.push(`  ✗ ${e.message}`);
  }
  if (warnings.length > 0) {
    lines.push(`concept-adr-refs: ${warnings.length} warning(s):`);
    for (const w of warnings) lines.push(`  ⚠ ${w.message}`);
  }
  return lines.join("\n");
}

function main(): void {
  const repoRoot = resolve(process.cwd());
  const problems = check(repoRoot);
  const errors = problems.filter((p) => p.kind === "error");
  if (problems.length > 0) {
    const stream = errors.length > 0 ? console.error : console.warn;
    stream(formatProblems(problems));
  }
  if (errors.length > 0) {
    process.exit(1);
  }
  console.log(`concept-adr-refs: ok (${problems.length} warning(s))`);
}

const invokedDirectly =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  /concept-adr-refs\.ts$/.test(process.argv[1]);

if (invokedDirectly) {
  main();
}
