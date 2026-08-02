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
import { logError, logInfo } from "../log.js";
import { pruneUnparseableLines } from "./prune.js";
import { assertStructureOnly, type Finding } from "../redact/redact.js";
import type { LlmClient, LlmUsage } from "./llm.js";
import { decomposePrompt, repairPrompt, surveyPrompt, synthesisePrompt } from "./prompts.js";

/** A file set that has been through `redactFiles`. */
export interface RedactedRepo {
  owner: string;
  repo: string;
  sha: string;
  files: readonly { path: string; content: string }[];
  findings: readonly Finding[];
}

/** Per-pass output ceilings. Synthesis writes a document; the others reply with JSON. */
const MAX_TOKENS = {
  survey: 8_000,
  decompose: 12_000,
  synthesise: 64_000,
  // A repair rewrites the same document, so it needs the same room.
  repair: 64_000,
} as const;

/**
 * How many parse errors are shown to the model when asking for a repair.
 *
 * A document with hundreds of errors has one or two structural mistakes
 * repeated, and sending all of them buries the signal in noise it has to pay
 * to read.
 */
const REPAIRED_DIAGNOSTICS_SHOWN = 8;

/** How many times a document may be handed back for repair. */
const MAX_REPAIR_ATTEMPTS = 1;

/** How many diagnostics reach the log when a document will not parse. */
const LOGGED_DIAGNOSTICS = 12;

/** Longest token value written to a log line. */
const LOGGED_VALUE_LENGTH = 40;

/** Shorten any string inside a diagnostic's params before it is logged. */
function truncateParams(params: unknown): unknown {
  if (typeof params !== "object" || params === null) return params;
  return Object.fromEntries(
    Object.entries(params as Record<string, unknown>).map(([key, value]) => [
      key,
      typeof value === "string" && value.length > LOGGED_VALUE_LENGTH
        ? `${value.slice(0, LOGGED_VALUE_LENGTH)}…`
        : value,
    ]),
  );
}

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
  /**
   * The model the provider says served these passes.
   *
   * `undefined` only when no pass reported one, which a fake client is free to
   * do; a cost report treats that as unpriceable rather than assuming a tier.
   */
  model?: string;
}

export interface DomainSketch {
  name: string;
  summary: string;
  confidence?: string;
}

/**
 * What a parse failure can say about itself without quoting the document.
 *
 * The code and the block kind identify the construct the model invented; the
 * position lets a reader find it if they still have the document. The token's
 * *value* is deliberately absent -- it is the one field that would carry the
 * generated text itself, and this travels into a stored record.
 */
export interface StructuralDiagnostic {
  code: string;
  /**
   * The class of token the parser rejected -- `Identifier`, `Colon`, `Comma`.
   *
   * A class, never the text. This is what identifies the invented syntax: a
   * line answering `Identifier Colon Identifier Comma` is a schema field
   * list, which is the one shape an `entity` forbids. `blockKind` was tried
   * first and is empty in every diagnostic this parser emits.
   */
  tokenType?: string;
  /** `line:column`, when the parser gave a range. */
  at?: string;
}

