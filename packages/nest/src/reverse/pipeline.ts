/**
 * The agentic reverse: survey → decompose → synthesise.
 *
 * Three passes rather than one because the passes disagree usefully. The
 * survey reads paths only and over-splits; the decomposition sees code and
 * mostly *merges*, which is the correction ADR-2077's spike measured as the
 * one that matters. Asking for a `.krs` in a single shot skips that
 * correction, and the spike's headline number is exactly what it costs.
 *
 * Every pass takes **already-redacted** input. This module does not redact —
 * it accepts a `RedactedRepo`, a type you can only get from `redactFiles`, so
 * "did anyone remember to redact" is not a question a reviewer has to ask
 * about the call site (ADR-1990 decision 2).
 *
 * What comes out is checked before it is returned: it must parse as `.krs`,
 * and it must survive the structure-only scan. A model that emits prose, or
 * that reproduces a credential, produces a failure rather than a cached
 * document.
 */
import { compile } from "@karasu-tools/core";
import { assertStructureOnly, type Finding } from "../redact/redact.js";
import type { LlmClient, LlmUsage } from "./llm.js";
import { decomposePrompt, surveyPrompt, synthesisePrompt } from "./prompts.js";

/** A file set that has been through `redactFiles`. */
export interface RedactedRepo {
  owner: string;
  repo: string;
  sha: string;
  files: readonly { path: string; content: string }[];
  findings: readonly Finding[];
}

/** Per-pass output ceilings. Synthesis writes a document; the others reply with JSON. */
const MAX_TOKENS = { survey: 8_000, decompose: 12_000, synthesise: 64_000 } as const;

export interface ReverseOptions {
  /**
   * How many files the decomposition and synthesis passes may read. The
   * survey chooses which; this only bounds how many it gets. A cap here is
   * the difference between a large repository costing more and costing
   * unboundedly more.
   */
  maxFilesRead?: number;
  /**
   * Total bytes of file content any one pass may carry. `maxFilesRead` bounds
   * the file *count*, which a single 10 MB file walks straight past — and the
   * prompt, the token bill and the Worker's memory all scale with bytes, not
   * files.
   */
  maxBytesRead?: number;
}

export interface ReverseResult {
  krs: string;
  domains: DomainSketch[];
  usage: LlmUsage;
  /** One entry per pass, so a cost report can attribute spend. */
  passes: { name: string; usage: LlmUsage }[];
}

export interface DomainSketch {
  name: string;
  summary: string;
  confidence?: string;
}

export class ReverseFailed extends Error {
  constructor(
    readonly pass: string,
    message: string,
  ) {
    super(`${pass}: ${message}`);
    this.name = "ReverseFailed";
  }
}

const DEFAULT_MAX_FILES_READ = 60;
const DEFAULT_MAX_BYTES_READ = 400_000;

/**
 * Pull JSON out of a reply.
 *
 * Models wrap JSON in prose or a fence more often than not, and failing the
 * whole reverse over a stray "Here you go:" would be a bad trade. The first
 * balanced `{…}` span is taken; anything else is a failure, not a guess.
 */
function extractJson(text: string, pass: string): unknown {
  const start = text.indexOf("{");
  if (start === -1) throw new ReverseFailed(pass, "the reply contained no JSON object");
  // Balanced scan rather than first-`{`-to-last-`}`: a model that adds a
  // closing remark containing a brace would otherwise extend the slice past
  // the real end and fail to parse perfectly good JSON. Quotes and escapes
  // are tracked so a brace inside a string does not shift the depth.
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index] as string;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\" && inString) {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, index + 1));
        } catch {
          throw new ReverseFailed(pass, "the reply's JSON did not parse");
        }
      }
    }
  }
  throw new ReverseFailed(pass, "the reply's JSON object was never closed");
}

/**
 * Pull the `.krs` out of a fenced reply, tolerating an unfenced one.
 *
 * The **largest** fenced block wins, not the first. A reply that opens with a
 * short illustrative snippet before the real document would otherwise be
 * truncated to the snippet — and the result still parses, so nothing
 * downstream would notice.
 */
