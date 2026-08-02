/**
 * The prompts, kept in one place because their **wording is the product**.
 *
 * ADR-2077 is unusual among the ADRs here: it fixes specific prose, not an
 * interface. Spike #1991 measured the bounded-context granularity directive
 * moving a repository from `domain-F1 0.40` to an exact match with the human
 * decomposition, and measured that summarising it (dropping the three split
 * conditions) regresses toward the unguided result. So the directive below is
 * reproduced verbatim from `.claude/skills/reverse-architecture/SKILL.md`, and
 * `prompts.test.ts` pins the load-bearing phrases against paraphrase.
 *
 * The same ADR forbids one thing outright: **ownership and change-history
 * signals must not decide logical domain seams.** On the large repository in
 * the spike that made the result measurably worse (V-measure 0.83 → 0.70) by
 * pulling seams toward per-owner vertical slices, which is Conway's team
 * structure rather than the product's language. There is no CODEOWNERS input
 * anywhere in this pipeline, and that absence is deliberate.
 */

/** Verbatim from ADR-2077 decision 1. Do not summarise (ADR-2077 rejected options). */
export const BOUNDED_CONTEXT_DIRECTIVE = `Decompose at **bounded-context granularity**, not per-aggregate. A bounded context
groups the aggregates that share a consistency boundary / ubiquitous language (e.g. all
of "Lending" — patron, book, hold, checkout, daily-sheet — is ONE domain, not five).
Model individual aggregates as **usecases + entities WITHIN** a domain, not as separate
domains. Only split when there is a genuine context seam (disjoint schema + weak coupling
+ separate ubiquitous language).`;

const HONESTY_DIRECTIVE = `Mark what you are unsure of. Put \`@draft\` on any element you inferred rather than
read, and \`@draft(confidence: "low")\` where you had to guess at a seam. A reviewer
deletes the mark; leaving it off where it belongs is worse than leaving it on where it
does not. Nothing is penalised for carrying it.`;

const REDACTION_NOTE = `Some values have been replaced with \`[REDACTED:<kind>]\` before you saw them. Those
are credentials. Treat them as evidence that a dependency needs authentication of that
kind, and never try to reconstruct them.`;

interface SurveyInput {
  owner: string;
  repo: string;
  /** Paths only. The survey pass reasons about shape, not contents. */
  paths: readonly string[];
}

/**
 * Pass 1 asks for a reading plan from paths alone.
 *
 * Paths are cheap and a repository's tree already carries most of the seam
 * evidence. Sending contents here would multiply the token cost of the pass
 * whose only job is deciding what is worth reading.
 */
export function surveyPrompt({ owner, repo, paths }: SurveyInput): string {
  return [
    `You are reverse-engineering the architecture of the repository ${owner}/${repo}.`,
    "",
    "Here is its file tree. From the paths alone, identify the candidate bounded contexts and",
    "the files most worth reading to confirm them. Directory and module structure is a seam",
    "*hint*, not the answer.",
    "",
    BOUNDED_CONTEXT_DIRECTIVE,
    "",
    "Do not use ownership, CODEOWNERS or change history to decide seams. They describe who",
    "works on the code, not what the code means.",
    "",
    'Reply as JSON: {"contexts": [{"name": string, "why": string, "readPaths": string[]}]}',
    "",
    "File tree:",
    ...paths.map((path) => `- ${path}`),
  ].join("\n");
}

interface DecomposeInput {
  owner: string;
  repo: string;
  contexts: readonly { name: string; why: string }[];
  files: readonly { path: string; content: string }[];
}

/** Pass 2 confirms or revises the decomposition against the code it asked for. */
export function decomposePrompt({ owner, repo, contexts, files }: DecomposeInput): string {
  return [
    `You are reverse-engineering ${owner}/${repo}. A first pass proposed these bounded contexts:`,
    ...contexts.map((context) => `- ${context.name}: ${context.why}`),
    "",
    "Confirm, merge or split them against the code below. Merging is the more likely",
    "correction: an unguided reading over-splits at aggregate granularity.",
    "",
    BOUNDED_CONTEXT_DIRECTIVE,
    "",
    REDACTION_NOTE,
    "",
    'Reply as JSON: {"domains": [{"name": string, "summary": string, "services": string[],',
    '"confidence": "low" | "medium" | "high"}]}',
    "",
    ...files.flatMap((file) => [`--- ${file.path}`, file.content, ""]),
  ].join("\n");
}

interface SynthesiseInput {
  owner: string;
  repo: string;
  domains: readonly { name: string; summary: string; confidence?: string }[];
  files: readonly { path: string; content: string }[];
}

/** Pass 3 writes the `.krs`. */
export function synthesisePrompt({ owner, repo, domains, files }: SynthesiseInput): string {
  return [
    `Write a karasu \`.krs\` model of ${owner}/${repo} using the decomposition below.`,
    "",
    ...domains.map(
      (domain) =>
        `- ${domain.name}${domain.confidence ? ` (confidence: ${domain.confidence})` : ""}: ${domain.summary}`,
    ),
    "",
    "Aggregates belong inside a domain as `usecase` and `entity`, never as domains of their own.",
    "",
    HONESTY_DIRECTIVE,
    "",
    REDACTION_NOTE,
    "",
    "Reply with the `.krs` source only, in a single ```krs fenced block, and nothing else.",
    "",
    ...files.flatMap((file) => [`--- ${file.path}`, file.content, ""]),
  ].join("\n");
}
