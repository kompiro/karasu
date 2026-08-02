import { describe, expect, it } from "vitest";
import type { LlmClient, LlmResponse } from "./llm.js";
import { reverseRepository, ReverseFailed, type RedactedRepo } from "./pipeline.js";

const usage = { inputTokens: 100, outputTokens: 200 };

interface Call {
  prompt: string;
  maxTokens?: number;
}

/** Replies in order, and records the prompts and options it was given. */
function scriptedLlm(
  replies: (string | LlmResponse)[],
): LlmClient & { prompts: string[]; calls: Call[] } {
  const prompts: string[] = [];
  const calls: Call[] = [];
  let index = 0;
  return {
    prompts,
    calls,
    complete(prompt: string, options?: { maxTokens?: number }): Promise<LlmResponse> {
      prompts.push(prompt);
      calls.push({
        prompt,
        ...(options?.maxTokens === undefined ? {} : { maxTokens: options.maxTokens }),
      });
      const reply = replies[index] ?? "";
      index += 1;
      return Promise.resolve(typeof reply === "string" ? { text: reply, usage } : reply);
    },
  };
}

const repo: RedactedRepo = {
  owner: "kompiro",
  repo: "karasu",
  sha: "a".repeat(40),
  files: [
    { path: "src/lending/loan.ts", content: "export class Loan {}" },
    { path: "src/lending/hold.ts", content: "export class Hold {}" },
    { path: "src/catalog/book.ts", content: "export class Book {}" },
  ],
  findings: [],
};

const SURVEY = JSON.stringify({
  contexts: [
    { name: "Lending", why: "loans and holds", readPaths: ["src/lending/loan.ts"] },
    { name: "Catalog", why: "books", readPaths: ["src/catalog/book.ts"] },
  ],
});

const DECOMPOSE = JSON.stringify({
  domains: [
    { name: "Lending", summary: "loans, holds, checkouts", confidence: "high" },
    { name: "Catalog", summary: "the book catalogue", confidence: "low" },
  ],
});

const KRS = `\`\`\`krs
system Library {
  service Circulation {
    domain Lending
    domain Catalog @draft(confidence: "low")
  }
}
\`\`\``;