export class ReverseFailed extends Error {
  constructor(
    readonly pass: string,
    message: string,
    /**
     * Present for a parse failure. Carried on the error so the caller can put
     * it in the run's record: a count and a code do not name the problem, and
     * the log that does name it only exists while something is watching.
     */
    readonly diagnostics?: StructuralDiagnostic[],
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
  let model: string | undefined;

  const run = async (name: keyof typeof MAX_TOKENS, prompt: string): Promise<string> => {
    const response = await llm.complete(prompt, { maxTokens: MAX_TOKENS[name] });
    passes.push({ name, usage: response.usage });
    model ??= response.model;
    usage = addUsage(usage, response.usage);
    // A run is 12-19 minutes with nothing to show for it until the end. The
    // pass name and its token counts are ours, not the repository's, so they
    // can be logged without touching the boundary decision 6 draws.
    logInfo(
      `karasu-nest ${name}: ${response.usage.inputTokens}/${response.usage.outputTokens} tokens`,
    );
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
  let krs = extractKrs(synthesised);
  if (krs.trim().length === 0) throw new ReverseFailed("synthesise", "empty .krs");

  // Refuse output that carries a credential. This throws rather than
  // scrubbing, on purpose (see redact.ts).
  assertStructureOnly(krs);

  // And refuse output that is not a model. A document that does not parse is
  // prose the caller would otherwise cache and serve as a diagram.
  //
  // Refusing is the last resort, not the first answer. The reverse skill this
  // pipeline descends from splits judgement from validation and runs a
  // **validate-and-repair loop** with the parser as the validator
  // (`.claude/skills/reverse-architecture/SKILL.md`, Phase 4); the spike that
  // cleared this pivot's gate never produced a parse-clean document in one
  // shot either. Without the loop, one missed brace throws away three paid
  // passes -- which is exactly what a real run did, over 824 errors that were
  // the same mistake repeated.
  // Deterministic repair first, because it is free, instant and identical
  // every time. Most of what fails here is a construct the notation has no
  // home for -- attributes inside an `entity` -- and a line rejected for that
  // reason carries nothing the model could have expressed. Asking a model to
  // fix it is another sample from the distribution that produced it: real
  // runs wandered 824 -> 31 -> 47 -> 22 -> 40 rather than converging.
  const pruned = pruneUnparseableLines(krs);
  if (pruned.removed > 0) {
    krs = pruned.krs;
    logInfo(`karasu-nest pruned ${pruned.removed} unrepresentable line(s) from the .krs`);
  }

  let compiled = compile(krs, { diagramType: "system" });
  for (let attempt = 0; attempt < MAX_REPAIR_ATTEMPTS; attempt += 1) {
    const errors = compiled.diagnostics.filter((d) => d.severity === "error");
    if (errors.length === 0) break;
    krs = extractKrs(
      await run(
        "repair",
        repairPrompt(
          krs,
          errors.slice(0, REPAIRED_DIAGNOSTICS_SHOWN).map((diagnostic) => ({
            where:
              diagnostic.loc === undefined
                ? "somewhere"
                : `line ${diagnostic.loc.start.line}, column ${diagnostic.loc.start.column}`,
            code: diagnostic.code,
            params: diagnostic.params,
          })),
        ),
      ),
    );
    // A repair is model output like any other, so it goes through the same
    // one-way door before anything else looks at it.
    assertStructureOnly(krs);
    // And prune what the model handed back, for the same reason: a repair
    // that reintroduces one unrepresentable line should not cost the run.
    const prunedRepair = pruneUnparseableLines(krs);
    if (prunedRepair.removed > 0) {
      krs = prunedRepair.krs;
      logInfo(`karasu-nest pruned ${prunedRepair.removed} line(s) from the repaired .krs`);
    }
    compiled = compile(krs, { diagramType: "system" });
  }

  const errors = compiled.diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) {
    // Logged server-side, not returned. The caller gets a count and a code
    // (ADR-1990 decision 6: a message it can see is ours, never something the
    // model or the repository produced), while an operator needs the actual
    // construct to know whether the prompt or the parser is at fault --
    // `unexpected-token-in-block` without its `blockKind` names no problem.
    //
    // Token values are truncated. They are model output rather than source,
    // and the document has already passed `assertStructureOnly`, but a
    // generated identifier can still echo a repository's vocabulary and a log
    // line is not the place to spell all of it out.
    logError(
      "karasu-nest could not parse the generated .krs",
      errors.slice(0, LOGGED_DIAGNOSTICS).map((diagnostic) => ({
        code: diagnostic.code,
        at:
          diagnostic.loc === undefined
            ? undefined
            : `${diagnostic.loc.start.line}:${diagnostic.loc.start.column}`,
        params: truncateParams(diagnostic.params),
      })),
    );
    throw new ReverseFailed(
      "synthesise",
      `the generated .krs did not parse (${errors.length} error(s), first: ${errors[0]?.code})`,
      errors.slice(0, LOGGED_DIAGNOSTICS).map((diagnostic) => ({
        code: diagnostic.code,
        ...(typeof (diagnostic.params as { tokenType?: unknown }).tokenType === "string" &&
        (diagnostic.params as { tokenType: string }).tokenType.length > 0
          ? { tokenType: (diagnostic.params as { tokenType: string }).tokenType }
          : {}),
        ...(diagnostic.loc === undefined
          ? {}
          : { at: `${diagnostic.loc.start.line}:${diagnostic.loc.start.column}` }),
      })),
    );
  }
  // Parsing is not enough. A comment-only document, or one describing only a
  // deploy or org view, produces zero errors and zero systems — and would be
  // cached and served as a diagram of nothing.
  if (!("systems" in compiled) || compiled.systems.length === 0) {
    throw new ReverseFailed("synthesise", "the generated .krs describes no system");
  }

  return { krs, domains, usage, passes, ...(model === undefined ? {} : { model }) };
}