function extractKrs(text: string): string {
  const blocks = [...text.matchAll(/```(?:krs)?\n([\s\S]*?)```/g)]
    .map((match) => (match[1] ?? "").trim())
    .filter((block) => block.length > 0);
  const largest = blocks.reduce<string>(
    (best, block) => (block.length > best.length ? block : best),
    "",
  );
  const body = largest.length > 0 ? largest : text.trim();
  return body.endsWith("\n") ? body : `${body}\n`;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function addUsage(total: LlmUsage, next: LlmUsage): LlmUsage {
  return {
    inputTokens: total.inputTokens + next.inputTokens,
    outputTokens: total.outputTokens + next.outputTokens,
  };
}

export async function reverseRepository(
  repo: RedactedRepo,
  llm: LlmClient,
  options: ReverseOptions = {},
): Promise<ReverseResult> {
  const maxFilesRead = options.maxFilesRead ?? DEFAULT_MAX_FILES_READ;
  const maxBytesRead = options.maxBytesRead ?? DEFAULT_MAX_BYTES_READ;
  const passes: { name: string; usage: LlmUsage }[] = [];
  let usage: LlmUsage = { inputTokens: 0, outputTokens: 0 };

  const run = async (name: keyof typeof MAX_TOKENS, prompt: string): Promise<string> => {
    const response = await llm.complete(prompt, { maxTokens: MAX_TOKENS[name] });
    passes.push({ name, usage: response.usage });
    usage = addUsage(usage, response.usage);
    // A truncated reply that still parses is the dangerous case: it would be
    // cached and served as a complete model of the repository.
    if (response.stopReason === "max_tokens") {
      throw new ReverseFailed(name, "the reply hit the output limit and is incomplete");
    }
    return response.text;
  };

  // Pass 1 — paths only. Contents here would multiply the cost of the pass
  // whose whole job is deciding what is worth reading.
  const surveyText = await run(
    "survey",
    surveyPrompt({ owner: repo.owner, repo: repo.repo, paths: repo.files.map((f) => f.path) }),
  );
  const survey = extractJson(surveyText, "survey") as { contexts?: unknown };
  const contexts = Array.isArray(survey.contexts)
    ? survey.contexts.flatMap((raw) => {
        if (typeof raw !== "object" || raw === null) return [];
        const entry = raw as Record<string, unknown>;
        const name = readString(entry.name);
        if (name === undefined) return [];
        return [
          {
            name,
            why: readString(entry.why) ?? "",
            readPaths: Array.isArray(entry.readPaths)
              ? entry.readPaths.filter((p): p is string => typeof p === "string")
              : [],
          },
        ];
      })
    : [];
  if (contexts.length === 0) throw new ReverseFailed("survey", "no candidate contexts");

  // Only files the survey actually asked for, and only ones that exist: a
  // hallucinated path must not become a silent empty read.
  const byPath = new Map(repo.files.map((file) => [file.path, file]));
  const wanted: { path: string; content: string }[] = [];
  const seen = new Set<string>();
  let bytes = 0;
  outer: for (const context of contexts) {
    for (const path of context.readPaths) {
      if (seen.has(path)) continue;
      const file = byPath.get(path);
      if (file === undefined) continue;
      seen.add(path);
      // Skipped rather than truncated: half a file is a misleading input, and
      // a file this large is rarely the one carrying the seam evidence.
      if (bytes + file.content.length > maxBytesRead) continue;
      bytes += file.content.length;
      wanted.push(file);
      if (wanted.length >= maxFilesRead) break outer;
    }
  }
  if (wanted.length === 0) throw new ReverseFailed("survey", "no readable files were selected");

  // Pass 2 — the correction pass. Merging is the likely move.
  const decomposeText = await run(
    "decompose",
    decomposePrompt({
      owner: repo.owner,
      repo: repo.repo,
      contexts: contexts.map(({ name, why }) => ({ name, why })),
      files: wanted,
    }),
  );
  const decomposed = extractJson(decomposeText, "decompose") as { domains?: unknown };
  const domains: DomainSketch[] = Array.isArray(decomposed.domains)
    ? decomposed.domains.flatMap((raw) => {
        if (typeof raw !== "object" || raw === null) return [];
        const entry = raw as Record<string, unknown>;
        const name = readString(entry.name);
        if (name === undefined) return [];
        const confidence = readString(entry.confidence);
        return [
          {
            name,
            summary: readString(entry.summary) ?? "",
            ...(confidence === undefined ? {} : { confidence }),
          },
        ];
      })
    : [];
  if (domains.length === 0) throw new ReverseFailed("decompose", "no domains");

  // Pass 3 — the document.
  const synthesised = await run(
    "synthesise",
    synthesisePrompt({ owner: repo.owner, repo: repo.repo, domains, files: wanted }),
  );
  const krs = extractKrs(synthesised);
  if (krs.trim().length === 0) throw new ReverseFailed("synthesise", "empty .krs");

  // Refuse output that carries a credential. This throws rather than
  // scrubbing, on purpose (see redact.ts).
  assertStructureOnly(krs);

  // And refuse output that is not a model. A document that does not parse is
  // prose the caller would otherwise cache and serve as a diagram.
  const compiled = compile(krs, { diagramType: "system" });
  const errors = compiled.diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) {
    throw new ReverseFailed(
      "synthesise",
      `the generated .krs did not parse (${errors.length} error(s), first: ${errors[0]?.code})`,
    );
  }
  // Parsing is not enough. A comment-only document, or one describing only a
  // deploy or org view, produces zero errors and zero systems — and would be
  // cached and served as a diagram of nothing.
  if (!("systems" in compiled) || compiled.systems.length === 0) {
    throw new ReverseFailed("synthesise", "the generated .krs describes no system");
  }

  return { krs, domains, usage, passes };
}
