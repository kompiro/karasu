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

export interface ReverseOptions {
  /**
   * How many files the decomposition and synthesis passes may read. The
   * survey chooses which; this only bounds how many it gets. A cap here is
   * the difference between a large repository costing more and costing
   * unboundedly more.
   */
  maxFilesRead?: number;
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

/**
 * Pull JSON out of a reply.
 *
 * Models wrap JSON in prose or a fence more often than not, and failing the
 * whole reverse over a stray "Here you go:" would be a bad trade. The first
 * balanced `{…}` span is taken; anything else is a failure, not a guess.
 */
function extractJson(text: string, pass: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new ReverseFailed(pass, "the reply contained no JSON object");
  }
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new ReverseFailed(pass, "the reply's JSON did not parse");
  }
}

/** Pull the `.krs` out of a fenced reply, tolerating an unfenced one. */
function extractKrs(text: string): string {
  const fenced = /```(?:krs)?\n([\s\S]*?)```/.exec(text);
  const body = (fenced?.[1] ?? text).trim();
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
  const passes: { name: string; usage: LlmUsage }[] = [];
  let usage: LlmUsage = { inputTokens: 0, outputTokens: 0 };

  const run = async (name: string, prompt: string): Promise<string> => {
    const response = await llm.complete(prompt);
    passes.push({ name, usage: response.usage });
    usage = addUsage(usage, response.usage);
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
  for (const context of contexts) {
    for (const path of context.readPaths) {
      if (seen.has(path)) continue;
      const file = byPath.get(path);
      if (file === undefined) continue;
      seen.add(path);
      wanted.push(file);
      if (wanted.length >= maxFilesRead) break;
    }
    if (wanted.length >= maxFilesRead) break;
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

  return { krs, domains, usage, passes };
}