describe("reverseRepository", () => {
  it("runs three passes and returns a parseable .krs", async () => {
    const llm = scriptedLlm([SURVEY, DECOMPOSE, KRS]);
    const result = await reverseRepository(repo, llm);
    expect(llm.prompts).toHaveLength(3);
    expect(result.krs).toContain("system Library");
    expect(result.krs.endsWith("\n")).toBe(true);
    expect(result.domains.map((d) => d.name)).toEqual(["Lending", "Catalog"]);
  });

  it("sends paths but not contents to the survey pass", async () => {
    // The pass whose only job is choosing what to read must not pay to read
    // everything first.
    const llm = scriptedLlm([SURVEY, DECOMPOSE, KRS]);
    await reverseRepository(repo, llm);
    expect(llm.prompts[0]).toContain("src/lending/loan.ts");
    expect(llm.prompts[0]).not.toContain("export class Loan");
  });

  it("carries the bounded-context directive into both reasoning passes", async () => {
    // ADR-2077 measured this wording; summarising it regresses the result.
    const llm = scriptedLlm([SURVEY, DECOMPOSE, KRS]);
    await reverseRepository(repo, llm);
    const carried = [0, 1].map((index) => ({
      pass: index,
      granularity: llm.prompts[index]?.includes("bounded-context granularity"),
      splitConditions: llm.prompts[index]?.includes("disjoint schema"),
    }));
    expect(carried).toEqual([
      { pass: 0, granularity: true, splitConditions: true },
      { pass: 1, granularity: true, splitConditions: true },
    ]);
  });

  it("reads only the files the survey asked for", async () => {
    const llm = scriptedLlm([SURVEY, DECOMPOSE, KRS]);
    await reverseRepository(repo, llm);
    expect(llm.prompts[1]).toContain("export class Loan");
    expect(llm.prompts[1]).toContain("export class Book");
    // Not requested by the survey.
    expect(llm.prompts[1]).not.toContain("export class Hold");
  });

  it("ignores a path the survey invented", async () => {
    // A hallucinated path must not become a silent empty read.
    const survey = JSON.stringify({
      contexts: [
        { name: "Ghost", why: "?", readPaths: ["src/does/not/exist.ts", "src/catalog/book.ts"] },
      ],
    });
    const llm = scriptedLlm([survey, DECOMPOSE, KRS]);
    await reverseRepository(repo, llm);
    expect(llm.prompts[1]).not.toContain("src/does/not/exist.ts");
    expect(llm.prompts[1]).toContain("export class Book");
  });

  it("caps how many files a pass may read", async () => {
    const many: RedactedRepo = {
      ...repo,
      files: Array.from({ length: 10 }, (_, index) => ({
        path: `src/f${index}.ts`,
        content: `export const f${index} = ${index};`,
      })),
    };
    const survey = JSON.stringify({
      contexts: [{ name: "All", why: "everything", readPaths: many.files.map((f) => f.path) }],
    });
    const llm = scriptedLlm([survey, DECOMPOSE, KRS]);
    await reverseRepository(many, llm, { maxFilesRead: 3 });
    expect(llm.prompts[1]).toContain("export const f2 = 2;");
    expect(llm.prompts[1]).not.toContain("export const f3 = 3;");
  });

  it("passes the decomposition's confidence through to the synthesis prompt", async () => {
    const llm = scriptedLlm([SURVEY, DECOMPOSE, KRS]);
    await reverseRepository(repo, llm);
    expect(llm.prompts[2]).toContain("Catalog (confidence: low)");
    expect(llm.prompts[2]).toContain("@draft");
  });

  it("sums usage per pass and in total", async () => {
    const llm = scriptedLlm([SURVEY, DECOMPOSE, KRS]);
    const result = await reverseRepository(repo, llm);
    expect(result.passes.map((p) => p.name)).toEqual(["survey", "decompose", "synthesise"]);
    expect(result.usage).toEqual({ inputTokens: 300, outputTokens: 600 });
  });

  it("tolerates prose around the JSON", async () => {
    const llm = scriptedLlm([`Sure! Here you go:\n${SURVEY}\nHope that helps.`, DECOMPOSE, KRS]);
    await expect(reverseRepository(repo, llm)).resolves.toBeDefined();
  });

  it("accepts an unfenced .krs reply", async () => {
    const llm = scriptedLlm([SURVEY, DECOMPOSE, "system Library {\n  service Circulation\n}"]);
    expect((await reverseRepository(repo, llm)).krs).toContain("system Library");
  });

  it("gives the synthesis pass a far larger output budget than the JSON passes", async () => {
    // Synthesis writes a document; the others reply with a short object. One
    // shared ceiling either truncates the document or overpays for the JSON.
    const llm = scriptedLlm([SURVEY, DECOMPOSE, KRS]);
    await reverseRepository(repo, llm);
    const budgets = llm.calls.map((call) => call.maxTokens);
    expect(budgets[2]).toBeGreaterThan(budgets[1] as number);
    expect(budgets.every((budget) => typeof budget === "number")).toBe(true);
  });

  it("bounds total bytes read, not just the file count", async () => {
    // `maxFilesRead` alone lets one huge file through, and prompt size, token
    // bill and Worker memory all scale with bytes.
    const big: RedactedRepo = {
      ...repo,
      files: [
        { path: "src/huge.ts", content: "x".repeat(5000) },
        { path: "src/small.ts", content: "export const ok = 1;" },
      ],
    };
    const survey = JSON.stringify({
      contexts: [{ name: "All", why: "everything", readPaths: big.files.map((f) => f.path) }],
    });
    const llm = scriptedLlm([survey, DECOMPOSE, KRS]);
    await reverseRepository(big, llm, { maxBytesRead: 1000 });
    expect(llm.prompts[1]).not.toContain("x".repeat(100));
    // The oversized file is skipped, not truncated — half a file is a
    // misleading input — and the small one still gets through.
    expect(llm.prompts[1]).toContain("export const ok = 1;");
  });

  it("takes the largest fenced block, not the first", async () => {
    // A reply that opens with a short illustrative snippet would otherwise be
    // truncated to the snippet, and the snippet still parses.
    const twoBlocks = [
      "For example:",
      "```krs",
      "system Tiny {\n  service A\n}",
      "```",
      "Here is the real model:",
      "```krs",
      "system Library {\n  service Circulation {\n    domain Lending\n  }\n}",
      "```",
    ].join("\n");
    const llm = scriptedLlm([SURVEY, DECOMPOSE, twoBlocks]);
    expect((await reverseRepository(repo, llm)).krs).toContain("domain Lending");
  });

  it("finds the JSON object even when prose after it contains a brace", async () => {
    const llm = scriptedLlm([`${SURVEY}\nNote: the {api} module needs care.`, DECOMPOSE, KRS]);
    await expect(reverseRepository(repo, llm)).resolves.toBeDefined();
  });

  it("is not confused by a brace inside a JSON string", async () => {
    const survey = JSON.stringify({
      contexts: [{ name: "A}B", why: "a } in a value", readPaths: ["src/catalog/book.ts"] }],
    });
    const llm = scriptedLlm([survey, DECOMPOSE, KRS]);
    await expect(reverseRepository(repo, llm)).resolves.toBeDefined();
  });

  describe("what it refuses", () => {
    it("refuses a truncated reply rather than caching it as complete", async () => {
      // The dangerous case: a cut-off `.krs` that still parses would be served
      // as a complete model of the repository.
      const llm = scriptedLlm([SURVEY, DECOMPOSE, { text: KRS, usage, stopReason: "max_tokens" }]);
      await expect(reverseRepository(repo, llm)).rejects.toThrowError(/output limit/);
    });

    it("refuses a document that parses but describes no system", async () => {
      // Comment-only and deploy-only documents both compile without errors.
      const llm = scriptedLlm([SURVEY, DECOMPOSE, "```krs\n// nothing here\n```"]);
      await expect(reverseRepository(repo, llm)).rejects.toThrowError(/describes no system/);
    });

    it("fails when the survey returns no JSON", async () => {
      const llm = scriptedLlm(["I could not read the repository.", DECOMPOSE, KRS]);
      await expect(reverseRepository(repo, llm)).rejects.toThrowError(/survey/);
    });

    it("fails when the survey returns no contexts", async () => {
      const llm = scriptedLlm(['{"contexts": []}', DECOMPOSE, KRS]);
      await expect(reverseRepository(repo, llm)).rejects.toThrowError(ReverseFailed);
    });

    it("fails when the decomposition returns no domains", async () => {
      const llm = scriptedLlm([SURVEY, '{"domains": []}', KRS]);
      await expect(reverseRepository(repo, llm)).rejects.toThrowError(/decompose/);
    });

    it("refuses output that carries a credential", async () => {
      // The structure-only scan, at the point where it can still stop the
      // document from being cached and served.
      const leak = `\`\`\`krs\nsystem S {\n  service Api "ghp_${"A1b2C3d4E5f6G7h8I9j0".repeat(2)}"\n}\n\`\`\``;
      const llm = scriptedLlm([SURVEY, DECOMPOSE, leak]);
      await expect(reverseRepository(repo, llm)).rejects.toThrowError(/credential patterns/);
    });

    it("refuses output that is not a model", async () => {
      // Prose that reaches the cache would be served as a diagram.
      const llm = scriptedLlm([SURVEY, DECOMPOSE, "```krs\nthis is not karasu syntax\n```"]);
      await expect(reverseRepository(repo, llm)).rejects.toThrowError(/did not parse/);
    });

    it("refuses an empty .krs", async () => {
      const llm = scriptedLlm([SURVEY, DECOMPOSE, "```krs\n\n```"]);
      await expect(reverseRepository(repo, llm)).rejects.toThrowError(ReverseFailed);
    });
  });
});
