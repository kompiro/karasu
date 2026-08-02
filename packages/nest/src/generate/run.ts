/**
 * The zero-setup promise, end to end: fetch → redact → reverse → scan → cache.
 *
 * The ordering is the contract. Nothing reaches the model that has not been
 * through `redactFiles`, and nothing reaches the cache that has not been
 * through `assertStructureOnly` (which `reverseRepository` runs). Raw file
 * contents live only inside this function's stack frame — they are never
 * stored, never logged, and never returned (ADR-1990 decisions 1, 2, 6).
 *
 * Which files are fetched is decided here rather than by the model, because
 * the model cannot be asked about a file until someone has paid to read it.
 * The filter is deliberately conservative: it drops what is expensive and
 * uninformative (lockfiles, minified bundles, binaries, vendored trees) and
 * keeps everything else, because a rule that guesses at "important" would
 * decide the architecture before the reverse starts.
 */
import { GitHubApiError, type GitHubClient } from "../github/client.js";
import { logError } from "../log.js";
import { StructureOnlyViolation } from "../redact/redact.js";
import { LlmError } from "../reverse/llm.js";
import { ReverseFailed } from "../reverse/pipeline.js";
import type { LlmClient, LlmUsage } from "../reverse/llm.js";
import { redactFiles } from "../redact/redact.js";
import { reverseRepository, type ReverseResult } from "../reverse/pipeline.js";
import { MetricsStore } from "../meter/record.js";
import { markGenerated } from "../store/krs-cache.js";
import type { NestStore } from "../store/nest-store.js";
import type { RunStatusStore } from "../store/run-status.js";

/** Paths that cost tokens and teach the model nothing about the architecture. */
const SKIPPED_PATH = new RegExp(
  [
    "(^|/)(node_modules|vendor|dist|build|out|target|\\.git)/",
    "(^|/)(package-lock\\.json|pnpm-lock\\.yaml|yarn\\.lock|Cargo\\.lock|poetry\\.lock|go\\.sum|composer\\.lock)$",
    "\\.(min\\.js|min\\.css|map|snap)$",
    // Binaries and media: a blob read returns base64 we cannot use.
    "\\.(png|jpe?g|gif|webp|svg|ico|pdf|zip|gz|tar|jar|woff2?|ttf|otf|mp4|mov|wasm|so|dylib|dll|exe|bin)$",
  ].join("|"),
  "i",
);

/** Above this, a file is a data dump rather than source. */
const MAX_FILE_BYTES = 200_000;

/** A ceiling on how many files one run will read out of the archive. */
const MAX_FILES_FETCHED = 200;

/**
 * A ceiling on the source a single run holds in memory at once.
 *
 * The archive arrives as one stream and is read into strings, so this is what
 * keeps a large repository inside a Worker's memory rather than the file
 * count -- 200 files of 200 KB each would be 40 MB.
 */
const MAX_ARCHIVE_BYTES = 8_000_000;

export interface GenerateInput {
  installationId: string;
  owner: string;
  repo: string;
  /** Omit to resolve the default branch's head. */
  sha?: string;
}

export interface GenerateDeps {
  github: GitHubClient;
  llm: LlmClient;
  store: NestStore;
  runs: RunStatusStore;
  /**
   * Where the cost of this run is written (#2226).
   *
   * Optional because metering must never be the reason a generation fails —
   * ADR-1990 decision 3 makes the numbers a prerequisite for choosing a quota
   * level, not a prerequisite for producing a model.
   */
  metrics?: MetricsStore;
  /** Injected so the run is clock-free and its records are assertable. */
  now: () => Date;
}

export interface GenerateOutcome {
  sha: string;
  reverse: ReverseResult;
  /** How many redactions fired on the way in. Counts only; never the values. */
  redactions: number;
  /** GitHub could not return the whole tree. */
  truncatedTree: boolean;
  /** We stopped short of the whole tree ourselves, at `MAX_FILES_FETCHED`. */
  truncatedByCap: boolean;
  /** Files whose blob read failed and were skipped rather than aborting. */
  unreadableFiles: number;
  /** Wall-clock for the whole run, milliseconds. */
  durationMs: number;
}

export class GenerateFailed extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GenerateFailed";
  }
}

/**
 * Error types whose message this module wrote, and may therefore show a
 * caller.
 *
 * An allowlist, not a denylist. The first version excluded only the base
 * `Error` class, which is exactly backwards: a `TypeError` raised deep inside
 * a fetch or a decode has `name !== "Error"` and sailed through with whatever
 * the runtime put in it, while a deliberately safe `new Error("refusing to
 * cache an empty .krs")` was thrown away. This is the one place a message
 * crosses from "something that happened while reading someone's private
 * repository" to a public status endpoint (ADR-1990 decision 6).
 */
const SAFE_ERRORS = [
  GenerateFailed,
  GitHubApiError,
  LlmError,
  ReverseFailed,
  StructureOnlyViolation,
] as const;

function callerSafeMessage(cause: unknown): string {
  return SAFE_ERRORS.some((type) => cause instanceof type) && cause instanceof Error
    ? cause.message
    : "the generation failed";
}

/**
 * Run one generation to completion.
 *
 * Throws on failure *and* records the failure, so a caller that fires this
 * detached does not have to remember to write the status itself.
 */
export async function generate(input: GenerateInput, deps: GenerateDeps): Promise<GenerateOutcome> {
  const { github, llm, store, runs, metrics, now } = deps;
  const { installationId, owner, repo } = input;
  const ref = { installationId, owner, repo };
  const startedAtMs = now().getTime();
  const startedAt = new Date(startedAtMs).toISOString();

  const sha = input.sha ?? (await github.defaultBranchSha(installationId, owner, repo));
  await runs.put(ref, { state: "running", sha, startedAt });

  // Accumulated outside the try so the failure path can report what a run
  // spent before it died. A retried generation pays for every attempt, and a
  // report that counts only the attempt that succeeded understates the bill
  // by exactly the amount the retries cost (#2226).
  let spent: LlmUsage = { inputTokens: 0, outputTokens: 0 };
  // Built as the passes complete rather than read off the result, because a
  // failed run has no result -- and "how many passes did we pay for" is the
  // question a failure makes worth asking (#2226).
  const observedPasses: { name: string; inputTokens: number; outputTokens: number }[] = [];
  let bytesRead = 0;
  let fileCount = 0;
  let redactions = 0;
  // Structurally zero since the repository arrives as one archive: an entry
  // already in hand cannot fail its own read. Kept because the metrics record
  // is retained for 400 days and its shape should not shift under a reader.
  const unreadableFiles = 0;

  const meter = async (outcome: "done" | "failed", model: string): Promise<void> => {
    if (metrics === undefined) return;
    try {
      await metrics.record(ref, {
        sha,
        finishedAt: now().toISOString(),
        outcome,
        model,
        durationMs: now().getTime() - startedAtMs,
        inputTokens: spent.inputTokens,
        outputTokens: spent.outputTokens,
        passes: recordedPasses,
        files: fileCount,
        bytesRead,
        redactions,
        unreadableFiles,
      });
    } catch (cause) {
      // A run that produced a model and could not write its token count has
      // succeeded. Failing it to protect a number would be the wrong trade in
      // both directions.
      logError("karasu-nest could not record run metrics", cause);
    }
  };
  let recordedPasses: { name: string; inputTokens: number; outputTokens: number }[] = [];

  try {
    // One request for the whole repository, not one per file. Workers caps
    // subrequests per invocation and KV operations count toward the same
    // budget, so per-file fetching capped repository size for a reason that
    // had nothing to do with the model -- an 85-file repository died partway
    // through with `Too many subrequests` (see `github/tar.ts`).
    const archive = await github.sourceFiles(installationId, owner, repo, sha, {
      accept: ({ path, size }) =>
        SKIPPED_PATH.test(path) || size > MAX_FILE_BYTES ? "skip" : "read",
      maxFiles: MAX_FILES_FETCHED,
      maxTotalBytes: MAX_ARCHIVE_BYTES,
    });
    const files = archive.files;
    if (files.length === 0) throw new GenerateFailed("no readable source files");

    // Bytes, not code units: the archive is decoded to text, so `.length`
    // would count a 3-byte CJK character as 1 and report a third of the real
    // size for a repository whose sources are not ASCII (#2226).
    const encoder = new TextEncoder();
    bytesRead = files.reduce((total, file) => total + encoder.encode(file.content).length, 0);

    // The one-way door. Everything downstream sees redacted text only.
    const redacted = redactFiles(files);
    redactions = redacted.findings.length;
    fileCount = files.length;
    const reverse = await reverseRepository(
      { owner, repo, sha, files: redacted.files, findings: redacted.findings },
      llm,
      {
        // Spend is captured as it happens, so a run that throws on the third
        // pass still reports what the first two cost.
        onUsage: (usage, pass) => {
          // `usage` is cumulative, so a pass costs the difference. Attributing
          // the running total to each pass would make the last one look like
          // it cost everything.
          observedPasses.push({
            name: pass,
            inputTokens: usage.inputTokens - spent.inputTokens,
            outputTokens: usage.outputTokens - spent.outputTokens,
          });
          spent = usage;
        },
      },
    );

    await store.publish(
      { installationId, owner, repo, sha },
      { krs: markGenerated(reverse.krs), generatedAt: now().toISOString() },
    );
    const finishedAt = now().toISOString();
    await runs.put(ref, { state: "done", sha, startedAt, finishedAt });

    const durationMs = now().getTime() - startedAtMs;
    recordedPasses = reverse.passes.map((pass) => ({
      name: pass.name,
      inputTokens: pass.usage.inputTokens,
      outputTokens: pass.usage.outputTokens,
    }));
    spent = reverse.usage;
    await meter("done", reverse.model ?? "unknown");

    return {
      sha,
      reverse,
      redactions: redacted.findings.length,
      // GitHub's archive is never partial the way its tree API can be, so
      // this stays false; the field is kept because the pull-request body
      // distinguishes "GitHub could not give us everything" from "we stopped
      // early", and only the second can now happen.
      truncatedTree: false,
      truncatedByCap: archive.truncated,
      unreadableFiles,
      durationMs,
    };
  } catch (cause) {
    await runs.put(ref, {
      state: "failed",
      sha,
      startedAt,
      finishedAt: now().toISOString(),
      error: callerSafeMessage(cause),
    });
    // Metered before rethrowing. The tokens this attempt burned are already
    // billed whether or not it produced anything, and a Workflow will retry.
    if (spent.inputTokens > 0 || spent.outputTokens > 0) {
      // Every pass that ran, not just the last one. Collapsing them lost the
      // one fact a failed run can still establish: how far it got.
      recordedPasses = observedPasses;
      await meter("failed", "unknown");
    }
    throw cause;
  }
}
